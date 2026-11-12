// Player projectiles: plasma bolts, lobbed grenades, homing missiles and the thrown glaive spear.
// Heights are stored above the ground (like fx), so shots follow the terrain in the open world.
import * as THREE from 'three';

const V = THREE.Vector3;
let TEX = null;
const glowTex = () => TEX || (TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})());

export class Shots {
  constructor(game) {
    this.g = game;
    this.pool = Array.from({ length: 40 }, () => {
      const mk = c => new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const s = mk(0xffffff), core = mk(0xffffff); s.add(core); core.scale.setScalar(.45); s.visible = false; game.scene.add(s);
      return { s, core, on: false };
    });
  }

  clear() { for (const b of this.pool) { b.on = false; b.s.visible = false; } }

  /** fire from (x, h above ground, z) toward angle `ang`. o: speed, dmg, size, pierce, range, blast, blastDmg,
   *  lob (landing distance), homing (enemy), rise (initial climb), knock, launch, stun, color */
  fire(x, h, z, ang, o) {
    const b = this.pool.find(p => !p.on) || this.pool[0], g = this.g;
    Object.assign(b, { on: true, x, h, z, ang, o, t: 0, hits: new Set(), left: (o.pierce || 0) + (g.stats?.pierce || 0), dist: 0, vh: 0 });
    if (o.lob) { const T = o.lob / o.speed; b.vh = (9.8 * T * T / 2 - h) / T; }
    if (o.rise) b.vh = o.rise;
    b.s.visible = true; b.s.material.color.set(o.color ?? 0x7fe9ff);
    const sz = .42 * (o.size || 1); b.s.scale.set(o.spear ? sz * 1.6 : sz, sz, 1);
    g.fx.impact(x, h, z, .45 * (o.size || 1), o.color ?? 0x7fe9ff, .06);
    g.fx.spray(x, h, z, ang, 5, o.color ?? 0x7fe9ff, 9, .05);
    return b;
  }

  _explode(b) {
    const g = this.g, o = b.o, c = o.color ?? 0x7fe9ff;
    if (o.blast) {
      g.shockwave(b.x, b.z, o.blast, o.blastDmg || o.dmg, c, { knock: o.knock ?? 6, stun: o.stun, launch: o.launch, style: 'cannon' });
      g.fx.burst(b.x, Math.max(.3, b.h), b.z, 26, c, 10, .1, .5); g.fx.scorch(b.x, b.z, o.blast * .5);
      g.impactFrame && o.blast > 3.5 && g.impactFrame(new V(b.x, 1, b.z), .05);
      g.audio.explode?.();
    } else g.fx.burst(b.x, b.h, b.z, 8, c, 5, .06, .3);
    b.on = false; b.s.visible = false;
  }

  update(dt) {
    const g = this.g;
    for (const b of this.pool) {
      if (!b.on) continue;
      const o = b.o, c = o.color ?? 0x7fe9ff;
      b.t += dt;
      if (o.homing && b.t > .15) {
        const e = o.homing;
        if (e.alive) {
          const want = Math.atan2(e.pos.x - b.x, e.pos.z - b.z), d = Math.atan2(Math.sin(want - b.ang), Math.cos(want - b.ang));
          b.ang += Math.sign(d) * Math.min(Math.abs(d), dt * 7);
          b.vh += ((e.y + 1) - b.h) * dt * 10 - b.vh * dt * 3;
        } else b.vh -= 9.8 * dt;
      } else if (o.lob || o.rise) b.vh -= 9.8 * dt;
      const sp = o.speed * dt;
      b.x += Math.sin(b.ang) * sp; b.z += Math.cos(b.ang) * sp; b.h += b.vh * dt; b.dist += sp;
      b.s.position.set(b.x, g.ground(b.x, b.z) + b.h, b.z);
      { // stretch the glow along the shot's on-screen direction so it reads as a streak, not a ball
        const cam = g.camera, a0 = this._a || (this._a = new V()), a1 = this._b || (this._b = new V());
        a0.copy(b.s.position).project(cam); a1.set(b.x + Math.sin(b.ang), b.s.position.y + b.vh / Math.max(1, o.speed), b.z + Math.cos(b.ang)).project(cam);
        b.s.material.rotation = b.core.material.rotation = Math.atan2((a1.y - a0.y) * innerHeight, (a1.x - a0.x) * innerWidth);
        const sz = .42 * (o.size || 1); b.s.scale.set(sz * (o.spear ? 3.4 : 2.3), sz * .75, 1); b.core.scale.set(.75, .55, 1);
      }
      if (Math.random() < .9) g.fx.spark(b.x, b.h, b.z, (Math.random() - .5) * .6, (Math.random() - .5) * .6, (Math.random() - .5) * .6, .22, .05 * (o.size || 1), Math.random() < .3 ? 0xffffff : c, 0);
      // contact
      const rad = .45 * (o.size || 1);
      for (const e of g.enemies.list) {
        if (!e.alive || e.state === 'spawn' || b.hits.has(e)) continue;
        if (Math.hypot(e.pos.x - b.x, e.pos.z - b.z) > rad + e.r || Math.abs(e.y + 1 - b.h) > 1.4 + (e.T.boss ? 1.2 : 0)) continue;
        b.hits.add(e);
        g.damageEnemy(e, o.dmg, { color: c, style: 'cannon', fromMove: true, chainable: true, knock: o.knock ?? 1.5, launch: o.launch, stun: o.stun, dir: b.ang, heavy: (o.size || 1) > 1.4 });
        g.hitstop(.012);
        if (b.left-- <= 0) { this._explode(b); break; }
      }
      if (!b.on) continue;
      if (b.h <= 0 && (o.lob || o.rise || o.homing)) { b.h = 0; this._explode(b); continue; }
      if (b.dist > (o.range || 18) || b.t > 3 || g.outOfBounds(b.x, b.z)) this._explode(b);
    }
  }
}
