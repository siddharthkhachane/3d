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
    // rows: [{ id, name, bestMs, medal, target }]; extras: { showControls, notice }
    showTracks(rows, { showControls = false, notice = '' } = {}) {
      open();
      panel.append(el('h1', 'menu-title', 'NEON TIME TRIAL'));
      if (notice) panel.append(el('p', 'menu-notice', notice));
      for (const row of rows) {
        const b = el('button', 'menu-row');
        b.type = 'button';
        b.append(el('span', 'row-name', row.name));
        b.append(el('span', `row-medal ${row.medal ?? 'none'}`, row.medal ? row.medal.toUpperCase() : '—'));
        b.append(el('span', 'row-best', row.bestMs === null ? 'no time yet' : formatTime(row.bestMs)));
        b.append(el('span', 'row-target', row.target || ''));
        b.addEventListener('click', () => { b.blur(); handlers.onSelect(row.id); });
        panel.append(b);
      }
      if (showControls) {
        const line = el('div', 'menu-controls');
        line.append(el('span', '', CONTROLS), button('Got it', () => { line.remove(); handlers.onDismissControls(); }, 'menu-link'));
        panel.append(line);
      }
    },
    showPause(muted) {
      open();
      panel.append(el('h1', 'menu-title', 'PAUSED'));
      panel.append(button('Resume', handlers.onResume));
      panel.append(button('Restart', handlers.onRestart));
      panel.append(button('Tracks', handlers.onTracks));
      panel.append(button(muted ? 'Sound: off' : 'Sound: on', handlers.onToggleMute));
      panel.append(el('p', 'menu-controls', CONTROLS));
    },
    hide() {
      root.classList.remove('open');
      panel.replaceChildren();
    },
  };
}
