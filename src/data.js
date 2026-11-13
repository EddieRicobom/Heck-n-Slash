// Game data: combat styles, combo trees, upgrades, meta shop and waves.
// Each move plays a slice [from, to] of a clip over `dur` seconds. Hit `f` values are
// positions in the clip (0..1) measured from the strike peaks of Eddie's hands and feet.
const D = Math.PI / 180;

export const STYLES = {
  claws: {
    id: 'claws', name: 'Garras', key: 1, color: 0xb44dff, css: '#b44dff', move: 1.1,
    trait: 'Rápido. Todo acerto aplica sangramento.',
    moves: {
      L: { name: 'Arranhão', anim: 'Left_Jab_from_Guard', from: .05, to: .42, dur: .34, alts: [{ anim: 'Elbow_Strike', f: .49, span: .28 }], hits: [{ f: .18, dmg: 9, arc: 110, range: 2.1, roll: .35, dir: 1 }] },
      LL: { name: 'Corte Cruzado', anim: 'Right_Jab_from_Guard', from: .08, to: .42, dur: .34, alts: [{ anim: 'Counterstrike', f: .39, span: .12 }], hits: [{ f: .23, dmg: 10, arc: 110, range: 2.1, roll: -.35, dir: -1 }] },
      LLL: { name: 'Gancho Lupino', anim: 'Left_Hook_from_Guard', from: .08, to: .62, dur: .42, lunge: 1, hits: [{ f: .30, dmg: 14, arc: 150, range: 2.3, knock: 3, roll: .1, dir: 1 }] },
      LLLL: { name: 'Uivo Rasgante', anim: 'Lunge_Spin_Kick', from: .2, to: .85, dur: .62, lunge: 1.5, hits: [{ f: .6, dmg: 24, arc: 360, range: 2.9, knock: 8, ring: 3.2, roll: 0, dir: 1, heavy: true }] },
      LLH: { name: 'Uppercut da Lua', anim: 'Right_Uppercut_from_Guard', from: .2, to: .8, dur: .5, locked: true, hits: [{ f: .5, dmg: 18, arc: 120, range: 2.3, launch: 9, roll: 1.4, dir: 1, heavy: true }] },
      LH: { name: 'Rasteira', anim: 'Sweeping_Kick', from: .25, to: .75, dur: .55, hits: [{ f: .5, dmg: 14, arc: 360, range: 2.7, stun: .9, roll: 0, dir: -1 }] },
      H: { name: 'Bote', anim: 'Lunge_Roundhouse_Kick', from: .12, to: .55, dur: .55, lunge: 3.6, hits: [{ f: .35, dmg: 16, arc: 130, range: 2.4, knock: 5, roll: .2, dir: 1, heavy: true }] },
      HH: { name: 'Coice de Coelho', anim: 'Spartan_Kick', from: .05, to: .6, dur: .5, hits: [{ f: .3, dmg: 22, arc: 70, range: 2.4, knock: 13, roll: 0, dir: 1, heavy: true, slam: true }] },
      HL: { name: 'Tempestade de Garras', anim: 'Punch_Combo', from: .15, to: .62, dur: .9, locked: true, hits: [.26, .33, .4, .48].map((f, i) => ({ f, dmg: 7, arc: 140, range: 2.3, roll: i % 2 ? -.4 : .4, dir: i % 2 ? -1 : 1, bleed: 2 })) },
    },
  },
  katana: {
    id: 'katana', name: 'Katana', key: 2, color: 0x59e0ff, css: '#59e0ff', move: 1,
    trait: 'Alcance longo. +10% de chance crítica.',
    moves: {
      L: { name: 'Corte', anim: 'Right_Hand_Sword_Slash', from: .12, to: .65, dur: .4, hits: [{ f: .38, dmg: 13, arc: 160, range: 2.8, roll: .2, dir: -1 }] },
      LL: { name: 'Contracorte', anim: 'Left_Slash', from: .08, to: .4, dur: .42, hits: [{ f: .23, dmg: 14, arc: 160, range: 2.8, roll: -.25, dir: 1 }] },
      LLL: { name: 'Estocada', anim: 'Thrust_Slash', from: .08, to: .42, dur: .45, lunge: 1.8, hits: [{ f: .23, dmg: 20, arc: 36, range: 4.4, knock: 4, roll: 0, dir: 1 }] },
      LLLL: { name: 'Ciclone de Lâminas', anim: 'Double_Blade_Spin', from: .05, to: .4, dur: .8, lunge: 1.5, hits: [.12, .18, .24, .3].map((f, i) => ({ f, dmg: 9, arc: 360, range: 3, roll: (i - 1.5) * .3, dir: 1, knock: i === 3 ? 6 : 0, heavy: i === 3 })) },
      LLH: { name: 'Onda Lunar', anim: 'Charged_Slash', from: .2, to: .75, dur: .55, locked: true, hits: [{ f: .52, dmg: 16, arc: 140, range: 2.8, wave: 26, roll: 0, dir: 1, heavy: true }] },
      LH: { name: 'Ascensão', anim: 'Charged_Upward_Slash', from: .12, to: .5, dur: .5, hits: [{ f: .32, dmg: 18, arc: 110, range: 2.8, launch: 10, roll: Math.PI / 2, dir: -1, heavy: true }] },
      H: { name: 'Iaido', anim: 'Charged_Slash', from: .2, to: .75, dur: .6, lunge: 5.5, dash: true, hits: [{ f: .52, dmg: 26, arc: 90, range: 3.2, roll: .1, dir: 1, heavy: true }] },
      HH: { name: 'Julgamento', anim: 'Sword_Judgment', from: .04, to: .42, dur: .9, lunge: 2.6, locked: true, hits: [{ f: .21, dmg: 36, arc: 360, range: 2.4, ring: 4, stun: 1, roll: Math.PI / 2, dir: -1, heavy: true, slam: true }] },
    },
  },
  hammer: {
    id: 'hammer', name: 'Martelo', key: 3, color: 0xffb347, css: '#ffb347', move: .9, armor: true,
    trait: 'Lento e pesado. Não é interrompido ao atacar e atordoa.',
    moves: {
      L: { name: 'Varredura', anim: 'Heavy_Hammer_Swing', from: .25, to: .9, dur: .62, hits: [{ f: .66, dmg: 24, arc: 180, range: 3.1, knock: 6, roll: .15, dir: 1, heavy: true }] },
      LL: { name: 'Ceifa', anim: 'Reaping_Swing', from: .6, to: .85, dur: .7, hits: [{ f: .73, dmg: 30, arc: 230, range: 3.3, knock: 7, roll: -.1, dir: -1, heavy: true }] },
      LLL: { name: 'Terremoto', anim: 'Charged_Ground_Slam', from: .3, to: .75, dur: .85, hits: [{ f: .55, dmg: 40, arc: 360, range: 2.4, ring: 4.8, stun: 1.3, roll: Math.PI / 2, dir: -1, heavy: true, slam: true }] },
      H: { name: 'Machadada', anim: 'Charged_Axe_Chop', from: .42, to: .7, dur: .9, hits: [{ f: .57, dmg: 56, arc: 70, range: 3.5, ring: 2.6, stun: 1.6, roll: Math.PI / 2, dir: -1, heavy: true, slam: true }] },
      HH: { name: 'Furacão', anim: 'Axe_Spin_Attack', from: .05, to: .5, dur: .95, lunge: 2.2, hits: [.15, .2, .25, .3].map(f => ({ f, dmg: 13, arc: 360, range: 3.2, knock: 3, roll: 0, dir: 1 })) },
      LH: { name: 'Réplica Sísmica', anim: 'Charged_Ground_Slam', from: .3, to: .75, dur: .9, locked: true, hits: [{ f: .55, dmg: 32, arc: 360, range: 2.4, ring: 6.5, aftershock: 1, stun: 1, roll: Math.PI / 2, dir: 1, heavy: true, slam: true }] },
      HL: { name: 'Martelo Lunar', anim: 'Sword_Judgment', from: .04, to: .42, dur: 1, lunge: 3, locked: true, hits: [{ f: .21, dmg: 52, arc: 360, range: 2.6, ring: 5, stun: 1.6, roll: Math.PI / 2, dir: -1, heavy: true, slam: true }] },
    },
  },
};
export const STYLE_ORDER = ['claws', 'katana', 'hammer'];

export const SPECIAL = { name: 'LUA CHEIA', anim: 'Charged_Ground_Slam', from: .3, to: .75, dur: 1.1, hits: [{ f: .55, dmg: 70, arc: 360, range: 3, ring: 8, stun: 2.2, launch: 6, roll: 0, dir: 1, heavy: true, slam: true }] };

// Special inputs: '.' = short pause before the next press, 'd' = attack out of a dodge,
// 'S' = swap strike fired when changing style right after landing a hit. `cont` is the combo
// position the move leaves you at, so these openers flow into the normal strings.
const P2 = Math.PI / 2;
Object.assign(STYLES.claws.moves, {
  'LL.L': { name: 'Garras Gêmeas', anim: 'Punch_Combo', from: .15, to: .62, dur: .7, hits: [.26, .33, .4, .48].map((f, i) => ({ f, dmg: 6.5, arc: 150, range: 2.3, roll: i % 2 ? -.5 : .5, dir: i % 2 ? -1 : 1, bleed: 2.5 })) },
  dL: { name: 'Garra Fantasma', anim: 'Lunge_Spin_Kick', from: .2, to: .85, dur: .5, lunge: 3, cont: 'L', hits: [{ f: .6, dmg: 18, arc: 360, range: 2.6, knock: 5, bleed: 3, roll: 0, dir: 1 }] },
  dH: { name: 'Contra-Coice', anim: 'Spartan_Kick', from: .05, to: .6, dur: .45, lunge: 1.5, cont: 'H', hits: [{ f: .3, dmg: 26, arc: 80, range: 2.6, knock: 14, roll: 0, dir: 1, heavy: true, slam: true }] },
  S: { name: 'Salto Selvagem', anim: 'Lunge_Roundhouse_Kick', from: .12, to: .55, dur: .45, lunge: 4, cont: 'L', hits: [{ f: .35, dmg: 22, arc: 140, range: 2.6, knock: 5, bleed: 3, roll: .2, dir: 1, heavy: true }] },
});
Object.assign(STYLES.katana.moves, {
  'LL.L': { name: 'Lua Crescente', anim: 'Charged_Slash', from: .2, to: .75, dur: .5, hits: [{ f: .52, dmg: 15, arc: 150, range: 2.8, wave: 24, roll: 0, dir: -1, heavy: true }] },
  dL: { name: 'Corte Fantasma', anim: 'Right_Hand_Sword_Slash', from: .12, to: .65, dur: .38, lunge: 4.5, dash: true, cont: 'L', hits: [{ f: .38, dmg: 18, arc: 120, range: 2.8, roll: .2, dir: -1 }] },
  dH: { name: 'Iaido Reverso', anim: 'Charged_Slash', from: .2, to: .75, dur: .5, lunge: 6, dash: true, cont: 'H', hits: [{ f: .52, dmg: 30, arc: 90, range: 3.2, roll: .1, dir: 1, heavy: true }] },
  S: { name: 'Relâmpago', anim: 'Thrust_Slash', from: .08, to: .42, dur: .38, lunge: 5, dash: true, cont: 'L', hits: [{ f: .23, dmg: 24, arc: 50, range: 4.2, knock: 4, roll: 0, dir: 1, heavy: true }] },
});
Object.assign(STYLES.hammer.moves, {
  'L.L': { name: 'Tremor', anim: 'Charged_Ground_Slam', from: .3, to: .75, dur: .8, hits: [{ f: .55, dmg: 30, arc: 360, range: 2.4, ring: 4, stun: 1, roll: P2, dir: 1, heavy: true, slam: true }] },
  dL: { name: 'Giro Pesado', anim: 'Axe_Spin_Attack', from: .05, to: .5, dur: .7, lunge: 2, cont: 'L', hits: [.15, .22, .29].map(f => ({ f, dmg: 12, arc: 360, range: 3.1, knock: 3, roll: 0, dir: 1 })) },
  dH: { name: 'Salto Esmagador', anim: 'Sword_Judgment', from: .04, to: .42, dur: .85, lunge: 4, cont: 'H', hits: [{ f: .21, dmg: 48, arc: 360, range: 2.6, ring: 4.5, stun: 1.4, roll: P2, dir: -1, heavy: true, slam: true }] },
  S: { name: 'Impacto', anim: 'Heavy_Hammer_Swing', from: .25, to: .9, dur: .5, lunge: 2.5, cont: 'L', hits: [{ f: .66, dmg: 30, arc: 180, range: 3.1, knock: 8, stun: .8, roll: .15, dir: 1, heavy: true }] },
});

// Aerial strings ('a' prefix): Eddie hangs in the air while attacking, homing to the target's height.
// fin = finisher (impact frame, ends the air string), smash = slams juggled enemies into the ground,
// plunge = dive that strikes on landing (landT = recovery point in move time, plungeAt = when the dive starts).
Object.assign(STYLES.claws.moves, {
  aL: { name: 'Garra Celeste', anim: 'High_Kick', from: .22, to: .5, dur: .32, air: true, hits: [{ f: .36, dmg: 9, arc: 150, range: 2.5, roll: .4, dir: 1 }] },
  aLL: { name: 'Rodopio Lunar', anim: 'Roundhouse_Kick', from: .25, to: .55, dur: .36, air: true, hits: [{ f: .42, dmg: 11, arc: 360, range: 2.6, roll: 0, dir: -1 }] },
  aLLL: { name: 'Meteoro de Garras', anim: 'Flying_Fist_Kick', from: .35, to: .6, dur: .45, air: true, fin: true, hits: [{ f: .47, dmg: 18, arc: 150, range: 2.7, roll: 1.2, dir: -1, smash: true, heavy: true, bleed: 3 }] },
  aH: { name: 'Mergulho do Coelho', anim: 'Flying_Fist_Kick', from: .35, to: .65, dur: .6, air: true, plunge: true, plungeAt: .12, landT: .4, hits: [{ f: .5, dmg: 24, arc: 360, range: 2.2, ring: 3.4, stun: .8, roll: 0, dir: 1, heavy: true, slam: true }] },
});
Object.assign(STYLES.katana.moves, {
  aL: { name: 'Corte Celeste', anim: 'Attack', from: .22, to: .5, dur: .32, air: true, hits: [{ f: .38, dmg: 11, arc: 170, range: 2.9, roll: .3, dir: -1 }] },
  aLL: { name: 'Lâminas Gêmeas', anim: 'Double_Combo_Attack', from: .12, to: .48, dur: .48, air: true, hits: [{ f: .22, dmg: 8, arc: 170, range: 2.9, roll: -.3, dir: 1 }, { f: .41, dmg: 9, arc: 170, range: 2.9, roll: .4, dir: -1 }] },
  aLLL: { name: 'Tríade Estelar', anim: 'Triple_Combo_Attack', from: .12, to: .56, dur: .6, air: true, fin: true, hits: [{ f: .17, dmg: 8, arc: 170, range: 2.9, roll: .3, dir: 1 }, { f: .34, dmg: 8, arc: 170, range: 2.9, roll: -.3, dir: -1 }, { f: .51, dmg: 15, arc: 180, range: 3, roll: Math.PI / 2, dir: -1, smash: true, heavy: true }] },
  aH: { name: 'Queda Lunar', anim: 'Sword_Judgment', from: .04, to: .42, dur: .75, air: true, plunge: true, plungeAt: .1, landT: .38, hits: [{ f: .21, dmg: 30, arc: 360, range: 2.4, ring: 4, stun: 1, roll: Math.PI / 2, dir: -1, heavy: true, slam: true }] },
});
Object.assign(STYLES.hammer.moves, {
  aL: { name: 'Martelada Aérea', anim: 'Weapon_Combo_2', from: .12, to: .32, dur: .4, air: true, hits: [{ f: .24, dmg: 16, arc: 190, range: 3.1, roll: .2, dir: 1, heavy: true }] },
  aLL: { name: 'Giro Celeste', anim: 'Weapon_Combo_2', from: .34, to: .52, dur: .42, air: true, hits: [{ f: .44, dmg: 18, arc: 220, range: 3.1, roll: -.2, dir: -1, heavy: true }] },
  aLLL: { name: 'Cometa', anim: 'Weapon_Combo_1', from: .3, to: .62, dur: .55, air: true, fin: true, hits: [{ f: .51, dmg: 28, arc: 360, range: 3.1, roll: Math.PI / 2, dir: -1, smash: true, heavy: true }] },
  aH: { name: 'Meteoro', anim: 'Charged_Axe_Chop', from: .42, to: .7, dur: .75, air: true, plunge: true, plungeAt: .1, landT: .42, hits: [{ f: .57, dmg: 46, arc: 360, range: 2.6, ring: 5, stun: 1.4, roll: Math.PI / 2, dir: -1, heavy: true, slam: true }] },
  LLH: { name: 'Catapulta', anim: 'Heavy_Hammer_Swing', from: .25, to: .9, dur: .6, hits: [{ f: .66, dmg: 26, arc: 160, range: 3.1, launch: 11, roll: Math.PI / 2, dir: -1, heavy: true }] },
});
// 'B' = hold away from the enemy + attack: a high launcher; Eddie rises with the target for a follow-up.
STYLES.claws.moves.B = { name: 'Uppercut Lunar', anim: 'Right_Uppercut_from_Guard', from: .2, to: .8, dur: .45, rise: true, hits: [{ f: .5, dmg: 14, arc: 140, range: 2.6, launch: 13.5, roll: 1.4, dir: 1, heavy: true }] };
STYLES.katana.moves.B = { name: 'Lua Ascendente', anim: 'Charged_Upward_Slash', from: .12, to: .5, dur: .45, rise: true, hits: [{ f: .32, dmg: 16, arc: 140, range: 2.9, launch: 13.5, roll: Math.PI / 2, dir: -1, heavy: true }] };
STYLES.hammer.moves.B = { name: 'Erupção', anim: 'Heavy_Hammer_Swing', from: .25, to: .9, dur: .55, rise: true, hits: [{ f: .66, dmg: 22, arc: 170, range: 3.1, launch: 13.5, roll: Math.PI / 2, dir: -1, heavy: true }] };
// launchers available from the start so juggling is part of every style
delete STYLES.claws.moves.LLH.locked;
STYLES.claws.moves.LLH.hits[0].launch = 11; STYLES.katana.moves.LH.hits[0].launch = 11;
for (const [st, seqs] of Object.entries({ claws: ['LLLL', 'HH'], katana: ['LLLL', 'HH', 'H'], hammer: ['LLL', 'H', 'HL'] })) for (const q of seqs) STYLES[st].moves[q].fin = true;

// ---- Titanium Tigress: three weapons of her own ------------------------------------------------------
// Manoplas: electric punches. Glaive: a long polearm with huge reach. Canhão: a plasma cannon on her forearm
// that fires projectiles (`shot`), lobbed grenades (`shot.lob`) and piercing charged blasts.
const SH = (dmg, o = {}) => ({ speed: 34, dmg, ...o });
Object.assign(STYLES, {
  gauntlet: {
    id: 'gauntlet', name: 'Manoplas', key: 1, color: 0x3dff8a, css: '#3dff8a', move: 1.08,
    trait: 'Socos de titânio. Os acertos podem soltar um choque que salta entre inimigos.',
    moves: {
      L: { name: 'Jab de Titânio', anim: 'Left_Jab_from_Guard', from: .05, to: .42, dur: .3, alts: [{ anim: 'Elbow_Strike', f: .49, span: .28 }], hits: [{ f: .18, dmg: 10, arc: 110, range: 2.1, roll: .35, dir: 1 }] },
      LL: { name: 'Direto', anim: 'Right_Jab_from_Guard', from: .08, to: .42, dur: .3, alts: [{ anim: 'Counterstrike', f: .39, span: .12 }], hits: [{ f: .23, dmg: 11, arc: 110, range: 2.1, roll: -.35, dir: -1 }] },
      LLL: { name: 'Cruzado Elétrico', anim: 'Left_Hook_from_Guard', from: .08, to: .62, dur: .4, lunge: 1, hits: [{ f: .30, dmg: 15, arc: 150, range: 2.3, knock: 3, roll: .1, dir: 1 }] },
      LLLL: { name: 'Martelo Tesla', anim: 'Charged_Ground_Slam', from: .3, to: .75, dur: .75, hits: [{ f: .55, dmg: 30, arc: 360, range: 2.4, ring: 3.6, stun: 1, roll: P2, dir: 1, heavy: true, slam: true }] },
      LLH: { name: 'Uppercut Magnético', anim: 'Right_Uppercut_from_Guard', from: .2, to: .8, dur: .48, hits: [{ f: .5, dmg: 18, arc: 120, range: 2.3, launch: 11, roll: 1.4, dir: 1, heavy: true }] },
      LH: { name: 'Cotovelada Blindada', anim: 'Elbow_Strike', from: .35, to: .63, dur: .4, hits: [{ f: .49, dmg: 16, arc: 120, range: 2.2, stun: .8, roll: -.3, dir: -1 }] },
      H: { name: 'Investida Blindada', anim: 'Lunge_Roundhouse_Kick', from: .12, to: .55, dur: .52, lunge: 3.6, hits: [{ f: .35, dmg: 17, arc: 130, range: 2.4, knock: 5, roll: .2, dir: 1, heavy: true }] },
      HH: { name: 'Pancada Sísmica', anim: 'Spartan_Kick', from: .05, to: .6, dur: .5, hits: [{ f: .3, dmg: 24, arc: 70, range: 2.4, knock: 13, roll: 0, dir: 1, heavy: true, slam: true }] },
      HL: { name: 'Metralhadora de Socos', anim: 'Punch_Combo', from: .15, to: .62, dur: .85, hits: [.26, .33, .4, .48].map((f, i) => ({ f, dmg: 7, arc: 140, range: 2.3, roll: i % 2 ? -.4 : .4, dir: i % 2 ? -1 : 1 })) },
      'LL.L': { name: 'Punho Magnético', anim: 'Counterstrike', from: .27, to: .5, dur: .5, locked: true, tree: true, hits: [{ f: .39, dmg: 22, arc: 360, range: 2.6, pull: 7, launch: 9, roll: 0, dir: 1, heavy: true }] },
      dL: { name: 'Contragolpe Elétrico', anim: 'Lunge_Spin_Kick', from: .2, to: .85, dur: .5, lunge: 3, cont: 'L', hits: [{ f: .6, dmg: 18, arc: 360, range: 2.6, knock: 5, roll: 0, dir: 1 }] },
      dH: { name: 'Coice de Titânio', anim: 'Spartan_Kick', from: .05, to: .6, dur: .45, lunge: 1.5, cont: 'H', hits: [{ f: .3, dmg: 26, arc: 80, range: 2.6, knock: 14, roll: 0, dir: 1, heavy: true, slam: true }] },
      S: { name: 'Entrada Blindada', anim: 'Lunge_Roundhouse_Kick', from: .12, to: .55, dur: .45, lunge: 4, cont: 'L', hits: [{ f: .35, dmg: 22, arc: 140, range: 2.6, knock: 5, roll: .2, dir: 1, heavy: true }] },
      B: { name: 'Gancho Orbital', anim: 'Right_Uppercut_from_Guard', from: .2, to: .8, dur: .45, rise: true, hits: [{ f: .5, dmg: 14, arc: 140, range: 2.6, launch: 13.5, roll: 1.4, dir: 1, heavy: true }] },
      aL: { name: 'Soco Aéreo', anim: 'High_Kick', from: .22, to: .5, dur: .32, air: true, hits: [{ f: .36, dmg: 9, arc: 150, range: 2.5, roll: .4, dir: 1 }] },
      aLL: { name: 'Giro Blindado', anim: 'Roundhouse_Kick', from: .25, to: .55, dur: .36, air: true, hits: [{ f: .42, dmg: 11, arc: 360, range: 2.6, roll: 0, dir: -1 }] },
      aLLL: { name: 'Meteoro de Titânio', anim: 'Flying_Fist_Kick', from: .35, to: .6, dur: .45, air: true, fin: true, hits: [{ f: .47, dmg: 18, arc: 150, range: 2.7, roll: 1.2, dir: -1, smash: true, heavy: true }] },
      aH: { name: 'Queda de Bigorna', anim: 'Flying_Fist_Kick', from: .35, to: .65, dur: .6, air: true, plunge: true, plungeAt: .12, landT: .4, hits: [{ f: .5, dmg: 26, arc: 360, range: 2.2, ring: 3.6, stun: .9, roll: 0, dir: 1, heavy: true, slam: true }] },
    },
  },
  glaive: {
    id: 'glaive', name: 'Glaive', key: 2, color: 0xff8a2a, css: '#ff8a2a', move: 1,
    trait: 'Alcance enorme e golpes largos. +20% de dano em inimigos no ar.',
    moves: {
      L: { name: 'Estocada', anim: 'Thrust_Slash', from: .08, to: .42, dur: .38, hits: [{ f: .23, dmg: 13, arc: 40, range: 4.4, roll: 0, dir: 1 }] },
      LL: { name: 'Varredura', anim: 'Right_Hand_Sword_Slash', from: .12, to: .65, dur: .42, hits: [{ f: .38, dmg: 14, arc: 200, range: 3.4, roll: .2, dir: -1 }] },
      LLL: { name: 'Contragiro', anim: 'Left_Slash', from: .08, to: .4, dur: .42, hits: [{ f: .23, dmg: 15, arc: 200, range: 3.4, roll: -.25, dir: 1 }] },
      LLLL: { name: 'Ciclone de Titânio', anim: 'Axe_Spin_Attack', from: .05, to: .5, dur: .85, lunge: 1.8, hits: [.15, .2, .25, .3].map((f, i) => ({ f, dmg: 10, arc: 360, range: 3.6, roll: 0, dir: 1, knock: i === 3 ? 7 : 0, heavy: i === 3 })) },
      LLH: { name: 'Lua Laranja', anim: 'Reaping_Swing', from: .6, to: .85, dur: .6, hits: [{ f: .73, dmg: 18, arc: 230, range: 3.5, wave: 24, roll: -.1, dir: -1, heavy: true }] },
      LH: { name: 'Alavanca', anim: 'Charged_Upward_Slash', from: .12, to: .5, dur: .5, hits: [{ f: .32, dmg: 18, arc: 120, range: 3.4, launch: 11, roll: P2, dir: -1, heavy: true }] },
      H: { name: 'Lança Relâmpago', anim: 'Thrust_Slash', from: .08, to: .42, dur: .5, lunge: 6, dash: true, hits: [{ f: .23, dmg: 26, arc: 50, range: 4.6, knock: 5, roll: 0, dir: 1, heavy: true }] },
      HH: { name: 'Queda da Glaive', anim: 'Sword_Judgment', from: .04, to: .42, dur: .9, lunge: 2.6, hits: [{ f: .21, dmg: 36, arc: 360, range: 2.8, ring: 4.2, stun: 1, roll: P2, dir: -1, heavy: true, slam: true }] },
      HL: { name: 'Moinho', anim: 'Double_Blade_Spin', from: .05, to: .4, dur: .8, lunge: 1.5, hits: [.12, .18, .24, .3].map((f, i) => ({ f, dmg: 9, arc: 360, range: 3.6, roll: (i - 1.5) * .3, dir: 1, knock: i === 3 ? 6 : 0, heavy: i === 3 })) },
      'LL.L': { name: 'Dança da Glaive', anim: 'Triple_Combo_Attack', from: .12, to: .56, dur: .62, locked: true, tree: true, hits: [{ f: .17, dmg: 12, arc: 220, range: 3.8, roll: .3, dir: 1 }, { f: .34, dmg: 12, arc: 220, range: 3.8, roll: -.3, dir: -1 }, { f: .51, dmg: 24, arc: 360, range: 4, wave: 26, roll: 0, dir: 1, heavy: true }] },
      dL: { name: 'Corte Fantasma', anim: 'Right_Hand_Sword_Slash', from: .12, to: .65, dur: .38, lunge: 4.5, dash: true, cont: 'L', hits: [{ f: .38, dmg: 18, arc: 140, range: 3.4, roll: .2, dir: -1 }] },
      dH: { name: 'Estocada Reversa', anim: 'Thrust_Slash', from: .08, to: .42, dur: .45, lunge: 6, dash: true, cont: 'H', hits: [{ f: .23, dmg: 30, arc: 50, range: 4.6, knock: 6, roll: 0, dir: 1, heavy: true }] },
      S: { name: 'Entrada Giratória', anim: 'Double_Blade_Spin', from: .05, to: .25, dur: .4, lunge: 3, cont: 'L', hits: [{ f: .15, dmg: 22, arc: 360, range: 3.6, knock: 5, roll: 0, dir: 1, heavy: true }] },
      B: { name: 'Catapulta de Titânio', anim: 'Charged_Upward_Slash', from: .12, to: .5, dur: .45, rise: true, hits: [{ f: .32, dmg: 16, arc: 140, range: 3.4, launch: 13.5, roll: P2, dir: -1, heavy: true }] },
      aL: { name: 'Corte Celeste', anim: 'Attack', from: .22, to: .5, dur: .32, air: true, hits: [{ f: .38, dmg: 11, arc: 180, range: 3.4, roll: .3, dir: -1 }] },
      aLL: { name: 'Hélice', anim: 'Double_Combo_Attack', from: .12, to: .48, dur: .48, air: true, hits: [{ f: .22, dmg: 8, arc: 200, range: 3.4, roll: -.3, dir: 1 }, { f: .41, dmg: 9, arc: 200, range: 3.4, roll: .4, dir: -1 }] },
      aLLL: { name: 'Órbita Laranja', anim: 'Weapon_Combo_1', from: .3, to: .62, dur: .55, air: true, fin: true, hits: [{ f: .51, dmg: 20, arc: 360, range: 3.6, roll: P2, dir: -1, smash: true, heavy: true }] },
      aH: { name: 'Empalar', anim: 'Sword_Judgment', from: .04, to: .42, dur: .75, air: true, plunge: true, plungeAt: .1, landT: .38, hits: [{ f: .21, dmg: 32, arc: 360, range: 2.8, ring: 4.2, stun: 1, roll: P2, dir: -1, heavy: true, slam: true }] },
    },
  },
  cannon: {
    id: 'cannon', name: 'Canhão', key: 3, color: 0x7fe9ff, css: '#7fe9ff', move: .95,
    trait: 'Plasma à distância: tiros, granadas e disparos carregados que atravessam.',
    moves: {
      L: { name: 'Disparo de Plasma', anim: 'Right_Jab_from_Guard', from: .08, to: .42, dur: .3, hits: [{ f: .23, dmg: 3, arc: 90, range: 1.6, roll: 0, dir: 1, shot: SH(9) }] },
      LL: { name: 'Rajada', anim: 'Punch_Combo', from: .15, to: .62, dur: .6, hits: [.26, .33, .4, .48].map(f => ({ f, dmg: 2, arc: 90, range: 1.5, roll: 0, dir: 1, shot: SH(6, { spread: .08 }) })) },
      LLL: { name: 'Tiro Carregado', anim: 'Charged_Slash', from: .2, to: .75, dur: .55, hits: [{ f: .52, dmg: 6, arc: 90, range: 1.8, knock: 4, roll: 0, dir: 1, heavy: true, shot: SH(26, { speed: 42, size: 2.2, pierce: 4, knock: 7 }) }] },
      LLLL: { name: 'Morteiro', anim: 'Charged_Ground_Slam', from: .3, to: .75, dur: .8, hits: [{ f: .55, dmg: 14, arc: 360, range: 2.2, ring: 2.6, roll: P2, dir: 1, heavy: true, slam: true, shot: SH(10, { lob: 7, blast: 3.6, blastDmg: 30, n: 3, spread: .5, size: 1.6 }) }] },
      LLH: { name: 'Disparo Ascendente', anim: 'Right_Uppercut_from_Guard', from: .2, to: .8, dur: .48, hits: [{ f: .5, dmg: 16, arc: 120, range: 2.3, launch: 11, roll: 1.4, dir: 1, heavy: true, shot: SH(10) }] },
      LH: { name: 'Leque de Plasma', anim: 'Right_Jab_from_Guard', from: .08, to: .42, dur: .42, hits: [{ f: .23, dmg: 3, arc: 120, range: 1.6, roll: 0, dir: 1, shot: SH(8, { n: 5, spread: .32 }) }] },
      H: { name: 'Explosão de Recuo', anim: 'Spartan_Kick', from: .05, to: .6, dur: .5, hits: [{ f: .3, dmg: 20, arc: 80, range: 3, knock: 14, roll: 0, dir: 1, heavy: true, shot: SH(18, { size: 1.8, blast: 2.4, blastDmg: 16 }) }] },
      HH: { name: 'Granada', anim: 'Heavy_Hammer_Swing', from: .25, to: .9, dur: .6, hits: [{ f: .66, dmg: 6, arc: 120, range: 2, roll: .15, dir: 1, shot: SH(8, { lob: 8, blast: 4.2, blastDmg: 42, size: 1.8, stun: 1 }) }] },
      HL: { name: 'Metralhadora', anim: 'Punch_Combo', from: .15, to: .62, dur: .9, hits: [.22, .26, .3, .34, .38, .42, .46, .5].map(f => ({ f, dmg: 1, arc: 90, range: 1.5, roll: 0, dir: 1, shot: SH(5, { spread: .14 }) })) },
      'LL.L': { name: 'Anel de Plasma', anim: 'Double_Blade_Spin', from: .05, to: .4, dur: .6, locked: true, tree: true, hits: [{ f: .2, dmg: 8, arc: 360, range: 2.4, roll: 0, dir: 1, heavy: true, shot: SH(12, { n: 10, spread: .628, pierce: 1 }) }] },
      dL: { name: 'Tiro Evasivo', anim: 'Right_Jab_from_Guard', from: .08, to: .42, dur: .3, cont: 'L', hits: [{ f: .23, dmg: 4, arc: 90, range: 1.6, roll: 0, dir: 1, shot: SH(16, { size: 1.5, pierce: 2 }) }] },
      dH: { name: 'Contra-Explosão', anim: 'Lunge_Spin_Kick', from: .2, to: .85, dur: .5, cont: 'H', hits: [{ f: .6, dmg: 22, arc: 360, range: 2.6, ring: 3.4, knock: 8, roll: 0, dir: 1, heavy: true }] },
      S: { name: 'Entrada Explosiva', anim: 'Spartan_Kick', from: .05, to: .6, dur: .45, cont: 'L', hits: [{ f: .3, dmg: 16, arc: 80, range: 2.6, knock: 10, roll: 0, dir: 1, heavy: true, shot: SH(16, { size: 1.6, blast: 2.4, blastDmg: 14 }) }] },
      B: { name: 'Propulsão', anim: 'Right_Uppercut_from_Guard', from: .2, to: .8, dur: .45, rise: true, hits: [{ f: .5, dmg: 14, arc: 140, range: 2.6, launch: 13.5, roll: 1.4, dir: 1, heavy: true }] },
      aL: { name: 'Tiro Aéreo', anim: 'High_Kick', from: .22, to: .5, dur: .32, air: true, hits: [{ f: .36, dmg: 3, arc: 150, range: 1.8, roll: .4, dir: 1, shot: SH(9) }] },
      aLL: { name: 'Disparo Giratório', anim: 'Roundhouse_Kick', from: .25, to: .55, dur: .36, air: true, hits: [{ f: .42, dmg: 3, arc: 360, range: 1.8, roll: 0, dir: -1, shot: SH(7, { n: 3, spread: .25 }) }] },
      aLLL: { name: 'Bala de Canhão', anim: 'Flying_Fist_Kick', from: .35, to: .6, dur: .45, air: true, fin: true, hits: [{ f: .47, dmg: 10, arc: 150, range: 2.4, roll: 1.2, dir: -1, smash: true, heavy: true, shot: SH(16, { size: 1.8, pierce: 2 }) }] },
      aH: { name: 'Bombardeio', anim: 'Flying_Fist_Kick', from: .35, to: .65, dur: .6, air: true, plunge: true, plungeAt: .12, landT: .4, hits: [{ f: .5, dmg: 22, arc: 360, range: 2.2, ring: 4, stun: .8, roll: 0, dir: 1, heavy: true, slam: true }] },
    },
  },
});
for (const [st, seqs] of Object.entries({ gauntlet: ['LLLL', 'HH'], glaive: ['LLLL', 'HH', 'H'], cannon: ['LLL', 'HH', 'LLLL'] })) for (const q of seqs) STYLES[st].moves[q].fin = true;

for (const st of Object.values(STYLES)) for (const [seq, m] of Object.entries(st.moves)) {
  m.seq = seq; m.style = st.id;
  for (const h of m.hits) h.t = (h.f - m.from) / (m.to - m.from) * m.dur;
  m.cancel = Math.max(...m.hits.map(h => h.t)) + .04;
}
for (const h of SPECIAL.hits) h.t = (h.f - SPECIAL.from) / (SPECIAL.to - SPECIAL.from) * SPECIAL.dur;
SPECIAL.cancel = SPECIAL.dur; SPECIAL.seq = 'F'; SPECIAL.fin = true;

// Playable characters. STYLE_ORDER is rewritten in place when the character changes, so every module that
// imported it sees the current character's three styles.
export const CHARS = {
  eddie: {
    id: 'eddie', name: 'Eddie Wolfunny', short: 'Eddie', title: 'Lobo-coelho da noite', css: '#b44dff', model: 'assets/eddie.glb', anims: 'assets/anims.json',
    styles: ['claws', 'katana', 'hammer'], rim: 0x6a4aa8, ult: 'LUA CHEIA', reviveName: 'SEGUNDA LUA', progress: 'Altar das Almas',
  },
  tigress: {
    id: 'tigress', name: 'Tigresa de Titânio', short: 'Tigresa', title: 'Ciborgue de titânio', css: '#3dff8a', model: 'assets/tigress.glb', anims: 'assets/anims_tigress.json',
    // how each Meshy weapon model is fitted to her hand: length, grip point along it, and which end leads
    fit: { gauntlet: { len: .3, grip: .45, flip: true, axis: 'x' }, glaive: { len: 2, grip: .3, axis: 'y' }, cannon: { len: .7, grip: .45, flip: true, axis: 'x' } },
    styles: ['gauntlet', 'glaive', 'cannon'], rim: 0xff9a4a, ult: 'PROTOCOLO ÔMEGA', reviveName: 'REINICIALIZAR', progress: 'Árvore de Titânio',
  },
};

// Ultimate choreography per style: the clip slice used for each teleport strike, and the finisher.
Object.assign(STYLES.claws, { ultHit: ['Lunge_Spin_Kick', .55, .7], ultFin: ['Charged_Ground_Slam', .3, .75] });
Object.assign(STYLES.katana, { ultHit: ['Right_Hand_Sword_Slash', .3, .45], ultFin: ['Charged_Upward_Slash', .2, .5] });
Object.assign(STYLES.hammer, { ultHit: ['Heavy_Hammer_Swing', .55, .75], ultFin: ['Charged_Ground_Slam', .3, .75] });
Object.assign(STYLES.gauntlet, { ultHit: ['Right_Jab_from_Guard', .15, .35], ultFin: ['Charged_Ground_Slam', .3, .75] });
Object.assign(STYLES.glaive, { ultHit: ['Right_Hand_Sword_Slash', .3, .45], ultFin: ['Charged_Upward_Slash', .2, .5] });
Object.assign(STYLES.cannon, { ultHit: ['Right_Jab_from_Guard', .15, .35], ultFin: ['Charged_Slash', .45, .75] });

// The Tigress's skill tree, bought with souls: a core node, one branch per weapon, and a capstone that needs
// all three branches. `unlock` opens a combo, `apply` changes the run's stats.
export const TREE = [
  { id: 'core', name: 'Núcleo de Titânio', desc: '+20 de vida máxima e -8% de dano recebido.', cost: 60, req: [], col: 1, row: 0, apply: s => { s.maxHp += 20; s.armor *= .92; } },
  { id: 'g1', name: 'Bobina Tesla', desc: 'Manoplas: +20% de chance do choque saltar entre inimigos.', cost: 90, req: ['core'], col: 0, row: 1, apply: s => { s.tesla += .2; } },
  { id: 'g2', name: 'Punho Magnético', desc: 'Libera o combo E E · E das Manoplas: puxa todos para perto e lança.', cost: 150, req: ['g1'], col: 0, row: 2, unlock: 'gauntlet:LL.L' },
  { id: 'g3', name: 'Sobrecarga', desc: 'Técnicas das Manoplas causam +40% de dano.', cost: 220, req: ['g2'], col: 0, row: 3, apply: s => { s.skillPow.gauntlet += .4; } },
  { id: 'v1', name: 'Haste Estendida', desc: 'Glaive: +20% de alcance.', cost: 90, req: ['core'], col: 1, row: 1, apply: s => { s.reach += .2; } },
  { id: 'v2', name: 'Dança da Glaive', desc: 'Libera o combo E E · E da Glaive: três cortes e uma onda.', cost: 150, req: ['v1'], col: 1, row: 2, unlock: 'glaive:LL.L' },
  { id: 'v3', name: 'Fio Orbital', desc: 'Técnicas da Glaive causam +40% de dano.', cost: 220, req: ['v2'], col: 1, row: 3, apply: s => { s.skillPow.glaive += .4; } },
  { id: 'c1', name: 'Plasma Perfurante', desc: 'Canhão: os tiros atravessam +1 inimigo.', cost: 90, req: ['core'], col: 2, row: 1, apply: s => { s.pierce += 1; } },
  { id: 'c2', name: 'Anel de Plasma', desc: 'Libera o combo E E · E do Canhão: dez tiros em círculo.', cost: 150, req: ['c1'], col: 2, row: 2, unlock: 'cannon:LL.L' },
  { id: 'c3', name: 'Reator Instável', desc: 'Técnicas do Canhão causam +40% de dano.', cost: 220, req: ['c2'], col: 2, row: 3, apply: s => { s.skillPow.cannon += .4; } },
  { id: 'omega', name: 'Protocolo Ômega', desc: 'Começa com 50% de fúria, a energia recarrega 30% mais rápido e o golpe final causa +50% de dano.', cost: 450, req: ['g3', 'v3', 'c3'], col: 1, row: 4, apply: s => { s.ultPow += .5; s.energyRegen += .3; s.startFury = 50; } },
];

export const RANKS = [
  { name: 'Filhote', min: 0, mult: 1, color: '#c9ad86' },
  { name: 'Caçador', min: 12, mult: 1.08, color: '#b7dc6a' },
  { name: 'Feroz', min: 30, mult: 1.16, color: '#59e0ff' },
  { name: 'Alfa', min: 60, mult: 1.26, color: '#ffb347' },
  { name: 'LUA CHEIA', min: 110, mult: 1.4, color: '#b44dff' },
];

export const RARITY = {
  comum: { label: 'COMUM', color: '#d8d0e6', w: 10 },
  raro: { label: 'RARO', color: '#59e0ff', w: 5.5 },
  epico: { label: 'ÉPICO', color: '#b44dff', w: 2.2 },
  lendario: { label: 'LENDÁRIO', color: '#ffb347', w: .7 },
};

export const UPGRADES = [
  { id: 'presas', name: 'Presas Afiadas', r: 'comum', max: 5, desc: '+15% de dano.', apply: s => { s.dmg += .15; } },
  { id: 'vigor', name: 'Vigor', r: 'comum', max: 5, desc: '+25 de vida máxima e cura 25.', apply: (s, p) => { s.maxHp += 25; p.heal(25); } },
  { id: 'patas', name: 'Patas Ligeiras', r: 'comum', max: 3, desc: '+10% de velocidade de movimento.', apply: s => { s.speed += .1; } },
  { id: 'olho', name: 'Olho de Caçador', r: 'comum', max: 4, desc: '+8% de chance crítica.', apply: s => { s.crit += .08; } },
  { id: 'pele', name: 'Pelagem Grossa', r: 'comum', max: 3, desc: '-12% de dano recebido.', apply: s => { s.armor *= .88; } },
  { id: 'imã', name: 'Imã de Almas', r: 'comum', max: 2, desc: '+25% de almas e coleta mais distante.', apply: s => { s.soul += .25; s.magnet += 3; } },
  { id: 'frenesi', name: 'Frenesi', r: 'raro', max: 4, desc: '+12% de velocidade de ataque.', apply: s => { s.atk += .12; } },
  { id: 'sangue', name: 'Sede de Sangue', r: 'raro', max: 3, desc: 'Cura 2% do dano causado.', apply: s => { s.leech += .02; } },
  { id: 'brutal', name: 'Golpe Brutal', r: 'raro', max: 3, desc: '+40% de dano crítico.', apply: s => { s.critMult += .4; } },
  { id: 'cauda', name: 'Cauda Veloz', r: 'raro', max: 2, desc: '+1 carga de esquiva.', apply: s => { s.dodges += 1; } },
  { id: 'uivo', name: 'Uivo Profundo', r: 'raro', max: 2, desc: 'Ondas de choque: +35% de raio e dano.', apply: s => { s.shock += .35; } },
  { id: 'hemorragia', name: 'Hemorragia', r: 'raro', max: 3, desc: 'Sangramento causa +60% de dano.', apply: s => { s.bleed += .6; } },
  { id: 'coracao', name: 'Coração Lunar', r: 'raro', max: 2, desc: '+40% de ganho de fúria.', apply: s => { s.fury += .4; } },
  { id: 'alfa', name: 'Sangue Alfa', r: 'raro', max: 2, desc: 'O combo dura +1,5 s e as patentes dão +8% de dano.', apply: s => { s.comboTime += 1.5; s.rankBonus += .08; } },
  { id: 'fantasma', name: 'Esquiva Fantasma', r: 'epico', max: 1, desc: 'Esquivar através de inimigos os corta e faz sangrar.', apply: s => { s.ghost = true; } },
  { id: 'trovao', name: 'Trovão Roxo', r: 'epico', max: 3, desc: '15% dos acertos lançam um raio que salta entre 3 inimigos.', apply: s => { s.chain += .15; } },
  { id: 'troca', name: 'Troca Selvagem', r: 'epico', max: 1, desc: 'Trocar de estilo logo após um acerto libera uma onda de choque.', apply: s => { s.swapNova = true; } },
  { id: 'instinto', name: 'Instinto Selvagem', r: 'epico', max: 1, desc: 'Esquiva perfeita recarrega as esquivas e garante crítico por 2 s.', apply: s => { s.instinct = true; } },
  { id: 'execucao', name: 'Execução', r: 'epico', max: 1, desc: '+50% de dano em inimigos com menos de 30% de vida.', apply: s => { s.execute = true; } },
  { id: 'segunda', name: 'Segunda Lua', r: 'lendario', max: 1, desc: 'Ao cair, volta uma vez com 50% de vida.', apply: s => { s.revive += 1; } },
];

export const SHOP = [
  { id: 'vida', name: 'Vitalidade Ancestral', desc: '+10 de vida inicial.', max: 5, cost: l => 40 * (l + 1) },
  { id: 'dano', name: 'Presas Ancestrais', desc: '+5% de dano.', max: 5, cost: l => 50 * (l + 1) },
  { id: 'almas', name: 'Ganância', desc: '+10% de almas coletadas.', max: 5, cost: l => 40 * (l + 1) },
  { id: 'reroll', name: 'Destino', desc: '+1 re-rolagem de cartas por caçada.', max: 3, cost: l => 120 * (l + 1) },
  { id: 'furia', name: 'Fúria Inicial', desc: 'Começa cada caçada com 50% de fúria.', max: 1, cost: () => 150 },
  { id: 'combo', name: 'Memória de Combate', desc: 'Começa com um combo trancado já liberado.', max: 2, cost: l => 250 * (l + 1) },
  { id: 'escolha', name: 'Visão da Lua', desc: 'Mostra 4 cartas em vez de 3.', max: 1, cost: () => 400 },
];

// Enemy budget per wave: [type, count]. Waves 5 and 10 are bosses.
export const WAVES = [
  [['crawler', 8]],
  [['crawler', 10], ['spitter', 2]],
  [['crawler', 8], ['spitter', 3], ['bomber', 4]],
  [['brute', 2], ['crawler', 9], ['spitter', 3]],
  [['boss1', 1], ['crawler', 8]],
  [['wraith', 3], ['crawler', 10], ['bomber', 4]],
  [['brute', 3], ['spitter', 5], ['wraith', 3], ['crawler', 8]],
  [['brute', 3], ['wraith', 5], ['bomber', 6], ['spitter', 4], ['crawler', 10]],
  [['brute', 5], ['wraith', 6], ['spitter', 6], ['crawler', 12]],
  [['boss2', 1], ['wraith', 3], ['crawler', 8]],
];
export const FINAL_WAVE = WAVES.length;

export function endlessWave(n) {
  const k = n - FINAL_WAVE;
  if (k % 5 === 0) return [[k % 10 === 0 ? 'boss2' : 'boss1', 1], ['wraith', 4], ['brute', 3]];
  return [['crawler', 10 + k], ['spitter', 4 + k / 2 | 0], ['brute', 3 + k / 3 | 0], ['wraith', 4 + k / 2 | 0], ['bomber', 5 + k / 3 | 0]];
}
