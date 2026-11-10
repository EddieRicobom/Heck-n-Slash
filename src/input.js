import * as THREE from 'three';

const MOVE = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
// Standard gamepad layout (Xbox names): A0 B1 X2 Y3 LB4 RB5 LT6 RT7 Back8 Start9 LS10 RS11 Up12 Down13 Left14 Right15
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const DEAD = .22;

export class Input {
  constructor(canvas, camera) {
    this.camera = camera; this.keys = new Set(); this.buf = null; this.onPress = null;
    this.ndc = new THREE.Vector2(); this.hasMouse = false; this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); this.hit = new THREE.Vector3();
    this.device = 'kb'; this.padIndex = -1; this.padPrev = []; this.stick = new THREE.Vector2(); this.aimStick = new THREE.Vector2();
    this.held = { L: false, H: false }; this.camYaw = 0;
    addEventListener('keydown', e => {
      this.device = 'kb';
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.push('J'); e.preventDefault(); }
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyC') { this.push('D'); e.preventDefault(); }
      else if (e.code === 'KeyJ') { this.push('L'); this.held.L = true; }
      else if (e.code === 'KeyK') { this.push('H'); this.held.H = true; }
      else if (e.code === 'KeyF') this.push('F');
      else if (e.code === 'KeyE') this.push('S1');
      else if (e.code === 'KeyR') this.push('S2');
      if (e.code === 'Tab') e.preventDefault();
      this.onPress?.(e.code, e);
    });
    addEventListener('keyup', e => { this.keys.delete(e.code); if (e.code === 'KeyJ') this.held.L = false; if (e.code === 'KeyK') this.held.H = false; });
    addEventListener('blur', () => { this.keys.clear(); this.held.L = this.held.H = false; this.onPress?.('Blur'); });
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

  push(k) { this.buf = { k, t: performance.now() / 1000 }; }
  peek(age) { return this.buf && performance.now() / 1000 - this.buf.t <= age ? this.buf.k : null; }
  take() { this.buf = null; }

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
    for (const k of this.keys) { const m = MOVE[k]; if (m) { v.x += m[0]; v.z += m[1]; } }
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
