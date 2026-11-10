// Original procedural soundtrack: a small step sequencer playing hand-written themes with synthesized
// instruments. Tracks crossfade on bar boundaries; intensity opens filters and adds layers.
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// chord = [root midi, intervals]
const MIN = [0, 3, 7], MAJ = [0, 4, 7], MIN7 = [0, 3, 7, 10], SUS = [0, 5, 7], ADD9 = [0, 3, 7, 14];

// melodies: per bar, list of [16th step, midi, length in 16ths]
const TRACKS = {
  title: {
    bpm: 72, swing: 0, lead: 'bell', arp: 'music', drums: 'none', pad: 1.8,
    chords: [[50, ADD9], [46, MAJ], [43, MIN], [45, MAJ]],
    melody: [
      [[0, 74, 8], [8, 72, 4], [12, 69, 4]],
      [[0, 70, 8], [8, 69, 8]],
      [[0, 67, 6], [6, 69, 2], [8, 70, 8]],
      [[0, 69, 12], [12, 73, 4]],
    ],
  },
  explore: {
    bpm: 94, swing: .08, lead: 'flute', arp: 'pluck', drums: 'soft', pad: .8,
    chords: [[50, MIN], [46, MAJ], [53, MAJ], [48, MAJ], [50, MIN], [43, MIN], [46, MAJ], [45, MAJ]],
    melody: [
      [[0, 69, 6], [6, 67, 2], [8, 65, 4], [12, 62, 4]],
      [[0, 65, 4], [4, 67, 4], [8, 70, 6], [14, 69, 2]],
      [[0, 72, 6], [6, 70, 2], [8, 69, 4], [12, 65, 4]],
      [[0, 67, 8], [8, 64, 4], [12, 67, 4]],
      [[0, 69, 4], [4, 72, 4], [8, 74, 6], [14, 72, 2]],
      [[0, 70, 4], [4, 69, 4], [8, 67, 4], [12, 65, 4]],
      [[0, 65, 6], [6, 67, 2], [8, 69, 4], [12, 70, 4]],
      [[0, 69, 12], [12, 73, 4]],
    ],
  },
  combat: {
    bpm: 172, swing: 0, lead: 'saw', arp: 'shred', drums: 'punk', pad: .3, guitar: true,
    chords: [[50, MIN], [50, MIN], [46, MAJ], [48, MAJ], [50, MIN], [50, MIN], [43, MIN], [45, MAJ]],
    melody: [
      [[0, 62, 2], [2, 62, 2], [4, 69, 2], [6, 62, 2], [8, 67, 2], [10, 62, 2], [12, 65, 2], [14, 64, 2]],
      [[0, 62, 2], [2, 62, 2], [4, 69, 2], [6, 62, 2], [8, 72, 2], [10, 70, 2], [12, 69, 2], [14, 67, 2]],
      [[0, 58, 2], [2, 58, 2], [4, 65, 2], [6, 58, 2], [8, 70, 2], [10, 69, 2], [12, 67, 2], [14, 65, 2]],
      [[0, 60, 2], [2, 60, 2], [4, 67, 2], [6, 60, 2], [8, 72, 4], [12, 74, 4]],
      [[0, 74, 4], [4, 72, 2], [6, 69, 2], [8, 74, 4], [12, 76, 4]],
      [[0, 77, 6], [6, 76, 2], [8, 74, 4], [12, 72, 4]],
      [[0, 70, 4], [4, 69, 4], [8, 67, 4], [12, 70, 4]],
      [[0, 69, 8], [8, 73, 4], [12, 76, 4]],
    ],
  },
  boss: {
    bpm: 160, swing: 0, lead: 'saw', arp: 'shred', drums: 'war', pad: .8, choir: true, guitar: true, minLevel: 2,
    chords: [[48, MIN], [44, MAJ], [41, MIN], [43, MAJ]],
    melody: [
      [[0, 72, 4], [4, 75, 4], [8, 79, 6], [14, 78, 2]],
      [[0, 80, 8], [8, 79, 4], [12, 75, 4]],
      [[0, 77, 4], [4, 75, 4], [8, 72, 4], [12, 75, 4]],
      [[0, 74, 8], [8, 71, 4], [12, 74, 4]],
    ],
  },
  victory: {
    bpm: 120, swing: 0, lead: 'bell', arp: 'music', drums: 'soft', pad: 1, once: true,
    chords: [[50, MAJ], [55, MAJ], [57, MAJ], [50, MAJ]],
    melody: [
      [[0, 74, 2], [2, 78, 2], [4, 81, 2], [6, 86, 6], [12, 85, 2], [14, 86, 2]],
      [[0, 83, 4], [4, 81, 4], [8, 83, 8]],
      [[0, 85, 4], [4, 86, 4], [8, 88, 8]],
      [[0, 86, 16]],
    ],
  },
};

export class Music {
  constructor(ctx, out) {
    this.c = ctx;
    this.out = ctx.createGain(); this.out.gain.value = .2; this.out.connect(out);
    this.bus = ctx.createGain(); this.bus.connect(this.out);
    const verb = ctx.createConvolver(), n = ctx.sampleRate * 2.4, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    verb.buffer = b; this.send = ctx.createGain(); this.send.gain.value = .35; this.send.connect(verb); verb.connect(this.out);
    const len = ctx.sampleRate; this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.track = null; this.want = null; this.step = 0; this.next = 0; this.intensity = 0; this.variant = 'grove'; this.level = 0;
    this.shaper = ctx.createWaveShaper(); const n2 = 2048, cv = new Float32Array(n2); for (let i = 0; i < n2; i++) { const x = i * 2 / n2 - 1; cv[i] = Math.tanh(x * 14) * .9; } this.shaper.curve = cv; this.shaper.oversample = '2x';
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90; const cab = ctx.createBiquadFilter(); cab.type = 'lowpass'; cab.frequency.value = 3400; cab.Q.value = .8; const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 900; mid.gain.value = 4;
    this.amp = ctx.createGain(); this.amp.gain.value = .2; this.shaper.connect(hp); hp.connect(mid); mid.connect(cab); cab.connect(this.amp); this.amp.connect(this.bus); const as = ctx.createGain(); as.gain.value = .15; this.amp.connect(as); as.connect(this.send);
    this.timer = setInterval(() => this._tick(), 40);
  }

  play(name) { this.want = name; if (!this.track) this._start(name); }
  stop() { this.want = null; }

  _start(name) {
    this.track = name ? TRACKS[name] : null; this.trackName = name; this.step = 0; this.next = this.c.currentTime + .08;
    this.bus.gain.cancelScheduledValues(this.c.currentTime);
    this.bus.gain.setValueAtTime(.001, this.c.currentTime); this.bus.gain.linearRampToValueAtTime(1, this.c.currentTime + 1.2);
  }

  _tick() {
    const c = this.c;
    if (!this.track) { if (this.want) this._start(this.want); return; }
    const T = this.track, sp = 60 / T.bpm / 4, barLen = 16, bars = T.melody.length;
    while (this.next < c.currentTime + .2) {
      const s = this.step % barLen, bar = Math.floor(this.step / barLen) % bars;
      // switch tracks only on bar boundaries, with a short fade
      if (s === 0 && this.want !== this.trackName) {
        if (!this.fading) { this.fading = true; this.bus.gain.setTargetAtTime(.001, this.next - .3, .12); }
        this._start(this.want); this.fading = false;
        if (!this.track) return;
        continue;
      }
      if (T.once && this.step >= bars * barLen) { this.want = this.trackName === 'victory' ? 'title' : this.want; this._start(this.want); return; }
      const t = this.next + (s % 2 ? T.swing * sp : 0);
      this._step(T, s, bar, t, sp);
      this.step++; this.next += sp;
    }
  }

  _step(T, s, bar, t, sp) {
    this._t = t;
    const I = this.intensity, [root, iv] = T.chords[bar % T.chords.length], dark = this.variant === 'ruins' || this.variant === 'castle';
    const cut = 500 + I * 2600;
    // pad: chord every bar
    if (s === 0) for (const k of iv) this.pad(mtof(root + 12 + k), sp * 16, .035 * T.pad * (dark ? 1.2 : 1), dark ? 600 : 1100);
    if (T.choir && s === 0) for (const k of [0, 7, 12]) this.choir(mtof(root + 24 + k), sp * 16);
    // bass
    const bassPat = T.drums === 'rock' || T.drums === 'war' ? [0, 3, 6, 8, 10, 11, 14] : [0, 8, 11];
    if (bassPat.includes(s)) this.bass(mtof(root - 12 + (s === 11 && T.drums === 'soft' ? 7 : 0)), sp * (T.drums === 'soft' ? 6 : 1.6), cut);
    // combo-reactive layers: each one fades in with the style meter and out as it drains
    const L = Math.max(this.level, T.minLevel || 0), lay = k => Math.max(0, Math.min(1, L - k + 1));
    if (T.guitar) {
      const five = [0, 7, 12];
      if (lay(1) > 0 && s % 2 === 0) this.guitar(root - 12, five, sp * .9, .55 * lay(1), true);            // palm-muted chugs
      if (lay(2) > 0 && (s === 0 || s === 6 || s === 12)) this.guitar(root - 12, five, sp * (s === 12 ? 3.6 : 5.5), .8 * lay(2), false); // open power chords
      if (lay(5) > 0 && s === 0) this.crash(t, .35 * lay(5));
    }
    // arpeggio
    if (T.arp === 'shred') { if (lay(5) > 0) { const notes = [0, 3, 7, 12, 15, 19, 24, 19], k = notes[(s + bar * 3) % 8]; this.lead(mtof(root + 24 + k), sp * .9, 3000, .022 * lay(5)); } }
    else if (T.arp && s % 2 === 0 && (T.drums !== 'none' || s % 4 === 0)) {
      const notes = [...iv, 12, iv[1] + 12, 7 + 12], k = notes[(s / 2 + bar) % notes.length];
      const m = root + 24 + k + (this.variant === 'crystal' || this.variant === 'highlands' ? 12 : 0);
      if (T.arp === 'pluck' || T.arp === 'music') this.pluck(mtof(m), T.arp === 'music' ? .7 : .35, T.arp === 'music' ? .03 : .026 + I * .015);
      else if (I > .1 || this.trackName === 'boss') this.pulse(mtof(m), sp * 1.6, .016 + I * .02, cut);
    }
    // melody (in reactive tracks the lead only joins at higher style ranks, plus a harmony line a third up)
    for (const [st, m, len] of T.melody[bar]) if (st === s) {
      const mm = m + (dark ? -12 : 0);
      if (T.lead === 'bell' || this.variant === 'crystal') this.bell(mtof(mm), sp * len);
      else if (T.lead === 'flute') this.flute(mtof(mm), sp * len);
      else if (!T.guitar) this.lead(mtof(mm), sp * len, cut);
      else { if (lay(3) > 0) this.lead(mtof(mm), sp * len, 3200, .05 * lay(3)); if (lay(4) > 0) this.lead(mtof(mm + 4), sp * len, 2600, .03 * lay(4)); }
    }
    // drums
    const D = T.drums;
    if (D === 'soft') { if (s === 0 || s === 10) this.kick(t, .5); if (s === 8) this.snare(t, .18); if (s % 4 === 2) this.hat(t, .05); }
    if (D === 'rock') { if (s % 8 === 0 || s === 11) this.kick(t, .9); if (s === 4 || s === 12) this.snare(t, .5); if (s % 2 === 1 || I > .5) this.hat(t, .07 + I * .05); if (s === 15 && bar % 4 === 3) { this.tom(t, 180); this.tom(t + sp, 120); } }
    if (D === 'punk') { // driving punk beat; hats and fills arrive with the meter
      if (s % 4 === 0 || s === 10) this.kick(t, .95); if (s === 4 || s === 12) this.snare(t, .55);
      if (s % 2 === 0) this.hat(t, .05 + lay(1) * .04); if (lay(3) > 0 && s % 2 === 1) this.hat(t, .04 * lay(3));
      if (lay(4) > 0 && s >= 12 && bar % 2 === 1) this.snare(t, .3 * lay(4));
    }
    if (D === 'war') { if (s % 4 === 0 || s === 7) this.kick(t, 1); if (s === 4 || s === 12) this.snare(t, .6); if (s % 2 === 1) this.hat(t, .08); if (s === 6 || s === 14) this.tom(t, 90); }
  }

  // ---- instruments -----------------------------------------------------------------------------
  _env(g, t, a, peak, d) { g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); }
  _osc(type, f, t, dur, peak, a, cutoff, q = 1, detune = 0, send = .3) {
    const c = this.c, o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
    o.type = type; o.frequency.value = f; o.detune.value = detune; fl.type = 'lowpass'; fl.frequency.value = cutoff; fl.Q.value = q;
    this._env(g, t, a, peak, dur);
    o.connect(fl); fl.connect(g); g.connect(this.bus);
    if (send) { const s = c.createGain(); s.gain.value = send; g.connect(s); s.connect(this.send); }
    o.start(t); o.stop(t + a + dur + .05);
    return o;
  }
  pad(f, dur, v, cut) { const t = this._t ?? this.next; for (const d of [-9, 9]) this._osc('sawtooth', f, t, dur * .9, v, .35, cut, 1, d, .6); }
  choir(f, dur) {
    const c = this.c, t = this._t ?? this.next;
    for (const fm of [700, 1150]) {
      const o = c.createOscillator(), g = c.createGain(), b = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - .5) * 14;
      b.type = 'bandpass'; b.frequency.value = fm; b.Q.value = 6; this._env(g, t, .5, .05, dur * .9);
      o.connect(b); b.connect(g); g.connect(this.bus); const s = c.createGain(); s.gain.value = .7; g.connect(s); s.connect(this.send); o.start(t); o.stop(t + dur + .6);
    }
  }
  bass(f, dur, cut) { const t = this._t ?? this.next; this._osc('sawtooth', f, t, dur, .12, .005, Math.min(cut, 900), 5, 0, 0); this._osc('sine', f / 2, t, dur, .14, .005, 400, 1, 0, 0); }
  pluck(f, dur, v) { const t = this._t ?? this.next; this._osc('triangle', f, t, dur, v, .003, 4000, 1, 0, .5); this._osc('sine', f * 2, t, dur * .5, v * .4, .003, 6000, 1, 0, .5); }
  /** distorted electric guitar: a power chord through a tanh amp and a cabinet filter */
  guitar(rootMidi, ints, dur, v, palm) {
    const c = this.c, t = this._t ?? this.next, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = palm ? 750 : 5000;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + dur + (palm ? .02 : .25));
    for (const k of ints) for (const d of [-6, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(rootMidi + 12 + k); o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + dur + .3); }
    lp.connect(g); g.connect(this.shaper);
  }
  crash(t, v) { const c = this.c, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); n.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 5200; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + 1.4); n.connect(f); f.connect(g); g.connect(this.bus); const s = c.createGain(); s.gain.value = .4; g.connect(s); s.connect(this.send); n.loop = true; n.start(t); n.stop(t + 1.5); }
  pulse(f, dur, v, cut) { const t = this._t ?? this.next; this._osc('square', f, t, dur, v, .004, cut, 2, 0, .3); }
  bell(f, dur) { const t = this._t ?? this.next; [[1, .05], [2.76, .018], [5.4, .008]].forEach(([k, v]) => this._osc('sine', f * k, t, Math.max(.4, dur * 1.3), v, .004, 9000, 1, 0, .7)); }
  flute(f, dur) {
    const c = this.c, t = this._t ?? this.next, o = this._osc('triangle', f, t, Math.max(.15, dur * .95), .05, .06, 2600, 1, 0, .6);
    const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.2; lg.gain.value = f * .006; l.connect(lg); lg.connect(o.frequency); l.start(t + .15); l.stop(t + dur + .2);
    const n = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain(); n.buffer = this.noise; nf.type = 'bandpass'; nf.frequency.value = f * 2; nf.Q.value = 3; this._env(ng, t, .03, .012, .12);
    n.connect(nf); nf.connect(ng); ng.connect(this.bus); n.start(t, Math.random(), .2);
  }
  lead(f, dur, cut, v = .045) {
    const c = this.c, t = this._t ?? this.next, o = this._osc('square', f, t, Math.max(.08, dur * .9), v, .01, Math.min(3200, cut + 800), 2, 0, .35);
    this._osc('sawtooth', f, t, Math.max(.08, dur * .9), v * .66, .01, Math.min(3200, cut + 600), 2, 7, .35);
    const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 6; lg.gain.value = f * .008; l.connect(lg); lg.connect(o.frequency); l.start(t + .1); l.stop(t + dur + .2);
  }
  kick(t, v) { const c = this.c, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + .12); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .2); o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + .22); }
  snare(t, v) { const c = this.c, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); n.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 1900; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .16); n.connect(f); f.connect(g); g.connect(this.bus); const s = c.createGain(); s.gain.value = .3; g.connect(s); s.connect(this.send); n.start(t, Math.random(), .18); this._osc('triangle', 190, t, .08, v * .3, .002, 2000, 1, 0, 0); }
  hat(t, v) { const c = this.c, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); n.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 8000; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .045); n.connect(f); f.connect(g); g.connect(this.bus); n.start(t, Math.random(), .05); }
  tom(t, f0) { const c = this.c, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * .5, t + .25); g.gain.setValueAtTime(.6, t); g.gain.exponentialRampToValueAtTime(.001, t + .3); o.connect(g); g.connect(this.bus); const s = c.createGain(); s.gain.value = .4; g.connect(s); s.connect(this.send); o.start(t); o.stop(t + .32); }

  /** short musical stingers for game events */
  sting(kind) {
    const t0 = this.c.currentTime + .02, save = this._t;
    const seq = { card: [[74, 0], [78, .08], [81, .16], [86, .24]], death: [[62, 0], [61, .25], [60, .5], [55, .8]], milestone: [[69, 0], [74, .06], [78, .12], [81, .18], [86, .26]], chest: [[79, 0], [83, .07], [86, .14], [91, .21]] }[kind] || [];
    for (const [m, dt] of seq) { this._t = t0 + dt; kind === 'death' ? this.pad(mtof(m), .9, .05, 900) : this.bell(mtof(m), .5); }
    this._t = save;
  }
}
