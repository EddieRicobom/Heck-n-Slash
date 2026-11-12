import { STYLES, STYLE_ORDER, RANKS, RARITY, SHOP } from './data.js';
import { SKILLS } from './skills.js';
import { ACTIONS, keyLabel } from './settings.js';

const $ = id => document.getElementById(id);
let DEVICE = 'kb';
const GLYPH = () => DEVICE === 'pad' ? { L: 'X', H: 'Y' } : { L: 'E', H: 'D' };
const SEQ = s => {
  const g = GLYPH(), out = [];
  for (const c of s) out.push(c === 'L' ? g.L : c === 'H' ? g.H : c === '.' ? '·' : c === 'd' ? (DEVICE === 'pad' ? 'A +' : 'Esquiva +') : c === 'S' ? 'Trocar estilo após acerto' : c);
  return out.join(' ');
};

export class UI {
  constructor(game) {
    this.g = game; this.cache = {};
    this.screens = ['loading', 'title', 'how', 'shop', 'tree', 'cards', 'pause', 'over', 'options'];
    this.renderStyles();
    document.querySelectorAll('.back').forEach(b => b.onclick = () => { game.audio.ui(); this.show('title'); });
  }

  renderStyles() { $('styles').innerHTML = STYLE_ORDER.map(id => `<div class="style" id="st_${id}" style="--c:${STYLES[id].css}"><small>${STYLES[id].key}</small>${STYLES[id].name}</div>`).join(''); }

  /** title screen: the character switch and her skill tree button */
  charInfo(C) {
    document.body.style.setProperty('--accent', C.css);
    document.body.dataset.char = C.id;
    $('titleName').textContent = C.name.toUpperCase();
    $('cbName').textContent = C.short.toUpperCase();
    $('btnChar').innerHTML = `Personagem: <b style="color:${C.css}">${C.name}</b> ⇄`;
    $('charLine').textContent = `${C.title} · ${C.styles.map(s => STYLES[s].name).join(' · ')}`;
    $('btnTree').classList.toggle('hide', C.id !== 'tigress');
  }

  /** the Tigress's skill tree: a core node, three weapon branches and a capstone */
  tree(meta, TREE, onBuy) {
    const T = meta.tree || {};
    $('treeSouls').textContent = `◆ ${meta.souls} almas`;
    $('treeGrid').innerHTML = TREE.map(n => {
      const owned = !!T[n.id], open = n.req.every(r => T[r]), afford = meta.souls >= n.cost;
      const col = n.col === 0 ? 'gauntlet' : n.col === 2 ? 'cannon' : n.row === 0 || n.row === 4 ? null : 'glaive';
      const c = col ? STYLES[col].css : '#e9e3ff';
      const req = n.req.length && !open ? `<small>Requer: ${n.req.map(r => TREE.find(x => x.id === r).name).join(', ')}</small>` : '';
      return `<div class="node ${owned ? 'owned' : open ? 'open' : 'locked'}" style="grid-column:${n.col + 1};grid-row:${n.row + 1};--c:${c}"><h4>${n.name}</h4><p>${n.desc}</p>${req}<button data-id="${n.id}" ${owned || !open || !afford ? 'disabled' : ''}>${owned ? 'Instalado' : `◆ ${n.cost}`}</button></div>`;
    }).join('');
    $('treeGrid').querySelectorAll('button').forEach(b => b.onclick = () => onBuy(b.dataset.id));
    this.show('tree');
  }

  show(id) {
    this.current = id;
    for (const s of this.screens) $(s).classList.toggle('hide', s !== id);
    const btn = id && $(id)?.querySelector('button,.card');
    if (btn) setTimeout(() => btn.focus(), 30);
  }
  hud(on) { $('hud').classList.toggle('hide', !on); }

  _set(id, prop, v) { const k = id + prop; if (this.cache[k] === v) return; this.cache[k] = v; const el = $(id); if (prop === 'text') el.textContent = v; else if (prop === 'html') el.innerHTML = v; else el.style[prop] = v; }

  update() {
    const g = this.g, p = g.player, st = g.stats;
    this._set('hpFill', 'width', `${p.hp / st.maxHp * 100}%`);
    this._set('hpGhost', 'width', `${p.hp / st.maxHp * 100}%`);
    this._set('hpText', 'text', `${Math.ceil(p.hp)} / ${st.maxHp}`);
    const low = p.hp < st.maxHp * .3; if (this._low !== low) { this._low = low; $('hpFill').parentElement.classList.toggle('low', low); }
    this._set('cbStyle', 'text', p.styleDef.name); this._set('cbStyle', 'color', p.styleDef.css);
    this._set('furyFill', 'width', `${p.fury}%`);
    this._set('enFill', 'width', `${p.energy}%`); this._set('enText', 'text', `ENERGIA ${p.energy | 0}`);
    const keys = g.input.device === 'pad' ? ['LT', 'LB'] : ['E', 'R'];
    this._set('skillBar', 'html', SKILLS[p.style].map((s, i) => {
      const cd = p.skillCd[s.id] || 0, off = cd > 0 || p.energy < s.cost;
      return `<div class="sk${off ? ' off' : ''}"><div class="cd" style="width:${Math.min(100, cd / s.cd * 100)}%"></div><b>${keys[i]}</b>${s.name}<i>${s.cost}</i></div>`;
    }).join(''));
    this._set('furyText', 'text', p.fury >= 100 ? `F  ·  ${p.char.ult} PRONTA` : `FÚRIA ${p.fury | 0}%`);
    $('furyFill').parentElement.classList.toggle('ready', p.fury >= 100);
    let pips = '';
    for (let i = 0; i < st.dodges; i++) pips += `<div class="pip"><i style="width:${Math.min(1, Math.max(0, p.dodgeCharge - i)) * 100}%"></i></div>`;
    this._set('dodges', 'html', pips);
    const buffs = [p.moonT > 0 && `☾ ${p.char.ult} ${p.moonT.toFixed(1)}s`, p.swapBuff > 0 && 'Troca Selvagem', p.critT > 0 && 'Instinto'].filter(Boolean).join(' · ');
    this._set('buffs', 'text', buffs);
    this._set('waveLabel', 'text', g.waveText());
    this._set('souls', 'text', `◆ ${g.runSouls | 0}`);
    for (const id of STYLE_ORDER) $('st_' + id).classList.toggle('on', p.style === id);
    DEVICE = g.input.device;
    const gl = GLYPH();
    const launch = !p.airborne && p.available('B') && (p.state === 'free' || p.comboGrace > 0) ? `<div class="chip"><b class="L">↩</b>Trás + ${gl.L}: ${p.available('B').name}</div>` : '';
    const nm = launch + p.nextMoves().map(m => m ? `<div class="chip${m.pause ? ' pause' : ''}">${m.pause ? '<i>pausa</i> ' : ''}<b class="${m.key}">${gl[m.key]}</b>${m.name}</div>` : '').join('') + (p.counterT > 0 ? '<div class="chip counter">CONTRA-ATAQUE PRONTO</div>' : '');
    this._set('nextMoves', 'html', nm);
    const r = g.rankIndex(), rk = RANKS[r];
    $('rank').classList.toggle('on', g.combo > 1);
    this._set('rankName', 'text', rk.name); this._set('rankName', 'color', rk.color);
    if (this._combo !== g.combo) { this._combo = g.combo; this._pop('comboNum', 'pop'); }
    if (this._rk !== r) { if (this._rk !== undefined && r > this._rk) this._pop('rankName', 'rankPop'); this._rk = r; }
    this._set('comboNum', 'text', `${g.combo} acertos`);
    this._set('rankFill', 'width', `${Math.max(0, g.comboTimer / st.comboTime) * 100}%`);
    const b = g.boss;
    $('bossWrap').classList.toggle('hide', !b);
    if (b) {
      this._set('bossName', 'text', b.T.name + (b.elite ? ' (Elite)' : ''));
      this._set('bossFill', 'width', `${Math.max(0, b.hp / b.maxHp) * 100}%`);
      this._set('poiseFill', 'width', `${Math.max(0, b.poise / b.poiseMax) * 100}%`);
    }
  }

  _pop(id, cls) { const el = $(id); el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  /** Gamepad navigation for menus: D-pad/stick moves focus, A confirms, B goes back, Y re-rolls cards. */
  padNav(code, state) {
    const scr = this.screens.map(id => $(id)).find(el => !el.classList.contains('hide'));
    if (!scr) return;
    const items = [...scr.querySelectorAll('button, .card')].filter(el => !el.disabled && el.offsetParent !== null && !el.classList.contains('hide'));
    if (!items.length) return;
    const cur = items.indexOf(document.activeElement);
    const dir = code.replace('Stick', '');
    if (dir === 'PadUp' || dir === 'PadLeft') { (items[cur <= 0 ? items.length - 1 : cur - 1]).focus(); this.g.audio.ui(); }
    else if (dir === 'PadDown' || dir === 'PadRight') { (items[cur < 0 || cur >= items.length - 1 ? 0 : cur + 1]).focus(); this.g.audio.ui(); }
    else if (code === 'PadA') (cur >= 0 ? items[cur] : items[0]).click();
    else if (code === 'PadB') { if (state === 'pause') $('btnResume').click(); else scr.querySelector('.back')?.click(); }
    else if (code === 'PadY' && state === 'cards') $('btnReroll').click();
  }

  /** options screen: sliders/select bound to the settings object, plus click-to-rebind keys */
  options(S, onChange, back) {
    const bind = (id, key, fmt = Number) => { const el = $(id); el.value = S[key]; el.oninput = () => { S[key] = fmt(el.value); onChange(); }; };
    bind('optMaster', 'master'); bind('optMusic', 'music'); bind('optSfx', 'sfx'); bind('optCam', 'camDist'); bind('optSens', 'camSens'); bind('optShake', 'shake');
    bind('optQuality', 'quality', v => v === 'auto' ? 'auto' : +v);
    const render = () => {
      $('keyList').innerHTML = ACTIONS.map(([a, label]) => `<div class="keyRow"><span>${label}</span><button data-a="${a}">${keyLabel(S.keys[a])}</button></div>`).join('');
      $('keyList').querySelectorAll('button').forEach(b => b.onclick = () => {
        b.textContent = 'Pressione…'; b.classList.add('wait');
        this.g.input.capture = code => {
          if (code !== 'Escape') { for (const k in S.keys) if (S.keys[k] === code) S.keys[k] = null; S.keys[b.dataset.a] = code; onChange(); }
          render();
        };
      });
    };
    render();
    $('btnKeysReset').onclick = () => { S.keys = null; onChange(true); this.options(this.g.settings, onChange, back); };
    $('btnOptsBack').onclick = back;
    this.show('options');
  }

  skillName(name, color) { this.moveName(name, color); }

  bossCard(name, sub, color = '#b44dff') {
    const el = $('bossCard'); el.style.setProperty('--bc', color);
    el.querySelector('.bcName').textContent = name; el.querySelector('.bcSub').textContent = sub || '';
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  }

  letterbox(on) { document.body.classList.toggle('cine', on); }

  moveName(name, color) {
    const el = $('moveName'); el.textContent = name; el.style.color = color; el.classList.add('on');
    clearTimeout(this._mt); this._mt = setTimeout(() => el.classList.remove('on'), 650);
  }

  announce(big, small = '', ms = 1700) {
    const el = $('announce'); el.innerHTML = `${big}${small ? `<small>${small}</small>` : ''}`; el.classList.add('on');
    clearTimeout(this._at); this._at = setTimeout(() => el.classList.remove('on'), ms);
  }
  announceSmall(t) { this.announce('', t, 900); }

  milestone(big, small) {
    const el = $('milestone'); el.innerHTML = `${big}<small>${small}</small>`;
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  }

  hurtFlash() { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = .7; requestAnimationFrame(() => { f.style.transition = 'opacity .45s'; f.style.opacity = 0; }); }

  cards(list, rerolls, onPick, onReroll, title) {
    $('cardsTitle').textContent = title;
    $('cardRow').innerHTML = list.map((c, i) => {
      const R = RARITY[c.r];
      return `<div class="card" tabindex="0" data-i="${i}" style="--rc:${R.color}"><div class="tag">${c.kind === 'combo' ? 'NOVO COMBO · ' : ''}${R.label}</div><h3>${c.name}</h3>${c.seq ? `<div class="seq">${STYLES[c.style].name}: ${SEQ(c.seq)}</div>` : ''}<p>${c.desc}</p><div class="key">${c.stack ? `Nível ${c.stack + 1}/${c.max}` : ''} [${i + 1}]</div></div>`;
    }).join('');
    $('cardRow').querySelectorAll('.card').forEach(el => {
      const pick = () => onPick(list[+el.dataset.i]);
      el.onclick = pick; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') pick(); };
    });
    const rb = $('btnReroll');
    rb.textContent = `Re-rolar (${rerolls})`; rb.disabled = rerolls <= 0; rb.onclick = onReroll;
    this.show('cards');
  }

  pause(player, picked) {
    $('comboList').innerHTML = STYLE_ORDER.map(id => {
      const s = STYLES[id];
      const rows = Object.values(s.moves).map(m => {
        const locked = m.locked && !player.unlocked.has(id + ':' + m.seq);
        return `<div class="cm ${locked ? 'locked' : ''}"><code>${SEQ(m.seq)}</code><span>${m.name}${locked ? ' 🔒' : ''}</span></div>`;
      }).join('');
      return `<div style="--c:${s.css}"><h4>${s.key} · ${s.name}</h4><div style="font-size:12px;opacity:.7;margin-bottom:6px">${s.trait}</div>${rows}</div>`;
    }).join('');
    $('runUpgrades').textContent = picked.length ? 'Bênçãos: ' + picked.join(', ') : 'Nenhuma bênção ainda.';
    this.show('pause');
  }

  shop(meta, onBuy) {
    $('shopSouls').textContent = `◆ ${meta.souls} almas`;
    $('shopList').innerHTML = SHOP.map(it => {
      const lv = meta.shop[it.id] || 0, maxed = lv >= it.max, cost = it.cost(lv);
      return `<div class="shopItem"><h4>${it.name}</h4><div class="lv">Nível ${lv}/${it.max}</div><p>${it.desc}</p><button data-id="${it.id}" ${maxed || meta.souls < cost ? 'disabled' : ''}>${maxed ? 'Máximo' : `◆ ${cost}`}</button></div>`;
    }).join('');
    $('shopList').querySelectorAll('button').forEach(b => b.onclick = () => onBuy(b.dataset.id));
    this.show('shop');
  }

  over(title, rows, endless, o = {}) {
    const scr = $('over');
    scr.dataset.result = o.win ? 'win' : 'lose';
    $('overTitle').textContent = title;
    $('overSub').textContent = o.sub || '';
    $('overStats').innerHTML = rows.map(([a, b], i) => `<span style="animation-delay:${.35 + i * .12}s">${a}</span><b style="animation-delay:${.35 + i * .12}s">${b}</b>`).join('');
    const gr = $('overGrade'); gr.textContent = o.grade || ''; gr.dataset.g = o.grade || ''; gr.style.animationDelay = `${.35 + rows.length * .12 + .35}s`;
    scr.classList.remove('anim'); void scr.offsetWidth; scr.classList.add('anim');
    $('btnEndless').classList.toggle('hide', !endless);
    this.show('over');
  }
}

export { SEQ };
