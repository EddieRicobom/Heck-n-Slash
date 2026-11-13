import * as THREE from 'three';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
const SLASH_VS = `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const SLASH_FS = `
varying vec2 vP; uniform float uArc,uProg,uFade,uDir; uniform vec3 uColor;
void main(){
  float r = length(vP); if(r>1.0) discard;
  float a = atan(vP.x, vP.y)*uDir;
  float t = a/(uArc*.5)*.5+.5; if(t<0.||t>1.) discard;
  float head = uProg*1.3;
  if (t > head) discard;
  float age = clamp((head - t) / .8, 0., 1.);
  // anime crescent: thick in the middle of the swing, needle thin at both ends
  float thick = .24 * sin(3.14159 * clamp(t, 0., 1.)) * (1. - age * .6) + .015;
  float inner = 1. - thick;
  if (r < inner) discard;
  float x = (r - inner) / thick;               // 0 inner edge .. 1 outer edge
  float core = smoothstep(.6, .95, x) * .7;      // bright outer edge
  float ink = step(.965, x) * (1. - age);        // thin dark rim for the cel look
  vec3 col = mix(uColor * 1.05, vec3(1.), core);
  col = mix(col, vec3(.05, .0, .1), ink * .0);
  float al = (1. - age * .9) * (1. - uFade) * smoothstep(0., .15, x) * .7;
  gl_FragColor = vec4(col * (.85 + core * .6), al);
}`;

/** Ribbon trail between two points that follow a weapon (base and tip). */
export class Trail {
  constructor(scene, n = 12) {
    this.n = n; this.pts = []; this.alpha = 0;
    const pos = new Float32Array(n * 2 * 3), a = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < n - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    for (let i = 0; i < n; i++) { a[i * 2] = a[i * 2 + 1] = 1 - i / (n - 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('fade', new THREE.BufferAttribute(a, 1)); g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uBoost: { value: 0 } },
      vertexShader: 'attribute float fade; varying float vF; varying float vE; void main(){ vF = fade; vE = float(gl_VertexID % 2); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; uniform float uBoost; varying float vF; varying float vE; void main(){ float a = vF*mix(vF, 1., uBoost*.6)*uAlpha*(.35+.65*vE); vec3 c = mix(uColor, vec3(1.), vE*vF*uBoost*.7); gl_FragColor = vec4(c*(.9+vE*vF*(.8+uBoost*1.2)), a*.75); }',
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; scene.add(this.mesh);
  }

  update(base, tip, active, color, dt, boost = 0) {
    this.alpha = THREE.MathUtils.damp(this.alpha, active ? 1 : 0, active ? 30 : 9, dt);
    this.mat.uniforms.uColor.value.set(color); this.mat.uniforms.uAlpha.value = this.alpha; this.mat.uniforms.uBoost.value = boost;
    this.pts.unshift([base.clone(), tip.clone()]);
    if (this.pts.length > this.n) this.pts.length = this.n;
    const p = this.mesh.geometry.attributes.position;
    for (let i = 0; i < this.n; i++) {
      const q = this.pts[Math.min(i, this.pts.length - 1)];
      p.setXYZ(i * 2, q[0].x, q[0].y, q[0].z); p.setXYZ(i * 2 + 1, q[1].x, q[1].y, q[1].z);
    }
    p.needsUpdate = true;
    this.mesh.visible = this.alpha > .01;
  }
}

export class FX {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera; this.ground = () => 0;
    this._particles(); this._slashes(); this._rings(); this._telegraphs(); this._bolts(); this._numbers();
  }

  // particles ---------------------------------------------------------------
  _particles() {
    const N = this.N = 900;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    this.pm = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), mat, N);
    this.pm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pm.frustumCulled = false;
    this.pm.setColorAt(0, _c.set(0xffffff));
    this.scene.add(this.pm);
    this.pd = new Float32Array(N * 11); // x y z vx vy vz life max size grav floor
    this.pcol = new Float32Array(N * 3);
    this.pi = 0;
  }

  spark(x, y, z, vx, vy, vz, life, size, color, grav = 14) {
    const i = this.pi = (this.pi + 1) % this.N, d = this.pd, o = i * 11, g0 = this.ground(x, z);
    d[o] = x; d[o + 1] = y + g0; d[o + 2] = z; d[o + 10] = g0 + .05; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz; d[o + 6] = life; d[o + 7] = life; d[o + 8] = size; d[o + 9] = grav;
    _c.set(color); this.pcol[i * 3] = _c.r; this.pcol[i * 3 + 1] = _c.g; this.pcol[i * 3 + 2] = _c.b;
  }

  burst(x, y, z, n, color, speed = 8, size = .09, life = .45, grav = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, e = Math.random() * 1.2 - .1, s = speed * (.35 + Math.random() * .75);
      this.spark(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1.5, Math.sin(a) * Math.cos(e) * s, life * (.5 + Math.random() * .7), size * (.5 + Math.random()), color, grav);
    }
  }

  _updateParticles(dt) {
    const d = this.pd, m = this.pm;
    for (let i = 0; i < this.N; i++) {
      const o = i * 11;
      if (d[o + 6] <= 0) { _m.makeScale(0, 0, 0); m.setMatrixAt(i, _m); continue; }
      d[o + 6] -= dt; d[o + 4] -= d[o + 9] * dt;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      if (d[o + 1] < d[o + 10]) { d[o + 1] = d[o + 10]; d[o + 4] *= -.4; }
      const k = Math.max(0, d[o + 6] / d[o + 7]), s = d[o + 8] * k;
      _m.makeScale(s, s, s); _m.setPosition(d[o], d[o + 1], d[o + 2]);
      m.setMatrixAt(i, _m);
      m.setColorAt(i, _c.setRGB(this.pcol[i * 3] * k * .9, this.pcol[i * 3 + 1] * k * .9, this.pcol[i * 3 + 2] * k * .9));
    }
    m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
  }

  // slash arcs --------------------------------------------------------------
  _slashes() {
    const geo = new THREE.PlaneGeometry(2, 2);
    this.slashes = Array.from({ length: 20 }, () => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: SLASH_VS, fragmentShader: SLASH_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
        uniforms: { uArc: { value: 2 }, uProg: { value: 0 }, uFade: { value: 0 }, uDir: { value: 1 }, uColor: { value: new THREE.Color() } },
      });
      const mesh = new THREE.Mesh(geo, mat); mesh.visible = false; mesh.frustumCulled = false;
      this.scene.add(mesh);
      return { mesh, t: 0, life: 0 };
    });
    this._si = 0;
  }

  /** arc in radians, roll around the facing axis (0 flat, PI/2 vertical), dir = sweep sense */
  slash(pos, facing, range, arc, roll, dir, color, life = .2) {
    const s = this.slashes[this._si = (this._si + 1) % this.slashes.length], u = s.mesh.material.uniforms;
    const y = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    const n = new THREE.Vector3(0, 1, 0).applyAxisAngle(y, roll).normalize();
    const x = new THREE.Vector3().crossVectors(y, n);
    s.mesh.quaternion.setFromRotationMatrix(_m.makeBasis(x, y, n));
    s.mesh.position.copy(pos); s.mesh.position.y += this.ground(pos.x, pos.z); s.mesh.scale.setScalar(range);
    u.uArc.value = Math.min(arc, 6.283); u.uDir.value = dir; u.uColor.value.set(color); u.uProg.value = 0; u.uFade.value = 0;
    s.t = 0; s.life = life; s.mesh.visible = true;
  }

  _updateSlashes(dt) {
    for (const s of this.slashes) {
      if (!s.mesh.visible) continue;
      s.t += dt;
      const k = s.t / s.life, u = s.mesh.material.uniforms;
      u.uProg.value = Math.min(1, k * 1.9);
      u.uFade.value = Math.max(0, (k - .5) * 2);
      if (k >= 1) s.mesh.visible = false;
    }
  }

  // expanding shockwaves -----------------------------------------------------
  _rings() {
    const geo = new THREE.RingGeometry(.86, 1, 72); geo.rotateX(-Math.PI / 2);
    this.rings = Array.from({ length: 16 }, () => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      m.visible = false; m.frustumCulled = false; this.scene.add(m);
      return { m, t: 0, life: 0, r: 1 };
    });
    this._ri = 0;
  }

  ring(x, z, r, color, life = .4, y = .08) {
    const s = this.rings[this._ri = (this._ri + 1) % this.rings.length];
    s.m.position.set(x, y + this.ground(x, z), z); s.m.material.color.set(color); s.m.material.opacity = 1; s.t = 0; s.life = life; s.r = r; s.m.visible = true; s.m.scale.setScalar(.1);
  }

  _updateRings(dt) {
    for (const s of this.rings) {
      if (!s.m.visible) continue;
      s.t += dt; const k = s.t / s.life;
      s.m.scale.setScalar(Math.max(.05, s.r * (1 - (1 - k) * (1 - k))));
      s.m.material.opacity = 1 - k;
      if (k >= 1) s.m.visible = false;
    }
  }

  // enemy attack warnings ------------------------------------------------------
  _telegraphs() {
    const disc = new THREE.CircleGeometry(1, 48); disc.rotateX(-Math.PI / 2);
    const ring = new THREE.RingGeometry(.95, 1, 48); ring.rotateX(-Math.PI / 2);
    const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2); plane.translate(0, 0, .5);
    const mk = (g, o) => {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff3048, transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      m.visible = false; m.frustumCulled = false; this.scene.add(m); return m;
    };
    this.tels = Array.from({ length: 28 }, () => ({ fill: mk(disc, .34), edge: mk(ring, .9), lineB: mk(plane, .18), lineF: mk(plane, .4), t: 0, life: 0, kind: '', on: false }));
  }

  telegraph(x, z, r, life) {
    const s = this.tels.find(t => !t.on); if (!s) return;
    s.on = true; s.kind = 'c'; s.t = 0; s.life = life;
    const gy = this.ground(x, z) + .06;
    s.fill.position.set(x, gy + .07, z); s.edge.position.set(x, gy + .08, z); s.edge.scale.setScalar(r); s.fill.visible = s.edge.visible = true; s.r = r; s.fill.scale.setScalar(.01);
  }

  telegraphLine(x, z, ang, len, wid, life) {
    const s = this.tels.find(t => !t.on); if (!s) return;
    s.on = true; s.kind = 'l'; s.t = 0; s.life = life; s.len = len; s.wid = wid;
    const gy = this.ground(x, z) + .06;
    for (const m of [s.lineB, s.lineF]) { m.position.set(x, gy + .07, z); m.rotation.y = ang; m.visible = true; }
    s.lineB.scale.set(wid, 1, len); s.lineF.scale.set(wid, 1, .01);
  }

  clearTelegraphs() { for (const s of this.tels) { s.on = false; s.fill.visible = s.edge.visible = s.lineB.visible = s.lineF.visible = false; } }

  _updateTelegraphs(dt) {
    for (const s of this.tels) {
      if (!s.on) continue;
      s.t += dt; const k = Math.min(1, s.t / s.life);
      if (s.kind === 'c') s.fill.scale.setScalar(Math.max(.01, s.r * k)); else s.lineF.scale.set(s.wid, 1, Math.max(.01, s.len * k));
      if (k >= 1) { s.on = false; s.fill.visible = s.edge.visible = s.lineB.visible = s.lineF.visible = false; }
    }
  }

  // chain lightning ------------------------------------------------------------
  _bolts() {
    this.bolts = Array.from({ length: 10 }, () => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xc9a6ff, transparent: true, toneMapped: false, blending: THREE.AdditiveBlending }));
      l.visible = false; l.frustumCulled = false; this.scene.add(l); return { l, t: 0 };
    });
    this._bi = 0;
  }

  bolt(a, b, color = 0xc9a6ff) {
    const s = this.bolts[this._bi = (this._bi + 1) % this.bolts.length], p = s.l.geometry.attributes.position;
    for (let i = 0; i < 10; i++) {
      const k = i / 9, j = i === 0 || i === 9 ? 0 : .28;
      const ga = this.ground(a.x, a.z), gb = this.ground(b.x, b.z);
      p.setXYZ(i, a.x + (b.x - a.x) * k + (Math.random() - .5) * j, ga + a.y + (gb + b.y - ga - a.y) * k + (Math.random() - .5) * j, a.z + (b.z - a.z) * k + (Math.random() - .5) * j);
    }
    p.needsUpdate = true; s.l.material.color.set(color); s.l.material.opacity = 1; s.t = .16; s.l.visible = true;
  }

  // damage numbers --------------------------------------------------------------
  _numbers() {
    const layer = document.getElementById('dmgLayer');
    this.nums = Array.from({ length: 44 }, () => {
      const el = document.createElement('div'); el.className = 'dmg'; el.style.opacity = 0; layer.appendChild(el);
      return { el, t: 0, x: 0, y: 0, z: 0, on: false };
    });
    this._ni = 0; this._v = new THREE.Vector3();
  }

  number(x, y, z, value, crit, color) {
    const s = this.nums[this._ni = (this._ni + 1) % this.nums.length];
    s.x = x + (Math.random() - .5) * .6; s.y = y + this.ground(x, z); s.z = z + (Math.random() - .5) * .6; s.t = 0; s.on = true;
    s.el.textContent = typeof value === 'number' ? Math.round(value) : value;
    s.el.className = crit ? 'dmg crit' : (typeof value === 'number' && value > 45 ? 'dmg big' : 'dmg');
    s.el.style.color = color || '';
  }

  _updateNumbers(dt) {
    const w = innerWidth, h = innerHeight;
    for (const s of this.nums) {
      if (!s.on) continue;
      s.t += dt;
      if (s.t > .75) { s.on = false; s.el.style.opacity = 0; continue; }
      const v = this._v.set(s.x, s.y + s.t * 2.2, s.z).project(this.camera);
      const sc = s.t < .1 ? 1.6 - s.t * 6 : 1;
      s.el.style.transform = `translate(${(v.x * .5 + .5) * w}px,${(-v.y * .5 + .5) * h}px) translate(-50%,-50%) scale(${sc})`;
      s.el.style.opacity = Math.min(1, (.75 - s.t) * 5);
    }
  }

  // impact stars, scorch decals and dust ----------------------------------------------------------
  _extras() {
    const star = document.createElement('canvas'); star.width = star.height = 128;
    const g = star.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.18, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#fff'; g.translate(64, 64);
    for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 4 * (i ? 2 : 1)); g.beginPath(); g.moveTo(-3, 0); g.lineTo(0, -62); g.lineTo(3, 0); g.lineTo(0, 62); g.fill(); }
    const tex = new THREE.CanvasTexture(star);
    this.stars = Array.from({ length: 16 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false, transparent: true }));
      s.visible = false; this.scene.add(s); return { s, t: 0, life: 0, size: 1 };
    });
    this._sti = 0;
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const h = sc.getContext('2d'), sg = h.createRadialGradient(64, 64, 6, 64, 64, 64);
    sg.addColorStop(0, 'rgba(0,0,0,.85)'); sg.addColorStop(.55, 'rgba(10,0,20,.55)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    h.fillStyle = sg; h.fillRect(0, 0, 128, 128);
    h.strokeStyle = 'rgba(0,0,0,.8)'; h.lineWidth = 3;
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + Math.random() * .4; h.beginPath(); h.moveTo(64, 64); let x = 64, y = 64; for (let k = 0; k < 4; k++) { x += Math.cos(a + (Math.random() - .5)) * 13; y += Math.sin(a + (Math.random() - .5)) * 13; h.lineTo(x, y); } h.stroke(); }
    const stex = new THREE.CanvasTexture(sc), geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
    this.decals = Array.from({ length: 14 }, () => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: stex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.visible = false; this.scene.add(m); return { m, t: 0 };
    });
    this._di = 0;
  }

  impact(x, y, z, size, color, life = .14) {
    if (!this.stars) this._extras();
    const s = this.stars[this._sti = (this._sti + 1) % this.stars.length];
    s.s.position.set(x, y + this.ground(x, z), z); s.s.material.color.set(color); s.s.material.rotation = Math.random() * 3; s.size = size; s.t = 0; s.life = life; s.s.visible = true;
  }

  scorch(x, z, r) {
    if (!this.stars) this._extras();
    const d = this.decals[this._di = (this._di + 1) % this.decals.length];
    d.m.position.set(x, this.ground(x, z) + .05, z); d.m.rotation.y = Math.random() * 6; d.m.scale.setScalar(r); d.t = 0; d.m.material.opacity = 1; d.m.visible = true;
  }

  /** anime streak sparks sprayed along a direction (radians on the ground plane) */
  spray(x, y, z, dir, n, color, speed = 10, size = .07) {
    if (!this.st) this._streaks();
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - .5) * 1.4, s = speed * (.6 + Math.random() * .9);
      const k = this.si = (this.si + 1) % this.SN, d = this.sd, o = k * 9;
      d[o] = x; d[o + 1] = y + this.ground(x, z); d[o + 2] = z; d[o + 3] = Math.sin(a) * s; d[o + 4] = (Math.random() * 1.2 - .1) * s * .5; d[o + 5] = Math.cos(a) * s;
      d[o + 6] = d[o + 7] = .16 + Math.random() * .14; d[o + 8] = size * 9;
      this.st.setColorAt(k, _c.set(i % 3 ? color : 0xffffff));
    }
    this.st.instanceColor.needsUpdate = true;
  }

  _streaks() {
    this.SN = 260; this.si = 0; this.sd = new Float32Array(this.SN * 9);
    const g = new THREE.BoxGeometry(.03, .03, 1); g.translate(0, 0, -.5);
    this.st = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }), this.SN);
    this.st.frustumCulled = false; this.st.setColorAt(0, _c.set(0xffffff)); this.scene.add(this.st);
    this._sq = new THREE.Quaternion(); this._sv = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1);
  }

  _updateStreaks(dt) {
    if (!this.st) return;
    const d = this.sd;
    for (let i = 0; i < this.SN; i++) {
      const o = i * 9;
      if (d[o + 6] <= 0) { _m.makeScale(0, 0, 0); this.st.setMatrixAt(i, _m); continue; }
      d[o + 6] -= dt; d[o + 3] *= Math.exp(-dt * 6); d[o + 4] = d[o + 4] * Math.exp(-dt * 6) - 6 * dt; d[o + 5] *= Math.exp(-dt * 6);
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      const v = this._sv.set(d[o + 3], d[o + 4], d[o + 5]), sp = v.length(), k = Math.max(0, d[o + 6] / d[o + 7]);
      this._sq.setFromUnitVectors(this._z, v.normalize());
      _m.compose(_p.set(d[o], d[o + 1], d[o + 2]), this._sq, _s.set(k * d[o + 8] * .12 + .2, k * d[o + 8] * .12 + .2, Math.max(.05, sp * .045 * k)));
      this.st.setMatrixAt(i, _m);
    }
    this.st.instanceMatrix.needsUpdate = true;
  }

  dust(x, z, n = 3) { for (let i = 0; i < n; i++) this.spark(x + (Math.random() - .5) * .4, .12, z + (Math.random() - .5) * .4, (Math.random() - .5) * 1.4, .6 + Math.random(), (Math.random() - .5) * 1.4, .45, .09, 0x6d6280, -1); }

  wisps(x, y, z, n, color) { for (let i = 0; i < n; i++) this.spark(x + (Math.random() - .5), y + Math.random(), z + (Math.random() - .5), (Math.random() - .5) * 1.5, 1.5 + Math.random() * 3, (Math.random() - .5) * 1.5, .8 + Math.random() * .6, .1, color, -2); }

  _updateExtras(dt) {
    if (!this.stars) return;
    for (const s of this.stars) {
      if (!s.s.visible) continue;
      s.t += dt; const k = s.t / s.life;
      s.s.scale.setScalar(s.size * (.6 + k * .9)); s.s.material.opacity = 1 - k;
      if (k >= 1) s.s.visible = false;
    }
    for (const d of this.decals) {
      if (!d.m.visible) continue;
      d.t += dt; if (d.t > 3) d.m.material.opacity = Math.max(0, 1 - (d.t - 3) / 1.5);
      if (d.t > 4.5) d.m.visible = false;
    }
  }

  update(dt) {
    this._updateParticles(dt); this._updateSlashes(dt); this._updateRings(dt); this._updateTelegraphs(dt); this._updateExtras(dt); this._updateStreaks(dt);
    for (const b of this.bolts) if (b.l.visible) { b.t -= dt; b.l.material.opacity = Math.max(0, b.t / .16); if (b.t <= 0) b.l.visible = false; }
  }

  /** Numbers run on real time so hit stop does not freeze them. */
  updateUnscaled(dt) { this._updateNumbers(dt); }
}
