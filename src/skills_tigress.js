// The Titanium Tigress's energy skills (two per weapon), mixed into the shared Skills class.
import * as THREE from 'three';
import { STYLES } from './data.js';
import { SKILLS, ULTS, Skills, timeline } from './skills.js';

const V = THREE.Vector3;
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

Object.assign(SKILLS, {
  gauntlet: [{ id: 'tesla', name: 'Descarga Tesla', cost: 35, cd: 4 }, { id: 'rocket', name: 'Punho Foguete', cost: 45, cd: 7 }],
  glaive: [{ id: 'cyclone', name: 'Turbilhão de Titânio', cost: 35, cd: 4 }, { id: 'impale', name: 'Lança Orbital', cost: 50, cd: 8 }],
  cannon: [{ id: 'barrage', name: 'Enxame de Mísseis', cost: 35, cd: 4 }, { id: 'beam', name: 'Hiper Raio', cost: 50, cd: 8 }],
});
Object.assign(ULTS, { gauntlet: 'Sobrecarga Total', glaive: 'Corte Orbital', cannon: 'Canhão Ômega' });

Object.assign(Skills.prototype, {
  /** enemies within `w` of the segment from `o` along angle `ang` for `len` meters */
  alongLine(o, ang, len, w) {
    const dx = Math.sin(ang), dz = Math.cos(ang);
    return this.g.enemies.list.filter(e => {
      if (!e.alive || e.state === 'spawn') return false;
      const rx = e.pos.x - o.x, rz = e.pos.z - o.z, along = rx * dx + rz * dz;
      return along > -.5 && along < len && Math.abs(rx * dz - rz * dx) < w + e.r;
    });
  },

  // ---- Manoplas ------------------------------------------------------------------------------------
  tesla() {
    const g = this.g, p = g.player, col = STYLES.gauntlet.color;
    p.iframe = 1.2; p.playOnce('Charged_Ground_Slam', .3, .75, .7, .06);
    const ev = [[.38, () => { const pp = p.root.position; g.fx.ring(pp.x, pp.z, 4, col, .4); g.shake(.4); g.audio.shock(); }]];
    for (let i = 0; i < 5; i++) ev.push([.42 + i * .12, () => {
      const pp = p.root.position;
      for (const e of this.near(pp, 7.5).slice(0, 6)) { g.fx.bolt(new V(pp.x, 1.3, pp.z), new V(e.pos.x, 1 + e.y, e.pos.z), i % 2 ? 0xffffff : col); this.hit(e, 8, { heavy: false, knock: 0, stun: .35 }); }
      for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28; g.fx.spark(pp.x + Math.cos(a) * .6, .2 + Math.random() * 1.6, pp.z + Math.sin(a) * .6, Math.cos(a) * 5, 2, Math.sin(a) * 5, .25, .07, Math.random() < .4 ? 0xffffff : col, 0); }
      g.audio.hit(false, 'gauntlet');
    }]);
    ev.push([1.1, () => {
      const pp = p.root.position;
      for (const e of this.near(pp, 5)) this.hit(e, 30, { launch: 8, knock: 7, stun: .5 });
      g.fx.ring(pp.x, pp.z, 5.5, col, .5); g.fx.ring(pp.x, pp.z, 3.5, 0xffffff, .35); g.fx.burst(pp.x, 1, pp.z, 40, col, 12, .12, .6);
      g.impactFrame(new V(pp.x, 1.2, pp.z), .08); g.aberr(1); g.shake(.6); g.audio.explode(); g.input.rumble(.6, 1, 250);
    }]);
    return timeline(ev, null, 1.2);
  },

  rocket() {
    const g = this.g, p = g.player, col = STYLES.gauntlet.color, tgt = this.target(14), hitSet = new Set();
    this.face(tgt); p.iframe = .9; p.playOnce('Right_Jab_from_Guard', 0, .2, .3, .06);
    let dashT = 0;
    return timeline([
      [.25, () => { dashT = .28; p.playOnce('Right_Jab_from_Guard', .2, .35, .3, .04); p.ghosts(6); p.burst(p.facing, 1.4); g.audio.dodge(); }],
      [.58, () => {
        const c = this.ahead(1.2);
        for (const e of this.near(c, 3.8)) this.hit(e, 40, { launch: 10, knock: 10, stun: .6, slam: true });
        g.fx.ring(c.x, c.z, 4.2, col, .45); g.fx.burst(c.x, 1.2, c.z, 45, col, 13, .13, .6); g.fx.scorch(c.x, c.z, 2.4);
        g.impactFrame(new V(c.x, 1.2, c.z), .08); g.aberr(1); g.shake(.65); g.audio.explode(); g.input.rumble(.7, 1, 260);
      }],
    ], (t, dt) => {
      if (dashT <= 0) return;
      dashT -= dt;
      const pp = p.root.position, s = 34 * dt; pp.x += Math.sin(p.facing) * s; pp.z += Math.cos(p.facing) * s; g.clampPos(pp, .45);
      for (const e of this.near(pp, 1.6)) if (!hitSet.has(e)) { hitSet.add(e); this.hit(e, 20, { knock: 9, dir: p.facing }); }
      g.fx.spark(pp.x, 1.2, pp.z, (Math.random() - .5) * 2, Math.random() * 2, (Math.random() - .5) * 2, .3, .1, Math.random() < .4 ? 0xffffff : col, 0);
    }, .8);
  },

  // ---- Glaive --------------------------------------------------------------------------------------
  cyclone() {
    const g = this.g, p = g.player, col = STYLES.glaive.color;
    p.iframe = 1.3; p.playOnce('Axe_Spin_Attack', .05, .5, 1.2, .06);
    let tick = 0;
    return timeline([[1.15, () => {
      const pp = p.root.position;
      for (const e of this.near(pp, 4.5)) this.hit(e, 28, { launch: 9, knock: 8, stun: .4 });
      g.fx.ring(pp.x, pp.z, 5, col, .5); g.fx.burst(pp.x, 1, pp.z, 36, col, 12, .12, .6);
      g.impactFrame(new V(pp.x, 1.2, pp.z), .07); g.shake(.5); g.audio.shock();
    }]], (t, dt) => {
      if (t > 1.1) return;
      const pp = p.root.position; tick -= dt;
      for (const e of this.near(pp, 8)) {
        if (e.T.boss) continue;
        const dx = pp.x - e.pos.x, dz = pp.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
        if (d > 1.8) { e.pos.x += dx / d * Math.min(d - 1.8, 6 * dt); e.pos.z += dz / d * Math.min(d - 1.8, 6 * dt); }
      }
      if (tick <= 0) {
        tick = .15;
        for (const e of this.near(pp, 3.8)) this.hit(e, 7, { heavy: false, knock: 0 });
        g.fx.slash(new V(pp.x, 1.1, pp.z), Math.random() * 6.28, 3.8, 6.28, (Math.random() - .5) * .4, 1, Math.random() < .5 ? 0xffffff : col, .16);
        g.audio.swish('glaive', false);
      }
    }, 1.25);
  },

  impale() {
    const g = this.g, p = g.player, col = STYLES.glaive.color, tgt = this.target(16);
    this.face(tgt); p.iframe = .6; p.playOnce('Thrust_Slash', .05, .42, .55, .06);
    return timeline([[.3, () => {
      const pp = p.root.position, k = this.pow();
      g.shots.fire(pp.x + Math.sin(p.facing) * .8, 1.3, pp.z + Math.cos(p.facing) * .8, p.facing, { speed: 30, dmg: 32 * k, size: 2.6, pierce: 99, range: 16, blast: 4.2, blastDmg: 44 * k, color: col, knock: 6, launch: 6, spear: true });
      g.audio.swish('glaive', true); g.shake(.25); g.speedLines(.3);
    }]], null, .6);
  },

  // ---- Canhão --------------------------------------------------------------------------------------
  barrage() {
    const g = this.g, p = g.player, col = STYLES.cannon.color;
    p.iframe = .6; p.playOnce('Charged_Slash', .2, .5, .5, .06);
    const ev = [];
    for (let i = 0; i < 8; i++) ev.push([.25 + i * .05, () => {
      const pp = p.root.position, list = this.near(pp, 18), e = list.length ? list[i % list.length] : null, k = this.pow();
      g.shots.fire(pp.x, 1.6, pp.z, p.facing + (i - 3.5) * .35, { speed: 18, dmg: 14 * k, size: 1.1, homing: e, rise: 6, range: 30, blast: 1.8, blastDmg: 8 * k, color: i % 2 ? 0xffffff : col });
      g.audio.shoot(false);
    }]);
    return timeline(ev, null, .75);
  },

  beam() {
    const g = this.g, p = g.player, col = STYLES.cannon.color, tgt = this.target(16), L = 18;
    this.face(tgt); p.iframe = 1.6; p.playOnce('Charged_Slash', .2, .5, .35, .06);
    const geo = new THREE.CylinderGeometry(.35, .35, 1, 12, 1, true).translate(0, .5, 0).rotateX(Math.PI / 2);
    const add = () => ({ color: col, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial(add())), core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ ...add(), color: 0xffffff, opacity: 1 }));
    core.scale.set(.4, .4, 1); beam.add(core); beam.visible = false; g.scene.add(beam);
    let tick = 0;
    const origin = () => { const pp = p.root.position; return new V(pp.x + Math.sin(p.facing) * .7, 0, pp.z + Math.cos(p.facing) * .7); };
    const fx = { update: () => true, dispose: () => g.scene.remove(beam) }; this.effects.push(fx);
    return timeline([
      [.3, () => { beam.visible = true; g.audio.explode(); g.audio.shoot(true); g.shake(.4); g.aberr(.8); }],
      [1.75, () => {
        const o = origin();
        for (const e of this.alongLine(o, p.facing, L, 1.6)) this.hit(e, 30, { knock: 8, launch: 5, dir: p.facing });
        const end = new V(o.x + Math.sin(p.facing) * L * .5, 0, o.z + Math.cos(p.facing) * L * .5);
        g.fx.burst(end.x, 1.3, end.z, 50, col, 14, .12, .6); g.impactFrame(new V(end.x, 1.3, end.z), .07); g.shake(.5);
        g.scene.remove(beam);
      }],
    ], (t, dt) => {
      if (!beam.visible) return;
      const pp = p.root.position, aim = g.input.aimAngle(pp, p.facing);
      p.facing += angDiff(p.facing, aim) * Math.min(1, dt * 2.5);
      const o = origin(), w = 1 + Math.sin(t * 50) * .15;
      beam.position.set(o.x, g.ground(o.x, o.z) + 1.3, o.z); beam.rotation.set(0, p.facing, 0); beam.scale.set(w, w, L);
      tick -= dt;
      if (tick <= 0) { tick = .1; for (const e of this.alongLine(o, p.facing, L, 1.3)) this.hit(e, 6, { heavy: false, knock: 1.5, dir: p.facing }); }
      for (let i = 0; i < 3; i++) { const d = Math.random() * L; g.fx.spark(o.x + Math.sin(p.facing) * d, 1.3 + (Math.random() - .5) * .6, o.z + Math.cos(p.facing) * d, (Math.random() - .5) * 3, Math.random() * 2, (Math.random() - .5) * 3, .25, .08, Math.random() < .4 ? 0xffffff : col, 0); }
    }, 1.85);
  },
});
