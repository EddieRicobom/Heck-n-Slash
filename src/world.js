import * as THREE from 'three';

export const ARENA = 22;

function floorTexture() {
  const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), C = S / 2, R = S / 2;
  g.fillStyle = '#26222e'; g.fillRect(0, 0, S, S);
  const rnd = (a, b) => a + Math.random() * (b - a);
  // concentric flagstones
  for (let ring = 0; ring < 11; ring++) {
    const r0 = R * ring / 11, r1 = R * (ring + 1) / 11, n = Math.max(1, 6 + ring * 7);
    const off = rnd(0, 6.28);
    for (let i = 0; i < n; i++) {
      const a0 = off + i / n * 6.283, a1 = off + (i + 1) / n * 6.283, l = rnd(17, 25), h = rnd(240, 268);
      g.beginPath(); g.arc(C, C, r1 - 3, a0 + .004, a1 - .004); g.arc(C, C, Math.max(0, r0 + 3), a1 - .004, a0 + .004, true); g.closePath();
      g.fillStyle = `hsl(${h} 12% ${l}%)`; g.fill();
    }
  }
  // grime speckles
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${rnd(.02, .05)})`; g.fillRect(rnd(0, S), rnd(0, S), rnd(1, 7), rnd(1, 7)); }
  // moon sigil
  g.strokeStyle = '#9a5ad6'; g.shadowColor = '#7a3ab0'; g.shadowBlur = 14; g.lineWidth = 6;
  for (const r of [.3, .315, .62]) { g.beginPath(); g.arc(C, C, R * r, 0, 6.283); g.stroke(); }
  g.fillStyle = '#3d2a55'; g.beginPath(); g.arc(C, C, R * .1, 0, 6.283); g.fill();
  g.shadowBlur = 0; g.fillStyle = '#26222e'; g.beginPath(); g.arc(C + R * .04, C - R * .02, R * .088, 0, 6.283); g.fill();
  g.strokeStyle = '#b896dc'; g.shadowColor = '#7a3ab0'; g.shadowBlur = 8; g.lineWidth = 6; g.lineCap = 'round';
  for (let i = 0; i < 40; i++) { // abstract glyph ring
    const a = i / 40 * 6.283, cx = C + Math.cos(a) * R * .47, cy = C + Math.sin(a) * R * .47;
    g.beginPath(); for (let k = 0; k < 3; k++) { const p = rnd(-28, 28), q = rnd(-28, 28); k ? g.lineTo(cx + p, cy + q) : g.moveTo(cx + p, cy + q); } g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function glowTexture(inner = '#fff', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function bokehTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(64, 64, 58, 0, 6.283); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4; g.stroke();
  return new THREE.CanvasTexture(c);
}

export function createWorld(scene) {
  const arena = new THREE.Group(); arena.name = 'arena'; scene.add(arena);
  scene.fog = new THREE.Fog(0x120d22, 45, 200);
  scene.background = new THREE.Color(0x0b0816);

  scene.add(new THREE.HemisphereLight(0xc9c4e6, 0x3a3444, 1.7));
  const moon = new THREE.DirectionalLight(0xdbe2ff, 2.6);
  moon.position.set(-14, 30, 14); moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 });
  moon.shadow.bias = -.0012; moon.shadow.normalBias = .03;
  scene.add(moon, moon.target);
  const rim = new THREE.DirectionalLight(0xb98cff, 1.3); rim.position.set(8, 9, -18); scene.add(rim);
  const aura = new THREE.PointLight(0xb44dff, 7, 7, 1.6); scene.add(aura);

  const floor = new THREE.Mesh(new THREE.CylinderGeometry(ARENA + 1, ARENA + 2, 1.2, 96),
    [new THREE.MeshStandardMaterial({ color: 0x26212f, roughness: 1 }), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: .86, metalness: .05 }), new THREE.MeshStandardMaterial({ color: 0x1a1622 })]);
  floor.position.y = -.6; floor.receiveShadow = true; arena.add(floor);

  // glowing boundary
  const edge = new THREE.Mesh(new THREE.TorusGeometry(ARENA + .55, .07, 8, 128), new THREE.MeshBasicMaterial({ color: 0xc77bff, toneMapped: false }));
  edge.rotation.x = Math.PI / 2; edge.position.y = .08; arena.add(edge);

  // obelisks
  const N = 18, ob = new THREE.InstancedMesh(new THREE.CylinderGeometry(.55, 1.05, 7, 5), new THREE.MeshStandardMaterial({ color: 0x3a3548, flatShading: true, roughness: .9 }), N);
  const tips = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.42), new THREE.MeshBasicMaterial({ color: 0xd59bff, toneMapped: false }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < N; i++) {
    const a = i / N * 6.283, r = ARENA + 3.4, x = Math.cos(a) * r, z = Math.sin(a) * r, h = .75 + Math.random() * .5;
    q.setFromEuler(e.set((Math.random() - .5) * .08, a * 3, (Math.random() - .5) * .08));
    m.compose(new THREE.Vector3(x, 3.5 * h - .8, z), q, new THREE.Vector3(1, h, 1)); ob.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, 7 * h, z), q, new THREE.Vector3(1, 1.4, 1)); tips.setMatrixAt(i, m);
  }
  ob.castShadow = true; arena.add(ob, tips);

  // sky dome
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 p; void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    uniforms: { uMood: { value: 0 } },
    fragmentShader: 'uniform float uMood; varying vec3 p; void main(){float h=clamp(p.y*1.5+.2,0.,1.); vec3 a=mix(vec3(.17,.08,.3), vec3(.6,.1,.06), uMood), b=mix(vec3(.02,.016,.06), vec3(.08,0.,.03), uMood); gl_FragColor=vec4(mix(a,b,pow(h,.7)),1.);}',
  }));
  arena.add(sky);

  const moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#fff', 'rgba(190,150,255,0)'), color: 0xefe6ff, fog: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  moonDisc.position.set(-40, 55, -100); moonDisc.scale.setScalar(70); arena.add(moonDisc);

  // far away city bokeh, echoing Eddie's night-city portrait
  const bm = bokehTexture(), palette = [0xff9a3c, 0xffd070, 0x7a6bff, 0xff5fa8, 0x58c8ff, 0xfff0d0];
  const lights = [];
  for (let i = 0; i < 130; i++) {
    const a = Math.random() * 6.283, r = 55 + Math.random() * 60;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bm, color: palette[i % 6], transparent: true, opacity: .1 + Math.random() * .3, fog: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    s.position.set(Math.cos(a) * r, -14 + Math.random() * 15, Math.sin(a) * r); s.scale.setScalar(2.5 + Math.random() * 7);
    s.userData.base = s.material.opacity; s.userData.ph = Math.random() * 6; arena.add(s); lights.push(s);
  }

  const deco = decorate(arena);

  // shadow camera snapped to its texel grid so shadows don't shimmer while Eddie moves
  const texel = (moon.shadow.camera.right - moon.shadow.camera.left) / moon.shadow.mapSize.x;
  return {
    update(t, p, auraColor, power = 0) {
      const sx = Math.round(p.x / texel) * texel, sz = Math.round(p.z / texel) * texel;
      const sy = Math.round(p.y / texel) * texel;
      moon.position.set(sx - 14, sy + 30, sz + 14); moon.target.position.set(sx, sy, sz); moon.target.updateMatrixWorld();
      aura.position.set(p.x, 2.6 + p.y, p.z + .5); aura.color.set(auraColor); aura.intensity = 7 + power * 14;
      for (let i = 0; i < lights.length; i += 7) { const s = lights[i]; s.material.opacity = s.userData.base * (.7 + .3 * Math.sin(t * 1.4 + s.userData.ph)); }
      deco.update(t, auraColor, power);
    },
    moon, arena, aura, hemi: scene.children.find(o => o.isHemisphereLight), sky, moonPos: new THREE.Vector3(-40, 55, -100),
  };
}

function windowsTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#120c1e'; g.fillRect(0, 0, 128, 256);
  const lit = ['#ffcf7a', '#ff9a5a', '#ff7ac8', '#7ad8ff', '#fff2c8'];
  for (let y = 6; y < 250; y += 12) for (let x = 6; x < 124; x += 10) {
    if (Math.random() < .32) { g.fillStyle = lit[Math.random() * lit.length | 0]; g.globalAlpha = .5 + Math.random() * .5; g.fillRect(x, y, 5, 7); }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}

function runeRingTexture() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round';
  for (let i = 0; i < 64; i++) {
    const x0 = i * 32 + 6;
    g.beginPath();
    for (let k = 0; k < 4; k++) { const x = x0 + Math.random() * 20, y = 10 + Math.random() * 44; k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  g.fillStyle = '#fff'; g.fillRect(0, 0, 2048, 4); g.fillRect(0, 60, 2048, 4);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Skyline, stars, moon and clouds, floating crystals, a combo-reactive rune ring and fireflies. */
function decorate(arena) {
  const rnd = (a, b) => a + Math.random() * (b - a);
  // skyline of lit buildings far below the floating arena
  const NB = 90, win = windowsTexture();
  const bMat = new THREE.MeshToonMaterial({ color: 0x2a2140, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 1.1, map: win });
  const bld = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bMat, NB);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < NB; i++) {
    const a = i / NB * 6.283 + rnd(-.03, .03), r = rnd(78, 125), h = rnd(14, 46), w = rnd(5, 10);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    m.compose(new THREE.Vector3(Math.cos(a) * r, -26 + h / 2, Math.sin(a) * r), q, new THREE.Vector3(w, h, rnd(5, 9)));
    bld.setMatrixAt(i, m);
  }
  arena.add(bld);

  // stars
  const sp = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const u = Math.random() * 6.283, v = Math.acos(rnd(.15, 1)), r = 170;
    sp[i * 3] = Math.cos(u) * Math.sin(v) * r; sp[i * 3 + 1] = Math.cos(v) * r; sp[i * 3 + 2] = Math.sin(u) * Math.sin(v) * r;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xe8ddff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: .85, depthWrite: false }));
  arena.add(stars);

  // cel-shaded moon disc with crater spots, plus drifting clouds
  const mc = document.createElement('canvas'); mc.width = mc.height = 256;
  const mg = mc.getContext('2d');
  mg.fillStyle = '#f4ecff'; mg.beginPath(); mg.arc(128, 128, 120, 0, 6.283); mg.fill();
  mg.fillStyle = '#d6c6f2'; for (let i = 0; i < 9; i++) { mg.beginPath(); mg.arc(rnd(60, 196), rnd(60, 196), rnd(8, 26), 0, 6.283); mg.fill(); }
  mg.strokeStyle = '#2a1640'; mg.lineWidth = 6; mg.beginPath(); mg.arc(128, 128, 121, 0, 6.283); mg.stroke();
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), fog: false, depthWrite: false, toneMapped: false }));
  moon.position.set(-45, 62, -120); moon.scale.setScalar(34); arena.add(moon);
  const cc = document.createElement('canvas'); cc.width = 256; cc.height = 96;
  const cg = cc.getContext('2d'); cg.fillStyle = '#3b2a5c';
  for (let i = 0; i < 7; i++) { cg.beginPath(); cg.ellipse(40 + i * 30, 60 - Math.sin(i) * 14, 36, 22, 0, 0, 6.283); cg.fill(); }
  const ctex = new THREE.CanvasTexture(cc);
  const clouds = Array.from({ length: 9 }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex, fog: false, depthWrite: false, transparent: true, opacity: .75 }));
    s.position.set(rnd(-120, 60), rnd(40, 70), rnd(-140, -100)); s.scale.set(rnd(40, 70), rnd(14, 22), 1); s.userData.v = rnd(.6, 1.6);
    arena.add(s); return s;
  });

  // floating crystals orbiting the arena
  const NC = 16, cr = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.7, 0), new THREE.MeshToonMaterial({ color: 0x9a6bff, emissive: 0x6a2bd9, emissiveIntensity: 1.2 }), NC);
  const crData = Array.from({ length: NC }, (_, i) => ({ a: i / NC * 6.283, r: rnd(25.5, 29), y: rnd(2, 7), s: rnd(.6, 1.4), ph: rnd(0, 6) }));
  arena.add(cr);

  // rune ring inlaid in the floor, brightening with the combo
  const rt = runeRingTexture();
  const ringGeo = new THREE.RingGeometry(ARENA - 3.2, ARENA - 2.2, 128, 1); ringGeo.rotateX(-Math.PI / 2);
  const uv = ringGeo.attributes.uv, pos = ringGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) { const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z); uv.setXY(i, (Math.atan2(z, x) / 6.283 + .5) * 6, (r - (ARENA - 3.2))); }
  const ringMat = new THREE.MeshBasicMaterial({ map: rt, color: 0xb44dff, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.y = .02; arena.add(ring);

  // fireflies
  const NF = 140, fp = new Float32Array(NF * 3), fd = [];
  for (let i = 0; i < NF; i++) { fd.push({ x: rnd(-ARENA, ARENA), y: rnd(.5, 6), z: rnd(-ARENA, ARENA), ph: rnd(0, 6), sp: rnd(.2, .6) }); }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  const flies = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xd7ff8a, size: .16, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  flies.frustumCulled = false; arena.add(flies);

  const col = new THREE.Color();
  return {
    update(t, auraColor, power) {
      for (const c of clouds) { c.position.x += c.userData.v * .016; if (c.position.x > 90) c.position.x = -140; }
      crData.forEach((d, i) => {
        const a = d.a + t * .05;
        q.setFromEuler(new THREE.Euler(t * .4 + d.ph, t * .6 + d.ph, 0));
        m.compose(new THREE.Vector3(Math.cos(a) * d.r, d.y + Math.sin(t * .8 + d.ph) * .6, Math.sin(a) * d.r), q, new THREE.Vector3(d.s * .6, d.s, d.s * .6));
        cr.setMatrixAt(i, m);
      });
      cr.instanceMatrix.needsUpdate = true;
      ring.rotation.y = t * (.03 + power * .25);
      ringMat.color.copy(col.set(auraColor)); ringMat.opacity = .35 + power * .65 + Math.sin(t * 3) * .05;
      for (let i = 0; i < NF; i++) {
        const d = fd[i];
        fp[i * 3] = d.x + Math.sin(t * d.sp + d.ph) * 1.5; fp[i * 3 + 1] = d.y + Math.sin(t * d.sp * 1.7 + d.ph) * .5; fp[i * 3 + 2] = d.z + Math.cos(t * d.sp * .8 + d.ph) * 1.5;
      }
      fg.attributes.position.needsUpdate = true;
    },
  };
}
