import * as THREE from 'three';

const ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const PUSH = { light: 'L', heavy: 'H', jump: 'J', dodge: 'D', skill1: 'S1', skill2: 'S2', ult: 'F' };
// Standard gamepad layout (Xbox names): A0 B1 X2 Y3 LB4 RB5 LT6 RT7 Back8 Start9 LS10 RS11 Up12 Down13 Left14 Right15
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const DEAD = .22;

export class Input {
  constructor(canvas, camera) {
    this.camera = camera; this.keys = new Set(); this.buf = []; this.onPress = null;
    this.ndc = new THREE.Vector2(); this.hasMouse = false; this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); this.hit = new THREE.Vector3();
    this.device = 'kb'; this.padIndex = -1; this.padPrev = []; this.stick = new THREE.Vector2(); this.aimStick = new THREE.Vector2();
    this.held = { L: false, H: false, J: false }; this.camYaw = 0; this.capture = null;
    this.setKeys({ up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', light: 'KeyJ', heavy: 'KeyK', jump: 'Space', dodge: 'ShiftLeft', skill1: 'KeyE', skill2: 'KeyR', ult: 'KeyF' });
    addEventListener('keydown', e => {
      this.device = 'kb';
      if (e.repeat) return;
      if (this.capture) { e.preventDefault(); const cb = this.capture; this.capture = null; cb(e.code); return; }
      this.keys.add(e.code);
      const act = this.codeAct[e.code] || (e.code === 'ShiftRight' ? 'dodge' : null);
      if (act && PUSH[act]) { this.push(PUSH[act]); if (act === 'light') this.held.L = true; if (act === 'heavy') this.held.H = true; if (act === 'jump') this.held.J = true; e.preventDefault(); }
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      this.onPress?.(e.code, e, act);
    });
    addEventListener('keyup', e => { this.keys.delete(e.code); const a = this.codeAct[e.code]; if (a === 'light') this.held.L = false; if (a === 'heavy') this.held.H = false; if (a === 'jump') this.held.J = false; });
    addEventListener('blur', () => { this.keys.clear(); this.held.L = this.held.H = this.held.J = false; this.onPress?.('Blur'); });
    canvas.addEventListener('mousedown', e => {
      this.device = 'kb';
      if (e.button === 0) { this.push('L'); this.held.L = true; } else if (e.button === 2) { this.push('H'); this.held.H = true; }
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.held.L = false; else if (e.button === 2) this.held.H = false; });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => { this.ndc.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); this.hasMouse = true; if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.device = 'kb'; });
    addEventListener('gamepadconnected', e => { this.padIndex = e.gamepad.index; this.onPress?.('PadConnected'); });
    addEventListener('gamepaddisconnected', e => { if (e.gamepad.index === this.padIndex) { this.padIndex = -1; this.stick.set(0, 0); this.aimStick.set(0, 0); } });
  }

  /** keymap: action -> KeyboardEvent.code */
  setKeys(map) {
    this.keymap = { ...map }; this.codeAct = {};
    for (const [a, c] of Object.entries(this.keymap)) this.codeAct[c] = a;
    this.move = { ...ARROWS, [map.up]: [0, -1], [map.down]: [0, 1], [map.left]: [-1, 0], [map.right]: [1, 0] };
  }

  push(k) {
    if (k !== 'L' && k !== 'H') this.clear();
    if (this.buf.length < 2) this.buf.push({ k, t: performance.now() / 1000 });
  }
  peek(age) {
    const now = performance.now() / 1000;
    while (this.buf.length && now - this.buf[0].t > age) this.buf.shift();
    return this.buf[0]?.k ?? null;
  }
  take() { this.buf.shift(); }
  clear() { this.buf.length = 0; }

  /** Poll the gamepad once per frame: buffers combat buttons and reports edges for menus and styles. */
  poll() {
    const pads = navigator.getGamepads?.() || [];
    let gp = pads[this.padIndex];
    if (!gp) { gp = [...pads].find(p => p && p.connected); if (gp) this.padIndex = gp.index; }
    if (!gp) return;
    this.gp = gp;
    const b = i => !!gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > .5);
    const now = gp.buttons.map((_, i) => b(i));
    const edge = i => now[i] && !this.padPrev[i];
    const ax = (i) => { const v = gp.axes[i] || 0; return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD); };
    this.stick.set(ax(0), ax(1));
    this.aimStick.set(ax(2), ax(3));
    if (now.some(Boolean) || this.stick.lengthSq() > .05 || this.aimStick.lengthSq() > .05) this.device = 'pad';
    if (edge(PAD.X)) this.push('L');
    if (edge(PAD.Y)) this.push('H');
    if (edge(PAD.A)) this.push('J');
    if (edge(PAD.B)) this.push('D');
    if (edge(PAD.RT)) this.push('F');
    if (edge(PAD.LT)) this.push('S1');
    if (edge(PAD.LB)) this.push('S2');
    this.held.L = now[PAD.X] || (this.device === 'kb' && this.held.L);
    this.held.H = now[PAD.Y] || (this.device === 'kb' && this.held.H);
    this.held.J = now[PAD.A] || (this.device === 'kb' && this.held.J);
    const map = { [PAD.RB]: 'PadNext', [PAD.START]: 'PadStart', [PAD.BACK]: 'PadStart', [PAD.LEFT]: 'PadLeft', [PAD.UP]: 'PadUp', [PAD.RIGHT]: 'PadRight', [PAD.DOWN]: 'PadDown', [PAD.A]: 'PadA', [PAD.B]: 'PadB', [PAD.Y]: 'PadY' };
    for (const [i, name] of Object.entries(map)) if (edge(+i)) this.onPress?.(name);
    // left stick as menu navigation
    const ny = this.stick.y > .6 ? 'PadDown' : this.stick.y < -.6 ? 'PadUp' : this.stick.x > .6 ? 'PadRight' : this.stick.x < -.6 ? 'PadLeft' : null;
    if (ny && ny !== this._stickDir) this.onPress?.(ny + 'Stick');
    this._stickDir = ny;
    this.padPrev = now;
  }

  rumble(weak, strong, ms) {
    try { this.gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, weakMagnitude: weak, strongMagnitude: strong }); } catch { /* not supported */ }
  }

  moveVec() {
    const v = new THREE.Vector3();
    for (const k of this.keys) { const m = this.move[k]; if (m) { v.x += m[0]; v.z += m[1]; } }
    if (this.stick.lengthSq() > 0) { v.x += this.stick.x; v.z += this.stick.y; }
    if (v.lengthSq() > 1) v.normalize();
    return this._cam(v);
  }

  /** rotate a screen-relative direction (x right, z down) into the world using the camera yaw */
  _cam(v) {
    const c = Math.cos(this.camYaw), s = Math.sin(this.camYaw), x = v.x, z = v.z;
    v.x = x * c + z * s; v.z = -x * s + z * c;
    return v;
  }

  aimPoint() {
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.ray.intersectPlane(this.plane, this.hit) ? this.hit : null;
  }

  /** Returns [angle, explicit]: explicit when the player is actively aiming (mouse or right stick). */
  aimAngle(pos, fallback) {
    if (this.device === 'pad') {
      if (this.aimStick.lengthSq() > .1) { const a = this._cam(new THREE.Vector3(this.aimStick.x, 0, this.aimStick.y)); return Math.atan2(a.x, a.z); }
      const mv = this.moveVec();
      return mv.lengthSq() > .04 ? Math.atan2(mv.x, mv.z) : fallback ?? 0;
    }
    const p = this.hasMouse && this.aimPoint();
    if (!p) { const mv = this.moveVec(); return mv.lengthSq() ? Math.atan2(mv.x, mv.z) : fallback ?? 0; }
    return Math.atan2(p.x - pos.x, p.z - pos.z);
  }
}
