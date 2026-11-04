const PRESS_KEYS = { KeyR: 'restart', Escape: 'pause', KeyM: 'mute' };
const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'Space', 'ShiftLeft', 'ShiftRight', ...Object.keys(PRESS_KEYS),
]);

export function createInput(target = window) {
  const held = new Set();
  const pressed = [];
  const touches = new Map();   // identifier -> clientX
  let touchMode = false;

  const onKeyDown = (e) => {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    held.add(e.code);
    if (PRESS_KEYS[e.code]) pressed.push(PRESS_KEYS[e.code]);
  };
  const onKeyUp = (e) => { held.delete(e.code); };
  const onTouch = (e) => {
    touchMode = true;
    e.preventDefault();
    touches.clear();
    for (const t of e.touches) touches.set(t.identifier, t.clientX);
  };
  const clear = () => { held.clear(); touches.clear(); };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', clear);
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    target.addEventListener(type, onTouch, { passive: false });
  }

  const any = (...codes) => codes.some((c) => held.has(c));

  return {
    read() {
      let steer = (any('ArrowLeft', 'KeyA') ? 1 : 0) - (any('ArrowRight', 'KeyD') ? 1 : 0);
      let drift = any('Space', 'ShiftLeft', 'ShiftRight');
      if (touches.size > 0) {
        const [firstX] = touches.values();
        steer = firstX < window.innerWidth / 2 ? 1 : -1;
        drift = drift || touches.size >= 2;
      }
      return { throttle: any('ArrowUp', 'KeyW') || touchMode, brake: any('ArrowDown', 'KeyS'), steer, drift };
    },
    consumePressed() { return pressed.splice(0, pressed.length); },
    clear,
  };
}
