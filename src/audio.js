import { Music } from './music.js';
// Procedural sound design: every effect is synthesized in layers (transient + body + tail) and
// sent through a generated reverb, so the game ships no audio files.
const STYLE_TONE = { claws: 1.35, katana: 1, hammer: .55 };

export class Audio2 {
  constructor() { this.ctx = null; this.muted = false; this._int = 0; this.bossMusic = false; this._soulStreak = 0; this._soulT = 0; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = .8;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = .002; comp.release.value = .15;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    // reverb send
    this.verb = c.createConvolver(); this.verb.buffer = this._impulse(1.8, 2.6);
    this.verbIn = c.createGain(); this.verbIn.gain.value = .3; this.verbIn.connect(this.verb); this.verb.connect(this.master);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.dist = c.createWaveShaper(); const k = 30, n = 1024, cur = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; cur[i] = (3 + k) * x * 20 * Math.PI / 180 / (Math.PI + k * Math.abs(x)); }
    this.dist.curve = cur; this.distOut = c.createGain(); this.distOut.gain.value = .5; this.dist.connect(this.distOut); this.distOut.connect(this.sfx); this.distOut.connect(this.verbIn);
    this.music = new Music(c, this.master); this.music.intensity = this._int || 0;
  }

  _impulse(sec, decay) {
    const c = this.ctx, n = c.sampleRate * sec, b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }

  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : .8; const k = this.ambKind; this.ambKind = null; if (k) this.setAmbience(k); return this.muted; }

  // ---- building blocks -------------------------------------------------------------------------
  _out(node, verb = .25, dist = false) {
    node.connect(dist ? this.dist : this.sfx);
    if (verb > 0) { const s = this.ctx.createGain(); s.gain.value = verb; node.connect(s); s.connect(this.verbIn); }
  }

  _noise({ dur = .15, type = 'bandpass', f0 = 1200, f1 = 3000, q = 1.2, vol = .3, attack = .003, delay = 0, verb = .2, dist = false }) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(fl); fl.connect(g); this._out(g, verb, dist);
    s.start(t, Math.random() * 1.5, dur + .05);
  }

  _tone({ f0 = 200, f1 = 60, dur = .2, type = 'sine', vol = .4, delay = 0, attack = .002, verb = .15, dist = false, curve = 'exp' }) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); else o.frequency.linearRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); this._out(g, verb, dist); o.start(t); o.stop(t + dur + .05);
  }

  /** metallic ring: inharmonic partials with fast decay */
  _metal(base, dur, vol, delay = 0) {
    [1, 1.47, 2.09, 2.76, 3.9].forEach((r, i) => this._tone({ f0: base * r, f1: base * r * .995, dur: dur * (1 - i * .12), vol: vol / (1 + i * .6), type: i ? 'sine' : 'triangle', delay, verb: .45 }));
  }

  // ---- player ------------------------------------------------------------------------------------
  swish(style, heavy) {
    const k = STYLE_TONE[style] || 1, d = heavy ? .28 : .16;
    this._noise({ dur: d, f0: 500 * k, f1: 5200 * k, q: 2.2, vol: heavy ? .32 : .22, attack: d * .45, verb: .1 });
    this._noise({ dur: d * .9, f0: 3800 * k, f1: 900 * k, q: 3, vol: .08, attack: d * .5, delay: .02, verb: 0 });
    if (style === 'katana') this._tone({ f0: 3100, f1: 2500, dur: .12, vol: .035, type: 'sine', delay: d * .4, verb: .3 });
    if (style === 'hammer') this._noise({ dur: .3, type: 'lowpass', f0: 180, f1: 700, q: 1, vol: .35, attack: .15, verb: 0 });
  }

  hit(heavy, style, crit) {
    const h = heavy ? 1 : 0;
    this._noise({ dur: .03, type: 'highpass', f0: 3000, f1: 2000, vol: .4, verb: 0 }); // transient
    if (style === 'katana') {
      this._noise({ dur: .12 + h * .08, f0: 7000, f1: 2500, q: 1.5, vol: .3 + h * .15 });
      this._metal(1650 + Math.random() * 120, .35 + h * .25, .07 + h * .03);
      this._tone({ f0: 180, f1: 60, dur: .12 + h * .1, vol: .35 + h * .2 });
    } else if (style === 'hammer') {
      this._tone({ f0: 120, f1: 32, dur: .38, vol: .85, verb: .35 });
      this._noise({ dur: .3, type: 'lowpass', f0: 2600, f1: 120, q: .9, vol: .6, verb: .3, dist: true });
      this._noise({ dur: .18, f0: 900, f1: 300, q: 2, vol: .25, delay: .03 });
    } else {
      for (let i = 0; i < 3; i++) this._noise({ dur: .045, f0: 4200 - i * 500, f1: 1800, q: 4, vol: .22, delay: i * .022, verb: .05 });
      this._tone({ f0: 210, f1: 70, dur: .1 + h * .12, vol: .4 + h * .25 });
    }
    if (heavy) this._noise({ dur: .45, type: 'lowpass', f0: 900, f1: 60, vol: .3, verb: .5 });
    if (crit) { this._tone({ f0: 2093, f1: 2093, dur: .22, vol: .08, verb: .5 }); this._tone({ f0: 3136, f1: 3136, dur: .18, vol: .05, delay: .03, verb: .5 }); }
  }

  skillCast(style) { const k = { claws: 1.3, katana: 1, hammer: .6 }[style] || 1; this._tone({ f0: 200 * k, f1: 800 * k, dur: .35, vol: .12, type: 'sawtooth', verb: .5, attack: .08 }); this._noise({ dur: .4, f0: 600, f1: 5000, q: 1.2, vol: .14, attack: .15, verb: .4 }); }
  jump() { this._noise({ dur: .22, f0: 400, f1: 1800, q: .9, vol: .16, attack: .03, verb: .1 }); this._tone({ f0: 220, f1: 440, dur: .12, vol: .05, type: 'triangle', verb: .2 }); }
  bleed() { this._noise({ dur: .07, f0: 900, f1: 500, q: 6, vol: .06, verb: 0 }); }
  dodge() { this._noise({ dur: .3, f0: 300, f1: 2600, q: .9, vol: .24, attack: .1, verb: .1 }); this._noise({ dur: .12, type: 'highpass', f0: 5000, f1: 7000, vol: .05, delay: .05, verb: 0 }); }
  perfect() {
    this._noise({ dur: .55, type: 'bandpass', f0: 6000, f1: 300, q: 1, vol: .25, attack: .02, verb: .6 });
    [1046, 1568, 2093].forEach((f, i) => this._tone({ f0: f, f1: f, dur: .9, vol: .06, delay: i * .04, verb: .8 }));
  }
  hurt() { this._tone({ f0: 330, f1: 90, dur: .28, vol: .45, type: 'sawtooth', verb: .1, dist: true }); this._noise({ dur: .18, type: 'lowpass', f0: 1800, f1: 200, vol: .45 }); }
  shock() { this._tone({ f0: 95, f1: 26, dur: .65, vol: .9, verb: .4 }); this._noise({ dur: .55, type: 'lowpass', f0: 2200, f1: 70, vol: .6, verb: .45, dist: true }); this._noise({ dur: .35, f0: 500, f1: 4000, q: .8, vol: .12, delay: .05 }); }
  explode() { this._tone({ f0: 80, f1: 22, dur: .8, vol: 1, verb: .5 }); this._noise({ dur: .9, type: 'lowpass', f0: 4200, f1: 60, vol: .8, verb: .6, dist: true }); this._noise({ dur: .25, type: 'highpass', f0: 3000, f1: 1500, vol: .2 }); }
  swap(style) {
    const k = STYLE_TONE[style] || 1;
    this._noise({ dur: .14, f0: 1500 * k, f1: 6000 * k, q: 4, vol: .14, attack: .06 });
    this._metal(900 * k + 300, .4, .07, .07);
  }
  rankUp(i) { [0, 4, 7, 12].forEach((s, k) => this._tone({ f0: 330 * Math.pow(2, (s + i * 2) / 12), f1: 330 * Math.pow(2, (s + i * 2) / 12), dur: .4, vol: .07, type: 'triangle', delay: k * .05, verb: .6 })); }
  soul() {
    const now = this.ctx?.currentTime || 0;
    this._soulStreak = now - this._soulT < .25 ? Math.min(this._soulStreak + 1, 14) : 0; this._soulT = now;
    const f = 880 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33][this._soulStreak] / 12);
    this._tone({ f0: f, f1: f, dur: .14, vol: .05, verb: .5 });
  }
  heal() { [523, 659, 784, 1046].forEach((f, i) => this._tone({ f0: f, f1: f, dur: .3, vol: .1, delay: i * .06, type: 'triangle', verb: .6 })); }
  ui() { this._tone({ f0: 880, f1: 880, dur: .05, vol: .06, type: 'square', verb: 0 }); }
  confirm() { this._tone({ f0: 660, f1: 990, dur: .1, vol: .08, type: 'triangle', verb: .3 }); }
  card() { [392, 523, 659, 784].forEach((f, i) => this._tone({ f0: f, f1: f, dur: .35, vol: .1, delay: i * .07, type: 'triangle', verb: .6 })); }
  fury() {
    this._tone({ f0: 60, f1: 700, dur: .9, vol: .45, type: 'sawtooth', dist: true, verb: .5 });
    this._noise({ dur: 1.1, f0: 200, f1: 8000, vol: .3, attack: .6, verb: .6 });
    [261, 392, 523, 784].forEach((f, i) => this._tone({ f0: f, f1: f, dur: 1.4, vol: .07, delay: .7 + i * .03, type: 'triangle', verb: .9 }));
  }
  heartbeat() { this._tone({ f0: 60, f1: 40, dur: .14, vol: .5, verb: 0 }); this._tone({ f0: 55, f1: 38, dur: .14, vol: .35, delay: .2, verb: 0 }); }

  // ---- enemies ----------------------------------------------------------------------------------
  enemy(kind, ev) {
    if (!this.ctx) return;
    if (ev === 'windup') {
      if (kind === 'crawler') this._tone({ f0: 140, f1: 90, dur: .35, vol: .12, type: 'sawtooth', verb: .1, dist: true });
      else if (kind === 'brute' || kind === 'boss1') { this._tone({ f0: 90, f1: 55, dur: .7, vol: .3, type: 'sawtooth', verb: .3, dist: true }); this._noise({ dur: .6, type: 'lowpass', f0: 600, f1: 200, vol: .2, attack: .2 }); }
      else if (kind === 'spitter') this._noise({ dur: .5, f0: 300, f1: 2400, q: 6, vol: .12, attack: .4 });
      else if (kind === 'bomber') this._noise({ dur: .7, type: 'highpass', f0: 5000, f1: 7000, vol: .12, attack: .05, verb: 0 });
      else if (kind === 'wraith' || kind === 'boss2') { this._noise({ dur: .5, f0: 1800, f1: 600, q: 8, vol: .14, attack: .3, verb: .7 }); this._tone({ f0: 440, f1: 415, dur: .5, vol: .05, verb: .8 }); }
    } else if (ev === 'shoot') {
      this._noise({ dur: .18, type: 'lowpass', f0: 3000, f1: 200, q: 8, vol: .2, verb: .2 }); this._tone({ f0: 500, f1: 160, dur: .15, vol: .1, type: 'square', verb: .2 });
    } else if (ev === 'die') {
      this._noise({ dur: .4, f0: 2000, f1: 200, q: 3, vol: .12, verb: .5 }); this._tone({ f0: 300, f1: 900, dur: .3, vol: .04, delay: .1, verb: .8 });
    } else if (ev === 'blink') {
      this._noise({ dur: .25, f0: 6000, f1: 800, q: 5, vol: .15, verb: .6 });
    }
  }

  shoot() { this.enemy('spitter', 'shoot'); }

  bossRoar() {
    this._tone({ f0: 70, f1: 45, dur: 1.6, vol: .5, type: 'sawtooth', dist: true, verb: .6 });
    this._tone({ f0: 105, f1: 66, dur: 1.5, vol: .3, type: 'sawtooth', dist: true, verb: .6, delay: .05 });
    this._noise({ dur: 1.5, type: 'lowpass', f0: 1200, f1: 200, vol: .4, attack: .3, verb: .6 });
  }
  boss() { this.bossRoar(); }

  // ---- music (delegated to the sequencer in music.js) ----------------------------------------
  startMusic(name = 'combat') { this.music?.play(name); this.trackName = name; }
  stopMusic() { this.music?.play('title'); this.trackName = 'title'; }
  setTrack(name) { if (this.trackName !== name) { this.trackName = name; this.music?.play(name); } }
  set intensity(v) { this._int = v; if (this.music) this.music.intensity = v; }
  get intensity() { return this._int || 0; }
  sting(k) { this.music?.sting(k); }

  // ---- ambience: looping beds per biome plus random one-shots (crickets, drips, chimes, howls) ----------
  setAmbience(kind) {
    if (!this.ctx || this.ambKind === kind) return;
    this.ambKind = kind;
    const c = this.ctx, t = c.currentTime;
    if (!this.amb) {
      this.amb = {};
      const bed = (type, f, q) => { const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.master); s.start(); return g; };
      this.amb.wind = bed('lowpass', 420, .7); this.amb.leaves = bed('bandpass', 2600, .6); this.amb.water = bed('bandpass', 700, 1.4);
    }
    const lv = { grove: [.05, .025, 0], crystal: [.07, 0, 0], swamp: [.03, .015, .05], forest: [.04, .04, 0], ruins: [.06, .01, 0], castle: [.09, 0, 0], highlands: [.11, .01, 0], arena: [.03, 0, 0], none: [0, 0, 0] }[kind] || [0, 0, 0];
    [this.amb.wind, this.amb.leaves, this.amb.water].forEach((g, i) => g.gain.setTargetAtTime(this.muted ? 0 : lv[i], t, 1.2));
  }

  ambienceTick(dt) {
    if (!this.ctx || !this.ambKind || this.muted) return;
    const k = this.ambKind, r = Math.random;
    if ((k === 'grove' || k === 'forest') && r() < dt * 3) { const f = 4200 + r() * 900, d = r() * .1; for (let i = 0; i < 3; i++) this._tone({ f0: f, f1: f * 1.02, dur: .03, vol: .012, delay: d + i * .06, verb: .2 }); }
    if (k === 'swamp' && r() < dt * 1.5) this._tone({ f0: 300 + r() * 200, f1: 900 + r() * 400, dur: .08, vol: .03, verb: .4 });
    if (k === 'crystal' && r() < dt * .8) this._metal(1800 + r() * 1200, 1.4, .012);
    if ((k === 'highlands' || k === 'castle' || k === 'forest') && r() < dt * .04) { this._tone({ f0: 420, f1: 620, dur: 1.2, vol: .025, type: 'triangle', verb: .9, attack: .3 }); this._tone({ f0: 620, f1: 380, dur: 1.4, vol: .02, type: 'triangle', verb: .9, delay: 1.2, attack: .2 }); }
  }

  // ---- extra one-shots -----------------------------------------------------------------------
  step(grass) { this._noise({ dur: .06, type: 'lowpass', f0: 600, f1: 200, vol: .06, verb: 0 }); if (grass) this._noise({ dur: .09, f0: 3500, f1: 2200, q: .9, vol: .025, verb: 0 }); }
  land() { this._noise({ dur: .14, type: 'lowpass', f0: 900, f1: 120, vol: .22, verb: .1 }); this._tone({ f0: 110, f1: 50, dur: .12, vol: .2 }); }
  killPop(big) { this._tone({ f0: big ? 520 : 760, f1: big ? 1560 : 1900, dur: .16, vol: .07, type: 'triangle', verb: .5 }); this._noise({ dur: .2, f0: 3000, f1: 800, q: 2, vol: .08, verb: .4 }); }
  multiKill(n) { [0, 4, 7, 12, 16].slice(0, Math.min(5, n + 1)).forEach((s, i) => this._tone({ f0: 523 * Math.pow(2, s / 12), f1: 523 * Math.pow(2, s / 12), dur: .25, vol: .07, delay: i * .05, type: 'square', verb: .5 })); }
  milestone() { this.music?.sting('milestone'); this._noise({ dur: .6, f0: 400, f1: 7000, vol: .12, attack: .2, verb: .6 }); }
  chest() { this.music?.sting('chest'); this._noise({ dur: .3, type: 'lowpass', f0: 900, f1: 300, vol: .2 }); }
  coin() { const f = 1600 + Math.random() * 600; this._tone({ f0: f, f1: f, dur: .09, vol: .05, type: 'square', verb: .3 }); this._tone({ f0: f * 1.5, f1: f * 1.5, dur: .12, vol: .04, delay: .05, type: 'square', verb: .3 }); }
}

