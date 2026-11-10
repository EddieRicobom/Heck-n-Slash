// Energy skills (two per style) and the cinematic Full Moon ultimate, in the spirit of arena-fighter jutsus.
// Each skill is a small timeline that drives Eddie, spawns its own effect objects and deals damage
// through game.damageEnemy, so ranks, crits, juggles and upgrades all apply.
import * as THREE from 'three';
import { STYLES } from './data.js';
import { toon, outline } from './toon.js';

export const SKILLS = {
  claws: [{ id: 'orb', name: 'Esfera Lunar', cost: 35, cd: 4 }, { id: 'pack', name: 'Matilha Fantasma', cost: 45, cd: 7 }],
  katana: [{ id: 'crescent', name: 'Lua Crescente Gigante', cost: 35, cd: 4 }, { id: 'thousand', name: 'Mil Cortes', cost: 50, cd: 8 }],
  hammer: [{ id: 'pillars', name: 'Pilares Rúnicos', cost: 35, cd: 4 }, { id: 'hole', name: 'Singularidade', cost: 50, cd: 8 }],
};
export const ULTS = { claws: 'Uivo da Lua Cheia', katana: 'Corte do Eclipse', hammer: 'Queda da Lua' };

const V = THREE.Vector3;
let GLOW = null;
const glowTex = () => GLOW || (GLOW = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.85)'); gr.addColorStop(.6, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
})());
const sprite = (color, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); s.scale.setScalar(size); return s; };

/** A one-shot timeline: events fire once when their time is reached; tick runs every frame. */
function timeline(events, tick, dur) {
  let t = 0, i = 0;
  events.sort((a, b) => a[0] - b[0]);
  return { update(dt) { t += dt; tick?.(t, dt); while (i < events.length && t >= events[i][0]) events[i++][1](t); return t >= dur; } };
}

export class Skills {
  constructor(game) { this.g = game; this.effects = []; }

  /** effects that outlive the skill animation (wolves, black hole, projectiles) */
  update(dt) { this.effects = this.effects.filter(e => !e.update(dt)); }
  clear() { for (const e of this.effects) e.dispose?.(); this.effects = []; }

  near(pos, r, list = this.g.enemies.list) { return list.filter(e => e.alive && e.state !== 'spawn' && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < r + e.r); }
  hit(e, dmg, o = {}) { const p = this.g.player; return this.g.damageEnemy(e, dmg, { color: STYLES[p.style].color, style: p.style, fromMove: true, heavy: true, dir: Math.atan2(e.pos.x - p.root.position.x, e.pos.z - p.root.position.z), ...o }); }
  ahead(dist) { const p = this.g.player; return new V(p.root.position.x + Math.sin(p.facing) * dist, 0, p.root.position.z + Math.cos(p.facing) * dist); }
  target(range = 12) {
    const p = this.g.player, pp = p.root.position;
    let best = null, bs = 1e9;
    for (const e of this.g.enemies.list) {
      if (!e.alive || e.state === 'spawn') continue;
      const dx = e.pos.x - pp.x, dz = e.pos.z - pp.z, d = Math.hypot(dx, dz); if (d > range) continue;
      const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - p.facing), Math.cos(Math.atan2(dx, dz) - p.facing)));
      const s = d * (1 + da); if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  face(e) { const p = this.g.player; if (e) p.facing = Math.atan2(e.pos.x - p.root.position.x, e.pos.z - p.root.position.z); }
  add(obj) { (obj.parent ? obj.parent : this.g.scene).add(obj); return obj; }
  gy(x, z) { return this.g.ground(x, z); }

  start(def) {
    const p = this.g.player, f = this[def.id];
    p.energy -= def.cost; p.skillCd[def.id] = def.cd;
    this.g.ui.skillName(def.name, STYLES[p.style].css);
    this.g.audio.skillCast(p.style);
    return f.call(this, def);
  }

  // ---- Garras ---------------------------------------------------------------------------------------
  orb() {
    const g = this.g, p = g.player, col = STYLES.claws.color, orb = sprite(col, .2), core = sprite(0xffffff, .1);
    orb.add(core); g.scene.add(orb);
    let dashT = 0, tgt = this.target(10), center = null;
    this.face(tgt); p.iframe = 1.4;
    p.playOnce('Right_Jab_from_Guard', 0, .2, .4, .06);
    const hand = () => { const v = new V(); p.wClaws[0].getWorldPosition(v); return v; };
    return timeline([
      [.38, () => { tgt = this.target(10) || tgt; this.face(tgt); dashT = .26; p.playOnce('Punch_Combo', .45, .55, .4, .05); p.ghosts(5); g.speedLines(.3); }],
      [.66, () => { center = this.ahead(1.4); }],
      ...[0, 1, 2, 3, 4, 5].map(i => [.66 + i * .07, () => {
        for (const e of this.near(center, 2.4)) { this.hit(e, 6, { heavy: false, knock: 0 }); e.vel.multiplyScalar(.2); }
        g.hitstop(.02); g.audio.hit(false, 'claws'); g.shake(.12);
      }]),
      [1.1, () => {
        const c = center || this.ahead(1.4);
        for (const e of this.near(c, 4.5)) this.hit(e, 32, { launch: 9, knock: 9, stun: .5, slam: true });
        g.fx.ring(c.x, c.z, 5, col, .5); g.fx.ring(c.x, c.z, 3, 0xffffff, .35); g.fx.burst(c.x, 1.2, c.z, 40, col, 12, .14, .6); g.fx.scorch(c.x, c.z, 2.6);
        g.impactFrame(new V(c.x, 1.2, c.z), .08); g.aberr(1); g.shake(.6); g.audio.explode(); g.input.rumble(.6, 1, 250);
      }],
    ], (t, dt) => {
      // charge in the hand, then fly forward with Eddie and grind in front of him
      const pp = p.root.position;
      if (dashT > 0) { dashT -= dt; const d = tgt ? Math.hypot(tgt.pos.x - pp.x, tgt.pos.z - pp.z) - tgt.r - 1.1 : 9; if (d > 0) { const s = Math.min(d, 20 * dt); pp.x += Math.sin(p.facing) * s; pp.z += Math.cos(p.facing) * s; } }
      const pos = center ? new V(center.x, this.gy(center.x, center.z) + 1.2, center.z) : hand();
      orb.position.copy(pos); core.position.set(0, 0, 0);
      const k = t < .38 ? t / .38 : t < 1.1 ? 1 : Math.max(0, 1 - (t - 1.1) * 6);
      orb.scale.setScalar((.4 + k * 1.3) * (1 + Math.sin(t * 40) * .06)); orb.material.opacity = k;
      if (Math.random() < .8) { const a = Math.random() * 6.28, r = .9; g.fx.spark(pos.x + Math.cos(a) * r, pos.y - this.gy(pos.x, pos.z) + Math.sin(a * 2) * .3, pos.z + Math.sin(a) * r, -Math.cos(a) * 4, 0, -Math.sin(a) * 4, .22, .06, Math.random() < .5 ? 0xffffff : col, 0); }
      if (t > 1.25) { g.scene.remove(orb); }
    }, 1.3);
  }

  pack() {
    const g = this.g, p = g.player, col = STYLES.claws.color, asset = g.enemyAssets?.wolf;
    p.playOnce('Chest_Pound_Taunt', .2, .5, .55, .08); p.iframe = .6;
    return timeline([[.3, () => {
      g.fx.ring(p.root.position.x, p.root.position.z, 3, col, .4); g.audio.enemy('wraith', 'windup');
      const used = new Set();
      for (let i = 0; i < 4; i++) {
        const a = p.facing + (i - 1.5) * .5, start = new V(p.root.position.x + Math.sin(a) * 1.5, 0, p.root.position.z + Math.cos(a) * 1.5);
        const cands = this.near(start, 16).filter(e => !used.has(e)).sort((x, y) => x.pos.distanceTo(start) - y.pos.distanceTo(start));
        const tgt = cands[0]; if (tgt) used.add(tgt);
        const body = new THREE.Group();
        if (asset) { const m = asset.scene.clone(true); m.scale.setScalar(2); m.position.y = .48; m.traverse(o => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); }); body.add(m); }
        else body.add(sprite(col, 2));
        body.position.copy(start); g.scene.add(body);
        let t = 0, hitDone = false, dir = tgt ? Math.atan2(tgt.pos.x - start.x, tgt.pos.z - start.z) : a, gone = 0;
        this.effects.push({
          update: dt => {
            t += dt;
            if (tgt?.alive && !hitDone) dir = Math.atan2(tgt.pos.x - body.position.x, tgt.pos.z - body.position.z);
            body.position.x += Math.sin(dir) * 21 * dt; body.position.z += Math.cos(dir) * 21 * dt; body.position.y = this.gy(body.position.x, body.position.z) + Math.abs(Math.sin(t * 18)) * .25;
            body.rotation.y = dir;
            g.fx.spark(body.position.x, .6, body.position.z, 0, 1, 0, .35, .1, col, 0);
            for (const e of this.near(body.position, 1.3)) if (!hitDone || e !== tgt) { if (e === tgt) hitDone = true; this.hit(e, 22, { knock: 8, launch: 5, dir }); g.fx.impact(e.pos.x, 1.1, e.pos.z, 1.4, col, .1); }
            if (hitDone || t > 1.1) gone += dt;
            body.traverse(o => { if (o.material) o.material.opacity = Math.max(0, .55 * (1 - gone / .35)); });
            if (gone > .35) { g.scene.remove(body); return true; }
            return false;
          },
          dispose: () => g.scene.remove(body),
        });
      }
    }]], null, .6);
  }

  // ---- Katana -----------------------------------------------------------------------------------------
  crescent() {
    const g = this.g, p = g.player, col = STYLES.katana.color;
    const tgt = this.target(14); this.face(tgt); p.iframe = .5;
    p.playOnce('Charged_Slash', .2, .75, .55, .06);
    return timeline([[.32, () => {
      const geo = new THREE.TorusGeometry(2.6, .22, 4, 28, Math.PI * .85); geo.rotateX(Math.PI / 2); geo.rotateY(Math.PI * .075 + Math.PI / 2); geo.scale(1, .35, 1);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); core.scale.set(.96, .5, .96); m.add(core);
      const pp = p.root.position, ang = p.facing; m.position.set(pp.x, this.gy(pp.x, pp.z) + 1.1, pp.z); m.rotation.y = ang; g.scene.add(m);
      g.fx.slash(new V(pp.x, 1.1, pp.z), ang, 3.4, 2.6, 0, 1, col, .25); g.audio.swish('katana', true); g.shake(.25);
      let t = 0; const hitSet = new Set();
      this.effects.push({
        update: dt => {
          t += dt; m.position.x += Math.sin(ang) * 28 * dt; m.position.z += Math.cos(ang) * 28 * dt; m.position.y = this.gy(m.position.x, m.position.z) + 1.1;
          m.scale.setScalar(1 + t * 1.4); m.material.opacity = Math.max(0, 1 - t / .95);
          for (let i = 0; i < 3; i++) g.fx.spark(m.position.x + (Math.random() - .5) * 4, .5 + Math.random() * 1.2, m.position.z + (Math.random() - .5) * 4, 0, .5, 0, .3, .07, Math.random() < .4 ? 0xffffff : col, 0);
          for (const e of this.near(m.position, 2.6 + t * 3)) if (!hitSet.has(e)) { hitSet.add(e); this.hit(e, 40, { knock: 6, dir: ang, stun: .4 }); g.hitstop(.03); }
          if (t > .95) { g.scene.remove(m); return true; }
          return false;
        },
        dispose: () => g.scene.remove(m),
      });
    }]], null, .55);
  }

  thousand() {
    const g = this.g, p = g.player, col = STYLES.katana.color, home = p.root.position.clone();
    const targets = this.near(home, 13).sort((a, b) => a.pos.distanceTo(home) - b.pos.distanceTo(home)).slice(0, 7);
    p.iframe = 2.2; g.speedLines(1.4); g.slowmo(1.3, .55);
    const ev = [];
    let prev = home.clone();
    targets.forEach((e, i) => ev.push([.1 + i * .13, () => {
      if (!e.alive) return;
      const a = Math.random() * 6.28, pp = p.root.position;
      g.fx.bolt(new V(prev.x, 1.1, prev.z), new V(e.pos.x + Math.sin(a) * 1.4, 1.1, e.pos.z + Math.cos(a) * 1.4), 0xffffff);
      pp.set(e.pos.x + Math.sin(a) * 1.4, 0, e.pos.z + Math.cos(a) * 1.4); prev = pp.clone();
      this.face(e); p.ghosts(2);
      p.playOnce(i % 2 ? 'Left_Slash' : 'Right_Hand_Sword_Slash', i % 2 ? .15 : .3, i % 2 ? .3 : .45, .14, .02);
      g.fx.slash(new V(e.pos.x, 1.2 + e.y, e.pos.z), Math.random() * 6.28, 2.2, 2.2, (Math.random() - .5) * 2.8, 1, Math.random() < .5 ? 0xffffff : col, .18);
      this.hit(e, 14, { knock: 0, heavy: false }); g.hitstop(.025); g.audio.hit(false, 'katana');
    }]));
    const end = .1 + targets.length * .13 + .1;
    ev.push([end, () => {
      const pp = p.root.position; g.fx.bolt(new V(prev.x, 1.1, prev.z), new V(home.x, 1.1, home.z), 0xffffff);
      pp.set(home.x, 0, home.z); p.playOnce('Charged_Slash', .6, .75, .35, .05); g.ui.skillName('...', STYLES.katana.css);
    }]);
    ev.push([end + .45, () => {
      for (const e of targets) if (e.alive) {
        g.fx.slash(new V(e.pos.x, 1.2 + e.y, e.pos.z), Math.random() * 6.28, 3, 2.6, .8, 1, 0xffffff, .3);
        g.fx.slash(new V(e.pos.x, 1.2 + e.y, e.pos.z), Math.random() * 6.28, 3, 2.6, -.8, -1, col, .3);
        this.hit(e, 30, { knock: 5, launch: 6 });
      }
      g.impactFrame(new V(home.x, 1.2, home.z), .08); g.aberr(1); g.shake(.5); g.audio.shock(); g.input.rumble(.5, .9, 220);
    }]);
    return timeline(ev, null, end + .6);
  }

  // ---- Martelo ----------------------------------------------------------------------------------------
  pillars() {
    const g = this.g, p = g.player, col = STYLES.hammer.color;
    const tgt = this.target(14); this.face(tgt); p.iframe = .9;
    p.playOnce('Charged_Ground_Slam', .3, .75, .75, .06);
    const mat = toon(new THREE.MeshStandardMaterial({ color: 0x4a3a2a, emissive: col, emissiveIntensity: .6 }));
    const geo = new THREE.CylinderGeometry(.55, .9, 4, 6).translate(0, 2, 0);
    const ang = () => p.facing;
    const ev = [[.42, () => { const pp = p.root.position; g.fx.ring(pp.x, pp.z, 3, col, .35); g.shake(.4); g.audio.shock(); }]];
    for (let i = 0; i < 7; i++) ev.push([.46 + i * .075, () => {
      const pp = p.root.position, d = 2.4 + i * 1.8, x = pp.x + Math.sin(ang()) * d, z = pp.z + Math.cos(ang()) * d;
      const m = new THREE.Group(), body = new THREE.Mesh(geo, mat); body.rotation.y = Math.random() * 3; m.add(body); outline(m, .04);
      m.position.set(x, this.gy(x, z) - 4, z); g.scene.add(m);
      g.fx.ring(x, z, 2.2, col, .3); g.fx.scorch(x, z, 1.3); g.fx.burst(x, .3, z, 14, col, 7, .1, .5, 14);
      for (let k = 0; k < 10; k++) g.fx.spark(x + (Math.random() - .5), Math.random() * 3, z + (Math.random() - .5), 0, 6 + Math.random() * 4, 0, .5, .09, Math.random() < .3 ? 0xffffff : col, 0);
      for (const e of this.near(new V(x, 0, z), 1.9)) this.hit(e, 22, { launch: 11, stun: .6 });
      g.audio.hit(true, 'hammer');
      let t = 0;
      this.effects.push({
        update: dt => { t += dt; const k = t < .12 ? t / .12 : t < .5 ? 1 : Math.max(0, 1 - (t - .5) / .3); m.position.y = this.gy(x, z) - 4 + k * 3.8; if (t > .8) { g.scene.remove(m); return true; } return false; },
        dispose: () => g.scene.remove(m),
      });
    }]);
    return timeline(ev, null, .85);
  }

  hole() {
    const g = this.g, p = g.player, col = STYLES.hammer.color;
    const tgt = this.target(12); this.face(tgt); p.iframe = .5;
    p.playOnce('Heavy_Hammer_Swing', .25, .9, .55, .06);
    return timeline([[.36, () => {
      const c = tgt ? tgt.pos.clone() : this.ahead(6); c.y = 0;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(.9, 20, 14), new THREE.MeshBasicMaterial({ color: 0x050008 }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.6, 48), new THREE.MeshBasicMaterial({ color: 0x9a4dff, transparent: true, opacity: .8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2.4; const halo = sprite(0xb44dff, 6);
      const grp = new THREE.Group(); grp.add(ball, ring, halo); grp.position.set(c.x, this.gy(c.x, c.z) + 1.6, c.z); g.scene.add(grp);
      g.audio.enemy('boss2', 'blink');
      let t = 0, tick = 0;
      this.effects.push({
        update: dt => {
          t += dt; tick -= dt;
          const k = Math.min(1, t * 3); grp.scale.setScalar(k * (1 + Math.sin(t * 20) * .04)); ring.rotation.z += dt * 6;
          for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28, r = 4 + Math.random() * 4; g.fx.spark(c.x + Math.cos(a) * r, .5 + Math.random() * 2, c.z + Math.sin(a) * r, -Math.cos(a) * r * 2, 0, -Math.sin(a) * r * 2, .45, .07, Math.random() < .5 ? 0x9a4dff : col, 0); }
          for (const e of this.near(c, 9)) {
            if (e.T.boss) continue;
            const dx = c.x - e.pos.x, dz = c.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
            e.pos.x += dx / d * Math.min(d, 7 * dt); e.pos.z += dz / d * Math.min(d, 7 * dt);
            if (tick <= 0) this.hit(e, 4, { knock: 0, heavy: false });
          }
          if (tick <= 0) tick = .25;
          if (t > 1.8) {
            for (const e of this.near(c, 5.5)) this.hit(e, 48, { launch: 10, knock: 10, dir: Math.random() * 6.28, stun: .8 });
            g.fx.ring(c.x, c.z, 6.5, 0x9a4dff, .5); g.fx.ring(c.x, c.z, 4, 0xffffff, .35); g.fx.burst(c.x, 1.6, c.z, 60, 0x9a4dff, 14, .14, .7);
            g.impactFrame(new V(c.x, 1.6, c.z), .08); g.aberr(1); g.shake(.7); g.audio.explode(); g.input.rumble(.7, 1, 300);
            g.scene.remove(grp); return true;
          }
          return false;
        },
        dispose: () => g.scene.remove(grp),
      });
    }]], null, .6);
  }

  // ---- Ultimate: cinematic Full Moon ------------------------------------------------------------------------
  ultimate() {
    const g = this.g, p = g.player, style = p.style, col = STYLES[style].color, home = p.root.position.clone();
    const targets = this.near(home, 18).sort((a, b) => a.pos.distanceTo(home) - b.pos.distanceTo(home)).slice(0, 8);
    const f0 = p.facing, gy0 = this.gy(home.x, home.z);
    p.fury = 0; p.iframe = 4;
    const moon = sprite(0xf0e6ff, 1); const moonCore = sprite(col, .6); moon.add(moonCore);
    g.startCine({
      dur: 3.1, letterbox: true, freeze: true,
      cam: t => {
        if (t < .95) { // low close-up in front of Eddie, slowly pushing in
          const a = f0 + .35, d = 3 - t * .6;
          return { pos: new V(home.x + Math.sin(a) * d, gy0 + .9 + t * .2, home.z + Math.cos(a) * d), look: new V(home.x, gy0 + 1.3, home.z) };
        }
        if (t < 2.05) { const a = f0 + 2.2 + (t - .95) * 1.4; return { pos: new V(home.x + Math.sin(a) * 13, gy0 + 7, home.z + Math.cos(a) * 13), look: new V(home.x, gy0 + 2, home.z) }; }
        const a = f0 + 3.6; return { pos: new V(home.x + Math.sin(a) * 18, gy0 + 4 + (t - 2.05) * 2, home.z + Math.cos(a) * 18), look: new V(home.x, gy0 + 3 + Math.max(0, 2.5 - t) * 6, home.z) };
      },
    });
    p.playOnce('Chest_Pound_Taunt', .12, .55, .95, .1);
    g.ui.bossCard('LUA CHEIA', ULTS[style], STYLES[style].css);
    g.audio.fury();
    const ev = [
      [.05, () => { g.fx.ring(home.x, home.z, 4, col, .6); for (let i = 0; i < 50; i++) g.fx.spark(home.x + (Math.random() - .5) * 2, Math.random() * .5, home.z + (Math.random() - .5) * 2, (Math.random() - .5) * 2, 5 + Math.random() * 6, (Math.random() - .5) * 2, 1, .12, Math.random() < .4 ? 0xffffff : col, -1); }],
      [.5, () => { g.impactFrame(new V(home.x, 1.3, home.z), .07); g.aberr(.8); }],
    ];
    let prev = home.clone();
    targets.forEach((e, i) => ev.push([1 + i * .12, () => {
      if (!e.alive) return;
      const a = Math.random() * 6.28, np = new V(e.pos.x + Math.sin(a) * 1.5, 0, e.pos.z + Math.cos(a) * 1.5);
      g.fx.bolt(new V(prev.x, 1.2, prev.z), new V(np.x, 1.2, np.z), 0xffffff); prev = np;
      p.root.position.copy(np); this.face(e); p.ghosts(2);
      p.playOnce(style === 'hammer' ? 'Heavy_Hammer_Swing' : style === 'katana' ? 'Right_Hand_Sword_Slash' : 'Lunge_Spin_Kick', style === 'hammer' ? .55 : style === 'katana' ? .3 : .55, style === 'hammer' ? .75 : style === 'katana' ? .45 : .7, .12, .02);
      g.fx.slash(new V(e.pos.x, 1.2 + e.y, e.pos.z), Math.random() * 6.28, 2.6, 2.4, (Math.random() - .5) * 2.4, 1, Math.random() < .5 ? 0xffffff : col, .2);
      this.hit(e, 25, { knock: 0, heavy: false }); g.audio.hit(true, style);
    }]));
    ev.push([2.05, () => {
      p.root.position.copy(home); this.face(targets[0]);
      p.playOnce(style === 'katana' ? 'Charged_Upward_Slash' : 'Charged_Ground_Slam', style === 'katana' ? .2 : .3, style === 'katana' ? .5 : .75, 1, .1);
      moon.position.set(home.x, gy0 + 40, home.z); moon.scale.setScalar(26); g.scene.add(moon);
      g.audio.bossRoar();
    }]);
    ev.push([2.62, () => {
      for (const e of this.near(home, 14)) this.hit(e, 120, { launch: 12, knock: 12, stun: 1.5, slam: true });
      for (const r of [5, 9, 14]) g.fx.ring(home.x, home.z, r, r === 9 ? 0xffffff : col, .6);
      g.fx.burst(home.x, 1, home.z, 120, col, 18, .18, .9); g.fx.scorch(home.x, home.z, 6);
      g.impactFrame(new V(home.x, 1, home.z), .1); g.aberr(1); g.shake(1); g.audio.explode(); g.input.rumble(1, 1, 500); g.flash('#ffffff');
      g.scene.remove(moon); p.moonT = 9;
    }]);
    return timeline(ev, t => {
      if (t > 2.05 && t < 2.62) { const k = (t - 2.05) / .57; moon.position.y = gy0 + 40 - k * k * 40; moon.material.rotation += .05; }
    }, 3.1);
  }
}
