// Cel shading for the whole game: 3-tone toon materials plus ink outlines (inverted hull),
// and an anime post pass with impact frames and speed lines.
import * as THREE from 'three';

let GRADIENT = null;
export function gradient() {
  if (GRADIENT) return GRADIENT;
  const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
  GRADIENT = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  GRADIENT.minFilter = GRADIENT.magFilter = THREE.NearestFilter; GRADIENT.generateMipmaps = false; GRADIENT.needsUpdate = true;
  return GRADIENT;
}

/** Turn any lit material into a toon material, keeping its maps and colors. */
export function toon(m, extra = {}, rim = null) {
  if (!m || m.isMeshToonMaterial || m.isMeshBasicMaterial || m.isShaderMaterial || m.isSpriteMaterial || m.isLineBasicMaterial) return m;
  const t = new THREE.MeshToonMaterial({
    color: m.color?.clone() ?? new THREE.Color(0xffffff), map: m.map ?? null, gradientMap: gradient(),
    emissive: m.emissive?.clone() ?? new THREE.Color(0), emissiveMap: m.emissiveMap ?? null, emissiveIntensity: m.emissiveIntensity ?? 1,
    normalMap: null, transparent: m.transparent, opacity: m.opacity, side: m.side, alphaTest: m.alphaTest, ...extra,
  });
  t.name = m.name;
  if (rim !== null) {
    // anime rim light: a bright edge facing away from the camera, color adjustable per material
    t.userData.rim = { value: new THREE.Color(rim) };
    t.onBeforeCompile = sh => {
      sh.uniforms.uRim = t.userData.rim;
      sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);\n  totalEmissiveRadiance += uRim * rimF;');
    };
  }
  return t;
}

export function toonify(root) {
  root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    o.material = Array.isArray(o.material) ? o.material.map(m => toon(m)) : toon(o.material);
  });
}

const INK = new THREE.Color(0x0c0414);
export function inkMaterial(width, skinned) {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  m.onBeforeCompile = sh => {
    sh.uniforms.uInk = { value: width };
    sh.vertexShader = 'uniform float uInk;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      skinned ? '#include <begin_vertex>\n transformed += normalize(objectNormal) * uInk;' : '#include <begin_vertex>\n transformed += normalize(normal) * uInk;');
  };
  m.userData.ink = true;
  return m;
}

/** Add an ink outline shell to every mesh under root. width is in world meters; call it before the root is
 *  parented under scaled bones. Skinned meshes are in bind space, so pass skinScale = any scale applied above them. */
export function outline(root, width = .02, skinScale = 1) {
  root.updateMatrixWorld(true);
  const rootScale = root.parent ? root.parent.getWorldScale(new THREE.Vector3()).x : 1;
  const add = [];
  root.traverse(o => { if (o.isMesh && !o.userData.ink && !o.material?.userData?.ink && !o.isInstancedMesh) add.push(o); });
  for (const o of add) {
    const s = Math.abs(o.getWorldScale(new THREE.Vector3()).x / (rootScale || 1)) || 1;
    const w = o.isSkinnedMesh ? width / skinScale : width / s;
    let shell;
    if (o.isSkinnedMesh) {
      shell = new THREE.SkinnedMesh(o.geometry, inkMaterial(w, true));
      shell.bind(o.skeleton, o.bindMatrix);
    } else shell = new THREE.Mesh(o.geometry, inkMaterial(w, false));
    shell.userData.ink = true; shell.frustumCulled = false; shell.castShadow = false;
    shell.position.copy(o.position); shell.quaternion.copy(o.quaternion); shell.scale.copy(o.scale);
    o.parent.add(shell);
  }
}

// ---- anime post pass ------------------------------------------------------------------------------
export const AnimeShader = {
  uniforms: {
    tDiffuse: { value: null }, uImpact: { value: 0 }, uInvert: { value: 0 }, uCenter: { value: new THREE.Vector2(.5, .5) },
    uSpeed: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 }, uTint: { value: new THREE.Color(0xb44dff) }, uAberr: { value: 0 },
    uRays: { value: 0 }, uLight: { value: new THREE.Vector2(.5, .8) }, uRayCol: { value: new THREE.Color(0xc9b8ff) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uImpact, uInvert, uSpeed, uTime, uAspect, uAberr, uRays; uniform vec2 uCenter, uLight; uniform vec3 uTint, uRayCol;
    varying vec2 vUv;
    float hash(float n){ return fract(sin(n)*43758.5453); }
    float lines(vec2 uv, float density, float seed){
      vec2 d = uv - uCenter; d.x *= uAspect;
      float a = atan(d.y, d.x), r = length(d);
      float id = floor((a + 3.14159) / 6.28318 * density);
      float on = step(.55, hash(id + seed));
      float w = abs(fract((a + 3.14159) / 6.28318 * density) - .5);
      float thin = smoothstep(.5 * (.25 + hash(id * 1.7 + seed) * .35), 0., w);
      float start = .18 + hash(id * 3.1 + seed) * .25;
      return on * thin * smoothstep(start, start + .2, r);
    }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (uAberr > 0.) { vec2 dir = (vUv - .5) * uAberr * .012; c.r = texture2D(tDiffuse, vUv + dir).r; c.b = texture2D(tDiffuse, vUv - dir).b; }
      float lum = dot(c.rgb, vec3(.299,.587,.114));
      // speed lines
      if (uSpeed > 0.) {
        float l = lines(vUv, 90., floor(uTime * 18.)) * uSpeed;
        c.rgb = mix(c.rgb, vec3(1.), l * .55);
      }
      // impact frame: posterized two-tone frame with heavy radial lines
      if (uImpact > 0.) {
        float ink = step(.32, lum);
        vec3 a = mix(vec3(.02,0.,.05), vec3(1.), ink);
        vec3 b = mix(vec3(1.), uTint * .25, ink);
        vec3 f = mix(a, b, uInvert);
        float l = lines(vUv, 140., floor(uTime * 30.) + 7.);
        f = mix(f, uInvert > .5 ? vec3(0.) : vec3(1.), l);
        c.rgb = mix(c.rgb, f, uImpact * .85);
      }
      // light shafts streaming from the moon (or the boss sun)
      if (uRays > 0.) {
        vec2 d = (uLight - vUv) / 14.; vec2 uv = vUv; float acc = 0., w = 1.;
        for (int i = 0; i < 14; i++) { uv += d; vec3 s = texture2D(tDiffuse, clamp(uv, 0., 1.)).rgb; acc += max(dot(s, vec3(.333)) - .62, 0.) * w; w *= .9; }
        c.rgb += acc * uRays * .22 * uRayCol;
      }
      gl_FragColor = c;
    }`,
};
