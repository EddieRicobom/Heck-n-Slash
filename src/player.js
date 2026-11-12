import * as THREE from 'three';
import { STYLES, STYLE_ORDER, SPECIAL, CHARS } from './data.js';
import { ARENA } from './world.js';

import { Trail } from './fx.js';
import { toon, outline } from './toon.js';
import { SKILLS } from './skills.js';

const V = THREE.Vector3, Q = THREE.Quaternion;
const GRACE = .75;
const _v = new V(), _q = new Q(), _q2 = new Q();
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function buildClips(json) {
  const clips = {};
  for (const [name, c] of Object.entries(json)) {
    const tracks = c.tracks.map(t => t.p === 'q'
      ? new THREE.QuaternionKeyframeTrack(`${t.b}.quaternion`, t.t, t.v)
      : new THREE.VectorKeyframeTrack(`${t.b}.position`, t.t, t.v));
    clips[name] = new THREE.AnimationClip(name, c.d, tracks);
  }
  return clips;
}

export function baseStats() {
  return { tesla: 0, reach: 1, pierce: 0, skillPow: { gauntlet: 1, glaive: 1, cannon: 1 }, ultPow: 1, energyRegen: 1, startFury: 0, maxHp: 100, dmg: 1, speed: 1, atk: 1, crit: .05, critMult: 1.8, leech: 0, armor: 1, dodges: 2, shock: 1, bleed: 1, fury: 1, soul: 1, magnet: 3, comboTime: 3, rankBonus: 0, chain: 0, ghost: false, swapNova: false, instinct: false, execute: false, revive: 0 };
}

export class Player {
  constructor(game, gltf, clips, char = CHARS.eddie) {
    this.game = game; this.char = char;
    this.root = new THREE.Group();
    this.model = gltf.scene;
    this.root.add(this.model);
    this.bones = {};
    this.model.traverse(o => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) this.mesh = o;
      if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
    });
    // lift the very dark fur a little so Eddie reads against the night arena
    const mat = this.mesh.material = toon(this.mesh.material, {}, char.rim);
    if (mat.map) { mat.emissiveMap = mat.map; mat.emissive = new THREE.Color(char.id === 'eddie' ? 0x3a3a3a : 0x1c1c1c); }
    mat.side = THREE.FrontSide;
    this._outline();
    this.model.updateMatrixWorld(true);
    this._tailSetup();
    this._weapons();

    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = clips;
    this.actions = {};
    this.idle = this._action('Combat_Stance'); this.run = this._action('RunFast');
    for (const a of [this.idle, this.run]) { a.play(); a.setEffectiveWeight(0); }
    this.shots = [];
    this.reset(game.stats);
  }

  /** switching characters: the inactive one leaves the scene along with its trails and afterimages */
  setActive(on) {
    this.root.visible = on;
    for (const list of Object.values(this.trails || {})) for (const tr of list) { tr.t.mesh.visible = on; tr.t.alpha = 0; tr.t.pts.length = 0; }
    for (const gh of this._ghostPool || []) gh.m.visible = false;
  }

  reset(stats) {
    this.stats = stats;
    this.hp = stats.maxHp; this.fury = 0; this.dead = false;
    this.state = 'free'; this.t = 0; this.seq = ''; this.comboGrace = 0;
    this.style = this.char.styles[0]; this.vel = new V(); this.facing = Math.PI; this.dodgeCharge = stats.dodges;
    this.iframe = 0; this.moonT = 0; this.critT = 0; this.swapBuff = 0; this.lastHit = -9; this.time = 0; this.dodgeEnd = -9; this.counterT = 0; this.counter = false;
    this.y = 0; this.vy = 0; this.airborne = false; this.jumps = 0; this.airUsed = false; this.airSeq = ''; this.pursuit = null; this.lastLaunch = -9; this.hoverY = null; this.swapGlow = 0;
    this.wScale = Object.fromEntries(this.char.styles.map((s, i) => [s, i ? 0 : 1]));
    this.energy = 60; this.skillCd = {}; this.skill = null;
    this.root.position.set(0, 0, 0); this.root.rotation.y = this.facing;
    this.unlocked = new Set();
    for (const s of this.shots) s.a.stop();
    this.shots = [];
    this._showWeapon();
  }

  // ---- visual setup ------------------------------------------------------------------
  _outline() {
    const m = new THREE.MeshBasicMaterial({ color: 0x12061c, side: THREE.BackSide });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(objectNormal) * 0.014;');
    };
    const o = new THREE.SkinnedMesh(this.mesh.geometry, m);
    o.bind(this.mesh.skeleton, this.mesh.bindMatrix);
    o.position.copy(this.mesh.position); o.quaternion.copy(this.mesh.quaternion); o.scale.copy(this.mesh.scale);
    o.frustumCulled = false;
    this.mesh.parent.add(o);
  }

  _tailSetup() {
    this.tail = [];
    for (let i = 1; i <= 5; i++) {
      const b = this.bones[`Tail0${i}`];
      if (!b) continue;
      const inv = b.getWorldQuaternion(new Q()).invert();
      this.tail.push({ b, rest: b.quaternion.clone(), wag: new V(0, 1, 0).applyQuaternion(inv).normalize(), lift: new V(1, 0, 0).applyQuaternion(inv).normalize() });
    }
    this.tailLag = 0;
  }

  _attach(boneName, obj, axisWorld, along) {
    const bone = this.bones[boneName];
    const inv = bone.getWorldQuaternion(new Q()).invert(), s = bone.getWorldScale(new V());
    const fore = this.bones[boneName.replace('Hand', 'ForeArm')];
    const arm = bone.getWorldPosition(new V()).sub(fore.getWorldPosition(new V())).normalize();
    const ax = axisWorld === 'arm' ? arm.clone() : axisWorld.clone().addScaledVector(arm, -axisWorld.dot(arm)).normalize();
    const g = new THREE.Group();
    g.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
    g.position.copy(arm.clone().applyQuaternion(inv).multiplyScalar(along).divide(s));
    g.quaternion.setFromUnitVectors(new V(0, 1, 0), ax.applyQuaternion(inv).normalize());
    g.userData.handGrip = g.quaternion.clone();
    g.add(obj); bone.add(g);
    return g;
  }

  _weapons() {
    if (this.char.id !== 'eddie') return this._tigressWeapons();
    const glow = (c, i = 1) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: .3, metalness: .2 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xdde6f0, metalness: .9, roughness: .22, emissive: 0x2a6f80, emissiveIntensity: .5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1622, roughness: .6, metalness: .4 });
    const fwd = new V(0, .15, 1).normalize();

    // claws: three energy blades per hand, along the fingers
    const claw = () => {
      const g = new THREE.Group();
      for (let i = -1; i <= 1; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(.022, .3, 5), glow(0xc77bff, 1.6));
        c.position.set(i * .028, .17, 0); c.rotation.z = -i * .12; g.add(c);
      }
      return g;
    };
    this.wClaws = [this._attach('RightHand', claw(), 'arm', .07), this._attach('LeftHand', claw(), 'arm', .07)];

    // katana
    const k = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .26, 6), dark); handle.position.y = .03;
    const guard = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .015, 10), glow(0x59e0ff, .8)); guard.position.y = .17;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.012, .92, .05), steel); blade.position.y = .64;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.026, .14, 4), steel); tip.position.y = 1.17; tip.scale.set(.46, 1, 1);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(.014, .9, .008), glow(0x59e0ff, 2)); edge.position.set(0, .64, .026);
    k.add(handle, guard, blade, tip, edge);
    this.wKatana = [this._attach('RightHand', k, fwd, .05)];

    // hammer
    const h = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.03, .035, 1.25, 6), dark); shaft.position.y = .22;
    const head = new THREE.Mesh(new THREE.BoxGeometry(.34, .3, .56), new THREE.MeshStandardMaterial({ color: 0x3b3346, metalness: .7, roughness: .4, flatShading: true }));
    head.position.y = .86;
    const band = new THREE.Mesh(new THREE.BoxGeometry(.36, .1, .58), glow(0xffb347, 1.8)); band.position.y = .86;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(.08, .25, 4), glow(0xffb347, 1)); spike.position.y = 1.1;
    h.add(shaft, head, band, spike);
    this.wHammer = [this._attach('RightHand', h, fwd, .05)];
    const A = this.game.weaponAssets;
    if (A?.katana && A?.hammer && A?.claws) this._meshyWeapons(A, new V(0, .25, -1).normalize());
    this.wSets = { claws: this.wClaws, katana: this.wKatana, hammer: this.wHammer };
    const cfg = (list, grip, trail, tip) => list.forEach(g => Object.assign(g.userData, { grip, trail, tip }));
    cfg(this.wKatana, { lift: 1, lean: .45, along: .04 }, this.meshyWeapons ? [.3, 1.14] : [.3, 1.23], [.4, 1.1]);
    cfg(this.wHammer, { lift: 1.3, lean: .3, along: .04 }, this.meshyWeapons ? [.72, 1.02] : [.66, 1.12], [.85, .85]);
    cfg(this.wClaws, { arm: true, along: -.05 }, this.meshyWeapons ? [.14, .34] : [.06, .34], [.3, .3]);
  }

  /** shared look for Meshy weapon models: toon shaded, inked, tinted by the style */
  _weaponModel(style, scene, mirror = false) {
    const holder = new THREE.Group(), model = scene;
    if (mirror) model.scale.x *= -1;
    const mats = [];
    model.traverse(o => { if (o.isMesh) { o.material = toon(o.material); o.material.emissive = new THREE.Color(STYLES[style].color); o.material.userData.ei = .12; o.material.emissiveIntensity = .12; mats.push(o.material); o.castShadow = true; } });
    holder.add(model);
    outline(holder, .012);
    return { holder, mats };
  }

  _weaponGlow(g, mats, style, glowY, glowSize) {
    const glowTex = Player._glowTex || (Player._glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })());
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: STYLES[style].color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    s.position.y = glowY; s.visible = false; g.add(s);
    Object.assign(g.userData, { glow: s, glowSize, mats, base: 1 });
  }

  /** a Meshy model fitted to a length along +Y, with its grip point (fraction of the length from the bottom) at the origin */
  static fit(scene, len, grip = .5, flip = false, axis = null) {
    const m = scene.clone(true), box = new THREE.Box3().setFromObject(m), size = box.getSize(new V()), c = box.getCenter(new V());
    const ax = axis || (size.x >= size.y && size.x >= size.z ? 'x' : size.z >= size.y ? 'z' : 'y');
    const g = new THREE.Group(), inner = new THREE.Group(); inner.add(m); g.add(inner);
    m.position.sub(c);
    if (ax === 'x') inner.rotation.z = flip ? -Math.PI / 2 : Math.PI / 2; else if (ax === 'z') inner.rotation.x = flip ? Math.PI / 2 : -Math.PI / 2; else if (flip) inner.rotation.z = Math.PI;
    g.scale.setScalar(len / size[ax]);
    g.position.y = (.5 - grip) * len;
    const out = new THREE.Group(); out.add(g); return out;
  }

  /** the Tigress: twin gauntlets, a glaive and a forearm plasma cannon (Meshy models when available) */
  _tigressWeapons() {
    const A = this.game.weaponAssets || {}, glow = (c, i = 1) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: .3, metalness: .2 });
    const ti = new THREE.MeshStandardMaterial({ color: 0xe8edf2, metalness: .8, roughness: .3 }), fwd = new V(0, .25, -1).normalize();
    const prim = {
      gauntlet: () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(.13, .16, .13), ti); const c = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), glow(0x3dff8a, 2)); c.position.set(0, .02, .07); g.add(b, c); return g; },
      glaive: () => { const g = new THREE.Group(); const s = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.7, 6), ti); s.position.y = .35; const b = new THREE.Mesh(new THREE.ConeGeometry(.08, .55, 4), glow(0xff8a2a, 1.4)); b.position.y = 1.45; b.scale.set(.4, 1, 1); g.add(s, b); return g; },
      cannon: () => { const g = new THREE.Group(); const s = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, .42, 10), ti); const r = new THREE.Mesh(new THREE.TorusGeometry(.085, .02, 6, 14), glow(0x7fe9ff, 2)); r.rotation.x = Math.PI / 2; r.position.y = .2; g.add(s, r); return g; },
    };
    const F = this.char.fit || {};
    const build = (style, mirror = false) => {
      const f = F[style];
      if (A[style] && f) return this._weaponModel(style, Player.fit(A[style], f.len, f.grip, f.flip, f.axis), mirror);
      const h = new THREE.Group(), m = prim[style](); if (mirror) m.scale.x = -1; h.add(m); outline(h, .012);
      const mats = []; m.traverse(o => { if (o.isMesh) mats.push(o.material); });
      return { holder: h, mats };
    };
    const gr = build('gauntlet'), gl = build('gauntlet', true), gv = build('glaive'), cn = build('cannon');
    this.wSets = {
      gauntlet: [this._attach('RightHand', gr.holder, 'arm', .02), this._attach('LeftHand', gl.holder, 'arm', .02)],
      glaive: [this._attach('RightHand', gv.holder, fwd, .04)],
      cannon: [this._attach('RightHand', cn.holder, 'arm', .02)],
    };
    this._weaponGlow(this.wSets.gauntlet[0], gr.mats, 'gauntlet', .05, .8); this._weaponGlow(this.wSets.gauntlet[1], gl.mats, 'gauntlet', .05, .8);
    this._weaponGlow(this.wSets.glaive[0], gv.mats, 'glaive', 1.2, 1.5); this._weaponGlow(this.wSets.cannon[0], cn.mats, 'cannon', .25, 1);
    const cfg = (list, grip, trail, tip) => list.forEach(g => Object.assign(g.userData, { grip, trail, tip }));
    cfg(this.wSets.gauntlet, { arm: true, along: 0 }, [0, .16], [.05, .12]);
    cfg(this.wSets.glaive, { lift: 1.2, lean: .35, along: .04 }, [.95, 1.35], [.9, 1.35]);
    cfg(this.wSets.cannon, { arm: true, along: -.12 }, null, [.25, .25]);
    this.meshyWeapons = true;
  }

  /** Replace the primitive weapons with the Meshy models (toon shaded, inked, glowing on summon). */
  _meshyWeapons(A, fwd) {
    for (const g of [...this.wClaws, ...this.wKatana, ...this.wHammer]) g.parent.remove(g);
    const make = (style, scene, scale, pos, rot, mirror = false) => {
      const holder = new THREE.Group(), model = scene.clone(true);
      model.scale.setScalar(scale); if (mirror) model.scale.z *= -1;
      model.position.set(...pos); model.rotation.set(...rot);
      const mats = [];
      model.traverse(o => { if (o.isMesh) { o.material = toon(o.material); o.material.emissive = new THREE.Color(STYLES[style].color); o.material.userData.ei = .12; o.material.emissiveIntensity = .12; mats.push(o.material); o.castShadow = true; } });
      holder.add(model);
      outline(holder, .012);
      return { holder, mats };
    };
    const glowTex = Player._glowTex || (Player._glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })());
    const finish = (g, mats, style, glowY, glowSize) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: STYLES[style].color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      s.position.y = glowY; s.visible = false; g.add(s);
      g.userData.glow = s; g.userData.glowSize = glowSize; g.userData.mats = mats; g.userData.base = 1;
    };
    const k = make('katana', A.katana, 1.3, [0, .52, 0], [0, 0, 0]);
    this.wKatana = [this._attach('RightHand', k.holder, fwd, .04)]; finish(this.wKatana[0], k.mats, 'katana', .7, 1.6);
    const h = make('hammer', A.hammer, 1.35, [0, .34, 0], [0, 0, 0]);
    this.wHammer = [this._attach('RightHand', h.holder, fwd, .04)]; finish(this.wHammer[0], h.mats, 'hammer', .86, 1.4);
    const cr = make('claws', A.claws, .5, [0, .09, 0], [0, 0, Math.PI / 2]), cl = make('claws', A.claws, .5, [0, .09, 0], [0, 0, Math.PI / 2], true);
    this.wClaws = [this._attach('RightHand', cr.holder, 'arm', .02), this._attach('LeftHand', cl.holder, 'arm', .02)];
    finish(this.wClaws[0], cr.mats, 'claws', .3, .9); finish(this.wClaws[1], cl.mats, 'claws', .3, .9);
    this.meshyWeapons = true;
  }

  _showWeapon(instant = true) {
    if (!this.wScale) this.wScale = {};
    for (const id of Object.keys(this.wSets)) if (instant) this.wScale[id] = id === this.style ? 1 : 0;
    this._weaponScale(0);
  }

  /** Weapons materialize/dematerialize with a slight overshoot instead of popping, and glow when summoned. */
  _weaponScale(dt) {
    const sets = this.wSets;
    this.swapGlow = Math.max(0, (this.swapGlow || 0) - dt);
    for (const [id, groups] of Object.entries(sets)) {
      const target = id === this.style ? 1 : 0;
      const cur = this.wScale[id] ?? target;
      const next = dt ? cur + (target - cur) * Math.min(1, dt * (target ? 14 : 20)) : cur;
      this.wScale[id] = Math.abs(next - target) < .01 ? target : next;
      const k = this.wScale[id], pop = target && k < 1 ? 1 + Math.sin(k * Math.PI) * .25 : 1;
      for (const g of groups) {
        g.visible = k > .02; g.children[0].scale.setScalar(Math.max(.001, k * pop) * (g.userData.base || 1));
        const glow = g.userData.glow;
        if (glow) { const a = target ? Math.min(1, this.swapGlow / .3) : 0; glow.visible = a > .01; glow.material.opacity = a; glow.scale.setScalar(g.userData.glowSize * (1.6 - a * .6)); }
        if (g.userData.mats) for (const m of g.userData.mats) m.emissiveIntensity = (m.userData.ei ?? 1) + (target ? this.swapGlow * 9 : 0);
      }
    }
  }

  // ---- animation helpers ----------------------------------------------------------------
  _action(name) {
    if (!this.actions[name]) this.actions[name] = this.mixer.clipAction(this.clips[name]);
    return this.actions[name];
  }

  playOnce(name, from, to, dur, fade = .07) {
    const a = this._action(name), D = this.clips[name].duration;
    for (const s of this.shots) s.target = 0;
    this.shots = this.shots.filter(s => s.a !== a);
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    a.time = from * D; a.timeScale = (to - from) * D / dur; a.setEffectiveWeight(0); a.play();
    this.shots.push({ a, w: 0, target: 1, rate: 1 / fade });
    return a;
  }

  _blend(dt, moving) {
    let sum = 0;
    for (const s of this.shots) {
      s.w += Math.sign(s.target - s.w) * Math.min(Math.abs(s.target - s.w), dt * s.rate);
      s.a.setEffectiveWeight(s.w); sum += s.w;
    }
    this.shots = this.shots.filter(s => { if (s.target === 0 && s.w <= 0) { s.a.stop(); return false; } return true; });
    const loco = Math.max(0, 1 - sum);
    this.runW = THREE.MathUtils.damp(this.runW || 0, moving ? 1 : 0, 12, dt);
    this.idle.setEffectiveWeight(loco * (1 - this.runW)); this.run.setEffectiveWeight(loco * this.runW);
    // feet keep pace with the ground: the run cycle speeds up with the actual velocity
    this.run.timeScale = THREE.MathUtils.clamp(Math.hypot(this.vel.x, this.vel.z) / 7, .75, 1.45);
  }

  _endShots() { if (this.airborne && this.state !== 'attack') return; for (const s of this.shots) { s.target = 0; s.rate = 1 / .18; } }

  // ---- actions ------------------------------------------------------------------------------
  get styleDef() { return STYLES[this.style]; }

  available(seq) {
    const m = this.styleDef.moves[seq];
    return m && (!m.locked || this.unlocked.has(m.style + ':' + seq)) ? m : null;
  }

  get dodgeWindow() { return (this.state === 'dodge' && this.t > .14) || this.time - this.dodgeEnd < .3; }

  /** Decide which move a light/heavy press starts right now. */
  /** Holding away from the closest enemy while attacking = launcher. */
  backTarget() {
    const mv = this.game.input.moveVec();
    if (mv.lengthSq() < .25) return null;
    const p = this.root.position;
    let best = null, bd = 6.5;
    for (const e of this.game.enemies.list) {
      if (!e.alive || e.state === 'spawn') continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return null;
    const tx = (best.pos.x - p.x) / bd, tz = (best.pos.z - p.z) / bd;
    return (mv.x * tx + mv.z * tz) / mv.length() < -.45 ? best : null;
  }

  pick(k) {
    if (!this.airborne && this.available('B') && !this.dodgeWindow) {
      const bt = this.backTarget();
      if (bt) { this.forceTarget = bt; return this.available('B'); }
    }
    if (this.airborne) {
      if (k === 'H') return this.available('aH');
      if (this.airUsed) return null;
      const cont = (this.state === 'attack' && this.move.air) || this.comboGrace > 0 ? this.airSeq : '';
      return this.available('a' + cont + k) || (cont ? null : this.available('aL'));
    }
    if (this.dodgeWindow) { const d = this.available('d' + k); if (d) return d; }
    const inCombo = this.state === 'attack' || this.comboGrace > 0;
    if (inCombo) {
      const paused = this.state !== 'attack' && GRACE - this.comboGrace >= .2;
      return (paused && this.available(this.seq + '.' + k)) || this.available(this.seq + k) || this.available(k);
    }
    return this.available(k);
  }

  nextMoves() {
    const out = ['L', 'H'].map(k => { const m = this.pick(k); return m && { key: k, name: m.name }; });
    const inCombo = this.state === 'attack' || this.comboGrace > 0;
    if (inCombo && !this.dodgeWindow) for (const k of ['L', 'H']) { const m = this.available(this.seq + '.' + k); if (m) out.push({ key: k, name: m.name, pause: true }); }
    return out;
  }

  _pickTarget(dirAngle, range = 6.5) {
    let best = null, bs = 1e9;
    for (const e of this.game.enemies.list) {
      if (!e.alive || e.state === 'spawn') continue;
      const dx = e.pos.x - this.root.position.x, dz = e.pos.z - this.root.position.z, d = Math.hypot(dx, dz);
      if (d > range + e.r) continue;
      const da = Math.abs(angDiff(dirAngle, Math.atan2(dx, dz)));
      if (da > 1.3) continue;
      const score = d * (1 + da);
      if (score < bs) { bs = score; best = { e, d, ang: Math.atan2(dx, dz) }; }
    }
    return best;
  }

  startMove(move) {
    const g = this.game, aim = g.input.aimAngle(this.root.position, this.facing);
    let tgt = this._pickTarget(aim);
    if (this.forceTarget) { const e = this.forceTarget, p = this.root.position, d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z); tgt = { e, d, ang: Math.atan2(e.pos.x - p.x, e.pos.z - p.z) }; this.forceTarget = null; }
    this.facing = tgt ? tgt.ang : aim;
    this.root.rotation.y = this.facing;
    const reach = Math.max(...move.hits.map(h => h.range));
    let lunge = move.lunge || 0;
    if (tgt && !move.dash) lunge = THREE.MathUtils.clamp(tgt.d - tgt.e.r - reach * .55, 0, Math.max(lunge, 1.6));
    this.lunge = lunge; this.lungeEnd = Math.max(.08, move.hits[0].t);
    this.locked = !!tgt;
    if (move.air) {
      this.airSeq = move.seq.slice(1); if (move.fin) this.airUsed = true;
      this.hoverY = move.plunge ? null : tgt ? Math.max(.9, tgt.e.y > .3 ? tgt.e.y : this.y) : this.y;
      if (move.plunge) { lunge = Math.min(lunge, 1.5); this.lunge = lunge; this.vy = 4; g.speedLines(.35); }
    }
    if (move.dash) { g.speedLines(.3); this.ghosts(5); }
    if (move.dash || (this.lunge || 0) > 2.2) this.burst(this.facing, move.dash ? 1.2 : .8);
    this.sprint = false;
    this.move = move; this.moveT = 0; this.hitIdx = 0; this.state = 'attack'; this.seq = move.cont ?? move.seq; this.dashHits = new Set();
    this.counter = this.counterT > 0 && (move.seq[0] === 'd'); this.counterT = 0;
    if (move.dash) this.iframe = Math.max(this.iframe, this.lungeEnd + .05);
    // pick the clip: counters get their own animation, some openers alternate between variants;
    // the clip slice is shifted so its strike frame still lands on the move's hit time
    let anim = move.anim, from = move.from, to = move.to;
    const t0 = move.hits[0].t / move.dur, alt = this.counter ? { anim: 'Dodge_and_Counter', f: .28, span: .11 } : (move.alts && Math.random() < .5 ? move.alts[Math.random() * move.alts.length | 0] : null);
    if (alt && this.clips[alt.anim]) { anim = alt.anim; from = Math.max(0, alt.f - alt.span * t0); to = from + alt.span; }
    this.playOnce(anim, from, to, move.dur / this.atkSpeed, move.fade ?? (move.seq === 'S' ? .16 : .06));
    for (const e of g.enemies.list) if (e.agile && e !== tgt?.e && e.pos.distanceTo(this.root.position) < 3.5 && Math.random() < .3) e.evade();
    if (tgt?.e?.agile && Math.random() < .18) tgt.e.evade();
    g.audio.swish(this.style, move.hits[0].heavy);
    g.ui.moveName(this.counter ? `CONTRA-ATAQUE: ${move.name}` : move.name, move.seq === 'F' ? '#fff' : this.styleDef.css);
  }

  get atkSpeed() { return this.stats.atk * (this.moonT > 0 ? 1.2 : 1); }

  onLaunch(e) {
    this.lastLaunch = this.time; this.launchTarget = e;
    if (this.state === 'attack' && this.move.rise && !this.airborne) {
      this.airborne = true; this.vy = 13.2; this.jumps = 1; this.airUsed = false; this.airSeq = ''; this.pursuit = e;
      this.game.speedLines(.45); this.game.fx.dust(this.root.position.x, this.root.position.z, 10);
      this.game.ui.moveName(this.move.name + ' · SIGA NO AR!', this.styleDef.css);
    }
  }

  jump() {
    if (this.dead || this.state === 'dodge' || this.state === 'hurt') return false;
    if (this.state === 'attack' && this.moveT < this.move.cancel && !(this.move.air && this.hitIdx > 0)) return false;
    const g = this.game, p = this.root.position;
    if (!this.airborne) {
      const pursuit = this.time - this.lastLaunch < .8 && this.launchTarget?.alive && this.launchTarget.y > .2;
      this.vy = pursuit ? 13.5 : 10; this.jumps = 1;
      this.pursuit = pursuit ? this.launchTarget : null;
      if (pursuit) { g.speedLines(.5); g.ui.moveName('PERSEGUIÇÃO', this.styleDef.css); }
      if (Math.hypot(this.vel.x, this.vel.z) > 4 && this.clips.Jump_Run) this.playOnce('Jump_Run', .18, .48, .5, .06); else this.playOnce('Basic_Jump', .25, .55, .45, .06);
    } else if (this.jumps < 2) {
      this.vy = 9; this.jumps = 2; this.airUsed = false; this.airSeq = '';
      this.playOnce('Rightward_Spin', .1, .7, .45, .06);
      g.fx.ring(p.x, p.z, 1.2, 0xffffff, .25, p.y + .1);
      if (this.char.id !== 'eddie') for (let i = 0; i < 14; i++) g.fx.spark(p.x + (Math.random() - .5) * .3, this.y + .6, p.z + (Math.random() - .5) * .3, (Math.random() - .5) * 3, -8 - Math.random() * 6, (Math.random() - .5) * 3, .25, .09, [0xffffff, 0xffc65c, 0xff8a2a, 0x3dff8a][i % 4], 0);
    } else return false;
    this.airborne = true; this.state = 'free'; this.comboGrace = 0;
    g.fx.dust(p.x, p.z, 6); g.audio.jump(); this.squash = -.16; this.ghosts(2);
    return true;
  }

  _startSprint() {
    this.sprint = true;
    this.burst(this.facing, .55); this.game.speedLines(.15);
  }

  /** braking hard: dust plume, sparks off the feet, the body leans back */
  _skid(cur) {
    const g = this.game, p = this.root.position, a = Math.atan2(this.vel.x, this.vel.z);
    this.skidCd = .6; this.sprint = false; this.runT = 0;
    g.fx.dust(p.x + Math.sin(a) * .4, p.z + Math.cos(a) * .4, 9);
    g.fx.spray(p.x, .15, p.z, a, 10, this.char.id === 'eddie' ? 0xd8ccef : 0xffc65c, cur * .9, .05);
    this.leanX = -.28; this.squash = Math.max(this.squash || 0, .1);
    g.audio._noise({ dur: .22, f0: 2400, f1: 700, q: 1.2, vol: .07, verb: 0 });
  }

  /** anime acceleration burst: dust plume, streaks flying backwards, camera punch and speed lines */
  burst(dir, k = 1) {
    const g = this.game, p = this.root.position, back = dir + Math.PI;
    g.fx.dust(p.x, p.z, Math.round(10 * k));
    g.fx.spray(p.x, this.y + .3, p.z, back, Math.round(12 * k), 0xd8ccef, 12 * k, .05);
    g.fx.spray(p.x, this.y + 1, p.z, back, Math.round(8 * k), this.styleDef.color, 14 * k, .04);
    g.fx.ring(p.x, p.z, 1.4 * k, 0xffffff, .2, this.y + .1);
    g.fovKick = Math.max(g.fovKick || 0, 2.5 * k); g.speedLines(.18 * k);
    this.squash = Math.min(this.squash || 0, -.08);
    if (this.char.id !== 'eddie') this.thrust(back, k);
  }

  /** the Tigress's back thrusters: a jet of flame and green arcs pushing her forward */
  thrust(back, k = 1) {
    const g = this.game, p = this.root.position, y = this.y + 1.15;
    const bx = p.x + Math.sin(back) * .35, bz = p.z + Math.cos(back) * .35;
    for (let i = 0; i < Math.round(16 * k); i++) {
      const s = 6 + Math.random() * 10, a = back + (Math.random() - .5) * .5;
      g.fx.spark(bx, y + (Math.random() - .5) * .3, bz, Math.sin(a) * s, (Math.random() - .3) * 2, Math.cos(a) * s, .18 + Math.random() * .15, .07 + Math.random() * .06, [0xffffff, 0xffc65c, 0xff8a2a, 0x3dff8a][i % 4], 0);
    }
    for (let i = 0; i < 2; i++) { const a = back + (Math.random() - .5) * .9, r = 1 + Math.random(); g.fx.bolt(new V(bx, y, bz), new V(bx + Math.sin(a) * r, y + (Math.random() - .5) * .6, bz + Math.cos(a) * r), 0x3dff8a); }
    g.fx.impact(bx, y, bz, .9 * k, 0xffc65c, .08);
  }

  /** afterimages: frozen translucent copies of Eddie's current pose that fade out */
  ghosts(n = 3) { this._ghostQueue = n; this._ghostT = 0; }

  _ghostUpdate(dt) {
    if (!this._ghostPool) {
      this._ghostPool = Array.from({ length: 8 }, () => {
        const bones = this.mesh.skeleton.bones.map(b => b.clone(false));
        const sk = new THREE.Skeleton(bones, this.mesh.skeleton.boneInverses);
        sk.update = () => {};
        const m = new THREE.SkinnedMesh(this.mesh.geometry, new THREE.MeshBasicMaterial({ color: 0xb44dff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        m.bind(sk, this.mesh.bindMatrix); m.bindMode = THREE.DetachedBindMode; m.frustumCulled = false; m.matrixAutoUpdate = false; m.visible = false;
        this.game.scene.add(m); return { m, t: 0 };
      });
    }
    if (this._ghostQueue > 0 && (this._ghostT -= dt) <= 0) {
      this._ghostQueue--; this._ghostT = .045;
      const gh = this._ghostPool.find(g => !g.m.visible) || this._ghostPool[0];
      this.mesh.updateMatrixWorld(true);
      const dst = gh.m.skeleton.boneMatrices, src = this.mesh.skeleton.boneMatrices;
      dst.set(src.subarray(0, Math.min(dst.length, src.length)));
      if (gh.m.skeleton.boneTexture) gh.m.skeleton.boneTexture.needsUpdate = true;
      gh.m.matrix.copy(this.mesh.matrixWorld); gh.m.matrixWorld.copy(this.mesh.matrixWorld);
      gh.m.bindMatrixInverse.copy(this.mesh.bindMatrixInverse);
      gh.m.material.color.set(this.styleDef.color); gh.t = .32; gh.m.visible = true;
    }
    for (const gh of this._ghostPool) if (gh.m.visible) { gh.t -= dt; gh.m.material.opacity = Math.max(0, gh.t / .32) * .45; if (gh.t <= 0) gh.m.visible = false; }
  }

  _land() {
    const g = this.game, p = this.root.position, hard = this.vy < -12;
    this.y = 0; this.vy = 0; this.airborne = false; this.jumps = 0; this.airUsed = false; this.airSeq = ''; this.pursuit = null;
    p.y = g.ground(p.x, p.z);
    g.fx.dust(p.x, p.z, hard ? 12 : 5); this.squash = hard ? .24 : .14; g.audio.land();
    if (this.state === 'attack' && this.move.plunge) {
      g.resolveHit(this.move.hits[0], this.move); this.hitIdx = this.move.hits.length;
      this.moveT = Math.max(this.moveT, this.move.landT);
    } else if (this.state === 'attack' && this.move.air) { this.state = 'free'; this.comboGrace = 0; this._endShots(); }
    else if (this.state === 'free') this._endShots();
  }

  _vertical(dt) {
    if (!this.airborne) return;
    const p = this.root.position, m = this.state === 'attack' ? this.move : null;
    if (m && m.air && !m.plunge) {
      this.vy = 0;
      if (this.hoverY != null) this.y += (this.hoverY - this.y) * Math.min(1, dt * 9);
    } else if (m && m.plunge) {
      this.vy = this.moveT > m.plungeAt ? -30 : Math.max(this.vy - 20 * dt, 1);
      this.y += this.vy * dt;
      if (this.vy < 0) this.game.fx.spark(p.x, this.y + 1, p.z, 0, 3, 0, .3, .12, this.styleDef.color, 0);
    } else if (this.state === 'dodge') { this.vy = 0; }
    else {
      this.vy = Math.max(-17, this.vy - (this.vy > 0 ? 22 : 17) * dt);
      this.y += this.vy * dt;
      if (this.pursuit && this.vy > 0) {
        const t = this.pursuit.pos;
        p.x += (t.x - p.x) * Math.min(1, dt * 5); p.z += (t.z - p.z) * Math.min(1, dt * 5);
        if (Math.hypot(t.x - p.x, t.z - p.z) > .1) this.facing = Math.atan2(t.x - p.x, t.z - p.z);
      }
    }
    if (this.y <= 0 && this.vy <= 0) this._land();
  }

  dodge() {
    if (this.dodgeCharge < 1) return false;
    this.dodgeCharge -= 1;
    const mv = this.game.input.moveVec();
    this.sidestep = mv.lengthSq() === 0 && !this.airborne;
    this.dodgeDir = mv.lengthSq() > 0 ? Math.atan2(mv.x, mv.z) : this.facing + (Math.random() < .5 ? 1.57 : -1.57);
    if (!this.sidestep) { this.facing = this.dodgeDir; this.root.rotation.y = this.facing; }
    this.state = 'dodge'; this.t = 0; this.iframe = .34; this.ghostHit = new Set(); if (this.airborne) this.vy = 0;
    this.seq = ''; this.comboGrace = 0;
    const p = this.root.position; this.game.fx.dust(p.x, p.z, 8);
    if (this.airborne) this.playOnce('Rightward_Spin', .1, .7, .42, .05);
    else if (this.sidestep && this.clips.Stand_Dodge_1) { if ((this.style === 'katana' || this.style === 'glaive') && this.clips.Sword_Parry) this.playOnce('Sword_Parry', .05, .45, .42, .04); else this.playOnce(Math.random() < .5 ? 'Stand_Dodge_1' : 'Stand_Dodge_2', .1, .5, .42, .04); }
    else this.playOnce('Roll_Dodge', .12, .62, .42, .04);
    this.ghosts(4); this.burst(this.dodgeDir, 1);
    this.game.audio.dodge();
    return true;
  }

  setStyle(id) {
    if (id === this.style || this.dead) return;
    const g = this.game, recent = this.time - this.lastHit < .7;
    const canStrike = recent && (this.state === 'free' || (this.state === 'attack' && this.moveT >= this.move.cancel));
    const old = this.style;
    this.style = id;
    this.seq = ''; this.comboGrace = 0;
    this._swapFx(old, id);
    g.audio.swap(id);
    const p = this.root.position;
    g.fx.burst(p.x, 1.1, p.z, 18, STYLES[id].color, 5, .07, .35, 2);
    g.fx.ring(p.x, p.z, 1.6, STYLES[id].color, .25);
    if (recent) {
      this.swapBuff = 1.6;
      g.ui.announceSmall('TROCA SELVAGEM  +30%');
      if (this.stats.swapNova) g.shockwave(p.x, p.z, 4.2, 18, STYLES[id].color, { knock: 6 });
      if (canStrike && this.available('S')) this.startMove(this.available('S'));
    }
  }

  _swapFx(old, id) {
    const g = this.game, sets = this.wSets;
    const v = new V();
    this.swapGlow = .35;
    g.hitstop(.05); // ~3 frames of weight on every swap
    for (const grp of sets[old]) { grp.getWorldPosition(v); v.y -= g.ground(v.x, v.z); g.fx.burst(v.x, v.y, v.z, 10, STYLES[old].color, 3, .06, .3, -3); }
    for (const grp of sets[id]) { grp.getWorldPosition(v); v.y -= g.ground(v.x, v.z); g.fx.impact(v.x, v.y, v.z, 1.2, STYLES[id].color, .2); g.fx.burst(v.x, v.y, v.z, 16, 0xffffff, 4, .05, .35, -2); }
  }

  special() {
    if (this.fury < 100 || this.dead || this.state === 'dodge' || this.state === 'skill') return;
    this.airborne = false; this.y = 0; this.vy = 0;
    this.state = 'skill'; this.skill = this.game.skills.ultimate();
  }

  /** energy skills: E/R on keyboard, LT/LB on a gamepad */
  useSkill(i) {
    if (this.dead || this.airborne || this.state === 'skill' || this.state === 'dodge' || this.state === 'hurt') return false;
    if (this.state === 'attack' && this.moveT < this.move.cancel) return false;
    const def = SKILLS[this.style][i];
    if ((this.skillCd[def.id] || 0) > 0) { this.game.ui.announceSmall('Recarregando…'); return true; }
    if (this.energy < def.cost) { this.game.ui.announceSmall('Energia insuficiente'); this.game.audio.ui(); return true; }
    this.state = 'skill'; this._endShots(); this.skill = this.game.skills.start(def);
    return true;
  }

  heal(n) { this.hp = Math.min(this.stats.maxHp, this.hp + n); }

  // ---- update ---------------------------------------------------------------------------------------
  update(dt) {
    const g = this.game, inp = g.input, st = this.stats, p = this.root.position;
    this.time += dt;
    for (const k of ['iframe', 'moonT', 'critT', 'swapBuff', 'comboGrace', 'counterT']) this[k] = Math.max(0, (this[k] || 0) - dt);
    if (this.dodgeCharge < st.dodges) this.dodgeCharge = Math.min(st.dodges, this.dodgeCharge + dt / 1.1);
    this.energy = Math.min(100, this.energy + dt * 5 * (st.energyRegen || 1));
    for (const k in this.skillCd) this.skillCd[k] = Math.max(0, this.skillCd[k] - dt);

    let moving = false;
    if (this.state === 'dead') { this.mixer.update(dt); this._blend(dt, false); this._trails(dt); return; }

    const buf = inp.peek(.65);
    const lockedSpecial = this.state === 'attack' && this.move.seq === 'F' && this.moveT < this.move.hits[0].t;
    if (this.state === 'skill') {
      if (this.skill.update(dt)) { this.state = 'free'; this.skill = null; this._endShots(); }
      return this._post(dt, false);
    }
    if (buf === 'S1' || buf === 'S2') { if (this.useSkill(buf === 'S1' ? 0 : 1)) inp.take(); if (this.state === 'skill') return this._post(dt, false); }
    if (buf === 'J' && !lockedSpecial) { if (this.jump()) inp.take(); }
    else if (buf === 'D' && !lockedSpecial && this.state !== 'dodge') { if (this.dodge()) inp.take(); }
    else if (buf === 'F' && this.fury >= 100 && this.state !== 'dodge') { inp.take(); this.special(); }

    if (this.state === 'free') {
      const mv = inp.moveVec(), cur = Math.hypot(this.vel.x, this.vel.z);
      moving = mv.lengthSq() > .01;
      // sprint: dodging while holding a direction (or running for a while) breaks into a dash-run
      this.runT = moving && !this.airborne ? (this.runT || 0) + dt : 0;
      if (!moving) this.sprint = false; else if (!this.sprint && this.runT > 1.4) this._startSprint();
      const sp = 6.8 * st.speed * this.styleDef.move * (this.moonT > 0 ? 1.15 : 1) * (this.sprint ? 1.42 : 1);
      // skid: letting go or reversing at speed digs the feet in
      this.skidCd = Math.max(0, (this.skidCd || 0) - dt);
      if (!this.airborne && cur > 7 && this.skidCd <= 0 && (!moving || (mv.x * this.vel.x + mv.z * this.vel.z) / cur < -.3)) this._skid(cur);
      // quick to start, a touch of slide when stopping, floaty in the air
      const rate = this.airborne ? 7 : moving ? (cur < sp * .5 ? 22 : 12) : 15;
      this.vel.x = THREE.MathUtils.damp(this.vel.x, mv.x * sp, rate, dt);
      this.vel.z = THREE.MathUtils.damp(this.vel.z, mv.z * sp, rate, dt);
      if (moving) this.facing += angDiff(this.facing, Math.atan2(mv.x, mv.z)) * Math.min(1, dt * (this.sprint ? 11 : 20));
      p.x += this.vel.x * dt; p.z += this.vel.z * dt;
      if (moving && !this.airborne && !this._wasMoving && cur < 1.5) { g.fx.dust(p.x, p.z, 4); this.squash = Math.min(this.squash || 0, -.06); }
      this._wasMoving = moving;
      if (moving && !this.airborne && (this.stepT = (this.stepT || 0) - dt) <= 0) {
        this.stepT = THREE.MathUtils.clamp(1.9 / Math.max(1, cur), .16, .3); g.fx.dust(p.x, p.z, this.sprint ? 3 : 2); g.audio.step(g.mode === 'world');
      }
      if (this.sprint && !this.airborne && Math.random() < .5) { const s = Math.random() < .5 ? 1 : -1, a = this.facing + Math.PI; g.fx.spark(p.x + Math.cos(this.facing) * .5 * s, .6 + Math.random() * 1.1, p.z - Math.sin(this.facing) * .5 * s, Math.sin(a) * 9, 0, Math.cos(a) * 9, .2, .035, 0xffffff, 0); }
      this.idleT = moving || this.airborne ? 0 : (this.idleT || 0) + dt;
      if (this.idleT > 7 && g.state === 'play') { this.idleT = -12; if (Math.random() < .45 && this.clips.FunnyDancing_01) this.playOnce('FunnyDancing_01', .05, .4, 2.6, .25); else this.playOnce('Chest_Pound_Taunt', .12, .62, 2.4, .2); }
      if (this.comboGrace <= 0) this.seq = '';
      const b = inp.peek(.3);
      if (b === 'L' || b === 'H') {
        const next = this.pick(b);
        inp.take();
        if (next) this.startMove(next);
      }
    } else if (this.state === 'attack') {
      const m = this.move;
      const prev = this.moveT;
      this.moveT += dt * this.atkSpeed;
      // before the strike lands, keep turning toward the aim when nothing is locked on
      if (!this.locked && this.hitIdx === 0) this.facing += angDiff(this.facing, inp.aimAngle(p, this.facing)) * Math.min(1, dt * 12);
      if (this.lunge > 0 && prev < this.lungeEnd) {
        const ease = x => 1 - Math.pow(1 - Math.min(1, x), 4);
        const step = (ease(Math.min(this.moveT, this.lungeEnd) / this.lungeEnd) - ease(prev / this.lungeEnd)) * this.lunge;
        p.x += Math.sin(this.facing) * step; p.z += Math.cos(this.facing) * step;
        if (m.dash) for (const e of g.enemies.list) if (e.alive && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < e.r + 1.3) this.dashHits.add(e);
      }
      if (m.plunge && this.airborne && this.moveT > m.landT - .05) this.moveT = m.landT - .05; // hold the dive until touching down
      while (!m.plunge && this.hitIdx < m.hits.length && this.moveT >= m.hits[this.hitIdx].t) {
        g.resolveHit(m.hits[this.hitIdx], m);
        this.hitIdx++;
      }
      if (this.moveT >= m.cancel) {
        const b = inp.peek(.65);
        if (b === 'L' || b === 'H') {
          const next = this.pick(b);
          inp.take();
          if (next) { this.startMove(next); return this._post(dt, false); }
        } else if (this.moveT >= m.cancel + .06 && inp.moveVec().lengthSq() > .04 && m.seq !== 'F') {
          // walking out of the recovery keeps the combo alive for a moment
          this.state = 'free'; this.comboGrace = GRACE; this._endShots();
        }
      }
      if (this.state === 'attack' && this.moveT >= m.dur) { this.state = 'free'; this.comboGrace = GRACE; this._endShots(); this.vel.set(0, 0, 0); }
    } else if (this.state === 'dodge') {
      this.t += dt;
      const sp = this.t < .34 ? 26 * Math.pow(1 - this.t / .34, 1.5) + 4 : 3;
      p.x += Math.sin(this.dodgeDir) * sp * dt; p.z += Math.cos(this.dodgeDir) * sp * dt;
      if (st.ghost) for (const e of g.enemies.list) {
        if (e.alive && !this.ghostHit.has(e) && e.pos.distanceTo(p) < e.r + .9) { this.ghostHit.add(e); g.damageEnemy(e, 12 * st.dmg, { bleed: 3, color: 0xb44dff }); }
      }
      const b = inp.peek(.3);
      if ((b === 'L' || b === 'H') && this.t > .14) { const m = this.pick(b); if (m) { inp.take(); this.startMove(m); return this._post(dt, false); } }
      if (this.t > .4) { this.state = 'free'; this.dodgeEnd = this.time; if (!this.airborne) this._endShots(); if (!this.airborne && !this.sidestep && inp.moveVec().lengthSq() > .25) { this.vel.set(Math.sin(this.dodgeDir) * 8, 0, Math.cos(this.dodgeDir) * 8); this._startSprint(); } }
    } else if (this.state === 'hurt') {
      this.t += dt;
      p.x += this.vel.x * dt; p.z += this.vel.z * dt; this.vel.multiplyScalar(Math.exp(-dt * 8));
      if (this.t > .3) { this.state = 'free'; this._endShots(); }
    }
    this._post(dt, moving);
  }

  _post(dt, moving) {
    const p = this.root.position;
    this.game.clampPos(p, .45);
    this._vertical(dt);
    p.y = this.game.ground(p.x, p.z) + this.y;
    this._weaponScale(dt);
    // squash & stretch plus a lean into turns and acceleration
    this.squash = THREE.MathUtils.damp(this.squash || 0, 0, 10, dt);
    const sq = this.squash, sp2 = Math.hypot(this.vel.x, this.vel.z);
    const pv = this.root.position, lv = this._lastPos || (this._lastPos = pv.clone());
    const spd = dt > 0 ? Math.hypot(pv.x - lv.x, pv.z - lv.z) / dt : 0; this._lastPos.copy(pv);
    this.stretch = THREE.MathUtils.damp(this.stretch || 0, Math.min(.22, Math.max(0, spd - 9) * .018), 18, dt);
    const st2 = this.stretch;
    this.model.scale.set((1 + sq * .5) * (1 - st2 * .35), (1 - sq) * (1 - st2 * .2), (1 + sq * .5) * (1 + st2));
    if (st2 > .05 && Math.random() < st2 * 3) { const b = this.facing + Math.PI; this.game.fx.spray(pv.x, this.y + .9 + Math.random() * .6, pv.z, b, 2, Math.random() < .5 ? 0xffffff : this.styleDef.color, 9, .04); }
    const turnRate = angDiff(this.root.rotation.y, this.facing) / Math.max(dt, 1e-3);
    this.leanZ = THREE.MathUtils.damp(this.leanZ || 0, THREE.MathUtils.clamp(-turnRate * .012, -.22, .22) * Math.min(1, sp2 / 5), 8, dt);
    this.leanX = THREE.MathUtils.damp(this.leanX || 0, this.state === 'free' && !this.airborne ? Math.min(this.sprint ? .24 : .14, sp2 * .022) : 0, 6, dt);
    this.model.rotation.set(this.leanX, 0, this.leanZ);
    this._ghostUpdate(dt);
    this._power(dt);
    const prevFacing = this.root.rotation.y;
    this.root.rotation.y = this.facing;
    this.mixer.update(dt);
    this._blend(dt, moving);
    this._grip(dt);
    this._trails(dt);
    // tail: wag plus lag when turning
    const turn = angDiff(prevFacing, this.facing) / Math.max(dt, 1e-3);
    this.tailLag = THREE.MathUtils.damp(this.tailLag, THREE.MathUtils.clamp(-turn * .05, -.5, .5), 6, dt);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const amp = this.state === 'attack' ? .1 : .16 + sp * .01;
    this.tail.forEach((t, i) => {
      const w = Math.sin(this.time * (moving ? 9 : 3.2) - i * .7) * amp * (.4 + i * .18) + this.tailLag * (.3 + i * .15);
      const l = -(moving ? .12 : 0) - (this.state === 'attack' ? .1 : 0);
      t.b.quaternion.copy(t.rest).multiply(_q.setFromAxisAngle(t.wag, w)).multiply(_q2.setFromAxisAngle(t.lift, l));
    });
  }

  /** Keep a readable guard in locomotion and blend into the animated wrist for attacks. */
  _grip(dt) {
    if (!this.meshyWeapons) return;
    this.gripW = THREE.MathUtils.damp(this.gripW ?? 0, this.state === 'attack' || this.state === 'skill' ? 1 : 0, 12, dt || 1);
    this.root.updateMatrixWorld(true);
    const fwd = new V(Math.sin(this.facing), 0, Math.cos(this.facing)), up = new V(0, 1, 0);
    const place = (g, yAxis, along) => {
      const bone = g.parent, fore = bone.parent;
      const hand = bone.getWorldPosition(new V()), f = hand.clone().sub(fore.getWorldPosition(new V())).normalize();
      const Y = yAxis(f).normalize();
      let X = new V().crossVectors(Y, f); if (X.lengthSq() < 1e-4) X.crossVectors(Y, up); if (X.lengthSq() < 1e-4) X.set(1, 0, 0); X.normalize();
      const Z = new V().crossVectors(X, Y).normalize();
      const qWorld = new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
      const guard = bone.getWorldQuaternion(new Q()).invert().multiply(qWorld);
      g.quaternion.copy(guard).slerp(g.userData.handGrip, this.gripW);
      g.position.copy(bone.worldToLocal(hand.addScaledVector(f, along)));
    };
    const blade = (lift, lean) => f => {
      const guard = fwd.clone().multiplyScalar(.55).addScaledVector(up, lift), swing = fwd.clone().addScaledVector(up, .25);
      const ref = guard.lerp(swing, this.gripW).normalize();
      const perp = ref.addScaledVector(f, -ref.dot(f)); if (perp.lengthSq() < 1e-4) perp.copy(up);
      return perp.normalize().multiplyScalar(Math.cos(lean)).addScaledVector(f, Math.sin(lean));
    };
    for (const list of Object.values(this.wSets)) for (const g of list) { const c = g.userData.grip; if (c) place(g, c.arm ? f => f.clone() : blade(c.lift, c.lean), c.along); }
  }

  /** Combo power 0..1 drives weapon glow, aura particles, trail size and hit effects. */
  _power(dt) {
    const g = this.game, target = g.combo > 1 ? Math.min(1, (g.rankIndex() + Math.min(1, g.combo / 120)) / 4.2) : 0;
    this.power = THREE.MathUtils.damp(this.power || 0, target, target > (this.power || 0) ? 4 : 1.5, dt);
    const P = this.power, sets = this.wSets, col = this.styleDef.color;
    for (const grp of sets[this.style]) {
      if (grp.userData.mats) for (const m of grp.userData.mats) m.emissiveIntensity = (m.userData.ei ?? .12) + P * .6 + this.swapGlow * 6;
      const glow = grp.userData.glow;
      if (glow && this.swapGlow <= 0) { glow.visible = P > .25; glow.material.opacity = (P - .25) * .35 * (.8 + .2 * Math.sin(this.time * 10)); glow.scale.setScalar(grp.userData.glowSize * (1 + P * .3)); }
      if (Math.random() < P * .45 * (dt * 60) * .5) {
        const tr = grp.userData.tip || [.3, .3], tip = grp.localToWorld(new V(0, tr[0] + Math.random() * (tr[1] - tr[0]), 0));
        g.fx.spark(tip.x, tip.y - g.ground(tip.x, tip.z), tip.z, (Math.random() - .5) * .8, .8 + Math.random() * 1.5, (Math.random() - .5) * .8, .45, .05 + P * .05, Math.random() < .3 ? 0xffffff : col, -1.5);
      }
      if (P > .9 && Math.random() < .012) {
        const a = grp.localToWorld(new V(0, .2, 0)), b = grp.localToWorld(new V((Math.random() - .5) * .5, 1, (Math.random() - .5) * .5));
        a.y -= g.ground(a.x, a.z); b.y -= g.ground(b.x, b.z); g.fx.bolt(a, b, 0xffffff);
      }
    }
  }

  _trails(dt) {
    if (!this.trails) {
      const fx = this.game.scene;
      this.trails = Object.fromEntries(Object.entries(this.wSets).map(([style, groups]) => [style, groups.filter(g => g.userData.trail).map(g => ({ g, base: new V(0, g.userData.trail[0], 0), tip: new V(0, g.userData.trail[1], 0), t: new Trail(fx) }))]));
      this._tb = new V(); this._tt = new V();
    }
    this.root.updateMatrixWorld(true);
    const active = this.state === 'attack' && this.moveT < (this.move.hits.at(-1).t + .1);
    const P = this.power || 0;
    for (const [style, list] of Object.entries(this.trails)) for (const tr of list) {
      const on = style === this.style;
      // a shorter ribbon near the tip, shedding particles along the swing
      const half = (tr.tip.y - tr.base.y) * (.28 + P * .12), top = tr.tip.y;
      const b = tr.g.localToWorld(this._tb.set(0, top - half * 2, 0)), t2 = tr.g.localToWorld(this._tt.set(0, top, 0));
      tr.t.update(b, t2, on && active, STYLES[style].color, on ? dt : 1, P);
      if (on && active && Math.random() < .75) {
        const k = Math.random(), gx = b.x + (t2.x - b.x) * k, gy = b.y + (t2.y - b.y) * k, gz = b.z + (t2.z - b.z) * k;
        this.game.fx.spark(gx, gy - this.game.ground(gx, gz), gz, (Math.random() - .5) * 1.5, Math.random() * 1.2, (Math.random() - .5) * 1.5, .35 + Math.random() * .25, .045 + P * .03, Math.random() < .3 ? 0xffffff : STYLES[style].color, 1.5);
      }
    }
  }

  hurt(dmg, from) {
    if (this.dead) return;
    const st = this.stats;
    this.hp -= dmg * st.armor;
    this.iframe = .55;
    this.seq = ''; this.comboGrace = 0;
    const armored = (this.styleDef.armor && this.state === 'attack' && !this.airborne) || this.state === 'skill';
    if (this.airborne) { this.vy = Math.min(this.vy, 2); this.airUsed = true; }
    if (!armored && this.state !== 'dodge') {
      this.state = 'hurt'; this.t = 0;
      const a = Math.atan2(this.root.position.x - from.x, this.root.position.z - from.z);
      this.vel.set(Math.sin(a) * 6, 0, Math.cos(a) * 6);
      this.playOnce('Hit_Reaction', 0, .35, .3, .04);
    }
    if (this.hp <= 0) {
      if (st.revive > 0) { st.revive--; this.hp = st.maxHp * .5; this.iframe = 2; this.game.ui.announce(this.char.reviveName, `${this.char.short} se levanta`); this.game.shockwave(this.root.position.x, this.root.position.z, 6, 30, 0xb44dff, { knock: 10 }); return; }
      this.hp = 0; this.dead = true; this.state = 'dead';
      this.playOnce('Dead', 0, 1, 2.2, .1);
      this.game.onPlayerDeath();
    }
  }
}

export { STYLE_ORDER };
