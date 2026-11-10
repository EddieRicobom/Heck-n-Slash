// Player preferences, saved in localStorage: volumes, camera, screen shake, graphics quality and key bindings.
export const ACTIONS = [
  ['up', 'Mover para cima', 'KeyW'], ['down', 'Mover para baixo', 'KeyS'], ['left', 'Mover para a esquerda', 'KeyA'], ['right', 'Mover para a direita', 'KeyD'],
  ['light', 'Ataque leve', 'KeyJ'], ['heavy', 'Ataque pesado', 'KeyK'], ['jump', 'Pular', 'Space'], ['dodge', 'Esquiva', 'ShiftLeft'],
  ['skill1', 'Técnica 1', 'KeyE'], ['skill2', 'Técnica 2', 'KeyR'], ['ult', 'Lua Cheia', 'KeyF'],
  ['style1', 'Estilo: Garras', 'Digit1'], ['style2', 'Estilo: Katana', 'Digit2'], ['style3', 'Estilo: Martelo', 'Digit3'], ['styleNext', 'Próximo estilo', 'KeyQ'],
  ['pause', 'Pausa', 'KeyP'],
];
export const QUALITY = ['Mínima', 'Baixa', 'Média', 'Alta'];
const KEY = 'eddie_settings_v1';

export function defaults() {
  return { master: .8, music: .7, sfx: 1, camDist: 1, camSens: 1, shake: 1, quality: 'auto', keys: Object.fromEntries(ACTIONS.map(([a, , k]) => [a, k])) };
}

export function loadSettings() {
  const d = defaults();
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...d, ...s, keys: { ...d.keys, ...(s.keys || {}) } }; } catch { return d; }
}

export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable: settings last for this session */ } }

/** readable name for a KeyboardEvent.code */
export function keyLabel(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift esq.').replace('ShiftRight', 'Shift dir.').replace('ControlLeft', 'Ctrl esq.').replace('Space', 'Espaço')
    .replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('Escape', 'Esc');
}
