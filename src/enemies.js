import * as THREE from 'three';
import { ARENA } from './world.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { toon, outline } from './toon.js';

// Meshy models: scale/height offset and which clip plays for each action ([clip, strike fraction]).
export const MODEL = {
  crawler: { scale: 1.9, y: .46 },
  spitter: { scale: 2.3, y: 1.55, float: true },
  bomber: { scale: 1.5, y: .72 },
  wraith: { scale: 1.05, clips: { walk: 'Walk_Fight_Forward', idle: 'Combat_Stance', atk: ['Left_Slash', .23], hit: 'Hit_Reaction', die: 'Dead' } },
  brute: { scale: 1, clips: { walk: 'Monster_Walk', idle: 'Idle', atk: ['Charged_Ground_Slam', .55], hit: 'Hit_Reaction', die: 'Dead' } },
  boss1: { scale: 1.15, clips: { walk: 'Monster_Walk', idle: 'Idle', slam: ['Charged_Ground_Slam', .55], charge: 'RunFast', cast: ['Charged_Spell_Cast', .5], roar: ['Shouting_Angrily', .35], hit: 'Hit_Reaction', die: 'Dead' } },
  wolf: { scale: 2, y: .48 },
  bat: { scale: 1.6, y: 0, float: true },
  shroom: { scale: 1.7, y: .8 },
  golem: { scale: 1, clips: { walk: 'Monster_Walk', idle: 'Idle', atk: ['Charged_Ground_Slam', .55], hit: 'Hit_Reaction', die: 'Dead' } },
  shaman: { scale: 1, clips: { walk: 'Walk_Fight_Forward', idle: 'Idle', atk: ['Charged_Spell_Cast', .5], hit: 'Hit_Reaction', die: 'Dead' } },
  archer: { scale: 1, clips: { walk: 'Walk_Fight_Forward', idle: 'Idle', atk: ['Archery_Shot', .55], hit: 'Hit_Reaction', die: 'Dead' } },
  treant: { scale: 1.1, clips: { walk: 'Slow_Orc_Walk', idle: 'Idle', slam: ['Charged_Ground_Slam', .55], roar: ['Shouting_Angrily', .35], hit: 'Hit_Reaction', die: 'Dead' } },
  boss2: { scale: 1.15, clips: { walk: 'Confident_Walk', idle: 'Idle', slam: ['Sword_Judgment', .21], charge: 'RunFast', cast: ['Charged_Spell_Cast', .5], roar: ['Sword_Shout', .35], hit: 'Hit_Reaction', die: 'Dead' } },
};

/** Keep Meshy clips in place: gameplay owns horizontal movement. */
export function stripRootMotion(clips) {
  for (const c of clips) for (const t of c.tracks) if (t.name.endsWith('Hips.position')) {
    const v = t.values, x = v[0], z = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x; v[i + 2] = z; }
  }
  return clips;
}

function buildFromAsset(e, asset) {
  const cfg = MODEL[e.type], root = new THREE.Group();
  const model = asset.skinned ? SkeletonUtils.clone(asset.scene) : asset.scene.clone(true);
  const mats = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = toon(o.material, {}, e.T.boss ? 0x7a5aff : 0x4a3a8a); o.material.emissive = new THREE.Color(0); mats.push(o.material);
    o.castShadow = true; o.frustumCulled = !o.isSkinnedMesh;
  });
  model.scale.setScalar(cfg.scale); model.position.y = cfg.y || 0;
  const holder = new THREE.Group(); holder.add(model); root.add(holder);
  outline(holder, e.type.startsWith('boss') ? .035 : .025, cfg.scale);
  return { root, mats, parts: { b: model, holder, model }, asset: true };
}


const V = THREE.Vector3;
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export const TYPES = {
  crawler: { name: 'Rastejante', hp: 34, speed: 5.2, dmg: 8, r: .55, range: 1.6, windup: .4, recover: .6, mass: .7, soul: 2, cd: .9, eye: 0xff3a4a },
  brute: { name: 'Bruto', hp: 160, speed: 2.5, dmg: 22, r: 1, range: 2.6, windup: .9, recover: 1, mass: 3, soul: 8, cd: 1.6, poise: 70, eye: 0xff6a2a },
  spitter: { name: 'Cuspidor', hp: 46, speed: 3.2, dmg: 10, r: .6, range: 12, keep: 7.5, windup: .65, recover: 1.3, mass: .8, soul: 4, cd: 1.8, eye: 0xc6ff4a },
  bomber: { name: 'Bombinha', hp: 24, speed: 6.2, dmg: 26, r: .55, range: 2.2, windup: .7, recover: 0, mass: .6, soul: 3, cd: 0, eye: 0xffa23a },
  wraith: { name: 'Espectro', hp: 72, speed: 4.4, dmg: 16, r: .6, range: 2.6, windup: .55, recover: .8, mass: 1, soul: 6, cd: 1.4, eye: 0x9fd6ff },
  boss1: { name: 'Gárgula de Obsidiana', hp: 1600, speed: 3.4, dmg: 24, r: 1.7, range: 4, windup: .9, recover: .9, mass: 30, soul: 120, cd: 1.1, poise: 260, boss: true, eye: 0xff4a3a },
  wolf: { name: 'Lobo de Cristal', hp: 40, speed: 6.4, dmg: 10, r: .6, range: 4.2, windup: .45, recover: .7, mass: .9, soul: 3, cd: 1.3, eye: 0x7ad8ff },
  bat: { name: 'Morcego Sombrio', hp: 30, speed: 5.5, dmg: 9, r: .6, range: 7, windup: .55, recover: .9, mass: .6, soul: 3, cd: 1.6, eye: 0xff4a5e, fly: 3.2 },
  shroom: { name: 'Cogumelo Tóxico', hp: 70, speed: 1.4, dmg: 12, r: .7, range: 3.2, windup: .9, recover: 1.2, mass: 1.8, soul: 4, cd: 2.2, eye: 0x9cff5a },
  golem: { name: 'Golem de Musgo', hp: 220, speed: 2.2, dmg: 26, r: 1.1, range: 2.8, windup: 1, recover: 1.1, mass: 4, soul: 10, cd: 1.8, poise: 110, eye: 0x7dff9a },
  shaman: { name: 'Xamã Ossudo', hp: 60, speed: 3, dmg: 11, r: .6, range: 13, keep: 9, windup: .8, recover: 1.2, mass: .9, soul: 6, cd: 2.2, eye: 0xb56bff },
  archer: { name: 'Arqueiro Esqueleto', hp: 55, speed: 3.4, dmg: 14, r: .6, range: 17, keep: 11, windup: .85, recover: 1, mass: .9, soul: 5, cd: 1.9, eye: 0x7ab8ff },
  treant: { name: 'Treant Corrompido', hp: 2600, speed: 2.8, dmg: 26, r: 1.8, range: 4.5, windup: 1, recover: .9, mass: 50, soul: 260, cd: 1, poise: 320, boss: true, eye: 0xb56bff },
  dummy: { name: 'Boneco de Treino', hp: 1000, speed: 0, dmg: 0, r: .95, range: 0, windup: 1, recover: 1, mass: 1.2, soul: 0, cd: 1e9, immortal: true, eye: 0xb7dc6a },
  boss2: { name: 'Rei da Noite Sem Lua', hp: 2900, speed: 3.8, dmg: 28, r: 1.6, range: 4, windup: .85, recover: .8, mass: 40, soul: 300, cd: .9, poise: 360, boss: true, eye: 0x9fd6ff },
};

const geo = {};
const G = (k, f) => geo[k] || (geo[k] = f());
const body = (c = 0x241d2e) => toon(new THREE.MeshStandardMaterial({ color: c, roughness: .75, flatShading: true, emissive: 0x000000 }));
const eyeMat = c => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });

function mesh(g, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; }

const BUILD = {
  crawler(e) {
    const m = body(0x2a2133), root = new THREE.Group();
    const b = mesh(G('cb', () => new THREE.IcosahedronGeometry(.45, 0)), m, 0, .55, 0); b.scale.set(1, .72, 1.35);
    const h = mesh(G('ch', () => new THREE.ConeGeometry(.3, .62, 5).rotateX(Math.PI / 2)), m, 0, .62, .72);
    const eg = G('eye', () => new THREE.SphereGeometry(.06, 6, 4)), em = eyeMat(e.eyeColor);
    h.add(mesh(eg, em, .13, .08, .05), mesh(eg, em, -.13, .08, .05));
    for (let i = 0; i < 3; i++) { const s = mesh(G('cs', () => new THREE.ConeGeometry(.09, .4, 4)), m, 0, .9, .25 - i * .3); s.rotation.x = -.5; root.add(s); }
    const legs = [];
    for (const [x, z] of [[.36, .4], [-.36, .4], [.36, -.4], [-.36, -.4]]) {
      const pivot = new THREE.Group(); pivot.position.set(x, .55, z);
      pivot.add(mesh(G('cl', () => new THREE.BoxGeometry(.11, .58, .11).translate(0, -.29, 0)), m)); root.add(pivot); legs.push(pivot);
    }
    root.add(b, h);
    return { root, mats: [m], parts: { b, h, legs } };
  },
  brute(e) {
    const m = body(0x2c2433), root = new THREE.Group();
    const t = mesh(G('bt', () => new THREE.DodecahedronGeometry(.9, 0)), m, 0, 1.75, 0); t.scale.set(1.15, 1, .85);
    const h = mesh(G('bh', () => new THREE.IcosahedronGeometry(.36, 0)), m, 0, 2.62, .35);
    const em = eyeMat(e.eyeColor), eg = G('eye2', () => new THREE.SphereGeometry(.08, 6, 4));
    h.add(mesh(eg, em, .15, .05, .28), mesh(eg, em, -.15, .05, .28));
    for (const s of [1, -1]) { const horn = mesh(G('bhn', () => new THREE.ConeGeometry(.09, .5, 4)), m, s * .3, .3, 0); horn.rotation.z = -s * .6; h.add(horn); }
    const arms = [];
    for (const s of [1, -1]) {
      const sh = new THREE.Group(); sh.position.set(s * 1.1, 2.15, 0);
      sh.add(mesh(G('ba', () => new THREE.BoxGeometry(.38, 1.3, .38).translate(0, -.65, 0)), m), mesh(G('bf', () => new THREE.IcosahedronGeometry(.42, 0)), m, 0, -1.4, 0));
      root.add(sh); arms.push(sh);
    }
    const legs = [];
    for (const s of [1, -1]) { const lg = new THREE.Group(); lg.position.set(s * .45, 1, 0); lg.add(mesh(G('bl', () => new THREE.CylinderGeometry(.22, .2, 1, 6).translate(0, -.5, 0)), m)); root.add(lg); legs.push(lg); }
    root.add(t, h);
    return { root, mats: [m], parts: { b: t, h, arms, legs } };
  },
  spitter(e) {
    const m = body(0x271f30), root = new THREE.Group();
    const b = mesh(G('sb', () => new THREE.ConeGeometry(.62, 1.4, 7).rotateX(Math.PI)), m, 0, 1.55, 0);
    const maw = mesh(G('sm', () => new THREE.IcosahedronGeometry(.27, 1)), eyeMat(e.eyeColor), 0, 1.75, .45);
    const tent = [];
    for (let i = 0; i < 4; i++) { const p = new THREE.Group(); const a = i / 4 * 6.283; p.position.set(Math.cos(a) * .3, .95, Math.sin(a) * .3); p.add(mesh(G('st', () => new THREE.ConeGeometry(.08, .7, 4).rotateX(Math.PI).translate(0, -.35, 0)), m)); root.add(p); tent.push(p); }
    root.add(b, maw);
    return { root, mats: [m], parts: { b, h: maw, tent } };
  },
  bomber(e) {
    const m = body(0x2b1f22), root = new THREE.Group();
    const b = mesh(G('ob', () => new THREE.IcosahedronGeometry(.55, 1)), m, 0, .7, 0);
    const core = mesh(G('oc', () => new THREE.IcosahedronGeometry(.6, 0)), new THREE.MeshBasicMaterial({ color: e.eyeColor, wireframe: true, toneMapped: false }), 0, .7, 0);
    const fuse = mesh(G('of', () => new THREE.CylinderGeometry(.04, .04, .3, 5)), m, 0, 1.35, 0);
    const spark = mesh(G('eye', () => new THREE.SphereGeometry(.06, 6, 4)), eyeMat(0xfff0a0), 0, 1.52, 0); spark.scale.setScalar(1.6);
    root.add(b, core, fuse, spark);
    return { root, mats: [m], parts: { b, h: core, spark } };
  },
  wraith(e) {
    const m = body(0x1f1c2e), root = new THREE.Group();
    const b = mesh(G('wb', () => new THREE.ConeGeometry(.62, 2, 7, 1, true)), new THREE.MeshStandardMaterial({ color: 0x1f1c2e, roughness: .8, flatShading: true, side: THREE.DoubleSide }), 0, 1.2, 0);
    const h = mesh(G('wh', () => new THREE.IcosahedronGeometry(.3, 0)), body(0xcfc6dd), 0, 2.25, .05);
    const em = eyeMat(e.eyeColor), eg = G('eye', () => new THREE.SphereGeometry(.06, 6, 4));
    h.add(mesh(eg, em, .11, .02, .24), mesh(eg, em, -.11, .02, .24));
    const arms = [];
    for (const s of [1, -1]) { const a = new THREE.Group(); a.position.set(s * .5, 1.75, 0); const bl = mesh(G('wa', () => new THREE.BoxGeometry(.06, 1.3, .16).translate(0, -.65, 0)), eyeMat(0xb9d8ff)); a.add(bl); a.rotation.z = s * .4; root.add(a); arms.push(a); }
    root.add(b, h);
    return { root, mats: [b.material, h.material], parts: { b, h, arms } };
  },
  boss1(e) {
    const p = BUILD.brute(e);
    p.mats[0].color.set(0x4a4556);
    for (const s of [1, -1]) {
      const w = mesh(G('gw', () => new THREE.ConeGeometry(.8, 1.7, 3).rotateZ(Math.PI / 2).scale(1, 1, .12)), p.mats[0], s * 1.4, 2.6, -.7);
      w.rotation.y = s * .5; w.scale.x = s; p.root.add(w); (p.parts.wings ||= []).push(w);
    }
    p.root.scale.setScalar(1.7);
    return p;
  },
  boss2(e) {
    const p = BUILD.wraith(e);
    const crown = mesh(G('kc', () => new THREE.CylinderGeometry(.34, .3, .2, 8, 1, true)), eyeMat(0xffc65c), 0, .3, 0);
    for (let i = 0; i < 6; i++) { const s = mesh(G('ks', () => new THREE.ConeGeometry(.06, .25, 4)), eyeMat(0xffc65c), Math.cos(i) * .33, .18, Math.sin(i) * .33); crown.add(s); }
    p.parts.h.add(crown);
    const sword = mesh(G('kw', () => new THREE.BoxGeometry(.14, 2.6, .3).translate(0, -1.3, 0)), eyeMat(0x9fd6ff));
    p.parts.arms[0].children[0].visible = false; p.parts.arms[0].add(sword);
    p.root.scale.setScalar(1.75);
    return p;
  },
};

export class Enemy {
  constructor(game, type, x, z, opts = {}) {
    const T = TYPES[type];
    this.game = game; this.type = type; this.T = T;
    const lvl = opts.scale || 1;
    this.elite = !!opts.elite;
    this.eyeColor = this.elite ? 0xffc65c : T.eye;
    const asset = game.enemyAssets?.[type];
    const FALL = { wolf: 'crawler', bat: 'spitter', shroom: 'bomber', golem: 'brute', shaman: 'wraith', archer: 'wraith', treant: 'boss1', dummy: 'brute' };
    const built = asset ? buildFromAsset(this, asset) : (BUILD[type] || BUILD[FALL[type]])(this);
    this.root = built.root; this.mats = built.mats; this.parts = built.parts; this.fromAsset = !!built.asset;
    if (asset?.skinned) this._initRig(asset);
    if (this.elite) { this.root.scale.multiplyScalar(1.25); for (const m of this.mats) m.color.lerp(new THREE.Color(0x6a5020), .35); }
    if (!this.fromAsset) this.root.traverse(o => { if (o.isMesh) o.castShadow = o === this.parts.b; });
    this.root.position.set(x, 0, z);
    this.pos = this.root.position;
    this.r = T.r * (this.elite ? 1.25 : 1) * (T.boss ? 1 : 1);
    this.maxHp = this.hp = T.hp * (T.boss ? Math.sqrt(lvl) : lvl) * (this.elite ? 2.6 : 1);
    this.dmg = T.dmg * Math.min(2.2, .85 + lvl * .15) * (this.elite ? 1.35 : 1);
    this.speed = T.speed * (this.elite ? 1.1 : 1);
    this.poiseMax = this.poise = T.poise ? T.poise * Math.sqrt(lvl) : 0;
    this.alive = true; this.state = 'spawn'; this.t = 0; this.cd = 1 + Math.random(); this.stun = 0; this.flash = 0;
    this.vel = new V(); this.vy = 0; this.y = 0; this.bleedT = 0; this.bleedDps = 0; this.bleedTick = 0; this.phase = Math.random() * 6;
    this.facing = Math.atan2(-x, -z); this.attack = null; this.dieT = 0;
    this.slot = Math.random(); this.dodgeCd = 1; this.agile = ['wraith', 'archer', 'shaman', 'wolf'].includes(type) || (this.elite && !T.boss); this.canGuard = ['brute', 'golem'].includes(type);
    this.home = opts.home ? opts.home.clone() : null; this.camp = opts.camp || null; this.aggro = !opts.home; this.flyY = T.fly || 0;
    game.scene.add(this.root);
  }

  _initRig(asset) {
    this.mixer = new THREE.AnimationMixer(this.parts.model);
    this.clips = MODEL[this.type].clips;
    this.acts = {};
    for (const c of asset.animations) this.acts[c.name] = this.mixer.clipAction(c);
    this.walkA = this.acts[this.clips.walk]; this.idleA = this.acts[this.clips.idle];
    for (const a of [this.walkA, this.idleA]) { a.play(); a.setEffectiveWeight(0); a.time = Math.random() * a.getClip().duration; }
    this.shot = null; this.shotW = 0; this.walkW = 0;
  }

  /** Play an action clip so its strike lands exactly when the wind-up ends. */
  playClip(key, windup = .5, loop = false) {
    if (!this.mixer) return;
    const spec = this.clips[key]; if (!spec) return;
    const [name, frac] = Array.isArray(spec) ? spec : [spec, 0];
    const a = this.acts[name]; if (!a) return;
    if (this.shot && this.shot !== a) this.shot.fadeOut(.1);
    const D = a.getClip().duration, strike = frac * D;
    a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop;
    const start = Math.max(0, strike - windup * 1.2);
    a.time = start; a.timeScale = frac ? Math.max(.4, (strike - start) / Math.max(.05, windup)) : 1.4;
    a.setEffectiveWeight(1); a.fadeIn(.08); a.play();
    this.shot = a; this.shotUntil = this.phase + (loop ? 99 : (D - start) / a.timeScale);
  }

  stopClip() { if (this.shot) { this.shot.fadeOut(.15); this.shot = null; } }

  get dist() { const p = this.game.player.root.position; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
  get angleToPlayer() { const p = this.game.player.root.position; return Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }

  /** quick sidestep away from an incoming strike (agile enemies only) */
  evade() {
    if (!this.agile || this.dodgeCd > 0 || this.stun > 0 || this.y > 0 || this.state !== 'chase' || !this.aggro) return false;
    const g = this.game, a = this.angleToPlayer + (Math.random() < .5 ? 1.6 : -1.6);
    this.vel.x += Math.sin(a) * 13; this.vel.z += Math.cos(a) * 13; this.dodgeCd = 2.2 + Math.random() * 2;
    g.fx.burst(this.pos.x, 1, this.pos.z, 8, this.eyeColor, 4, .07, .3, 0); g.audio.enemy('wraith', 'blink');
    return true;
  }

  hurt(dmg, o) {
    if (!this.alive) return false;
    const g = this.game;
    if (this.guard && !o.heavy && !o.launch && !o.slam && o.fromMove && Math.abs(angDiff(this.facing, Math.atan2(g.player.root.position.x - this.pos.x, g.player.root.position.z - this.pos.z))) < 1.2) {
      dmg *= .15; this.guardHits = (this.guardHits || 0) + 1;
      g.fx.impact(this.pos.x, 1.4, this.pos.z, 1.3, 0x7fe9ff, .1); g.audio._metal(900, .25, .08);
      if ((this._blockMsg = (this._blockMsg || 0) - 1) <= 0) { g.fx.number(this.pos.x, 2.8, this.pos.z, 'BLOQUEIO', false, '#7fe9ff'); this._blockMsg = 3; }
      if (this.guardHits >= 5) { this.guard = false; this.guardHits = 0; this.stun = 1.2; g.ui.announceSmall('GUARDA QUEBRADA!'); g.audio.shock(); }
    }
    this.hp -= dmg; this.flash = .07; this.hitPulse = 1; this.hitLean = o.heavy ? 1 : .6; if (o.dir !== undefined) this.lastDir = o.dir;
    if (!this.aggro) this.alert();
    g.onDamage?.(dmg);
    if (this.T.immortal) this.hp = this.maxHp;
    if (o.knock && !this.T.boss) {
      const k = o.knock / this.T.mass;
      this.vel.x += Math.sin(o.dir) * k * 2.2; this.vel.z += Math.cos(o.dir) * k * 2.2;
      if (o.slam) this.slammed = .5;
    }
    const juggle = !this.T.boss && (this.T.mass < 2.5 || this.stun > 0 || (this.poiseMax && this.poise <= 0));
    if (juggle && this.state !== 'spawn') {
      const was = this.y > .3;
      if (o.launch) { this.vy = Math.max(this.vy, o.launch); this.hang = 0; this.airTarget = null; this.attack = null; if (this.state !== 'chase') { this.state = 'chase'; this.stopClip(); } g.player.onLaunch?.(this); }
      else if (o.smash && was) { this.vy = -24; this.hang = 0; this.smash = o.dmg || 12; }
      else if (o.air) { if (!was) { this.vy = 7.5; this.attack = null; this.state = 'chase'; } else { this.vy = 0; this.hang = .55; this.airTarget = o.airY; } }
      else if (was) { this.vy = Math.max(this.vy, 4.5); this.hang = .12; }
      if (was || o.launch) this.juggled = (this.juggled || 0) + 1;
    }
    if (o.stun && (!this.poiseMax || this.poise <= 0)) this.stun = Math.max(this.stun, o.stun);
    if (o.bleed) { this.bleedT = 3; this.bleedDps = Math.max(this.bleedDps, o.bleed); }
    if (this.T.boss && !this.phase2 && this.hp < this.maxHp * .5 && this.hp > 0) { this.phase2 = true; this.speed *= 1.2; g.onBossPhase2?.(this); }
    if (this.poiseMax && this.poise > 0) {
      this.poise -= dmg * (o.heavy ? 1.6 : 1);
      if (this.poise <= 0) {
        this.stun = this.T.boss ? 3 : 2; this.attack = null; this.state = 'chase';
        g.ui.announceSmall('POSTURA QUEBRADA!'); g.fx.ring(this.pos.x, this.pos.z, 3, 0xffffff, .5); g.audio.shock(); g.impactFrame(this.pos.clone().setY(1.5), .12);
      }
    } else if (!this.poiseMax && this.state === 'windup' && (o.heavy || this.T.mass < 1.5)) { this.state = 'recover'; this.t = 0; this.attack = null; }
    if (this.hp <= 0) { this.die(o); return true; }
    if (this.mixer && !this.T.boss && o.heavy && this.state === 'chase' && !this.shot) this.playClip('hit', 0);
    return false;
  }

  die(o = {}) {
    this.alive = false; this.dieT = 0;
    const g = this.game, p = this.pos;
    // how the body goes down depends on the blow: spiked out of the air, blasted away by a heavy hit, or crumpling
    const air = this.y > .6, heavy = !!(o.heavy || o.launch || o.slam);
    this.deathKind = air ? 'spike' : heavy ? 'launch' : 'crumple';
    this.fling = {
      a: this.lastDir ?? Math.random() * 6.28,
      sp: this.T.boss ? 0 : air ? 3 : heavy ? 12 : 5,
      vy: this.T.boss ? 0 : air ? -10 : heavy ? (this.mixer ? 5 : 9) : (this.mixer ? 0 : 4.5 + Math.random() * 2),
      spin: (Math.random() - .5) * (heavy ? 26 : 14),
    };
    if (heavy && !this.T.boss) g.fx.spray(p.x, 1 + this.y, p.z, this.fling.a, 10, 0xffffff, 12, .05);
    g.fx.burst(p.x, 1 + this.y, p.z, this.T.boss ? 90 : 24, 0x8e3dff, 9, .12, .7);
    g.fx.burst(p.x, 1 + this.y, p.z, this.T.boss ? 40 : 10, this.eyeColor, 6, .09, .6);
    g.onEnemyKilled(this);
    if (this.mixer) { this.playClip('die', 0); if (this.shot) { this.shot.timeScale = 1.3; this.shot.clampWhenFinished = true; } }
  }

  update(dt) {
    const g = this.game, T = this.T;
    this.phase += dt;
    if (!this.alive) {
      this.dieT += dt;
      const f = this.fling || (this.fling = { a: this.lastDir ?? Math.random() * 6.28, sp: 5, vy: 5, spin: 10 });
      const gy = g.ground(this.pos.x, this.pos.z), slide = f.sp * Math.exp(-this.dieT * (this.mixer ? 4 : 1.2));
      this.pos.x += Math.sin(f.a) * slide * dt; this.pos.z += Math.cos(f.a) * slide * dt;
      if (this.mixer) {
        this.mixer.update(dt);
        if (!f.down) {
          // fall back to the ground (bodies killed in the air no longer hang there)
          this.pos.y += f.vy * dt; f.vy -= 30 * dt;
          if (this.pos.y <= gy && f.vy < 0) { this.pos.y = gy; f.down = true; this._thud(f); }
        } else if (this.dieT > 1.1) {
          // sink while dissolving into violet wisps
          this.pos.y -= dt * 1.2;
          const k = Math.min(1, (this.dieT - 1.1) / .6); for (const m of this.mats) m.emissive.setRGB(k * .45, k * .15, k * .9);
          if (Math.random() < dt * 14) g.fx.wisps(this.pos.x + (Math.random() - .5) * this.r, .3, this.pos.z + (Math.random() - .5) * this.r, 1, 0x9a5cff);
        }
        return this.dieT > 2;
      }
      // flung away, spinning, bouncing once off the ground, then popping into wisps
      this.pos.y += f.vy * dt; f.vy -= 22 * dt;
      if (this.pos.y < gy && f.vy < 0) { this.pos.y = gy; if (!f.down) { f.down = true; f.vy = -f.vy * .35; f.sp *= .5; this._thud(f); } }
      this.root.rotation.x += f.spin * dt; this.root.rotation.z += f.spin * .6 * dt;
      if (this.dieT > .35) this.root.scale.multiplyScalar(Math.exp(-dt * 9));
      if (this.dieT > .55 && !f.pop) { f.pop = true; this.game.fx.wisps(this.pos.x, Math.max(.5, this.pos.y - this.game.ground(this.pos.x, this.pos.z)), this.pos.z, 10, 0x9a5cff); }
      return this.dieT > .7;
    }
    if (this.flash > 0) this.flash -= dt;
    this.hitPulse = Math.max(0, (this.hitPulse || 0) - dt * 5);
    this.dodgeCd = Math.max(0, (this.dodgeCd || 0) - dt);
    if (this.guard && Math.random() < dt * 10) g.fx.spark(this.pos.x + Math.sin(this.facing) * this.r, 1 + Math.random(), this.pos.z + Math.cos(this.facing) * this.r, 0, .5, 0, .3, .08, 0x7fe9ff, 0);
    if (this.phase2 && Math.random() < dt * 30) { const a = Math.random() * 6.28, r = this.r * 1.2; g.fx.spark(this.pos.x + Math.cos(a) * r, Math.random() * 3, this.pos.z + Math.sin(a) * r, 0, 3 + Math.random() * 3, 0, .6, .12, Math.random() < .5 ? 0xff3a2a : 0xffb347, -2); }
    if (this.elite && Math.random() < dt * 9) g.fx.spark(this.pos.x + (Math.random() - .5) * this.r * 2, .2 + Math.random() * 1.5 + (this.flyY || 0), this.pos.z + (Math.random() - .5) * this.r * 2, 0, 1.5, 0, .7, .07, 0xffc65c, -1);
    if (this.flash > 0) { const k = Math.min(1, this.flash / .07) * .85; for (const m of this.mats) m.emissive.setRGB(k, k, k); }
    else if (this.stun > 0) { const s = .07 + .05 * Math.sin(this.phase * 18); for (const m of this.mats) m.emissive.setRGB(s * .8, s * .5, s * 1.6); }
    else for (const m of this.mats) m.emissive.setRGB(0, 0, 0);
    if (this.bleedT > 0) {
      this.bleedT -= dt; this.bleedTick -= dt;
      if (this.bleedTick <= 0) {
        this.bleedTick = .5;
        const d = this.bleedDps * .5 * g.stats.bleed;
        g.fx.number(this.pos.x, 2.2, this.pos.z, d, false, '#d07bff');
        g.fx.burst(this.pos.x, 1, this.pos.z, 3, 0xa040ff, 2, .06, .35);
        if (this.hurt(d, {})) return false;
      }
      if (this.bleedT <= 0) this.bleedDps = 0;
    }
    if (this.poiseMax && this.poise < this.poiseMax && this.stun <= 0) this.poise = Math.min(this.poiseMax, this.poise + dt * this.poiseMax * .06);

    // physics
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.vel.multiplyScalar(Math.exp(-dt * 6));
    if (this.slammed > 0) this.slammed -= dt;
    if (this.y > 0 || this.vy > 0) {
      if (this.hang > 0) {
        this.hang -= dt; this.vy = 0;
        if (this.airTarget != null) this.y += (Math.max(.8, this.airTarget) - this.y) * Math.min(1, dt * 10);
      } else { this.y += this.vy * dt; this.vy -= (this.smash ? 46 : this.vy > 0 ? 19 : 15) * dt; }
      if (this.y > 0) g.fx.spark(this.pos.x, this.y + 1, this.pos.z, 0, 0, 0, .25, .06, 0xd9b4ff, 0);
      if (this.y <= 0) {
        this.y = 0; this.vy = 0; this.hang = 0; this.airTarget = null; this.juggled = 0;
        this.stun = Math.max(this.stun, this.smash ? 1.2 : .45);
        g.fx.dust(this.pos.x, this.pos.z, this.smash ? 14 : 5);
        if (this.smash) { const d = this.smash; this.smash = 0; g.enemySlam(this, d); }
      }
    }
    g.clampPos(this.pos, this.r * .5 + .3);
    const gy = g.ground(this.pos.x, this.pos.z);

    if (this.state === 'spawn') {
      this.t += dt;
      const k = Math.min(1, this.t / .7);
      this.root.position.y = gy + (1 - k) * -1.6;
      if (k >= 1) { this.state = 'chase'; this.t = 0; }
      this._animate(dt, 0); return false;
    }
    if (this.stun > 0 || this.y > 0) {
      this.stun -= dt;
      this.root.position.y = gy + this.y + (this.flyY || 0);
      this.root.rotation.z = this.y > 0 ? Math.sin(this.phase * 9) * .3 : 0;
      this._animate(dt, 0); return false;
    }
    this.root.rotation.z = 0; this.root.position.y = gy + (this.flyY || 0);
    this.cd -= dt;
    const d = this.dist, a = this.angleToPlayer;
    let speed = 0;
    if (this.home && this.state === 'chase' && !this.aggro) {
      // idle around the camp until Eddie comes close
      if (d < (T.boss ? 20 : 15) && !g.player.dead) this.alert();
      else {
        if (!this.wander || this.phase > this.wanderT) { const r = Math.random() * 6, an = Math.random() * 6.283; this.wander = [this.home.x + Math.sin(an) * r, this.home.z + Math.cos(an) * r]; this.wanderT = this.phase + 2 + Math.random() * 3; }
        const wx = this.wander[0] - this.pos.x, wz = this.wander[1] - this.pos.z, wd = Math.hypot(wx, wz);
        if (wd > .6) { this.facing += angDiff(this.facing, Math.atan2(wx, wz)) * Math.min(1, dt * 4); speed = Math.min(this.speed * .35, wd); this.pos.x += Math.sin(this.facing) * speed * dt; this.pos.z += Math.cos(this.facing) * speed * dt; }
        this.root.rotation.y = this.facing; this._animate(dt, speed);
        if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * .05 * dt);
        return false;
      }
    }
    if (this.home && this.aggro && !T.boss) {
      const hd = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
      if ((d > 34 && hd > 24) || g.player.dead) { this.aggro = false; this.wander = null; }
    }
    if (this.state === 'chase') {
      this.facing += angDiff(this.facing, a) * Math.min(1, dt * 7);
      let want = 1, side = 0;
      if (T.keep) want = d > T.keep + 1.5 ? 1 : d < T.keep - 1.5 ? -1 : .25 * Math.sin(this.phase);
      else if (d < T.range * .7) want = 0;
      // coordinated pack: only a few attack at once, the rest circle Eddie at their own slot
      const busy = !T.boss && !T.keep && g.enemies.attackers >= 3 && d < 6;
      if (busy) { want = d < 3.6 ? -.5 : d > 4.6 ? .6 : 0; side = this.slot > .5 ? 1 : -1; }
      else if (!T.boss && !T.keep && d > 2.5 && d < 9) side = (this.slot - .5) * .9;
      speed = this.speed * (T.boss && this.hp < this.maxHp * .5 ? 1.25 : 1);
      const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
      this.pos.x += (fx * want + fz * side) * speed * dt; this.pos.z += (fz * want - fx * side) * speed * dt;
      speed *= Math.min(1, Math.abs(want) + Math.abs(side));
      // guard: armored enemies raise their guard when Eddie is close and in front
      if (this.canGuard) this.guard = d < 4 && this.cd > .2 && !this.stun;
      if (!busy && this.cd <= 0 && !g.player.dead && d < T.range + (T.boss ? 8 : 0)) this._startAttack(d);
    } else if (this.state === 'windup') {
      this.t += dt;
      if (this.attack.track) this.facing += angDiff(this.facing, a) * Math.min(1, dt * 3);
      if (this.t >= this.attack.windup) { this._strike(); }
    } else if (this.state === 'active') {
      this.t += dt; this.attack.update?.(dt);
      if (this.t >= this.attack.active) { this.state = 'recover'; this.t = 0; }
    } else if (this.state === 'recover') {
      this.t += dt;
      if (this.t >= (this.attack?.recover ?? T.recover)) { this.attack?.recoverFn?.(); this.state = 'chase'; this.t = 0; this.attack = null; this.stopClip(); }
    }
    this.root.rotation.y = this.facing;
    this._animate(dt, Math.abs(speed));
    return false;
  }

  /** wake up this enemy and its camp mates */
  alert() {
    if (this.aggro) return;
    this.aggro = true; this.cd = Math.max(this.cd, .5 + Math.random() * .8);
    this.game.fx.number(this.pos.x, 2.6 + (this.flyY || 0), this.pos.z, '!', true, '#ffd27a');
    if (this.camp) for (const e of this.game.enemies.list) if (e.camp === this.camp && e !== this && e.alive) e.alert();
  }

  _startAttack(d) {
    const T = this.T, g = this.game, fx = g.fx, p = this.pos;
    const rage = this.hp < this.maxHp * .5 ? .8 : 1;
    const fw = (dist) => [p.x + Math.sin(this.facing) * dist, p.z + Math.cos(this.facing) * dist];
    let atk;
    switch (this.type) {
      case 'crawler': { const [x, z] = fw(1.1); fx.telegraph(x, z, 1.1, T.windup); atk = { windup: T.windup, strike: () => this._circle(x, z, 1.3) }; break; }
      case 'brute': { const [x, z] = fw(1.7); fx.telegraph(x, z, 2.6, T.windup); atk = { windup: T.windup, strike: () => { this._circle(x, z, 2.7); fx.ring(x, z, 3, 0xff6a2a, .35); g.shake(.35); g.audio.shock(); } }; break; }
      case 'spitter': atk = { windup: T.windup, track: true, strike: () => { const n = g.wave >= 6 || this.elite ? 3 : 1; for (let i = 0; i < n; i++) g.enemies.shoot(p.x, p.z, this.angleToPlayer + (i - (n - 1) / 2) * .22, 12, this.dmg, this.eyeColor); g.audio.shoot(); } }; break;
      case 'bomber': fx.telegraph(p.x, p.z, 3, T.windup); atk = { windup: T.windup, strike: () => { g.explosion(p.x, p.z, 3, this.dmg, this); this.hp = 0; this.die(); } }; break;
      case 'wraith': {
        if (d > 5 && Math.random() < .7) { // blink behind Eddie
          const pp = g.player.root.position, b = g.player.facing + Math.PI + (Math.random() - .5);
          fx.burst(p.x, 1.2, p.z, 14, 0x9fd6ff, 4, .08, .4, 0);
          p.x = pp.x + Math.sin(b) * 2.6; p.z = pp.z + Math.cos(b) * 2.6; this.facing = this.angleToPlayer;
          fx.burst(p.x, 1.2, p.z, 14, 0x9fd6ff, 4, .08, .4, 0);
        }
        fx.telegraphLine(p.x, p.z, this.facing, 3.4, 1.5, T.windup);
        const f = this.facing, x0 = p.x, z0 = p.z;
        atk = { windup: T.windup, strike: () => this._line(x0, z0, f, 3.4, 1.6) };
        break;
      }
      case 'wolf': { // pounce along a short line
        const f = this.angleToPlayer; this.facing = f; const x0 = p.x, z0 = p.z;
        fx.telegraphLine(x0, z0, f, 5, 1.3, T.windup);
        let hit = false;
        atk = { windup: T.windup, active: .3, strike: () => { this.dashDir = f; g.audio.enemy('crawler', 'windup'); },
          update: dt => { p.x += Math.sin(this.dashDir) * 16 * dt; p.z += Math.cos(this.dashDir) * 16 * dt; if (!hit && this.dist < this.r + .7 && g.player.y < 1.2) { hit = true; g.hurtPlayer(this.dmg, p); } } };
        break;
      }
      case 'bat': { // dive through Eddie
        const f = this.angleToPlayer; this.facing = f; const x0 = p.x, z0 = p.z;
        fx.telegraphLine(x0, z0, f, 9, 1.4, T.windup);
        let hit = false;
        atk = { windup: T.windup, active: .5, strike: () => { this.dashDir = f; },
          update: dt => { p.x += Math.sin(this.dashDir) * 18 * dt; p.z += Math.cos(this.dashDir) * 18 * dt; this.flyY = 1 + Math.abs(Math.sin(this.t * 6)) * .4; if (!hit && this.dist < this.r + .7 && g.player.y < 2) { hit = true; g.hurtPlayer(this.dmg, p); } } };
        atk.recoverFn = () => { this.flyY = T.fly; };
        break;
      }
      case 'shroom': { // poison burst around itself
        fx.telegraph(p.x, p.z, 3.4, T.windup);
        atk = { windup: T.windup, strike: () => { this._circle(p.x, p.z, 3.4); for (let i = 0; i < 26; i++) g.fx.spark(p.x + (Math.random() - .5) * 5, .3 + Math.random() * 1.2, p.z + (Math.random() - .5) * 5, (Math.random() - .5), 1 + Math.random(), (Math.random() - .5), 1.2, .14, 0x9cff5a, -1); fx.ring(p.x, p.z, 3.6, 0x9cff5a, .5); g.audio.enemy('spitter', 'shoot'); } };
        break;
      }
      case 'golem': { const [x, z] = fw(1.9); fx.telegraph(x, z, 3, T.windup); atk = { windup: T.windup, strike: () => { this._circle(x, z, 3.1); fx.ring(x, z, 3.4, 0x7dff9a, .4); fx.scorch(x, z, 1.6); g.shake(.4); g.audio.shock(); } }; break; }
      case 'shaman': {
        const hurt = g.enemies.list.find(e => e.alive && e !== this && e.hp < e.maxHp * .7 && !e.T.boss && e.pos.distanceTo(p) < 12);
        if (hurt) {
          atk = { windup: T.windup, strike: () => { for (const e of g.enemies.list) if (e.alive && e.pos.distanceTo(p) < 12) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * .3); g.fx.ring(e.pos.x, e.pos.z, e.r * 2.2, 0x9cff5a, .5); g.fx.wisps(e.pos.x, 1, e.pos.z, 6, 0x9cff5a); } g.audio.heal(); } };
        } else atk = { windup: T.windup, track: true, strike: () => { for (let i = -1; i <= 1; i++) g.enemies.shoot(p.x, p.z, this.angleToPlayer + i * .3, 10, this.dmg, T.eye); g.audio.shoot(); } };
        break;
      }
      case 'archer': {
        const f = this.angleToPlayer; this.facing = f;
        fx.telegraphLine(p.x, p.z, f, 18, .7, T.windup);
        atk = { windup: T.windup, strike: () => { g.enemies.shoot(p.x, p.z, f, 28, this.dmg, 0xd8ecff); g.audio.enemy('spitter', 'shoot'); } };
        break;
      }
      case 'treant': atk = this._treantAttack(d, rage); break;
      default: atk = this._bossAttack(d, rage);
    }
    this.attack = atk; this.state = 'windup'; this.t = 0;
    this.cd = (T.cd + Math.random() * .6) * rage;
    const clip = atk.clip ?? (['wraith', 'brute', 'golem', 'shaman', 'archer'].includes(this.type) ? 'atk' : null);
    if (clip) this.playClip(clip, atk.windup);
    g.audio.enemy(this.type, 'windup');
  }

  _treantAttack(d, rage) {
    const g = this.game, fx = g.fx, p = this.pos, T = this.T, w = T.windup * rage;
    const pick = d < 5 && Math.random() < .55 ? 'slam' : ['roots', 'roots', 'summon', 'sweep'][Math.random() * 4 | 0];
    if (pick === 'slam') { fx.telegraph(p.x, p.z, 5.5, w); return { windup: w, clip: 'slam', strike: () => { this._circle(p.x, p.z, 5.5); fx.ring(p.x, p.z, 6, T.eye, .45); fx.scorch(p.x, p.z, 3); g.shake(.6); g.audio.shock(); } }; }
    if (pick === 'roots') { // roots erupt under Eddie, three times in a row
      return { windup: .5, clip: 'roar', strike: () => {
        for (let k = 0; k < 3 + (rage < 1 ? 2 : 0); k++) g.after(k * .45, () => {
          if (!this.alive) return; const pp = g.player.root.position, x = pp.x, z = pp.z;
          fx.telegraph(x, z, 2.2, .55);
          g.after(.55, () => { if (!this.alive) return; this._circle(x, z, 2.2); fx.ring(x, z, 2.4, 0x7dff9a, .35); for (let i = 0; i < 10; i++) g.fx.spark(x, .2, z, (Math.random() - .5) * 3, 6 + Math.random() * 4, (Math.random() - .5) * 3, .7, .16, 0x3d2a1a, 14); g.audio.shock(); });
        });
      }, recover: 1.6 };
    }
    if (pick === 'summon') return { windup: w, clip: 'roar', strike: () => { g.audio.bossRoar(); for (let i = 0; i < 4; i++) { const a = i / 4 * 6.283; g.enemies.spawn(i % 2 ? 'wolf' : 'shroom', p.x + Math.cos(a) * 4, p.z + Math.sin(a) * 4, { scale: g.levelScale }); } g.ui.announceSmall('A FLORESTA RESPONDE'); } };
    const f = this.angleToPlayer; this.facing = f;
    fx.telegraphLine(p.x, p.z, f, 9, 7, w);
    return { windup: w, clip: 'slam', strike: () => { this._line(p.x, p.z, f, 9, 7); fx.ring(p.x + Math.sin(f) * 4, p.z + Math.cos(f) * 4, 4, T.eye, .35); g.shake(.5); g.audio.shock(); } };
  }

  _bossAttack(d, rage) {
    const g = this.game, fx = g.fx, p = this.pos, T = this.T;
    const options = ['slam', 'charge', 'ring'];
    if (this.type === 'boss2') options.push('summon', 'blink', 'spiral');
    if (rage < 1 && this.type === 'boss1') options.push('summon');
    let pick = options[Math.random() * options.length | 0];
    if (d < 4.5 && Math.random() < .5) pick = 'slam';
    if (pick === this.lastPick && Math.random() < .6) pick = options[(options.indexOf(pick) + 1) % options.length];
    this.lastPick = pick;
    const w = T.windup * rage;
    if (pick === 'slam') {
      fx.telegraph(p.x, p.z, 5, w);
      return { windup: w, clip: 'slam', strike: () => { this._circle(p.x, p.z, 5); fx.ring(p.x, p.z, 5.5, T.eye, .45); g.shake(.6); g.audio.shock();
        if (rage < 1) { const x = p.x, z = p.z; g.after(.15, () => { if (!this.alive) return; fx.telegraph(x, z, 8, .45); g.after(.45, () => { if (this.alive) { this._ring(x, z, 5, 8); fx.ring(x, z, 8, T.eye, .45); g.audio.shock(); } }); }); } } };
    }
    if (pick === 'charge') {
      const f = this.angleToPlayer; this.facing = f;
      fx.telegraphLine(p.x, p.z, f, 16, 3, w);
      let hit = false;
      return { windup: w, clip: 'roar', strikeClip: 'charge', active: .75, recover: .9, strike: () => { this.chargeDir = f; g.audio.shock(); },
        update: dt => {
          p.x += Math.sin(this.chargeDir) * 22 * dt; p.z += Math.cos(this.chargeDir) * 22 * dt;
          g.fx.burst(p.x, .3, p.z, 2, 0x6a5a80, 3, .1, .3);
          if (!hit && this.dist < this.r + .8) { hit = true; g.hurtPlayer(this.dmg * 1.2, p); }
        } };
    }
    if (pick === 'ring') {
      return { windup: w * .8, clip: 'cast', strike: () => {
        const n = this.type === 'boss2' ? 22 : 16;
        for (let k = 0; k < (rage < 1 ? 2 : 1); k++) g.after(k * .38, () => { if (!this.alive) return; for (let i = 0; i < n; i++) g.enemies.shoot(p.x, p.z, i / n * 6.283 + k * .14, 9, this.dmg * .6, T.eye); g.audio.shoot(); });
      } };
    }
    if (pick === 'summon') {
      return { windup: w, clip: 'roar', strike: () => { g.audio.bossRoar(); for (let i = 0; i < 4; i++) { const a = i / 4 * 6.283; g.enemies.spawn(i % 2 && this.type === 'boss2' ? 'wraith' : 'crawler', p.x + Math.cos(a) * 3, p.z + Math.sin(a) * 3, { scale: g.levelScale }); } g.ui.announceSmall('INVOCAÇÃO'); } };
    }
    if (pick === 'blink') {
      return { windup: .35, clip: 'roar', strikeClip: 'slam', strike: () => {
        g.audio.enemy('boss2', 'blink');
        const pp = g.player.root.position, b = Math.random() * 6.283;
        fx.burst(p.x, 2, p.z, 30, T.eye, 6, .12, .5, 0);
        p.x = pp.x + Math.sin(b) * 3; p.z = pp.z + Math.cos(b) * 3;
        fx.burst(p.x, 2, p.z, 30, T.eye, 6, .12, .5, 0);
        fx.telegraph(p.x, p.z, 4.5, .6);
        const x = p.x, z = p.z;
        g.after(.6, () => { if (this.alive) { this._circle(x, z, 4.5); fx.ring(x, z, 5, T.eye, .4); g.shake(.5); g.audio.shock(); } });
      }, recover: 1.2 };
    }
    // spiral
    let acc = 0, ang = 0;
    return { windup: w * .7, clip: 'cast', strikeClip: 'cast', active: 2.4, recover: .8, strike: () => {}, update: dt => {
      acc += dt;
      while (acc > .09) { acc -= .09; ang += .5; for (let i = 0; i < 3; i++) g.enemies.shoot(p.x, p.z, ang + i * 2.094, 8, this.dmg * .5, T.eye); }
    } };
  }

  _strike() {
    const a = this.attack;
    a.strike();
    if (!this.alive) return;
    if (a.strikeClip) this.playClip(a.strikeClip, a.strikeClip === 'slam' ? .6 : 0, a.strikeClip === 'charge' || a.strikeClip === 'cast');
    this.state = a.active ? 'active' : 'recover'; this.t = 0;
  }

  _circle(x, z, r) {
    const pp = this.game.player.root.position;
    if (this.game.player.y > 1.1) return;
    if (Math.hypot(pp.x - x, pp.z - z) < r + .35) this.game.hurtPlayer(this.dmg, this.pos);
  }

  _ring(x, z, r0, r1) {
    if (this.game.player.y > 1.1) return;
    const pp = this.game.player.root.position, d = Math.hypot(pp.x - x, pp.z - z);
    if (d > r0 && d < r1 + .35) this.game.hurtPlayer(this.dmg, this.pos);
  }

  _line(x, z, ang, len, wid) {
    if (this.game.player.y > 1.6) return;
    const pp = this.game.player.root.position, dx = pp.x - x, dz = pp.z - z;
    const along = dx * Math.sin(ang) + dz * Math.cos(ang), side = Math.abs(dx * Math.cos(ang) - dz * Math.sin(ang));
    if (along > -.5 && along < len + .4 && side < wid / 2 + .35) this.game.hurtPlayer(this.dmg, this.pos);
  }

  _animateModel(dt, speed) {
    const P = this.parts, ph = this.phase, wind = this.state === 'windup' ? Math.min(1, this.t / (this.attack?.windup || 1)) : 0;
    if (this.mixer) {
      if (this.shot && this.phase > this.shotUntil && this.state !== 'windup' && this.state !== 'active') this.stopClip();
      this.walkW = THREE.MathUtils.damp(this.walkW, speed > .3 ? 1 : 0, 10, dt);
      const free = this.shot ? 0 : 1;
      this.walkA.setEffectiveWeight(this.walkW * free); this.idleA.setEffectiveWeight((1 - this.walkW) * free);
      this.walkA.timeScale = Math.max(.6, speed / this.speed * 1.1);
      this.mixer.update(this.stun > 0 ? dt * .2 : dt);
      P.holder.rotation.x = (this.stun > 0 ? -.15 : 0) - this.hitPulse * .22;
      this._recoil(P.holder);
      return;
    }
    const hp = this.hitPulse || 0;
    P.holder.rotation.x = -hp * .35; P.holder.scale.set(1 + hp * .12, 1 - hp * .16, 1 + hp * .12);
    this._recoil(P.holder);
    const cfg = MODEL[this.type], hop = Math.abs(Math.sin(ph * (5 + speed * 1.6))) * Math.min(1, speed / 2);
    const y0 = cfg.y || 0;
    if (cfg.float) {
      P.model.position.y = y0 + Math.sin(ph * 2) * .14; P.model.rotation.y = Math.sin(ph * 1.3) * .2;
      P.model.scale.set(cfg.scale * (1 + wind * .15), cfg.scale * (1 - wind * .1), cfg.scale * (1 + wind * .15));
    } else if (this.type === 'bomber') {
      P.model.position.y = y0 + hop * .22; P.model.rotation.z = Math.sin(ph * 10) * .12 * Math.min(1, speed / 2) + (wind ? Math.sin(ph * 60) * .08 : 0);
      P.model.scale.setScalar(cfg.scale * (1 + wind * .3 + (wind ? Math.sin(ph * 40) * .05 : 0)));
    } else {
      P.model.position.y = y0 + hop * .14;
      P.model.rotation.x = -wind * .45 + (this.state === 'recover' && this.t < .15 ? .35 : 0) + Math.sin(ph * 10) * .05 * Math.min(1, speed / 2);
      P.model.scale.set(cfg.scale, cfg.scale * (1 - wind * .12), cfg.scale * (1 + wind * .08));
    }
  }

  /** a body hitting the floor: dust, and for spiked or blasted kills a ring and a little shake */
  _thud(f) {
    const g = this.game, p = this.pos, big = this.deathKind !== 'crumple';
    g.fx.dust(p.x, p.z, big ? 10 : 4);
    if (big) { g.fx.ring(p.x, p.z, 1.2 + this.r, 0xd9b4ff, .3); g.shake(this.deathKind === 'spike' ? .2 : .1); g.audio.land?.(); }
  }

  /** the body snaps back along the blow and trembles for an instant (frozen during hitstop) */
  _recoil(h) {
    const hp = this.hitPulse || 0, lean = (this.hitLean || 0) * hp;
    if (lean > .01 && this.lastDir !== undefined) {
      const local = this.lastDir - this.root.rotation.y;
      h.rotation.x += Math.cos(local) * lean * .35; h.rotation.z = -Math.sin(local) * lean * .35;
      h.position.x = (Math.random() - .5) * .09 * hp; h.position.z = (Math.random() - .5) * .09 * hp;
    } else { h.rotation.z = 0; h.position.x = h.position.z = 0; }
  }

  _animate(dt, speed) {
    if (this.fromAsset) return this._animateModel(dt, speed);
    const P = this.parts, ph = this.phase, wind = this.state === 'windup' ? Math.min(1, this.t / (this.attack?.windup || 1)) : 0;
    const walk = Math.sin(ph * (4 + speed * 1.5)) * Math.min(1, speed / 2);
    switch (this.type) {
      case 'crawler':
        P.legs.forEach((l, i) => { l.rotation.x = walk * .8 * (i % 2 ? 1 : -1) * (i < 2 ? 1 : -1); });
        P.b.position.y = .55 + Math.abs(walk) * .06; P.h.rotation.x = -wind * .5; P.h.position.z = .72 - wind * .2 + (this.state === 'recover' && this.t < .15 ? .35 : 0);
        break;
      case 'brute': case 'boss1':
        P.arms.forEach((a, i) => { a.rotation.x = -wind * 2.6 + walk * .5 * (i ? 1 : -1) + (this.state === 'recover' && this.t < .2 ? 1 : 0); });
        P.legs.forEach((l, i) => { l.rotation.x = walk * .6 * (i ? 1 : -1); });
        P.b.rotation.x = -wind * .25;
        if (P.wings) P.wings.forEach((w, i) => { w.rotation.z = Math.sin(ph * 3) * .25 * (i ? 1 : -1); });
        break;
      case 'spitter':
        P.b.position.y = 1.55 + Math.sin(ph * 2) * .12; P.h.scale.setScalar(1 + wind * .7);
        P.tent.forEach((t, i) => { t.rotation.x = Math.sin(ph * 3 + i) * .4; });
        break;
      case 'bomber':
        P.b.position.y = .7 + Math.abs(walk) * .15; P.h.rotation.y += dt * (2 + wind * 20); P.spark.scale.setScalar(1.4 + Math.sin(ph * (10 + wind * 40)) * .5 + wind);
        P.h.scale.setScalar(1 + wind * .35);
        break;
      case 'wraith': case 'boss2':
        P.b.position.y = 1.2 + Math.sin(ph * 2.2) * .1; P.h.position.y = 2.25 + Math.sin(ph * 2.2) * .1;
        P.arms.forEach((a, i) => { a.rotation.x = -wind * 2.2 + (this.state === 'recover' && this.t < .2 ? 1.2 : 0); a.rotation.z = (i ? -1 : 1) * (.4 + wind * .3); });
        break;
    }
  }

  dispose() {
    this.game.scene.remove(this.root);
    for (const m of this.mats) m.dispose();
    this.mixer?.stopAllAction();
  }
}

export class Enemies {
  constructor(game) {
    this.game = game; this.list = [];
    this.proj = [];
    const geoP = new THREE.IcosahedronGeometry(.22, 1);
    this.projPool = Array.from({ length: 160 }, () => {
      const m = new THREE.Mesh(geoP, new THREE.MeshBasicMaterial({ color: 0xff5050, toneMapped: false }));
      m.visible = false; game.scene.add(m); return { m, on: false };
    });
  }

  spawn(type, x, z, opts) {
    const e = new Enemy(this.game, type, x, z, opts);
    this.list.push(e);
    this.game.fx.ring(x, z, e.r * 2.5, 0x8e3dff, .6);
    this.game.fx.burst(x, .3, z, 12, 0x5a2a99, 4, .1, .6, -2);
    return e;
  }

  shoot(x, z, ang, speed, dmg, color) {
    const p = this.projPool.find(q => !q.on); if (!p) return;
    p.on = true; p.m.visible = true; p.m.position.set(x, this.game.ground(x, z) + 1.3, z); p.m.material.color.set(color);
    p.vx = Math.sin(ang) * speed; p.vz = Math.cos(ang) * speed; p.dmg = dmg; p.life = 4;
    this.proj.push(p);
  }

  clear() {
    for (const e of this.list) e.dispose();
    this.list = [];
    for (const p of this.proj) { p.on = false; p.m.visible = false; }
    this.proj = [];
  }

  update(dt) {
    const L = this.list;
    this.attackers = L.filter(e => e.alive && (e.state === 'windup' || e.state === 'active')).length;
    // separation
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (!a.alive) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]; if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.r + b.r;
        if (d < min && d > 1e-4) {
          const push = (min - d) / d * .5, wa = b.T.mass / (a.T.mass + b.T.mass), wb = 1 - wa;
          a.pos.x -= dx * push * wa; a.pos.z -= dz * push * wa; b.pos.x += dx * push * wb; b.pos.z += dz * push * wb;
          for (const [s, o] of [[a, b], [b, a]]) if (s.slammed > 0 && o.alive && !o.T.boss && Math.hypot(s.vel.x, s.vel.z) > 4) {
            s.slammed = 0; this.game.damageEnemy(o, 10 * this.game.stats.dmg, { knock: 4, dir: Math.atan2(o.pos.x - s.pos.x, o.pos.z - s.pos.z), color: 0xffffff });
          }
        }
      }
      const pp = this.game.player.root.position, dx = a.pos.x - pp.x, dz = a.pos.z - pp.z, d = Math.hypot(dx, dz), min = a.r + .45;
      if (d < min && d > 1e-4 && this.game.player.state !== 'dodge') { a.pos.x += dx / d * (min - d); a.pos.z += dz / d * (min - d); }
    }
    for (let i = L.length - 1; i >= 0; i--) if (L[i].update(dt)) { L[i].dispose(); L.splice(i, 1); }

    const g = this.game, pp = g.player.root.position;
    for (let i = this.proj.length - 1; i >= 0; i--) {
      const p = this.proj[i];
      p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt; p.life -= dt; p.m.position.y = g.ground(p.m.position.x, p.m.position.z) + 1.3;
      p.m.rotation.y += dt * 8;
      const hit = Math.hypot(p.m.position.x - pp.x, p.m.position.z - pp.z) < .65 && g.player.y < 1.4;
      if (hit) g.hurtPlayer(p.dmg, p.m.position);
      if (hit || p.life <= 0 || g.outOfBounds(p.m.position.x, p.m.position.z)) {
        if (hit) g.fx.burst(p.m.position.x, 1.3, p.m.position.z, 6, p.m.material.color.getHex(), 3, .07, .3);
        p.on = false; p.m.visible = false; this.proj.splice(i, 1);
      }
    }
  }

  get alive() { return this.list.filter(e => e.alive).length; }
}
