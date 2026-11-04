import { formatTime } from './format.js';

const CONTROLS = 'W / ↑ gas   S / ↓ brake   A D / ← → steer   Space drift   R restart   Esc pause';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, onClick, className = 'menu-btn') {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', () => { b.blur(); onClick(); });
  return b;
}

// handlers: { onSelect(id), onResume(), onRestart(), onTracks(), onToggleMute(), onDismissControls() }
export function createMenu(root, handlers) {
  const panel = el('div', 'menu-panel');
  root.replaceChildren(panel);

  function open() { root.classList.add('open'); panel.replaceChildren(); }

  return {
    // rows: [{ id, name, bestMs, medal, target, canShare }]; extras: { showControls, notice, error, shareUrl }
    showTracks(rows, { showControls = false, notice = '', error = false, shareUrl = '' } = {}) {
      open();
      panel.append(el('h1', 'menu-title', 'NEON TIME TRIAL'));
      if (notice) panel.append(el('p', error ? 'menu-notice error' : 'menu-notice', notice));
      if (shareUrl) {
        const field = el('input', 'menu-share');
        field.readOnly = true;
        field.value = shareUrl;
        field.setAttribute('aria-label', 'Share link');
        panel.append(el('p', 'menu-notice', 'Copy this link to share your ghost:'), field);
        field.focus();
        field.select();
      }
      for (const row of rows) {
        const wrap = el('div', 'menu-row-wrap');
        const b = el('button', 'menu-row');
        b.type = 'button';
        b.append(el('span', 'row-name', row.name));
        b.append(el('span', `row-medal ${row.medal ?? 'none'}`, row.medal ? row.medal.toUpperCase() : '—'));
        b.append(el('span', 'row-best', row.bestMs === null ? 'no time yet' : formatTime(row.bestMs)));
        b.append(el('span', 'row-target', row.target || ''));
        b.addEventListener('click', () => { b.blur(); handlers.onSelect(row.id); });
        wrap.append(b);
        if (row.canShare) wrap.append(button('Share ghost', () => handlers.onShare(row.id), 'menu-btn menu-share-btn'));
        panel.append(wrap);
      }
      if (showControls) {
        const line = el('div', 'menu-controls');
        line.append(el('span', '', CONTROLS), button('Got it', () => { line.remove(); handlers.onDismissControls(); }, 'menu-link'));
        panel.append(line);
      }
    },
    // cosmetics: { points, colors, trails } with items { id, label, hex?, selected, needs } (needs > 0 means locked)
    showPause(muted, cosmetics) {
      open();
      panel.append(el('h1', 'menu-title', 'PAUSED'));
      panel.append(button('Resume', handlers.onResume));
      panel.append(button('Restart', handlers.onRestart));
      panel.append(button('Tracks', handlers.onTracks));
      panel.append(button(muted ? 'Sound: off' : 'Sound: on', handlers.onToggleMute));
      if (cosmetics) {
        panel.append(el('p', 'menu-controls', `Medal points: ${cosmetics.points}`));
        for (const [title, items, pick] of [['Car', cosmetics.colors, handlers.onPickColor], ['Trail', cosmetics.trails, handlers.onPickTrail]]) {
          const group = el('div', 'cosmetics');
          group.append(el('span', 'cosmetics-title', title));
          for (const item of items) {
            const locked = item.needs > 0;
            const b = button(locked ? `${item.label} · ${item.needs} pts` : item.label, () => pick(item.id), `cosmetic${item.selected ? ' selected' : ''}`);
            b.disabled = locked;
            if (item.hex !== undefined) b.style.setProperty('--swatch', `#${item.hex.toString(16).padStart(6, '0')}`);
            group.append(b);
          }
          panel.append(group);
        }
      }
      panel.append(el('p', 'menu-controls', CONTROLS));
    },
    hide() {
      root.classList.remove('open');
      panel.replaceChildren();
    },
  };
}
