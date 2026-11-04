import { CHARGE_TIER1, CHARGE_TIER2 } from '../sim/constants.js';
import { formatTime, formatDelta } from './format.js';

const TEMPLATE = `
  <div class="hud-top">
    <div class="hud-time" data-k="time">0:00.00</div>
    <div class="hud-best" data-k="best"></div>
    <div class="hud-target" data-k="target"></div>
  </div>
  <div class="hud-delta" data-k="delta"></div>
  <div class="hud-pop" data-k="pop"></div>
  <div class="hud-wrong" data-k="wrong">WRONG WAY</div>
  <div class="hud-speed"><span data-k="speed">0</span><small>km/h</small></div>
  <div class="hud-charge">
    <div class="hud-charge-fill" data-k="fill"></div>
    <i style="left:${(CHARGE_TIER1 / CHARGE_TIER2) * 100}%"></i><i style="left:100%"></i>
  </div>
  <button class="hud-restart" data-k="restart" aria-label="Restart">&#8635;</button>`;

export function createHud(root, { onRestart = () => {} } = {}) {
  root.innerHTML = TEMPLATE;
  const el = {};
  for (const node of root.querySelectorAll('[data-k]')) el[node.dataset.k] = node;
  el.restart.addEventListener('click', () => onRestart());

  const text = new Map();
  const setText = (key, value) => {
    if (text.get(key) === value) return;
    text.set(key, value);
    el[key].textContent = value;
  };
  let fillScale = -1, fillTier = -1, wrongShown = null;
  const timers = new Map();

  function flash(key, value, className, ms) {
    setText(key, value);
    el[key].className = `hud-${key} show ${className}`;
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { el[key].className = `hud-${key}`; }, ms));
  }

  return {
    update(s) {
      setText('time', formatTime(s.lapMs));
      setText('best', s.bestMs === null ? '' : `BEST ${formatTime(s.bestMs)}`);
      setText('target', s.target || '');
      setText('speed', String(Math.round(s.speedKmh)));

      const scale = Math.min(1, s.charge / CHARGE_TIER2);
      const tier = s.charge >= CHARGE_TIER2 ? 2 : s.charge >= CHARGE_TIER1 ? 1 : 0;
      if (Math.abs(scale - fillScale) > 0.004) { fillScale = scale; el.fill.style.transform = `scaleX(${scale})`; }
      if (tier !== fillTier) { fillTier = tier; el.fill.dataset.tier = String(tier); }
      if (wrongShown !== s.wrongWay) { wrongShown = s.wrongWay; el.wrong.classList.toggle('show', s.wrongWay); }
    },
    event(e) {
      if (e.type === 'checkpoint') {
        if (e.deltaMs === null) flash('delta', formatTime(e.splitMs), 'neutral', 1500);
        else flash('delta', formatDelta(e.deltaMs), e.deltaMs <= 0 ? 'good' : 'bad', 1500);
      } else if (e.type === 'nearMiss') {
        flash('pop', 'NEAR MISS', 'good', 900);
      } else if (e.type === 'lap') {
        let msg = null;
        if (e.medalUpgraded) msg = `${e.medal.toUpperCase()} MEDAL  ${formatTime(e.timeMs)}`;
        else if (e.isBest) msg = `NEW BEST ${formatTime(e.timeMs)}`;
        if (e.unlockedNow?.length) {
          const unlocked = `UNLOCKED ${e.unlockedNow.map((i) => i.id.toUpperCase()).join(', ')}`;
          msg = msg ? `${msg}  ·  ${unlocked}` : unlocked;
        }
        if (msg) flash('pop', msg, 'good', 3000);
      } else if (e.type === 'banner') {
        flash('pop', e.text, 'neutral', 3500);
      }
    },
    setVisible(visible) { root.style.display = visible ? '' : 'none'; },
  };
}
