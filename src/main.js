import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { AnimeShader, toonify, fixNormals } from './toon.js';
import { Overworld } from './overworld.js';
import { Skills } from './skills.js';
import { loadSettings, saveSettings, defaults as settingsDefaults } from './settings.js';
import { WATER } from './terrain.js';
import { STYLES, STYLE_ORDER, RANKS, RARITY, UPGRADES, SHOP, WAVES, FINAL_WAVE, endlessWave, CHARS, TREE } from './data.js';
import { Shots } from './shots.js';
import './skills_tigress.js';
import { createWorld, ARENA } from './world.js';
import { FX } from './fx.js';
import { Audio2 } from './audio.js';
import { Input } from './input.js';
import { UI, SEQ } from './ui.js';
import { Player, buildClips, baseStats } from './player.js';
import { Enemies, TYPES, MODEL, stripRootMotion } from './enemies.js';

const STORE = 'eddie_presas_v1';
import { BIOMES } from './terrain.js';
function g_ember(g, pp) { const a = Math.random() * 6.28, r = 3 + Math.random() * 16; g.fx.spark(pp.x + Math.cos(a) * r, Math.random() * 1.5, pp.z + Math.sin(a) * r, (Math.random() - .5) * .8, 1 + Math.random() * 1.5, (Math.random() - .5) * .8, 2.2, .06 + Math.random() * .05, Math.random() < .5 ? 0xff7a2a : 0xffc65c, -.6); }
const BIOMES_NAME = Object.fromEntries(Object.entries(BIOMES).map(([k, v]) => [k, v.name]));
const loadMeta = () => { try { return { souls: 0, best: 0, shop: {}, tree: {}, char: 'eddie', ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch { return { souls: 0, best: 0, shop: {}, tree: {}, char: 'eddie' }; } };
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

class Game {
  async init() {
    const canvas = document.getElementById('c');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: location.search.includes('demo') });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, .1, 400);
    this.world = createWorld(this.scene);
    this.fx = new FX(this.scene, this.camera);
    this.ground = () => 0;
    this.fx.ground = (x, z) => this.ground(x, z);
    this.audio = new Audio2();
    this.input = new Input(canvas, this.camera);
    this.ui = new UI(this);
    this.meta = loadMeta();
    this.settings = loadSettings();
    this.bloomOn = true;
    this._composer();
    addEventListener('resize', () => this.resize()); this.resize();

    const loader = new GLTFLoader();
    this.enemyAssets = {};
    const enemyLoads = Object.keys(MODEL).map(t => loader.loadAsync(`assets/enemies/${t}.glb`).then(g => {
      let skinned = false; g.scene.traverse(o => { if (o.isSkinnedMesh) skinned = true; }); this.normalsFixed = (this.normalsFixed || 0) + fixNormals(g.scene);
      this.enemyAssets[t] = { scene: g.scene, animations: stripRootMotion(g.animations), skinned };
    }).catch(err => console.warn('enemy model missing, using procedural', t, err)));
    const [gltf, anims] = await Promise.all([
      loader.loadAsync('assets/eddie.glb'),
      fetch('assets/anims.json').then(x => { if (!x.ok) throw new Error('anims.json ' + x.status); return x.json(); }),
    ]);
    this.weaponAssets = {};
    const weaponLoads = ['katana', 'hammer', 'claws'].map(w => loader.loadAsync(`assets/weapons/${w}.glb`).then(g => { fixNormals(g.scene); this.weaponAssets[w] = g.scene; }).catch(err => console.warn('weapon model missing', w, err)));
    await Promise.all([...enemyLoads, ...weaponLoads]);
    if (this.enemyAssets.brute) { this.enemyAssets.dummy = this.enemyAssets.brute; MODEL.dummy = { ...MODEL.brute, scale: .85 }; }
    toonify(this.scene);
    this.stats = baseStats();
    fixNormals(gltf.scene);
    this.player = new Player(this, gltf, buildClips(anims), CHARS.eddie);
    this.players = { eddie: this.player };
    this.skills = new Skills(this);
    this.shots = new Shots(this);
    this.mood = 0; this.moodTarget = 0;
    this.scene.add(this.player.root);
    this.enemies = new Enemies(this);
    this._souls(); this._waves();
    this.timers = [];
    this.state = 'title'; this.time = 0; this.stopT = 0; this.slowT = 0; this.slowK = 1; this.trauma = 0; this.fovKick = 0;
    this.camPos = new THREE.Vector3(0, 13, 11);
    this.camYaw = 0; this.camFocus = new THREE.Vector3(); this.camDist = 7.2; this.camH = 3.1;
    this._bind();
    this.applySettings();
    if (this.meta.char && this.meta.char !== 'eddie') await this.selectChar(this.meta.char).catch(err => console.warn('character failed to load', err));
    this.ui.charInfo(this.player.char);
    this.toTitle();
    this.last = performance.now();
    this.fpsAcc = 0; this.fpsN = 0; this.lowFps = 0;
    this.renderer.setAnimationLoop(() => this.frame());
    window.__game = this;
  }

  _composer() {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // guard: a single NaN/Inf pixel gets smeared into black blocks by the bloom blur, so scrub them first
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.,0.,0.,1.); gl_FragColor = vec4(clamp(c.rgb, 0., 30.), c.a); }',
    }));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .32, .35, .92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.anime = new ShaderPass(AnimeShader);
    this.composer.addPass(this.anime);
    this.impactT = 0; this.speedT = 0;
  }

  /** Anime impact frame: a couple of posterized frames with radial lines, centered on the hit. */
  impactFrame(pos, dur = .1) {
    pos = pos.clone(); pos.y += this.ground(pos.x, pos.z);
    const now = performance.now();
    if (now - (this._lastImpact || 0) < 550) return;
    this._lastImpact = now; dur = Math.min(dur, .075);
    const v = pos.clone().project(this.camera);
    this.anime.uniforms.uCenter.value.set(v.x * .5 + .5, v.y * .5 + .5);
    this.anime.uniforms.uInvert.value = 0;
    this.anime.uniforms.uTint.value.set(STYLES[this.player.style].color);
    this.impactT = Math.max(this.impactT, dur);
  }
  // ---- cinematics ---------------------------------------------------------------------------------
  startCine(c) { this.cine = { t: 0, ...c }; if (c.letterbox) this.ui.letterbox(true); }
  endCine() { this.cine = null; this.ui.letterbox(false); }
  flash(color = '#fff', a = .85) { const f = document.getElementById('whiteFlash'); f.style.background = color; f.style.transition = 'none'; f.style.opacity = a; requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = 0; }); }

  /** epic boss entrance: freeze, orbiting low camera, roar, title card and a darkening sky */
  onBossSpawn(e, sub) {
    const SUB = { boss1: 'Guardião das Ruínas', boss2: 'Senhor da Cidadela', treant: 'Coração da Floresta' };
    const bp = e.pos.clone(), pp = this.player.root.position.clone(), a0 = Math.atan2(pp.x - bp.x, pp.z - bp.z), gy = this.ground(bp.x, bp.z), H = e.T.boss ? 3.2 : 2;
    this.startCine({ dur: 2.8, letterbox: true, freeze: true, cam: t => { const a = a0 + .5 - t * .35, d = 8.5 - t * 1.2; return { pos: new THREE.Vector3(bp.x + Math.sin(a) * d, gy + .8 + t * .5, bp.z + Math.cos(a) * d), look: new THREE.Vector3(bp.x, gy + H * (.75 + t * .05), bp.z) }; } });
    e.playClip?.('roar', .8); this.audio.bossRoar(); this.audio.boss();
    this.ui.bossCard(e.T.name.toUpperCase(), SUB[e.type] || sub, '#' + new THREE.Color(e.T.eye).getHexString());
    this.moodTarget = 1; this.after(1.1, () => this.lightning()); this.shake(.3);
  }

  onBossPhase2(e) {
    const bp = e.pos.clone(), gy = this.ground(bp.x, bp.z), pp = this.player.root.position;
    this.startCine({ dur: 1.6, letterbox: true, freeze: true, cam: t => { const a = Math.atan2(pp.x - bp.x, pp.z - bp.z) + .3; return { pos: new THREE.Vector3(bp.x + Math.sin(a) * (7 - t * 2), gy + 1.4, bp.z + Math.cos(a) * (7 - t * 2)), look: new THREE.Vector3(bp.x, gy + 3, bp.z) }; } });
    e.playClip?.('roar', .6); this.audio.bossRoar(); this.moodTarget = 2;
    this.ui.bossCard('FASE 2', `${e.T.name} desperta`, '#ff3a2a');
    for (const m of e.mats) if (m.userData.rim) m.userData.rim.value.set(0xff2a1a);
    this.after(.6, () => {
      this.fx.ring(bp.x, bp.z, 10, 0xff3a2a, .6); this.fx.ring(bp.x, bp.z, 6, 0xffffff, .4); this.impactFrame(bp.clone().setY(2.5), .08); this.aberr(1); this.shake(.8); this.lightning();
      const d = Math.hypot(pp.x - bp.x, pp.z - bp.z); if (d < 10) { const a = Math.atan2(pp.x - bp.x, pp.z - bp.z); this.player.vel.set(Math.sin(a) * 14, 0, Math.cos(a) * 14); }
    });
  }

  lightning() {
    this.flash('#e8dcff', .7); this._bolt = .25;
    this.audio._noise({ dur: 1.6, type: 'lowpass', f0: 900, f1: 60, vol: .5, attack: .02, verb: .8 }); this.audio._tone({ f0: 60, f1: 30, dur: 1.2, vol: .4 });
  }

  /** boss mood: blood sky, red fog and light, embers, floating debris and lightning */
  _mood(dt) {
    this.mood += (this.moodTarget - this.mood) * Math.min(1, dt * .9);
    const m = Math.min(1, this.mood), pp = this.player.root.position;
    const red = new THREE.Color(0x3a0812);
    if (this.overworld?.skyMat) this.overworld.skyMat.uniforms.uMood.value = m;
    if (this.world.sky) this.world.sky.material.uniforms.uMood.value = m;
    if (this.mode !== 'world') { this.scene.fog.color.set(0x120d22).lerp(red, m * .7); this.scene.background.copy(this.scene.fog.color); }
    else this.scene.fog.color.lerp(red, m * .05);
    if (this.world.hemi) { this.world.hemi.color.set(0xc9c4e6).lerp(new THREE.Color(0xff9a8a), m * .55); this._bolt = Math.max(0, (this._bolt || 0) - dt); this.world.hemi.intensity = (this.mode === 'world' ? 2.3 : 1.7) + this._bolt * 10; }
    this.world.moon.color.set(0xdbe2ff).lerp(new THREE.Color(0xff7a4a), m * .7);
    if (m > .15) {
      for (let i = 0; i < 2; i++) if (Math.random() < m * dt * 22) g_ember(this, pp);
      if (Math.random() < m * dt * 3 && this.boss) { const b = this.boss.pos, a = Math.random() * 6.28, r = 6 + Math.random() * 10; this.fx.spark(b.x + Math.cos(a) * r, 0, b.z + Math.sin(a) * r, 0, .8 + Math.random(), 0, 4, .35 + Math.random() * .3, 0x2a2230, -.25); }
      if (this.moodTarget >= 2 && Math.random() < dt * .22) this.lightning();
    }
  }

  speedLines(t) { this.speedT = Math.max(this.speedT, t); }
  aberr(v) { this.aberrT = Math.max(this.aberrT || 0, v); }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w / 2, h / 2);
    this.anime.uniforms.uAspect.value = w / h;
  }

  // ---- menus ------------------------------------------------------------------------------------
  _bind() {
    const $ = id => document.getElementById(id), click = (id, f) => $(id).onclick = () => { this.audio.init(); this.audio.ui(); f(); };
    click('btnPlay', () => this.startRun());
    click('btnTrain', () => this.startTraining());
    click('btnWorld', () => this.startWorld());
    click('btnShop', () => this.openShop());
    click('btnTree', () => this.openTree());
    click('btnChar', () => this.selectChar(this.player.char.id === 'eddie' ? 'tigress' : 'eddie'));
    click('btnHow', () => this.ui.show('how'));
    click('btnOpts', () => this.openOptions('title'));
    click('btnPauseOpts', () => this.openOptions('pause'));
    click('btnResume', () => this.resume());
    click('btnQuit', () => this.training ? this.toTitle() : this.endRun(false));
    click('btnAgain', () => this.startRun());
    click('btnMenu', () => this.toTitle());
    click('btnEndless', () => { this.endless = true; this.ui.show(null); this.state = 'play'; this.offerCards(); });
    this.input.onPress = (code, e, act) => {
      if (code.startsWith('Pad')) this.audio.init();
      if (code === 'PadConnected') this.ui.announceSmall('Controle conectado');
      if (code === 'Escape' || act === 'pause' || code === 'Blur' || code === 'PadStart') {
        if (this.ui.current === 'options') { document.getElementById('btnOptsBack').click(); return; }
        if (this.state === 'play') this.pause(); else if (this.state === 'pause' && code !== 'Blur') this.resume();
      }
      if (this.state === 'play') {
        const cyc = d => this.player.setStyle(STYLE_ORDER[(STYLE_ORDER.indexOf(this.player.style) + d + 3) % 3]);
        if (code === 'PadNext') cyc(1);
        if (code === 'PadPrev') cyc(-1);
        if (code === 'PadLeft') this.player.setStyle(STYLE_ORDER[0]);
        if (code === 'PadUp') this.player.setStyle(STYLE_ORDER[1]);
        if (code === 'PadRight') this.player.setStyle(STYLE_ORDER[2]);
      } else if (code.startsWith('Pad')) this.ui.padNav(code, this.state);
      if (code === 'KeyM') this.audio.toggleMute();
      if (this.training && this.state === 'play') { if (code === 'Backspace') this.resetDps(); if (code === 'KeyT') this.spawnDummy(); }
      if (code === 'KeyG') { this.bloomOn = !this.bloomOn; this.ui.announceSmall(this.bloomOn ? 'Efeitos: brilho ligado' : 'Efeitos: brilho desligado'); }
      if (this.state === 'play') {
        const s = STYLE_ORDER.find(id => act === 'style' + STYLES[id].key);
        if (s) this.player.setStyle(s);
        if (act === 'styleNext') this.player.setStyle(STYLE_ORDER[(STYLE_ORDER.indexOf(this.player.style) + 1) % 3]);
      }
      if (this.state === 'cards' && /^Digit[1-4]$/.test(code)) document.querySelectorAll('.card')[+code.slice(5) - 1]?.click();
    };
    document.addEventListener('pointerdown', () => this.audio.init(), { once: true });
  }

  // ---- open world ------------------------------------------------------------------------------------
  async loadWorldAssets() {
    if (this.overworld) return this.overworld;
    const loader = new GLTFLoader(), names = ['pine', 'oldtree', 'rocks', 'crystals', 'pillar', 'arch', 'shrine', 'lantern', 'shrooms', 'tower', 'bush'];
    const props = {};
    await Promise.all(names.map(n => loader.loadAsync(`assets/world/${n}.glb`).then(g => { fixNormals(g.scene); props[n] = g.scene; }).catch(() => null)));
    this.overworld = new Overworld(this, props);
    toonify(this.overworld.group);
    return this.overworld;
  }

  async startWorld() {
    this.ui.announce('CARREGANDO O MUNDO', 'gerando terreno e florestas…', 6000);
    await new Promise(r => setTimeout(r, 30));
    const ow = await this.loadWorldAssets();
    this.startRun();
    this.mode = 'world'; this.queue = []; this.waveDone = true; this.timers = []; this.boss = null;
    ow.reset();
    this.world.arena.visible = false; ow.group.visible = true;
    this.ground = (x, z) => ow.height(x, z);
    this.scene.fog.near = 55; this.scene.fog.far = 230;
    if (this.world.hemi) this.world.hemi.intensity = 2.3;
    const sp = ow.spawnPoint(); this.player.root.position.copy(sp);
    this.camFocus.copy(sp); this.camPos.set(sp.x, sp.y + 8, sp.z + 10); this.camYaw = 0;
    document.getElementById('minimap').classList.remove('hide');
    this.ui.announce('BOSQUE DA LUA', 'Derrote os três guardiões · santuários curam e guardam suas almas', 3200);
  }

  leaveWorld() {
    if (this.mode !== 'world') return;
    this.mode = 'arena'; this.ground = () => 0;
    this.world.arena.visible = true; if (this.overworld) this.overworld.group.visible = false;
    this.scene.fog.near = 45; this.scene.fog.far = 200; this.scene.fog.color.set(0x120d22); this.scene.background.set(0x0b0816);
    if (this.world.hemi) this.world.hemi.intensity = 1.7;
    document.getElementById('minimap').classList.add('hide');
  }

  onShrine(s) {
    const banked = Math.round(this.runSouls);
    this.player.heal(this.stats.maxHp); this.player.fury = Math.max(this.player.fury, 40);
    if (banked) { this.meta.souls += banked; this.runSouls = 0; this.saveMeta(); }
    this.audio.heal(); this.fx.ring(s.x, s.z, 4, 0x7fe9ff, .6); this.fx.wisps(s.x, 1, s.z, 24, 0x7fe9ff);
    this.ui.announce('SANTUÁRIO', banked ? `Vida restaurada · ◆ ${banked} almas guardadas no altar` : 'Vida restaurada · ponto de retorno', 1800);
  }

  onCampCleared(c) {
    if (this.player.state === 'free' && !this.player.airborne) this.player.playOnce('Victory_Cheer', .03, .2, 1.6, .15);
    this.ui.announce('ACAMPAMENTO PURIFICADO', c.B.name, 1300);
    this.dropSouls(c.x, c.z, 10 + c.B.tier * 6);
    this.after(1.4, () => { if (this.state === 'play' && this.mode === 'world' && !this.player.dead) this.offerCards(`${c.B.name} · escolha uma bênção`); });
  }

  onBossDown(e) {
    const n = this.overworld.bossesDown.size;
    this.after(2.2, () => {
      if (n >= 3) return this.endRun(true);
      if (this.state === 'play') this.offerCards(`Guardião derrotado (${n}/3) · escolha uma bênção`);
    });
  }

  /** switch the playable character, loading her model, clips and weapons the first time */
  async selectChar(id) {
    const C = CHARS[id];
    if (!C || this._charBusy) return;
    if (!this.players[id]) {
      this._charBusy = true;
      this.ui.announce('CARREGANDO', C.name, 6000);
      try {
        const loader = new GLTFLoader();
        const [gltf, anims] = await Promise.all([loader.loadAsync(C.model), fetch(C.anims).then(r => { if (!r.ok) throw new Error(C.anims + ' ' + r.status); return r.json(); })]);
        await Promise.all(C.styles.filter(w => !this.weaponAssets[w]).map(w => loader.loadAsync(`assets/weapons/${w}.glb`).then(g => { fixNormals(g.scene); this.weaponAssets[w] = g.scene; }).catch(() => null)));
        fixNormals(gltf.scene);
        this.players[id] = new Player(this, gltf, buildClips(anims), C);
        this.scene.add(this.players[id].root); this.players[id].setActive(false);
      } finally { this._charBusy = false; }
      this.ui.announce('', '', 10);
    }
    const old = this.player, P = this.players[id];
    if (old !== P) { old.setActive(false); P.setActive(true); P.root.position.copy(old.root.position); this.player = P; }
    STYLE_ORDER.splice(0, STYLE_ORDER.length, ...C.styles);
    this.meta.char = id; this.saveMeta();
    P.reset(this.stats); this.ui.renderStyles(); this.ui.charInfo(C);
    if (this.state === 'title') { P.playOnce('Chest_Pound_Taunt', 0, 1, 4.8, .3); this.audio.swap?.(C.styles[0]); }
  }

  openTree() {
    this.ui.tree(this.meta, TREE, id => {
      const n = TREE.find(x => x.id === id), T = this.meta.tree ||= {};
      if (T[id] || this.meta.souls < n.cost || !n.req.every(r => T[r])) return;
      this.meta.souls -= n.cost; T[id] = true; this.saveMeta(); this.audio.card(); this.openTree();
    });
  }

  toTitle() {
    this.leaveWorld(); if (this.cine) this.endCine(); this.skills?.clear(); this.shots?.clear(); this.moodTarget = 0; this.mood = 0;
    this.training = false; document.getElementById('trainPanel').classList.add('hide');
    this.state = 'title'; this.enemies.clear(); this.fx.clearTelegraphs(); this.boss = null;
    this.player.reset(this.stats); this.player.playOnce('Chest_Pound_Taunt', 0, 1, 4.8, .3);
    this.ui.hud(false); this.ui.show('title'); this.audio.stopMusic();
    document.getElementById('bestLine').textContent = this.meta.best ? `Melhor caçada: onda ${this.meta.best}  ·  ◆ ${this.meta.souls} almas no altar` : `◆ ${this.meta.souls} almas no altar`;
  }

  // ---- options ---------------------------------------------------------------------------------------
  openOptions(from) {
    this.ui.options(this.settings, (reset) => {
      if (reset) this.settings.keys = settingsDefaults().keys;
      this.applySettings(); saveSettings(this.settings);
    }, () => { if (from === 'pause') this.pause(); else this.ui.show('title'); });
  }

  applySettings() {
    const S = this.settings;
    this.input.setKeys(Object.fromEntries(Object.entries(S.keys).filter(([, c]) => c)));
    this.audio.setVolumes(S.master, S.music, S.sfx);
    if (S.quality !== 'auto') this.setQuality(S.quality);
  }

  /** 3 = high, 2 = medium, 1 = low, 0 = minimum */
  setQuality(q) {
    if (this.qLevel === q) return;
    this.qLevel = q;
    const r = this.renderer, dpr = Math.min(devicePixelRatio, 1.5);
    this.bloomOn = q >= 2;
    r.setPixelRatio([.7, .85, 1, dpr][q]); this.resize();
    const shadows = q >= 2;
    if (r.shadowMap.enabled !== shadows) { r.shadowMap.enabled = shadows; this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); }
    this.world.moon.shadow.mapSize.set(q >= 3 ? 2048 : 1024, q >= 3 ? 2048 : 1024); this.world.moon.shadow.map?.dispose(); this.world.moon.shadow.map = null;
    const ow = this.overworld;
    if (ow) { ow.grass.geometry.instanceCount = Math.round(42000 * [.15, .35, .6, 1][q]); ow.viewDist = [95, 120, 150, 175][q]; ow.inkDist = [0, 45, 70, 95][q]; }
  }

  saveMeta() { try { localStorage.setItem(STORE, JSON.stringify(this.meta)); } catch { /* storage unavailable: progress lives only this session */ } }

  openShop() {
    this.ui.shop(this.meta, id => {
      const it = SHOP.find(s => s.id === id), lv = this.meta.shop[id] || 0, c = it.cost(lv);
      if (lv >= it.max || this.meta.souls < c) return;
      this.meta.souls -= c; this.meta.shop[id] = lv + 1; this.saveMeta(); this.audio.card(); this.openShop();
    });
  }

  pause() { this.state = 'pause'; this.ui.pause(this.player, this.picked.map(p => p.name)); }
  resume() { this.ui.show(null); this.state = 'play'; this.input.clear(); }

  // ---- run flow --------------------------------------------------------------------------------
  // ---- training -----------------------------------------------------------------------------------
  startTraining() {
    this.startRun();
    this.training = true; this.queue = []; this.waveDone = true; this.timers = []; this.boss = null;
    this.ui.announce('TREINO', 'Boneco imortal · medidor de DPS', 1500);
    for (const id of STYLE_ORDER) for (const m of Object.values(STYLES[id].moves)) if (m.locked) this.player.unlocked.add(id + ':' + m.seq);
    this.enemies.clear(); this.spawnDummy(0, -3.5);
    document.getElementById('trainPanel').classList.remove('hide');
    this.resetDps();
  }

  spawnDummy(x, z) {
    if (x === undefined) { const a = Math.random() * 6.283; x = Math.sin(a) * 5; z = Math.cos(a) * 5; }
    const e = this.enemies.spawn('dummy', x, z, {}); e.cd = 1e9;
  }

  resetDps() { this.dmgLog = []; this.dpsTotal = 0; this.dpsMax = 0; this.dpsPeak = 0; this.dpsStart = null; }

  onDamage(d) {
    if (!this.training) return;
    if (this.dpsStart === null) this.dpsStart = this.time;
    this.dmgLog.push([this.time, d]); this.dpsTotal += d; this.dpsMax = Math.max(this.dpsMax, d);
  }

  _trainingUpdate() {
    const now = this.time, win = 5;
    while (this.dmgLog.length && this.dmgLog[0][0] < now - win) this.dmgLog.shift();
    const span = this.dpsStart === null ? win : Math.min(win, Math.max(1, now - this.dpsStart));
    const dps = this.dmgLog.reduce((a, b) => a + b[1], 0) / span;
    this.dpsPeak = Math.max(this.dpsPeak, dps);
    const set = (id, v) => { const el = document.getElementById(id); if (el.textContent !== v) el.textContent = v; };
    set('tpDps', Math.round(dps).toString()); set('tpPeak', Math.round(this.dpsPeak).toString());
    set('tpTotal', Math.round(this.dpsTotal).toString()); set('tpMax', Math.round(this.dpsMax).toString());
    set('tpTime', this.dpsStart === null ? '0 s' : `${Math.round(now - this.dpsStart)} s`);
    const p = this.player; p.fury = 100; p.hp = this.stats.maxHp;
    // dummies drift back to their spot after being launched or knocked away
    for (const e of this.enemies.list) if (e.alive && e.y <= 0 && e.stun <= 0) { e.home ||= e.pos.clone(); e.pos.lerp(e.home, .02); }
  }

  startRun() {
    if (this.cine) this.endCine(); this.skills?.clear(); this.shots?.clear(); this.moodTarget = 0;
    this._won = false;
    this.mode = this.mode === 'world' ? 'world' : 'arena';
    this.training = false; document.getElementById('trainPanel').classList.add('hide');
    const sh = this.meta.shop, st = this.stats = baseStats();
    st.maxHp += 10 * (sh.vida || 0); st.dmg += .05 * (sh.dano || 0); st.soul += .1 * (sh.almas || 0);
    const tree = this.player.char.id === 'tigress' ? TREE.filter(n => this.meta.tree?.[n.id]) : [];
    for (const n of tree) n.apply?.(st);
    this.rerolls = sh.reroll || 0; this.cardCount = 3 + (sh.escolha || 0);
    this.enemies.clear(); this.fx.clearTelegraphs(); this.timers = [];
    this.player.reset(st);
    this.player.fury = Math.max(sh.furia ? 50 : 0, st.startFury || 0);
    for (const n of tree) if (n.unlock) this.player.unlocked.add(n.unlock);
    const locked = this.lockedMoves();
    for (let i = 0; i < (sh.combo || 0) && locked.length; i++) { const m = locked.splice(Math.random() * locked.length | 0, 1)[0]; this.player.unlocked.add(m.style + ':' + m.seq); }
    this.picked = []; this.stacks = {};
    this.wave = 0; this.endless = false; this.runSouls = 0; this.kills = 0; this.maxCombo = 0; this.combo = 0; this.comboTimer = 0; this.boss = null;
    this.soulClear(); this.runStart = this.time;
    this.ui.show(null); this.ui.hud(true); this.audio.startMusic();
    this.state = 'play';
    this.nextWave();
  }

  get levelScale() { return 1 + .14 * (this.wave - 1) + (this.wave > FINAL_WAVE ? .12 * (this.wave - FINAL_WAVE) : 0); }
  waveText() { if (this.training) return 'TREINO'; if (this.mode === 'world') return `${(BIOMES_NAME[this.overworld?.region] || '').toUpperCase()} · GUARDIÕES ${this.overworld?.bossesDown.size || 0}/3`; return this.wave > FINAL_WAVE ? `ONDA ${this.wave} · INFINITO` : `ONDA ${this.wave} / ${FINAL_WAVE}`; }

  nextWave() {
    this.wave++;
    const plan = this.wave <= FINAL_WAVE ? WAVES[this.wave - 1] : endlessWave(this.wave);
    const q = [];
    for (const [t, n] of plan) for (let i = 0; i < n; i++) q.push(t);
    const bosses = q.filter(t => TYPES[t].boss), rest = q.filter(t => !TYPES[t].boss).sort(() => Math.random() - .5);
    this.queue = [...bosses, ...rest]; this.spawnT = 1.2; this.waveDone = false;
    if (bosses.length) { this.ui.announce(TYPES[bosses[0]].name.toUpperCase(), `Onda ${this.wave}`, 2400); this.audio.boss(); }
    else this.ui.announce(`ONDA ${this.wave}`, this.wave === 1 ? 'A noite tem fome' : '', 1500);
  }

  _spawner(dt) {
    if (!this.queue.length) return;
    this.spawnT -= dt;
    const cap = 9 + this.wave * 1.3;
    if (this.spawnT > 0 || this.enemies.alive >= cap) return;
    const n = Math.min(this.queue.length, 2 + Math.random() * 3 | 0);
    const pp = this.player.root.position;
    const base = Math.atan2(pp.x, pp.z) + Math.PI + (Math.random() - .5) * 2;
    for (let i = 0; i < n; i++) {
      const t = this.queue.shift(), a = base + (i - n / 2) * .35, rr = TYPES[t].boss ? 10 : ARENA - 3 - Math.random() * 3;
      const elite = !TYPES[t].boss && this.wave >= 4 && Math.random() < Math.min(.25, .04 * (this.wave - 3));
      const e = this.enemies.spawn(t, Math.sin(a) * rr, Math.cos(a) * rr, { scale: this.levelScale, elite });
      if (TYPES[t].boss) { this.boss = e; this.onBossSpawn(e, `Onda ${this.wave}`); }
    }
    this.spawnT = 1.6 + Math.random() * 1.2;
  }

  _checkWave() {
    if (this.training || this.mode === 'world') return;
    if (this.waveDone || this.queue.length || this.enemies.alive > 0) return;
    this.waveDone = true; this.boss = null; this.fx.clearTelegraphs();
    this.ui.announce('ONDA LIMPA', this.wave === FINAL_WAVE ? '' : 'Escolha uma bênção', 1300);
    this.after(1.6, () => {
      if (this.state !== 'play' || this.player.dead) return;
      if (this.wave === FINAL_WAVE && !this.endless) return this.endRun(true);
      this.offerCards();
    });
  }

  lockedMoves() {
    const out = [];
    for (const id of STYLE_ORDER) for (const m of Object.values(STYLES[id].moves)) if (m.locked && !m.tree && !this.player.unlocked.has(id + ':' + m.seq)) out.push(m);
    return out;
  }

  _moveDesc(m) {
    const h = m.hits, f = [];
    if (h.some(x => x.launch)) f.push('lança os inimigos ao ar');
    if (h.some(x => x.wave)) f.push('dispara uma onda cortante que atravessa a arena');
    if (h.some(x => x.ring)) f.push('libera uma onda de choque');
    if (h.some(x => x.aftershock)) f.push('com um tremor secundário');
    if (h.some(x => x.bleed)) f.push('faz sangrar');
    if (h.some(x => x.stun)) f.push('atordoa');
    if (h.length > 1) f.push(`${h.length} golpes seguidos`);
    const s = f.join(', ');
    return (s[0]?.toUpperCase() + s.slice(1) || 'Golpe poderoso') + '.';
  }

  rollCards() {
    const pool = UPGRADES.filter(u => (this.stacks[u.id] || 0) < u.max).map(u => ({ ...u, kind: 'up', stack: this.stacks[u.id] || 0 }));
    const combos = this.lockedMoves().map(m => ({ kind: 'combo', r: 'raro', style: m.style, seq: m.seq, name: m.name, desc: this._moveDesc(m), move: m }));
    const out = [];
    if (combos.length && (this.wave % 2 === 1 || Math.random() < .4)) out.push(combos.splice(Math.random() * combos.length | 0, 1)[0]);
    const all = [...pool, ...combos.map(c => ({ ...c, w: .5 }))];
    while (out.length < this.cardCount && all.length) {
      const tot = all.reduce((s, c) => s + (c.w ?? RARITY[c.r].w), 0);
      let x = Math.random() * tot, i = 0;
      for (; i < all.length - 1; i++) { x -= all[i].w ?? RARITY[all[i].r].w; if (x <= 0) break; }
      out.push(all.splice(i, 1)[0]);
    }
    return out;
  }

  offerCards(title) {
    this.state = 'cards'; this.audio.card();
    const show = () => this.ui.cards(this.cards, this.rerolls, c => this.pickCard(c), () => { if (this.rerolls > 0) { this.rerolls--; this.cards = this.rollCards(); this.audio.ui(); show(); } }, title || `Onda ${this.wave} vencida · escolha uma bênção`);
    this.cards = this.rollCards(); show();
  }

  pickCard(c) {
    this.audio.card(); this.audio.sting('card');
    { const pp = this.player.root.position; this.fx.wisps(pp.x, .5, pp.z, 30, 0xffd27a); this.fx.ring(pp.x, pp.z, 3, 0xffd27a, .5); }
    if (c.kind === 'combo') { this.player.unlocked.add(c.style + ':' + c.seq); this.picked.push(`${c.name} (${SEQ(c.seq)})`); }
    else { this.stacks[c.id] = (this.stacks[c.id] || 0) + 1; c.apply(this.stats, this.player); this.picked.push(c.name); }
    this.player.heal(this.stats.maxHp * .15);
    this.ui.show(null); this.state = 'play'; this.input.clear();
    if (this.mode !== 'world') this.nextWave();
  }

  endRun(win) {
    const banked = Math.round(this.runSouls);
    this.meta.souls += banked; this.meta.best = Math.max(this.meta.best, win ? FINAL_WAVE : this.wave);
    this.saveMeta();
    this.state = 'over'; this.audio.stopMusic(); this.ui.hud(false);
    const t = this.time - this.runStart;
    const rows = [this.mode === 'world' ? ['Guardiões derrotados', `${this.overworld.bossesDown.size}/3`] : ['Onda alcançada', this.wave], ['Inimigos abatidos', this.kills], ['Maior combo', this.maxCombo], ['Almas levadas ao altar', '◆ ' + banked], ['Tempo', `${t / 60 | 0}m ${String(t % 60 | 0).padStart(2, '0')}s`]];
    this._won = win; if (!win) this.audio.sting('death');
    if (win) { this.player.playOnce('Victory_Cheer', 0, 1, 9.3, .3); this.runSouls = 0; }
    this.ui.over(win ? (this.mode === 'world' ? 'A NOITE É SUA' : 'A LUA É SUA') : 'A noite venceu', rows, win && this.mode !== 'world');
  }

  onPlayerDeath() {
    this.combo = 0; this.slowmo(1.2, .3);
    if (this.mode === 'world') {
      // respawn at the last shrine, losing half of the souls not yet stored
      return this.after(2.6, () => {
        const lost = Math.round(this.runSouls / 2); this.runSouls -= lost;
        for (const e of [...this.enemies.list]) if (e.alive && e.home) e.aggro = false;
        const p = this.player, sp = this.overworld.spawnPoint();
        p.dead = false; p.state = 'free'; p.hp = this.stats.maxHp; p.iframe = 2; p._endShots();
        p.root.position.copy(sp); this.camFocus.copy(sp);
        this.ui.announce('DE VOLTA AO SANTUÁRIO', lost ? `◆ ${lost} almas se perderam` : '', 1800);
      });
    }
    this.after(2.4, () => this.endRun(false));
  }

  // ---- combat --------------------------------------------------------------------------------------
  rankIndex() { let i = 0; RANKS.forEach((r, k) => { if (this.combo >= r.min) i = k; }); return i; }

  resolveHit(hit, move) {
    const p = this.player, pos = p.root.position, st = this.stats, style = STYLES[move.style] || STYLES[p.style];
    const color = move.seq === 'F' ? 0xe9d2ff : style.color;
    const face = p.facing;
    const PW = p.power || 0, sy = p.y + 1.05;
    if (style.id === 'glaive' && st.reach !== 1) hit = { ...hit, range: hit.range * st.reach };
    if (hit.pull) {
      for (const e of this.enemies.list) {
        if (!e.alive || e.state === 'spawn' || e.T.boss) continue;
        const dx = pos.x - e.pos.x, dz = pos.z - e.pos.z, d = Math.hypot(dx, dz);
        if (d < hit.pull && d > 1.2) { e.pos.x += dx / d * (d - 1.2); e.pos.z += dz / d * (d - 1.2); this.fx.bolt(new THREE.Vector3(pos.x, 1.2, pos.z), new THREE.Vector3(e.pos.x, 1.1, e.pos.z), color); }
      }
      this.fx.ring(pos.x, pos.z, hit.pull, color, .35);
    }
    if (hit.shot) this.fireShots(hit, move, face, color);
    else this.fx.slash(new THREE.Vector3(pos.x, sy, pos.z), face, hit.range * (1.05 + PW * .25), THREE.MathUtils.degToRad(Math.min(hit.arc + 20, 360)), hit.roll || 0, hit.dir || 1, color, (hit.heavy ? .26 : .18) * (1 + PW * .5));
    if (PW > .75) this.fx.slash(new THREE.Vector3(pos.x, sy, pos.z), face, hit.range * (.8 + PW * .2), THREE.MathUtils.degToRad(Math.min(hit.arc + 10, 360)), (hit.roll || 0) + .25, hit.dir || 1, 0xffffff, .14 + PW * .1);
    let any = false;
    for (const e of this.enemies.list) {
      if (!e.alive || e.state === 'spawn') continue;
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (Math.abs(e.y - p.y) > (move.air ? 2.2 : 1.7) && !hit.ring) continue;
      if (move.dash && p.dashHits.has(e)) { any = true; this.fx.slash(new THREE.Vector3(e.pos.x, 1.1, e.pos.z), face + 1.2, 1.6, 2, .4, 1, color, .2); this.damageEnemy(e, hit.dmg, { ...hit, dir: face, color, style: style.id, fromMove: true }); continue; }
      if (d > hit.range + e.r) continue;
      if (hit.arc < 360 && d > .4 && Math.abs(angDiff(face, Math.atan2(dx, dz))) > THREE.MathUtils.degToRad(hit.arc / 2) + Math.atan2(e.r, d)) continue;
      any = true;
      this.damageEnemy(e, hit.dmg, { ...hit, dir: Math.atan2(dx, dz), color, style: style.id, fromMove: true, air: !!move.air && p.airborne, airY: p.y });
      if (move.fin && !this._finFrame) { this._finFrame = true; this.impactFrame(new THREE.Vector3(e.pos.x, e.y + 1.2, e.pos.z), .1); }
    }
    this._finFrame = false;
    if (hit.ring) this.shockwave(pos.x + Math.sin(face) * .8, pos.z + Math.cos(face) * .8, hit.ring * st.shock, hit.dmg * .7, color, { stun: hit.stun, launch: hit.launch, knock: 6 });
    if (hit.aftershock) this.after(.35, () => this.shockwave(pos.x, pos.z, hit.ring * 1.35 * st.shock, hit.dmg * .5, color, { stun: .6, knock: 5 }));
    if (hit.wave) this.launchWave(pos, face, hit.wave, hit.dmg * 1.2, color);
    if (hit.slam) {
      const sx = pos.x + Math.sin(face) * 1.4, sz = pos.z + Math.cos(face) * 1.4;
      this.fx.burst(sx, .1, sz, 22, 0xbfb0d8, 6, .1, .5); this.fx.scorch(sx, sz, (hit.ring || 2) * .7); this.fx.dust(sx, sz, 10);
    }
    if (any) {
      const heavy = hit.heavy || p.counter;
      this.hitstop(heavy ? .08 : .035); this.shake(heavy ? .3 : .1); this.audio.hit(heavy, style.id, this._lastCrit);
      this.input.rumble(heavy ? .5 : .25, heavy ? .8 : .1, heavy ? 140 : 60);
      if (heavy) this.fovKick = Math.max(this.fovKick, hit.slam ? 4 : 2.5);
      if (move.fin || hit.slam) this.aberr(.6);
    } else if (move.seq !== 'F' && !hit.shot) this.audio._noise({ dur: .05, f0: 900, f1: 500, vol: .03, verb: 0 });
  }

  /** plasma shots leave the cannon's muzzle (or her chest for other styles) */
  fireShots(hit, move, face, color) {
    const p = this.player, s = hit.shot, n = s.n || 1, v = new THREE.Vector3(), mz = p.wSets?.cannon?.[0];
    if (p.style === 'cannon' && mz) { mz.localToWorld(v.set(0, .32, 0)); } else v.set(p.root.position.x, this.ground(p.root.position.x, p.root.position.z) + p.y + 1.3, p.root.position.z);
    const h = Math.max(.4, v.y - this.ground(v.x, v.z));
    for (let i = 0; i < n; i++) {
      const a = face + (n > 1 ? (i - (n - 1) / 2) * (s.spread || .2) : (Math.random() - .5) * (s.spread || 0));
      this.shots.fire(v.x, h, v.z, a, { ...s, color, launch: s.launch });
    }
    this.audio.shoot((s.size || 1) > 1.4 || !!s.lob);
    this.fx.impact(v.x, h, v.z, 1.1 * (s.size || 1), 0xffffff, .07);
  }

  damageEnemy(e, base, o = {}) {
    const p = this.player, st = this.stats, rk = this.rankIndex();
    let dmg = base * st.dmg * (RANKS[rk].mult + st.rankBonus * rk);
    if (p.moonT > 0) dmg *= 1.3;
    if (p.swapBuff > 0 && o.fromMove) dmg *= 1.3;
    if (st.execute && e.hp < e.maxHp * .3) dmg *= 1.5;
    if (e.stun > 0 && e.poiseMax) dmg *= 1.3;
    if (o.fromMove && p.counter) dmg *= 2;
    const juggle = e.y > .35 && o.fromMove;
    if (juggle) { dmg *= 1.2; e.vy = Math.max(e.vy, 4.2); }
    const crit = p.critT > 0 || Math.random() < st.crit + (o.style === 'katana' ? .1 : 0);
    if (crit) dmg *= st.critMult;
    this._lastCrit = crit;
    dmg *= .9 + Math.random() * .2;
    const bleed = o.bleed || (o.style === 'claws' && o.fromMove ? 2.2 : 0);
    if (o.style === 'glaive' && e.y > .35) dmg *= 1.2;
    const killed = e.hurt(dmg, { ...o, bleed });
    const hy = 1 + e.y + (e.T.boss ? 1.4 : 0);
    this.fx.number(e.pos.x, 1 + hy, e.pos.z, juggle ? `${Math.round(dmg)} ↑` : dmg, crit, crit ? '' : o.color === 0xffffff ? '#fff' : null);
    const c = o.color ?? 0xffffff;
    const PW = p.power || 0;
    this.fx.impact(e.pos.x, hy, e.pos.z, (crit ? 1.8 : o.heavy ? 1.4 : .9) * (1 + PW * .35), crit ? 0xffd27a : c, .11);
    this.fx.spray(e.pos.x, hy, e.pos.z, o.dir ?? 0, Math.round((crit ? 9 : 5) * (1 + PW * .8)), c, (o.heavy ? 10 : 7) * (1 + PW * .25));
    if (PW > .8 && o.fromMove && o.heavy) this.fx.ring(e.pos.x, e.pos.z, 1.1 + PW * .6, c, .2, hy - .6);
    this.fx.burst(e.pos.x, hy, e.pos.z, 3, 0x7a2bd9, 3, .08, .4);
    if (o.fromMove || o.chainable) {
      const before = this.rankIndex();
      this.combo++; this.comboTimer = st.comboTime; this.maxCombo = Math.max(this.maxCombo, this.combo);
      if ([10, 25, 50, 100, 150, 200, 300].includes(this.combo)) {
        this.ui.milestone(`${this.combo} ACERTOS!`, ['', 'Feroz!', 'Selvagem!', 'Imparável!', 'LENDÁRIO!', 'LUA CHEIA!', 'DIVINO!'][[10, 25, 50, 100, 150, 200, 300].indexOf(this.combo)] || '');
        this.audio.milestone(); this.aberr(1); p.fury = Math.min(100, p.fury + 15); this.dropSouls(e.pos.x, e.pos.z, Math.round(this.combo / 5));
      }
      const after = this.rankIndex();
      if (after > before) { this.audio.rankUp(after); this.ui.announceSmall(`PATENTE: ${RANKS[after].name}`); }
      p.energy = Math.min(100, p.energy + 1.4);
      p.fury = Math.min(100, p.fury + (o.heavy ? 4.5 : 2.6) * st.fury * (p.moonT > 0 ? 0 : 1));
      p.lastHit = p.time;
      if (st.leech) p.heal(dmg * st.leech);
      if (st.chain && o.fromMove && Math.random() < st.chain) this.chainLightning(e, dmg * .4);
      if (o.style === 'gauntlet' && o.fromMove && Math.random() < .18 + (st.tesla || 0)) this.chainLightning(e, dmg * .35);
    }
    return killed;
  }

  chainLightning(from, dmg) {
    let cur = from; const hit = new Set([from]);
    for (let i = 0; i < 3; i++) {
      let best = null, bd = 7;
      for (const e of this.enemies.list) if (e.alive && !hit.has(e)) { const d = e.pos.distanceTo(cur.pos); if (d < bd) { bd = d; best = e; } }
      if (!best) break;
      this.fx.bolt(new THREE.Vector3(cur.pos.x, 1.2, cur.pos.z), new THREE.Vector3(best.pos.x, 1.2, best.pos.z));
      hit.add(best); this.damageEnemy(best, dmg / this.stats.dmg, { color: 0xc9a6ff, stun: .3 }); cur = best;
    }
  }

  shockwave(x, z, r, dmg, color, o = {}) {
    this.fx.ring(x, z, r, color, .45); this.fx.ring(x, z, r * .7, 0xffffff, .3);
    this.audio.shock(); this.shake(.35);
    for (const e of this.enemies.list) {
      if (!e.alive || e.state === 'spawn') continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d < r + e.r) this.damageEnemy(e, dmg, { ...o, dir: Math.atan2(e.pos.x - x, e.pos.z - z), color, chainable: true, heavy: true });
    }
  }

  /** A juggled enemy smashed into the floor: bounce, shockwave, hurt whoever is around. */
  enemySlam(e, dmg) {
    const x = e.pos.x, z = e.pos.z;
    this.fx.ring(x, z, 3.2, 0xffffff, .35); this.fx.scorch(x, z, 1.6); this.fx.burst(x, .2, z, 20, 0xd9b4ff, 7, .1, .5);
    this.audio.shock(); this.shake(.4); this.hitstop(.05); this.input.rumble(.4, .6, 120);
    e.vy = 3.5; e.y = .01;
    for (const o of this.enemies.list) if (o !== e && o.alive && Math.hypot(o.pos.x - x, o.pos.z - z) < 3 + o.r) this.damageEnemy(o, dmg * .6, { knock: 5, dir: Math.atan2(o.pos.x - x, o.pos.z - z), color: 0xd9b4ff, stun: .6 });
  }

  explosion(x, z, r, dmg, src) {
    this.fx.ring(x, z, r, 0xffa23a, .45); this.fx.burst(x, .8, z, 40, 0xffa23a, 10, .14, .6); this.audio.explode(); this.shake(.45);
    const pp = this.player.root.position;
    if (Math.hypot(pp.x - x, pp.z - z) < r + .3) this.hurtPlayer(dmg, src.pos);
    for (const e of this.enemies.list) if (e !== src && e.alive && Math.hypot(e.pos.x - x, e.pos.z - z) < r + e.r) this.damageEnemy(e, 30, { knock: 8, dir: Math.atan2(e.pos.x - x, e.pos.z - z), color: 0xffa23a });
  }

  hurtPlayer(dmg, from) {
    const p = this.player;
    if (p.dead || this.state !== 'play') return;
    if (p.iframe > 0) {
      if (p.state === 'dodge' && p.t < .3 && !this._perfectCd) {
        this._perfectCd = true; this.after(.5, () => { this._perfectCd = false; });
        this.impactFrame(p.root.position.clone().setY(p.y + 1), .07);
        this.slowmo(.9, .25); this.audio.perfect(); this.ui.announceSmall('ESQUIVA PERFEITA · ATAQUE PARA CONTRA-ATACAR');
        p.fury = Math.min(100, p.fury + 12); p.counterT = 1.1;
        this.input.rumble(.2, 0, 120);
        this.fx.ring(p.root.position.x, p.root.position.z, 3, 0xffffff, .35);
        if (this.stats.instinct) { p.dodgeCharge = this.stats.dodges; p.critT = 2; }
      }
      return;
    }
    p.hurt(dmg, from);
    this.combo = 0; this.comboTimer = 0;
    this.ui.hurtFlash(); this.shake(.45); this.audio.hurt(); this.hitstop(.06); this.input.rumble(.6, .9, 220);
    this.fx.burst(p.root.position.x, 1.1, p.root.position.z, 12, 0xff4a5e, 6, .08, .4);
  }

  onEnemyKilled(e) {
    this.kills++;
    // anime kill cut + pop, and multi-kill callouts
    const ky = 1.1 + e.y;
    this.fx.slash(new THREE.Vector3(e.pos.x, ky, e.pos.z), Math.random() * 6.28, 1.6 + e.r * .6, .45, (Math.random() - .5) * 2.4, 1, 0xffffff, .13);
    this.fx.impact(e.pos.x, ky, e.pos.z, .9 + e.r * .4, 0xffffff, .09);
    this.audio.killPop(e.elite || e.T.boss);
    const now = this.time; this.killChain = (this.killChain || []).filter(t => now - t < 1.4); this.killChain.push(now);
    const chain = this.killChain.length;
    if (chain >= 2) { this.ui.announceSmall(['', '', 'DUPLO!', 'TRIPLO!', 'QUÁDRUPLO!'][chain] || `MASSACRE ×${chain}!`); this.audio.multiKill(chain); if (chain >= 3) this.aberr(.7); }
    // the last enemy of a fight gets a dramatic slow-motion finish
    const lastInCamp = e.camp && e.camp.members.filter(m => m.alive && m !== e.member).length === 0;
    const lastInWave = this.mode !== 'world' && !this.training && this.queue.length === 0 && this.enemies.alive === 0;
    if (lastInCamp || lastInWave) { this.slowmo(.7, .2); this.fovKick = 7; this.impactFrame(e.pos.clone().setY(ky), .08); this.aberr(1); }
    if (this.mode === 'world') this.overworld.onKilled(e);
    this.fx.wisps(e.pos.x, 1, e.pos.z, e.T.boss ? 60 : 14, 0x9a5cff); this.audio.enemy(e.type, 'die');
    const n = Math.max(1, Math.round(e.T.soul * (e.elite ? 3 : 1) * (1 + this.rankIndex() * .15)));
    this.dropSouls(e.pos.x, e.pos.z, n);
    if (Math.random() < (e.T.boss ? 1 : e.elite ? .4 : .05)) this.dropHeal(e.pos.x, e.pos.z);
    if (e.T.boss) { this.moodTarget = 0; this.slowmo(1.6, .2); this.ui.announce('DERROTADO', e.T.name); this.shake(.8); this.impactFrame(e.pos.clone().setY(2), .16); }
  }

  _worldUpdate(dt) {
    const ow = this.overworld; ow.update(dt);
    const p = this.player, pp = p.root.position;
    // wading through the swamp lake
    if (!p.airborne && this.ground(pp.x, pp.z) < WATER - .2) { p.vel.multiplyScalar(.9); if (Math.random() < .2 && Math.hypot(p.vel.x, p.vel.z) > 1) this.fx.spark(pp.x, WATER - this.ground(pp.x, pp.z) + .05, pp.z, (Math.random() - .5) * 2, 2, (Math.random() - .5) * 2, .4, .08, 0x9ff0e8, 12); }
    if ((this._mapT = (this._mapT || 0) - dt) <= 0) { this._mapT = .2; const c = document.getElementById('minimap'); ow.drawMinimap(c.getContext('2d'), c.width); }
  }

  launchWave(pos, ang, speed, dmg, color) {
    const w = this.wavesPool.find(x => !x.on); if (!w) return;
    w.on = true; w.m.visible = true; w.t = 0; w.ang = ang; w.speed = speed; w.dmg = dmg; w.hit = new Set();
    w.m.position.set(pos.x, this.ground(pos.x, pos.z) + 1, pos.z); w.m.rotation.set(0, ang, 0); w.m.material.color.set(color);
  }

  _waves() {
    const g = new THREE.TorusGeometry(1.5, .12, 4, 24, Math.PI * .8); g.rotateX(Math.PI / 2); g.rotateY(Math.PI * .1 + Math.PI / 2); g.scale(1, .3, 1);
    this.wavesPool = Array.from({ length: 6 }, () => {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, toneMapped: false, depthWrite: false }));
      m.visible = false; this.scene.add(m); return { m, on: false };
    });
  }

  _updateWaves(dt) {
    for (const w of this.wavesPool) {
      if (!w.on) continue;
      w.t += dt;
      w.m.position.x += Math.sin(w.ang) * w.speed * dt; w.m.position.z += Math.cos(w.ang) * w.speed * dt; w.m.position.y = this.ground(w.m.position.x, w.m.position.z) + 1;
      w.m.material.opacity = 1 - w.t / .8; w.m.scale.setScalar(1 + w.t);
      this.fx.spark(w.m.position.x, 1, w.m.position.z, 0, 1, 0, .3, .08, w.m.material.color.getHex(), 0);
      for (const e of this.enemies.list) if (e.alive && !w.hit.has(e) && Math.hypot(e.pos.x - w.m.position.x, e.pos.z - w.m.position.z) < 1.6 + e.r) {
        w.hit.add(e); this.damageEnemy(e, w.dmg, { knock: 4, dir: w.ang, color: w.m.material.color.getHex(), style: 'katana', chainable: true });
      }
      if (w.t > .8) { w.on = false; w.m.visible = false; }
    }
  }

  // ---- souls and healing orbs -----------------------------------------------------------------------
  _souls() {
    const N = 320;
    this.soulMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.13), new THREE.MeshBasicMaterial({ color: 0x7fe9ff, toneMapped: false }), N);
    this.soulMesh.frustumCulled = false; this.scene.add(this.soulMesh);
    this.soulData = Array.from({ length: N }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0, heal: false }));
    this.healMeshes = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.28, 1), new THREE.MeshBasicMaterial({ color: 0xff5f7c, toneMapped: false })); m.visible = false; this.scene.add(m); return { m, on: false, t: 0 }; });
  }

  soulClear() { for (const s of this.soulData) s.on = false; for (const h of this.healMeshes) { h.on = false; h.m.visible = false; } }

  dropSouls(x, z, n) {
    for (let i = 0; i < Math.min(n, 24); i++) {
      const s = this.soulData.find(q => !q.on); if (!s) return;
      const a = Math.random() * 6.283, sp = 2 + Math.random() * 4;
      s.on = true; s.t = 0; s.val = n / Math.min(n, 24); s.p.set(x, this.ground(x, z) + 1, z); s.v.set(Math.cos(a) * sp, 5 + Math.random() * 3, Math.sin(a) * sp);
    }
  }

  dropHeal(x, z) {
    const h = this.healMeshes.find(q => !q.on); if (!h) return;
    h.on = true; h.t = 0; h.m.visible = true; h.m.position.set(x, this.ground(x, z) + .6, z);
  }

  _updateSouls(dt) {
    const pp = this.player.root.position, m = new THREE.Matrix4(), st = this.stats;
    this.soulData.forEach((s, i) => {
      if (!s.on) { m.makeScale(0, 0, 0); this.soulMesh.setMatrixAt(i, m); return; }
      s.t += dt;
      const dx = pp.x - s.p.x, dz = pp.z - s.p.z, dy = pp.y + 1 - s.p.y, d = Math.hypot(dx, dz);
      if (s.t > .45 && (d < st.magnet + 1.5 || this.waveDone)) {
        const k = 18 + s.t * 10; s.v.set(dx / (d + .01) * k, dy * 6, dz / (d + .01) * k);
      } else { s.v.y -= 16 * dt; s.v.x *= Math.exp(-dt * 2); s.v.z *= Math.exp(-dt * 2); }
      s.p.addScaledVector(s.v, dt);
      { const gf = this.ground(s.p.x, s.p.z) + .25; if (s.p.y < gf) { s.p.y = gf; s.v.y = Math.abs(s.v.y) * .4; } }
      if (d < .6 && s.t > .45) { s.on = false; this.runSouls += s.val * st.soul; this.audio.soul(); }
      m.makeRotationY(s.t * 4); m.setPosition(s.p.x, s.p.y + Math.sin(s.t * 6) * .05, s.p.z); this.soulMesh.setMatrixAt(i, m);
    });
    this.soulMesh.instanceMatrix.needsUpdate = true;
    for (const h of this.healMeshes) {
      if (!h.on) continue;
      h.t += dt; h.m.position.y = this.ground(h.m.position.x, h.m.position.z) + .6 + Math.sin(h.t * 3) * .15; h.m.rotation.y += dt * 2;
      const d = Math.hypot(pp.x - h.m.position.x, pp.z - h.m.position.z);
      if (d < st.magnet * .6) { h.m.position.x += (pp.x - h.m.position.x) * dt * 6; h.m.position.z += (pp.z - h.m.position.z) * dt * 6; }
      if (d < .8) { h.on = false; h.m.visible = false; this.player.heal(st.maxHp * .2); this.audio.heal(); this.fx.burst(pp.x, 1, pp.z, 16, 0xff5f7c, 4, .08, .5, -2); }
      if (h.t > 20) { h.on = false; h.m.visible = false; }
    }
  }

  // ---- time & camera ---------------------------------------------------------------------------------
  /** Lock-on target for the camera: the boss when present, else the nearest enemy (sticky to avoid flicking). */
  _lockOn() {
    if (!this.lockMark) {
      const g = new THREE.RingGeometry(.75, .95, 40); g.rotateX(-Math.PI / 2);
      this.lockMark = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8, depthWrite: false, toneMapped: false }));
      const c = new THREE.Mesh(new THREE.ConeGeometry(.22, .4, 3), this.lockMark.material); c.rotation.x = Math.PI; c.name = 'chev';
      this.lockMark.add(c); this.scene.add(this.lockMark);
    }
    const pp = this.player.root.position;
    let L = this.lock;
    if (this.state !== 'play') L = null;
    else if (this.boss && this.boss.alive) L = this.boss;
    else {
      let best = null, bd = 16;
      for (const e of this.enemies.list) if (e.alive && e.state !== 'spawn' && e.aggro) { const d = Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z); if (d < bd) { bd = d; best = e; } }
      const cur = L && L.alive ? Math.hypot(L.pos.x - pp.x, L.pos.z - pp.z) : Infinity;
      if (!L || !L.alive || cur > 20 || (best && cur > bd * 1.6 + 1)) L = best;
    }
    this.lock = L;
    const m = this.lockMark;
    m.visible = !!L;
    if (L) {
      m.position.set(L.pos.x, this.ground(L.pos.x, L.pos.z) + .08 + L.y, L.pos.z); m.scale.setScalar(L.r * 1.2 + .3);
      m.material.color.set(STYLES[this.player.style].color);
      const ch = m.getObjectByName('chev'); ch.position.y = (L.T.boss ? 7 : L.r * 2 + 2.1) / m.scale.x + Math.sin(this.time * 5) * .1; ch.rotation.y = this.time * 2;
    }
    return L;
  }

  /** keep a position inside the playable area (and out of world obstacles) */
  clampPos(p, margin = .5) {
    if (this.overworld && this.mode === 'world') return this.overworld.clamp(p, margin);
    const r = Math.hypot(p.x, p.z), lim = ARENA - margin;
    if (r > lim) { p.x *= lim / r; p.z *= lim / r; }
  }
  outOfBounds(x, z) { return this.mode === 'world' && this.overworld ? this.overworld.outOfBounds(x, z) : Math.hypot(x, z) > ARENA + 2; }

  /** choose the soundtrack and ambience for what is happening right now */
  _audioRouting(dt) {
    const A = this.audio; if (!A.ctx) return;
    let track = 'title', amb = 'none';
    if (this.state === 'over') track = this._won ? 'victory' : 'title';
    else if (this.state !== 'title') {
      // one continuous theme that never switches; the combo meter (and bosses) add layers on top
      track = 'main';
      if (A.music) A.music.boss = !!(this.boss && this.boss.alive);
      amb = this.mode === 'world' ? (this.overworld?.region || 'grove') : 'arena';
      if (A.music) A.music.variant = this.mode === 'world' ? (this.overworld?.region || 'grove') : 'arena';
    }
    // style meter -> music layers: rise quickly with the rank, drain gradually once the combo drops
    if (A.music) {
      const target = this.state === 'play' && this.combo > 0 ? Math.min(5, this.rankIndex() + 1 + Math.min(1, this.combo / 12)) : 0;
      const L = A.music.level;
      A.music.level = target > L ? Math.min(target, L + dt * 2.2) : Math.max(target, L - dt * .32);
    }
    A.setTrack(track); A.setAmbience(amb); A.ambienceTick(dt);
  }

  after(s, fn) { this.timers.push({ t: s, fn }); }
  hitstop(s) { this.stopT = Math.max(this.stopT, s); }
  slowmo(s, k) { this.slowT = Math.max(this.slowT, s); this.slowK = k; }
  shake(a) { this.trauma = Math.min(1, this.trauma + a * (this.settings?.shake ?? 1)); }

  frame() {
    const now = performance.now(), rdt = Math.min(.05, (now - this.last) / 1000); this.last = now;
    this._autoQuality(rdt);
    this.tick(rdt, true);
  }

  /** Debug/test helper: advance the simulation by n fixed steps. */
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) this.tick(dt, i === n - 1); }

  tick(rdt, draw) {
    this.input.poll();
    let k = 1;
    if (this.stopT > 0) { this.stopT -= rdt; k = .02; }
    else if (this.slowT > 0) { this.slowT -= rdt; k = this.slowK; }
    const dt = this.state === 'play' || this.state === 'title' || this.state === 'over' ? rdt * k : 0;
    this.time += dt;
    const p = this.player;

    if (this.state === 'play') {
      for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
      p.update(dt);
      this.skills.update(dt);
      if (this.cine) { this.cine.t += dt; if (this.cine.t >= this.cine.dur) this.endCine(); }
      if (!this.cine?.freeze) this.enemies.update(dt);
      this._mood(dt);
      if (this.training) this._trainingUpdate(); else if (this.mode === 'world') this._worldUpdate(dt); else this._spawner(dt);
      this._checkWave();
      this._updateWaves(dt); this.shots.update(dt);
      this._updateSouls(dt);
      if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }
      this.audio.intensity = Math.min(1, this.enemies.alive / 12 + this.rankIndex() * .15); this.audio.bossMusic = !!(this.boss && this.boss.alive);
      this.ui.update();
      if (p.hp > 0 && p.hp < this.stats.maxHp * .3 && (this._beat = (this._beat || 0) - dt) <= 0) { this._beat = .85; this.audio.heartbeat(); }
    } else if (this.state === 'title' || this.state === 'over') {
      for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
      p.mixer.update(dt); p._blend(dt, false); p._post(0, false);
      if (this.state === 'title') { p.facing = Math.PI * .1; }
      this.enemies.update(dt);
    }
    this._audioRouting(dt);
    this.fx.update(dt);
    this.fx.updateUnscaled(rdt);

    // camera
    const pp = p.root.position;
    let target, look;
    if (this.state === 'title') {
      const a = this.time * .12;
      target = new THREE.Vector3(pp.x + Math.sin(a) * 2 - 2.2, 2.3, pp.z + 6.5); look = new THREE.Vector3(pp.x - 1.6, 1.25, pp.z);
    } else {
      // Arena-fighter camera: low, behind Eddie and off to one side, framing Eddie and the locked target.
      const L = this._lockOn(), py = Math.max(0, p.y || 0);
      let yawGoal = this.camYaw, dist = 7.2, height = 3.1 + py * .6, focus = pp.clone();
      if (L) {
        const dx = L.pos.x - pp.x, dz = L.pos.z - pp.z, D = Math.max(.1, Math.hypot(dx, dz));
        const behind = Math.atan2(-dx, -dz), a = behind + .6, b = behind - .6;
        if (this.camSide === undefined || Math.abs(angDiff(this.camYaw, behind + this.camSide * .6)) > 1.4) this.camSide = Math.abs(angDiff(this.camYaw, a)) < Math.abs(angDiff(this.camYaw, b)) ? 1 : -1;
        yawGoal = behind + this.camSide * .6;
        focus.set(pp.x + dx * .38, 0, pp.z + dz * .38);
        dist = THREE.MathUtils.clamp(5.6 + D * .62, 6.6, 15); height = 2.7 + D * .15 + py * .6 + (L.T.boss ? 1 : 0);
      } else if (this.input.device === 'pad' && Math.abs(this.input.aimStick.x) > .2) yawGoal = this.camYaw - this.input.aimStick.x * rdt * 2.6 * this.settings.camSens;
      this.camYaw += angDiff(this.camYaw, yawGoal) * Math.min(1, rdt * (L ? 3.2 : 6));
      this.camFocus.lerp(focus, 1 - Math.exp(-rdt * 8));
      const cs = this.settings.camDist; this.camDist = THREE.MathUtils.damp(this.camDist, dist * cs, 3, rdt); this.camH = THREE.MathUtils.damp(this.camH, height * (.6 + cs * .4), 4, rdt);
      const f = this.camFocus, lim = ARENA + 1.2;
      // keep the camera over the arena: shorten the boom (and lift it) instead of going into the obelisks
      let d = this.camDist;
      const at = k => new THREE.Vector3(f.x + Math.sin(this.camYaw) * k, 0, f.z + Math.cos(this.camYaw) * k);
      if (this.mode !== 'world' && at(d).length() > lim) { let lo = 0, hi = d; for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (at(mid).length() > lim) hi = mid; else lo = mid; } d = Math.max(lo, 2.5); }
      const lift = (this.camDist - d) * .45;
      const fg = this.ground(f.x, f.z);
      target = at(d); target.y = Math.max(this.ground(target.x, target.z) + 1.2, fg + this.camH + lift);
      look = new THREE.Vector3(f.x, fg + 1.2 + py * .55, f.z);
      this.input.camYaw = this.camYaw;
    }
    this.camPos.lerp(target, 1 - Math.exp(-rdt * (this.state === 'title' ? 2 : 10)));
    this.camera.position.copy(this.camPos);
    this.trauma = Math.max(0, this.trauma - rdt * 1.6);
    const sh = this.trauma * this.trauma * .45;
    this.camera.position.x += (Math.random() - .5) * sh; this.camera.position.y += (Math.random() - .5) * sh;
    if (this.cine?.cam) { const c = this.cine.cam(this.cine.t); this.camera.position.copy(c.pos); this.camPos.copy(c.pos); look = c.look; }
    if (this.debugCam) { const d = this.debugCam; this.camera.position.set(pp.x + d[0], pp.y + d[1], pp.z + d[2]); look = new THREE.Vector3(pp.x, pp.y + d[3], pp.z); }
    this.camera.lookAt(look);
    this.fovKick = Math.max(0, (this.fovKick || 0) - rdt * 14);
    const fov = (this.state === 'title' ? 42 : 52) - this.fovKick;
    if (Math.abs(this.camera.fov - fov) > .01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.world.update(this.time, pp, STYLES[p.style].color, p.power || 0);

    if (!draw) return;
    this.impactT = Math.max(0, this.impactT - rdt); this.speedT = Math.max(0, this.speedT - rdt);
    const U = this.anime.uniforms;
    this.aberrT = Math.max(0, (this.aberrT || 0) - rdt * 3); U.uAberr.value = this.aberrT;
    { // light shafts from the moon
      const mp = this.mode === 'world' && this.overworld ? this.overworld.moon.position : this.world.moonPos;
      const v = mp.clone().project(this.camera), on = v.z < 1 && Math.abs(v.x) < 1.6 && Math.abs(v.y) < 1.6;
      U.uLight.value.set(v.x * .5 + .5, v.y * .5 + .5); U.uRays.value = on ? (this.mode === 'world' ? .9 : .6) * (1 + this.mood * .6) : 0;
      U.uRayCol.value.set(0xc9b8ff).lerp(new THREE.Color(0xff6a3a), Math.min(1, this.mood));
    }
    U.uImpact.value = this.impactT > 0 ? 1 : 0; U.uSpeed.value = Math.min(1, this.speedT * 4); U.uTime.value = performance.now() / 1000;
    this.bloom.enabled = this.bloomOn;
    this.composer.render();
  }

  /** "Automatic" quality: step down when the frame rate sags, step back up when there is headroom */
  _autoQuality(rdt) {
    if (this.settings?.quality !== 'auto') return;
    if (this.qLevel === undefined) this.setQuality(3);
    if (this.state !== 'play' || rdt <= 0) return;
    this.fpsAcc += rdt; this.fpsN++;
    if (this.fpsAcc < 2) return;
    const fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0;
    this._qCool = Math.max(0, (this._qCool || 0) - 2);
    if (this._qCool > 0) return;
    if (fps < 48 && this.qLevel > 0) { this.setQuality(this.qLevel - 1); this._qCool = 4; this._goodT = 0; }
    else if (fps > 58) { this._goodT = (this._goodT || 0) + 2; if (this._goodT >= 10 && this.qLevel < 3) { this.setQuality(this.qLevel + 1); this._qCool = 6; this._goodT = 0; } }
    else this._goodT = 0;
  }
}

// Debug: ?demo=<style>&f=<frames>[&w=<wave>] plays an autopilot fight (used for automated screenshots).
function autopilot(g, frames) {
  const P = g.player;
  for (let t = 0; t < frames; t++) {
    const e = (g.boss && g.boss.alive) ? g.boss : g.enemies.list.find(x => x.alive && x.state !== 'spawn');
    g.input.keys.clear();
    if (e) {
      const v = e.pos.clone().project(g.camera); g.input.hasMouse = true; g.input.ndc.set(v.x, v.y);
      const p = P.root.position, dx = e.pos.x - p.x, dz = e.pos.z - p.z;
      if (Math.hypot(dx, dz) > 2.6) { if (dx > .8) g.input.keys.add('KeyD'); if (dx < -.8) g.input.keys.add('KeyA'); if (dz > .8) g.input.keys.add('KeyS'); if (dz < -.8) g.input.keys.add('KeyW'); }
      else if (t % 14 === 0) g.input.push(Math.random() < .6 ? 'L' : 'H');
    }
    g.step(1, 1 / 60);
  }
  g.input.keys.clear();
}
const q = new URLSearchParams(location.search);

const game = new Game();
game.init().then(() => {
  if (!q.has('demo')) return;
  game.startRun(); game.stats.armor = .2;
  if (q.get('w')) { game.timers = []; game.enemies.clear(); game.wave = +q.get('w') - 1; game.nextWave(); }
  game.player.setStyle(q.get('demo') || STYLE_ORDER[0]);
  autopilot(game, +(q.get('f') || 600));
  if (q.has('freeze')) { game.renderer.setAnimationLoop(null); game.step(1); }
}).catch(err => {
  console.error(err);
  document.getElementById('loadErr').textContent = 'Falha ao carregar: ' + err.message + ' — abra o jogo pelo jogar.bat (precisa de um servidor local).';
});
