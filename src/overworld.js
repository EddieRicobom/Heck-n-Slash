// The open world: terrain, water, wind-blown grass, chunked instanced props (Meshy models),
// sky with aurora, shrines, boss lairs, enemy camps streamed around Eddie, and a minimap.
import * as THREE from 'three';
import { buildTerrain, BIOMES, BIOME_KEYS, W, PLAY, WATER, fbm } from './terrain.js';
import { gradient, toon, inkMaterial, outline } from './toon.js';

const CHUNK = 64;
const PROP_SPEC = { // target height (m), collision radius as a fraction of height, ink width
  pine: { h: 9, r: .06, ink: .05 }, oldtree: { h: 8, r: .09, ink: .05 }, rocks: { h: 2.2, r: .5, ink: .03 },
  crystals: { h: 3, r: .25, ink: .03 }, pillar: { h: 5, r: .12, ink: .04 }, arch: { h: 7, r: 0, ink: .05 },
  shrine: { h: 3.2, r: .35, ink: .03 }, lantern: { h: 2, r: .2, ink: .02 }, shrooms: { h: 1.8, r: 0, ink: .02 },
  tower: { h: 24, r: .17, ink: .12 }, bush: { h: 1.6, r: 0, ink: .02 },
};
const col = c => new THREE.Color(c);
// screen-door transparency driven by a per-instance aFade attribute
function ditherize(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute float aFade;
varying float vFade;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vFade = aFade;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vFade;`).replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (vFade < .999) { float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453); if (n > vFade) discard; }`);
  };
  mat.customProgramCacheKey = () => 'fade' + (mat.userData.ink ? 'ink' : '');
  return mat;
}
const FADE_MATS = new Map();
const fadeMaterial = m => FADE_MATS.get(m) || FADE_MATS.set(m, ditherize(m.clone())).get(m);
let SOFT = null;
function softTex() {
  if (SOFT) return SOFT;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return SOFT = new THREE.CanvasTexture(c);
}
/** subtle painterly ground detail: tufts, pebbles and soft blotches, tiled every 8 m */
function detailTex() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${.06 + Math.random() * .08})`; g.beginPath(); g.ellipse(Math.random() * S, Math.random() * S, 10 + Math.random() * 30, 6 + Math.random() * 18, Math.random() * 3, 0, 6.283); g.fill(); }
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(40,30,60,${.12 + Math.random() * .15})`; g.beginPath(); g.arc(Math.random() * S, Math.random() * S, 1 + Math.random() * 3, 0, 6.283); g.fill(); }
  g.strokeStyle = 'rgba(60,50,80,.25)'; g.lineWidth = 2;
  for (let i = 0; i < 70; i++) { const x = Math.random() * S, y = Math.random() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 6, y - 6 - Math.random() * 6); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export class Overworld {
  constructor(game, assets) {
    this.game = game; this.assets = assets;
    this.group = new THREE.Group(); this.group.name = 'overworld'; this.group.visible = false;
    game.scene.add(this.group);
    this.T = buildTerrain(7);
    this.height = this.T.height; this.biomeAt = this.T.biome;
    this.grid = new Map(); // collision circles bucketed per 8 m cell
    this._terrain(); this._water(); this._sky(); this._grass(); this._props(); this._pois(); this._chests(); this._minimapBase();
    this.region = null; this.t = 0; this.bossesDown = new Set();
  }

  // ---- terrain ---------------------------------------------------------------------------------------
  _terrain() {
    const S = 190, g = new THREE.PlaneGeometry(W * 2, W * 2, S, S); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, colors = new Float32Array(pos.count * 3), c = new THREE.Color(), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = this.height(x, z);
      pos.setY(i, h);
      const B = BIOMES[this.biomeAt(x, z)], n = fbm(x * .05, z * .05, 3);
      c.set(B.grass[0]).lerp(tmp.set(B.grass[1]), n * .5 + .5);
      const slope = Math.abs(this.height(x + 1, z) - this.height(x - 1, z)) + Math.abs(this.height(x, z + 1) - this.height(x, z - 1));
      if (slope > 1.1) c.lerp(tmp.set(0x4a4560), Math.min(1, (slope - 1.1) * .8));
      if (h > 22) c.lerp(tmp.set(0x8a84a8), Math.min(1, (h - 22) / 18));
      if (h < WATER + .3) c.lerp(tmp.set(0x1e2a2a), .6);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); g.computeVertexNormals();
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / 4, uv.getY(i) * W / 4);
    this.terrain = new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient(), map: detailTex() }));
    this.terrain.receiveShadow = true; this.group.add(this.terrain);
  }

  _water() {
    const [sx, sz] = BIOMES.swamp.center;
    const geo = new THREE.PlaneGeometry(110, 110, 1, 1); geo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true, fog: true, depthWrite: false,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: { value: 0 } },
      vertexShader: 'varying vec2 vW; #include <fog_pars_vertex>\nvoid main(){ vec4 wp = modelMatrix*vec4(position,1.); vW = wp.xz; vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition; #include <fog_vertex>\n}'.replace(/#include <(\w+)>/g, '\n#include <$1>\n'),
      fragmentShader: 'uniform float uTime; varying vec2 vW; #include <fog_pars_fragment>\nvoid main(){ float w = sin(vW.x*.35 + uTime*1.2 + sin(vW.y*.27 - uTime*.8)*2.); float band = step(.82, w); float fres = .5 + .5*sin(vW.y*.05 + uTime*.2); vec3 c = mix(vec3(.008,.02,.035), vec3(.02,.06,.09), fres); c = mix(c, vec3(.12,.32,.34), band*.7); gl_FragColor = vec4(c, .86); #include <fog_fragment>\n}'.replace(/#include <(\w+)>/g, '\n#include <$1>\n'),
    });
    const water = new THREE.Mesh(geo, this.waterMat); water.position.set(sx + 6, WATER, sz - 4); this.group.add(water);
  }

  _sky() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(330, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uTime: { value: 0 }, uMood: { value: 0 } },
      vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform float uTime, uMood; varying vec3 p;
        void main(){
          float h = clamp(p.y, -.2, 1.);
          vec3 c = mix(vec3(.2,.1,.32), vec3(.02,.015,.07), pow(max(h,0.)*1.4, .6));
          c = mix(c, vec3(.12,.07,.2), smoothstep(.0, -.2, h));
          // aurora ribbons
          float a = atan(p.x, p.z);
          float band = sin(a*3. + uTime*.08 + sin(a*7. - uTime*.15)*.6);
          float y = .32 + band*.07;
          float aur = smoothstep(.09, 0., abs(h - y)) * (.6 + .4*sin(a*24. + uTime*.6)) * smoothstep(.05,.25,h);
          c += aur * mix(vec3(.15,.9,.6), vec3(.6,.3,1.), .5 + .5*sin(a*2. + uTime*.05)) * .55 * (1. - uMood);
          // drifting cloud bands, and a blood-red sky when a boss is awake
          float cl = smoothstep(.55, .95, sin(a*5. + uTime*.03 + h*16. + sin(a*11. + uTime*.07)*1.4)*.5 + .5) * smoothstep(.0,.12,h) * smoothstep(.55,.2,h);
          vec3 red = mix(vec3(.55,.08,.05), vec3(.07,.0,.03), pow(max(h,0.)*1.3, .7));
          c = mix(c, red, uMood * .9);
          c = mix(c, mix(vec3(.2,.13,.3), vec3(.75,.2,.1), uMood), cl * (.35 + uMood * .35));
          gl_FragColor = vec4(c, 1.);
        }`,
    }));
    this.skyMat = sky.material; this.group.add(sky);
    const sp = new Float32Array(1400 * 3);
    for (let i = 0; i < 1400; i++) { const u = Math.random() * 6.283, v = Math.acos(.08 + Math.random() * .92), r = 320; sp[i * 3] = Math.cos(u) * Math.sin(v) * r; sp[i * 3 + 1] = Math.cos(v) * r; sp[i * 3 + 2] = Math.sin(u) * Math.sin(v) * r; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xece2ff, size: 1.6, sizeAttenuation: false, fog: false, depthWrite: false }));
    this.group.add(this.stars);
    const mc = document.createElement('canvas'); mc.width = mc.height = 256; const m = mc.getContext('2d');
    const gr = m.createRadialGradient(128, 128, 60, 128, 128, 128); gr.addColorStop(0, 'rgba(220,200,255,.5)'); gr.addColorStop(1, 'rgba(220,200,255,0)');
    m.fillStyle = gr; m.fillRect(0, 0, 256, 256);
    m.fillStyle = '#f6efff'; m.beginPath(); m.arc(128, 128, 62, 0, 6.283); m.fill();
    m.fillStyle = '#d9cbf2'; for (let i = 0; i < 8; i++) { m.beginPath(); m.arc(98 + Math.random() * 60, 98 + Math.random() * 60, 5 + Math.random() * 12, 0, 6.283); m.fill(); }
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), fog: false, depthWrite: false, toneMapped: false }));
    this.moon.scale.setScalar(90); this.group.add(this.moon);
  }

  // ---- grass: a wrapping field of blades around Eddie, sampling height/color textures --------------
  _grass() {
    const N = this.T.N, hdata = new Float32Array(N * N), cdata = new Uint8Array(N * N * 4), c = new THREE.Color(), t2 = new THREE.Color();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = j * N + i, x = i - W, z = j - W, h = this.T.hm[o];
      hdata[o] = h;
      const B = BIOMES[BIOME_KEYS[this.T.bm[o]]];
      c.set(B.grass[1]).lerp(t2.set(B.grass[0]), .3 + fbm(x * .07, z * .07, 2) * .3);
      const dens = h < WATER + .1 || h > 20 ? 0 : B === BIOMES.castle ? .25 : B === BIOMES.ruins ? .6 : 1;
      cdata[o * 4] = c.r * 255; cdata[o * 4 + 1] = c.g * 255; cdata[o * 4 + 2] = c.b * 255; cdata[o * 4 + 3] = dens * 255;
    }
    const ht = new THREE.DataTexture(hdata, N, N, THREE.RedFormat, THREE.FloatType); ht.needsUpdate = true;
    const ct = new THREE.DataTexture(cdata, N, N, THREE.RGBAFormat); ct.needsUpdate = true; ct.colorSpace = THREE.SRGBColorSpace;
    for (const t of [ht, ct]) { t.minFilter = t.magFilter = THREE.NearestFilter; t.flipY = false; }
    const COUNT = 42000, SIZE = 70;
    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-.05, 0, 0, .05, 0, 0, -.03, .45, 0, .03, .45, 0, 0, 1, 0]), 3));
    blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    const g = new THREE.InstancedBufferGeometry().copy(blade); g.instanceCount = COUNT;
    const off = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) { off[i * 3] = Math.random() * SIZE; off[i * 3 + 1] = Math.random() * SIZE; off[i * 3 + 2] = Math.random(); }
    g.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 3));
    this.grassMat = new THREE.ShaderMaterial({
      fog: true, side: THREE.DoubleSide,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uCenter: { value: new THREE.Vector2() }, uPlayer: { value: new THREE.Vector3() }, uTime: { value: 0 }, uH: { value: ht }, uC: { value: ct }, uSize: { value: SIZE }, uW: { value: W } },
      vertexShader: `
        attribute vec3 offset; uniform vec2 uCenter; uniform vec3 uPlayer; uniform float uTime, uSize, uW; uniform sampler2D uH, uC;
        varying vec3 vCol; varying float vY;
        #include <fog_pars_vertex>
        void main(){
          vec2 wp = uCenter + mod(offset.xy - uCenter + uSize*.5, uSize) - uSize*.5;
          vec2 uv = (wp + uW + .5) / (uW*2. + 1.);
          float h = texture2D(uH, uv).r; vec4 cc = texture2D(uC, uv);
          float edge = smoothstep(uSize*.5, uSize*.36, length(wp - uCenter));
          float s = step(offset.z, cc.a) * edge * (.6 + offset.z*.7);
          float a = offset.z * 40.;
          vec3 p = position; p.y *= .35 + offset.z*.4;
          vec3 q = vec3(p.x*cos(a), p.y, p.x*sin(a)) * s;
          float yy = position.y;
          vec2 sway = vec2(sin(uTime*1.7 + wp.x*.25 + wp.y*.17), cos(uTime*1.3 + wp.y*.21)) * .22 * yy*yy;
          vec2 away = wp - uPlayer.xz; float dp = length(away);
          sway += (dp < 1.6 ? normalize(away + .001) * (1.6 - dp) * .5 * yy : vec2(0.));
          vec3 world = vec3(wp.x + q.x + sway.x*s, h + q.y, wp.y + q.z + sway.y*s);
          vCol = cc.rgb; vY = yy;
          vec4 mvPosition = viewMatrix * vec4(world, 1.);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        varying vec3 vCol; varying float vY;
        #include <fog_pars_fragment>
        void main(){
          vec3 c = vCol * mix(1.9, 3.3, step(.45, vY)) + vec3(.05,.08,.07) * step(.8, vY);
          gl_FragColor = vec4(c, 1.);
          #include <fog_fragment>
        }`,
    });
    this.grass = new THREE.Mesh(g, this.grassMat); this.grass.frustumCulled = false; this.group.add(this.grass);
  }

  // ---- props --------------------------------------------------------------------------------------
  _propSource(name) {
    const sc = this.assets?.[name];
    const parts = [];
    if (sc) {
      sc.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(sc), size = box.getSize(new THREE.Vector3());
      const k = PROP_SPEC[name].h / Math.max(.01, size.y);
      const base = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
      sc.traverse(o => { if (o.isMesh) parts.push({ geo: o.geometry, mat: toon(o.material), m: base.clone().multiply(o.matrixWorld) }); });
    } else { // procedural stand-ins until the Meshy models exist
      const h = PROP_SPEC[name].h, geo = { pine: () => new THREE.ConeGeometry(h * .28, h, 6).translate(0, h / 2, 0), oldtree: () => new THREE.DodecahedronGeometry(h * .35).translate(0, h * .7, 0), tower: () => new THREE.CylinderGeometry(h * .14, h * .18, h, 7).translate(0, h / 2, 0) }[name]?.() || new THREE.DodecahedronGeometry(h * .45).translate(0, h * .4, 0);
      parts.push({ geo, mat: new THREE.MeshToonMaterial({ color: { pine: 0x24504f, oldtree: 0x5a3a7a, crystals: 0x9a6bff, bush: 0x3a2a5a }[name] || 0x4a4560, gradientMap: gradient() }), m: new THREE.Matrix4() });
    }
    return parts;
  }

  _props() {
    const r = this.T.rng, chunks = new Map(), N = Math.ceil(W * 2 / CHUNK);
    this.occl = new Map(); this.fading = new Set();
    const place = {}; for (const k in PROP_SPEC) place[k] = [];
    const nearPoi = (x, z, pad) => this.T.pois.some(p => Math.hypot(p.x - x, p.z - z) < p.r + pad);
    // scatter by biome weights on a jittered grid
    for (let z = -W + 4; z < W - 4; z += 6) for (let x = -W + 4; x < W - 4; x += 6) {
      const px = x + (r() - .5) * 5, pz = z + (r() - .5) * 5, h = this.height(px, pz);
      if (h < WATER + .2) continue;
      const B = BIOMES[this.biomeAt(px, pz)], border = Math.max(Math.abs(px), Math.abs(pz)) > PLAY;
      for (const [name, w] of Object.entries(B.props)) {
        if (r() > w * (border ? .1 : .11)) continue;
        if (nearPoi(px, pz, name === 'bush' || name === 'shrooms' ? 1 : 5)) continue;
        if (Math.hypot(px, pz) < 14) continue;
        place[name].push([px, h, pz, r() * 6.283, .75 + r() * .55]);
        break;
      }
    }
    // POI dressing: arches/pillars near ruins camps, lanterns around shrines
    for (const p of this.T.pois) {
      if (p.kind === 'shrine') for (let i = 0; i < 4; i++) { const a = i / 4 * 6.283 + .4; place.lantern.push([p.x + Math.sin(a) * 5, p.h, p.z + Math.cos(a) * 5, a, 1]); }
      if (p.kind === 'lair') for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; place.pillar.push([p.x + Math.sin(a) * (p.r + 2), this.height(p.x + Math.sin(a) * (p.r + 2), p.z + Math.cos(a) * (p.r + 2)), p.z + Math.cos(a) * (p.r + 2), r() * 6, 1.1 + r() * .3]); }
      if (p.kind === 'camp' && (p.biome === 'ruins' || p.biome === 'castle') && r() < .6) { const a = r() * 6.283; place.arch.push([p.x + Math.sin(a) * (p.r + 3), this.height(p.x + Math.sin(a) * (p.r + 3), p.z + Math.cos(a) * (p.r + 3)), p.z + Math.cos(a) * (p.r + 3), a, 1]); }
    }
    this.propCount = 0;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const [name, list] of Object.entries(place)) {
      if (!list.length) continue;
      const parts = this._propSource(name), spec = PROP_SPEC[name];
      const byChunk = new Map();
      for (const it of list) {
        const ci = Math.floor((it[0] + W) / CHUNK), cj = Math.floor((it[2] + W) / CHUNK), key = cj * N + ci;
        (byChunk.get(key) || byChunk.set(key, []).get(key)).push(it);
        if (spec.r > 0) this._addCollider(it[0], it[2], spec.h * spec.r * it[4]);
      }
      for (const [key, items] of byChunk) {
        let c = chunks.get(key);
        if (!c) { c = { group: new THREE.Group(), ink: new THREE.Group(), cx: (key % N + .5) * CHUNK - W, cz: (Math.floor(key / N) + .5) * CHUNK - W }; chunks.set(key, c); this.group.add(c.group, c.ink); }
        // occlusion records: one per placed prop, pointing at its fade slot in every part mesh
        const recs = spec.h >= 2 ? items.map(it => ({ x: it[0], z: it[2], top: it[1] + spec.h * it[4], r: Math.max(1, spec.h * .2 * it[4]), cur: 1, fades: [] })) : null;
        if (recs) for (const rc of recs) { const k = `${Math.floor(rc.x / 8)},${Math.floor(rc.z / 8)}`; (this.occl.get(k) || this.occl.set(k, []).get(k)).push(rc); }
        for (const part of parts) {
          const geo = part.geo.clone(), fade = new THREE.InstancedBufferAttribute(new Float32Array(items.length).fill(1), 1);
          fade.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aFade', fade);
          if (recs) recs.forEach((rc, i) => rc.fades.push([fade, i]));
          const im = new THREE.InstancedMesh(geo, fadeMaterial(part.mat), items.length);
          const ink = new THREE.InstancedMesh(geo, ditherize(inkMaterial(spec.ink / (part.m.getMaxScaleOnAxis() || 1), false)), items.length);
          items.forEach((it, i) => {
            q.setFromAxisAngle(up, it[3]);
            m.compose(new THREE.Vector3(it[0], it[1] - .15, it[2]), q, new THREE.Vector3(it[4], it[4], it[4])).multiply(part.m);
            im.setMatrixAt(i, m); ink.setMatrixAt(i, m);
          });
          im.castShadow = name !== 'bush' && name !== 'shrooms'; im.receiveShadow = true;
          im.computeBoundingSphere(); ink.computeBoundingSphere();
          c.group.add(im); c.ink.add(ink);
        }
        this.propCount += items.length;
      }
    }
    this.chunks = [...chunks.values()];
  }

  /** props standing between the camera and Eddie dissolve into a dither pattern */
  _occlusion(dt, P, C) {
    const px = P.x, pz = P.z, py = P.y + 1.3, sx = px - C.x, sz = P.z - C.z, L2 = sx * sx + sz * sz || 1;
    const seen = new Set();
    const x0 = Math.floor(Math.min(px, C.x) / 8) - 1, x1 = Math.floor(Math.max(px, C.x) / 8) + 1, z0 = Math.floor(Math.min(pz, C.z) / 8) - 1, z1 = Math.floor(Math.max(pz, C.z) / 8) + 1;
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const cell = this.occl.get(`${cx},${cz}`); if (!cell) continue;
      for (const rc of cell) {
        const t = ((rc.x - C.x) * sx + (rc.z - C.z) * sz) / L2;
        if (t <= 0 || t >= 1.02) continue;
        const qx = C.x + sx * t, qz = C.z + sz * t, d = Math.hypot(rc.x - qx, rc.z - qz), lineY = C.y + (py - C.y) * t;
        if (d < rc.r + .8 && rc.top > lineY - .4) { seen.add(rc); this.fading.add(rc); }
      }
    }
    for (const rc of this.fading) {
      const target = seen.has(rc) ? .18 : 1;
      rc.cur += (target - rc.cur) * Math.min(1, dt * 7);
      if (target === 1 && rc.cur > .985) rc.cur = 1;
      for (const [a, i] of rc.fades) { a.array[i] = rc.cur; a.needsUpdate = true; }
      if (rc.cur === 1) this.fading.delete(rc);
    }
  }

  _addCollider(x, z, r) {
    const k = `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
    (this.grid.get(k) || this.grid.set(k, []).get(k)).push([x, z, r]);
  }

  /** keep a position inside the playable square and outside prop colliders */
  clamp(p, margin = .5) {
    const lim = PLAY - margin;
    p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
    const cx = Math.floor(p.x / 8), cz = Math.floor(p.z / 8);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cell = this.grid.get(`${cx + i},${cz + j}`); if (!cell) continue;
      for (const [x, z, r] of cell) {
        const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz), min = r + margin;
        if (d < min && d > 1e-4) { p.x = x + dx / d * min; p.z = z + dz / d * min; }
      }
    }
  }
  outOfBounds(x, z) { return Math.abs(x) > PLAY + 4 || Math.abs(z) > PLAY + 4; }

  // ---- points of interest -------------------------------------------------------------------------------
  _pois() {
    const beamGeo = new THREE.CylinderGeometry(.9, 1.6, 60, 12, 1, true).translate(0, 30, 0);
    this.shrines = []; this.camps = []; this.lairs = [];
    for (const p of this.T.pois) {
      if (p.kind === 'shrine') {
        const g = new THREE.Group(); g.position.set(p.x, p.h, p.z);
        for (const part of this._propSource('shrine')) { const mm = new THREE.Mesh(part.geo, part.mat); mm.applyMatrix4(part.m); mm.castShadow = true; g.add(mm); }
        const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        g.add(beam);
        const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: .7, toneMapped: false }));
        ring.position.y = .12; g.add(ring);
        this.group.add(g); this._addCollider(p.x, p.z, 1.2);
        this.shrines.push({ ...p, g, beam, ring, lit: !!p.spawn });
      } else if (p.kind === 'lair') this.lairs.push({ ...p, spawned: null, defeated: false });
      else if (p.kind === 'camp') {
        const B = BIOMES[p.biome], r = this.T.rng, n = 3 + Math.min(4, B.tier) + (r() < .4 ? 1 : 0);
        const members = Array.from({ length: n }, () => ({ type: B.foes[r() * B.foes.length | 0], elite: r() < .05 + B.tier * .05, alive: true }));
        // campfire
        const fire = new THREE.Group(); fire.position.set(p.x, p.h, p.z);
        const logs = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 1.4, 5).rotateZ(Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x3a2a22, gradientMap: gradient() }));
        logs.position.y = .15; fire.add(logs, logs.clone().rotateY(1.2));
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xff9a4a, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        glow.position.y = .8; glow.scale.set(2.2, 2.8, 1); fire.add(glow);
        this.group.add(fire);
        this.camps.push({ ...p, B, members, enemies: [], spawned: false, cleared: false, clearedAt: 0, fire, glow });
      }
    }
  }

  // ---- treasure chests ----------------------------------------------------------------------------
  _chests() {
    const r = this.T.rng, wood = new THREE.MeshToonMaterial({ color: 0x5a3a2a, gradientMap: gradient() });
    const gold = new THREE.MeshToonMaterial({ color: 0xffc65c, emissive: 0x6a4a10, gradientMap: gradient() });
    const purple = new THREE.MeshToonMaterial({ color: 0x8a5ad6, emissive: 0x3a1a6a, gradientMap: gradient() });
    this.chests = [];
    let tries = 0;
    while (this.chests.length < 28 && tries++ < 3000) {
      const near = this.T.pois[r() * this.T.pois.length | 0], camp = near.kind === 'camp' && r() < .55;
      const x = camp ? near.x + (r() - .5) * 8 : (r() * 2 - 1) * (PLAY - 10), z = camp ? near.z + (r() - .5) * 8 : (r() * 2 - 1) * (PLAY - 10);
      const h = this.height(x, z);
      if (h < WATER + .3 || h > 18 || this.chests.some(c => Math.hypot(c.x - x, c.z - z) < 25)) continue;
      const legendary = r() < .2, g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, .6, .75), wood); base.position.y = .3;
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.14, .1, .79), legendary ? gold : purple); band.position.y = .45;
      const lid = new THREE.Group(); lid.position.set(0, .6, -.375);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(.375, .375, 1.1, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), wood); top.position.z = .375;
      const lock = new THREE.Mesh(new THREE.BoxGeometry(.18, .22, .08), legendary ? gold : purple); lock.position.set(0, -.02, .76);
      lid.add(top, lock); g.add(base, band, lid);
      g.position.set(x, h, z); g.rotation.y = r() * 6.283;
      outline(g, .03);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: legendary ? 0xffc65c : 0xb48cff, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      glow.position.y = .8; glow.scale.setScalar(2.6); g.add(glow);
      this.group.add(g); this._addCollider(x, z, .6);
      this.chests.push({ x, z, g, lid, glow, legendary, open: false, t: 0 });
    }
  }

  _updateChests(dt, P) {
    const g = this.game;
    for (const c of this.chests) {
      if (c.open) { c.t += dt; c.lid.rotation.x = -Math.min(1.9, c.t * 7); c.glow.material.opacity = Math.max(0, .55 - c.t); continue; }
      c.glow.material.opacity = .4 + Math.sin(this.t * 3 + c.x) * .15; c.g.position.y = this.height(c.x, c.z) + Math.abs(Math.sin(this.t * 2 + c.z)) * .04;
      if (Math.hypot(P.x - c.x, P.z - c.z) < 2.3 && !g.player.dead) {
        c.open = true; c.t = 0;
        g.audio.chest(); g.fx.ring(c.x, c.z, 2.5, c.legendary ? 0xffc65c : 0xb48cff, .5); g.fx.impact(c.x, 1, c.z, 2.4, 0xffffff, .15);
        for (let i = 0; i < 10; i++) g.after(i * .06, () => g.audio.coin());
        g.dropSouls(c.x, c.z, c.legendary ? 40 : 14 + (Math.random() * 10 | 0));
        g.fx.wisps(c.x, .8, c.z, 30, c.legendary ? 0xffd27a : 0xc9a6ff);
        if (Math.random() < .35) g.dropHeal(c.x + 1, c.z);
        g.ui.announceSmall(c.legendary ? 'BAÚ LENDÁRIO!' : 'BAÚ!');
        if (c.legendary) g.after(1.2, () => { if (g.state === 'play') g.offerCards('Baú lendário · escolha uma bênção'); });
      }
    }
  }

  // ---- minimap -----------------------------------------------------------------------------------------
  _minimapBase() {
    const S = 220, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S), col = new THREE.Color();
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = i / S * W * 2 - W, z = j / S * W * 2 - W, h = this.height(x, z);
      col.set(BIOMES[this.biomeAt(x, z)].grass[1]);
      if (h < WATER + .2) col.set(0x2a6a7a);
      const shade = .55 + Math.min(.9, Math.max(0, h / 30)) * .7;
      const o = (j * S + i) * 4; img.data[o] = col.r * 255 * shade; img.data[o + 1] = col.g * 255 * shade; img.data[o + 2] = col.b * 255 * shade; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.mapBase = c;
  }

  drawMinimap(ctx, size) {
    const k = size / (W * 2), P = this.game.player.root.position, toS = (x, z) => [(x + W) * k, (z + W) * k];
    ctx.drawImage(this.mapBase, 0, 0, size, size);
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, size - 2, size - 2);
    for (const c of this.camps) { const [x, y] = toS(c.x, c.z); ctx.fillStyle = c.cleared ? 'rgba(255,255,255,.25)' : '#ff4a5e'; ctx.fillRect(x - 2, y - 2, 4, 4); }
    for (const c of this.chests) if (!c.open) { const [x, y] = toS(c.x, c.z); ctx.fillStyle = c.legendary ? '#ffd27a' : '#c9a6ff'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
    for (const s of this.shrines) { const [x, y] = toS(s.x, s.z); ctx.fillStyle = s.lit ? '#7fe9ff' : '#3a6a7a'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.283); ctx.fill(); }
    for (const l of this.lairs) { const [x, y] = toS(l.x, l.z); ctx.fillStyle = l.defeated ? '#666' : '#ffb347'; ctx.font = 'bold 13px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('☠', x, y + 5); }
    const [px, py] = toS(P.x, P.z), f = this.game.player.facing;
    ctx.save(); ctx.translate(px, py); ctx.rotate(-f + Math.PI); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  // ---- runtime -----------------------------------------------------------------------------------------
  spawnPoint() { const s = this.lastShrine || this.shrines.find(s => s.spawn); return new THREE.Vector3(s.x + 3.5, s.h, s.z + 3.5); }

  reset() {
    for (const c of this.camps) { c.members.forEach(m => m.alive = true); c.cleared = false; c.spawned = false; c.enemies = []; }
    for (const l of this.lairs) { l.spawned = null; l.defeated = false; }
    for (const s of this.shrines) s.lit = !!s.spawn;
    for (const c of this.chests) { c.open = false; c.lid.rotation.x = 0; c.glow.material.opacity = .55; }
    this.lastShrine = null; this.bossesDown = new Set(); this.region = null;
  }

  update(dt) {
    const g = this.game, P = g.player.root.position, cam = g.camera.position;
    this.t += dt;
    this.grassMat.uniforms.uTime.value = this.t; this.waterMat.uniforms.uTime.value = this.t; this.skyMat.uniforms.uTime.value = this.t;
    const gc = this.grassMat.uniforms.uCenter.value.set(P.x, P.z); this.grassMat.uniforms.uPlayer.value.copy(P);
    this.moon.position.set(cam.x - 120, cam.y + 140, cam.z - 220);
    for (const o of [this.stars]) o.position.set(cam.x, 0, cam.z);
    // chunk culling by distance (ink outlines only up close)
    for (const c of this.chunks) { const d = Math.hypot(c.cx - P.x, c.cz - P.z); c.group.visible = d < (this.viewDist || 175); c.ink.visible = d < (this.inkDist || 95); }
    this._occlusion(dt, P, cam);
    // region + fog tint
    const bid = this.biomeAt(P.x, P.z), B = BIOMES[bid];
    if (bid !== this.region) { this.region = bid; g.ui.announce(B.name, `Ameaça ${'★'.repeat(B.tier)}`, 1800); }
    g.scene.fog.color.lerp(col(B.fog), Math.min(1, dt * .8)); g.scene.background.copy(g.scene.fog.color);
    this._updateChests(dt, P);
    // shrines
    for (const s of this.shrines) {
      s.beam.material.opacity = s.lit ? .18 + Math.sin(this.t * 2) * .04 : .06; s.ring.rotation.y += dt * .5;
      if (Math.hypot(P.x - s.x, P.z - s.z) < 3.4 && !g.player.dead) {
        if (!s.lit || this.lastShrine !== s) g.onShrine(s);
        s.lit = true; this.lastShrine = s;
      }
    }
    // camps: stream enemies in and out, track clears and respawns
    for (const c of this.camps) {
      const d = Math.hypot(P.x - c.x, P.z - c.z);
      c.glow.material.opacity = .65 + Math.sin(this.t * 13 + c.x) * .15;
      if (c.fire.visible = d < 150) { if (d < 50 && Math.random() < .3) g.fx.spark(c.x + (Math.random() - .5) * .5, .4, c.z + (Math.random() - .5) * .5, 0, 2 + Math.random() * 2, 0, .7, .1, 0xffa24a, -2); }
      if (c.cleared) { if (g.time - c.clearedAt > 240 && d > 80) { c.cleared = false; c.members.forEach(m => m.alive = true); } continue; }
      if (!c.spawned && d < 62) this._spawnCamp(c);
      else if (c.spawned && d > 100 && !c.enemies.some(e => e.alive && e.aggro)) this._despawnCamp(c);
    }
    // boss lairs
    for (const l of this.lairs) {
      if (l.defeated) continue;
      const d = Math.hypot(P.x - l.x, P.z - l.z);
      if (!l.spawned && d < 26) {
        const e = g.enemies.spawn(l.boss, l.x, l.z, { scale: 1 + BIOMES[l.biome].tier * .25, home: new THREE.Vector3(l.x, 0, l.z) });
        e.lair = l; e.alert(); l.spawned = e; g.boss = e;
        g.onBossSpawn(e, BIOMES[l.biome].name);
      } else if (l.spawned && (d > 70 || g.player.dead) && l.spawned.alive) {
        l.spawned.dispose(); g.enemies.list.splice(g.enemies.list.indexOf(l.spawned), 1); l.spawned = null; g.boss = null;
      }
    }
  }

  _spawnCamp(c) {
    const g = this.game, tier = c.B.tier;
    c.enemies = [];
    c.members.forEach((m, i) => {
      if (!m.alive) return;
      const a = i / c.members.length * 6.283, r = 3 + Math.random() * 4;
      const e = g.enemies.spawn(m.type, c.x + Math.sin(a) * r, c.z + Math.cos(a) * r, { scale: 1 + (tier - 1) * .32, elite: m.elite, home: new THREE.Vector3(c.x, 0, c.z), camp: c });
      e.member = m; c.enemies.push(e);
    });
    c.spawned = true;
  }

  _despawnCamp(c) {
    const g = this.game;
    for (const e of c.enemies) if (e.alive) { e.dispose(); const i = g.enemies.list.indexOf(e); if (i >= 0) g.enemies.list.splice(i, 1); }
    c.enemies = []; c.spawned = false;
  }

  onKilled(e) {
    const g = this.game;
    if (e.member) e.member.alive = false;
    const c = e.camp;
    if (c && !c.cleared && c.members.every(m => !m.alive)) {
      c.cleared = true; c.clearedAt = g.time; c.spawned = false; c.enemies = [];
      g.onCampCleared(c);
    }
    if (e.lair) { e.lair.defeated = true; e.lair.spawned = null; this.bossesDown.add(e.type); g.boss = null; g.onBossDown(e); }
  }
}
