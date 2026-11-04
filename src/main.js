import { DT } from './sim/constants.js';
import { generateTrack } from './sim/track.js';
import { lapTimeMs } from './sim/sim.js';
import { carSpeed } from './sim/car.js';
import { sampleGhost } from './sim/ghost.js';
import { measureBotLapMs } from './sim/bot.js';
import { createSession } from './session.js';
import { advance } from './loop.js';
import { createInput } from './input.js';
import { createRenderer } from './render/renderer.js';
import { createWorld } from './render/world.js';
import { createCarMesh } from './render/carMesh.js';
import { createChaseCamera } from './render/chaseCamera.js';
import { createFx } from './render/fx.js';
import { createAudio } from './audio/audio.js';
import { createHud } from './ui/hud.js';
import { createMenu } from './ui/menu.js';
import { formatTime } from './ui/format.js';
import { createStore } from './meta/store.js';
import { medalTimes, nextMedal } from './meta/medals.js';
import { FIXED_TRACKS, dailyTrackId } from './meta/daily.js';
import { COLORS, TRAILS, isUnlocked } from './meta/unlocks.js';
import { makeShareUrl, parseShareHash } from './meta/share.js';

const debug = new URLSearchParams(location.search).has('debug');
const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);

if (!renderer) {
  const msg = document.createElement('p');
  msg.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;margin:0;padding:24px;text-align:center';
  msg.textContent = "This game needs WebGL, which isn't available in this browser.";
  document.body.append(msg);
}

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const trackName = (id) => (id.startsWith('daily-') ? 'Daily' : `Neon ${id.split('-')[1]}`);

function start() {
  const store = createStore(safeStorage());
  store.pruneDailies(dailyTrackId());

  const camera = createChaseCamera(renderer.camera);
  const input = createInput(window);
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fx = createFx(renderer.scene, renderer.camera, { reducedMotion });
  const audio = createAudio();
  audio.setMuted(store.getSettings().muted);
  for (const type of ['keydown', 'pointerdown', 'touchstart']) window.addEventListener(type, () => audio.unlock());
  const carMesh = createCarMesh({ color: 0x00e5ff });
  const ghostMesh = createCarMesh({ ghost: true });
  ghostMesh.visible = false;
  renderer.scene.add(carMesh, ghostMesh);

  const infoCache = new Map();
  function trackInfo(id) {
    if (!infoCache.has(id)) {
      const track = generateTrack(id);
      const botMs = measureBotLapMs(track);
      infoCache.set(id, { track, times: botMs ? medalTimes(botMs) : null });
    }
    return infoCache.get(id);
  }

  let current = null;   // { id, track, session, sim, world }
  let wrongTime = 0, targetText = '', targetFor;

  const wrapAngle = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return a;
  };

  function poseAt(alpha) {
    const { car, prev } = current.sim;
    return {
      x: prev.x + (car.x - prev.x) * alpha,
      z: prev.z + (car.z - prev.z) * alpha,
      heading: prev.heading + wrapAngle(car.heading - prev.heading) * alpha,
      speed: carSpeed(car),
      boosting: car.boostTime > 0,
    };
  }

  function loadTrack(id, friendGhost = null) {
    if (current) current.world.dispose();
    const { track, times } = trackInfo(id);
    const session = createSession({ trackId: id, track, store, times, friendGhost });
    ghostMesh.userData.setColor(friendGhost ? 0xff2bd6 : 0x40f0ff);
    current = { id, track, session, sim: session.sim, world: createWorld(renderer.scene, track) };
    ghostMesh.visible = false;
    wrongTime = 0;
    targetFor = undefined;
    camera.snap(poseAt(0));
    fx.reset();
    audio.reset();
  }

  function restart() {
    current.session.restart();
    current.world.resetPylons();
    camera.snap(poseAt(0));
    ghostMesh.visible = false;
    wrongTime = 0;
    fx.reset();
    audio.reset();
  }

  function trackRows() {
    return [...FIXED_TRACKS, dailyTrackId()].map((id) => {
      const best = store.getBest(id);
      const target = nextMedal(best ? best.timeMs : null, trackInfo(id).times ?? {});
      return {
        id, name: trackName(id),
        bestMs: best ? best.timeMs : null,
        medal: store.getMedal(id),
        canShare: !!(best && best.ghostCode),
        target: target ? `${capitalize(target.name)} in ${formatTime(target.timeMs)}` : '',
      };
    });
  }

  function activeCosmetic(list, id) {
    const points = store.totalPoints();
    return list.find((c) => c.id === id && isUnlocked(c, points)) ?? list[0];
  }
  function applyCosmetics() {
    const settings = store.getSettings();
    carMesh.userData.setColor(activeCosmetic(COLORS, settings.color).hex);
    fx.setTrail(activeCosmetic(TRAILS, settings.trail).id);
  }
  function cosmeticsView() {
    const settings = store.getSettings(), points = store.totalPoints();
    const view = (list, id) => list.map((c) => ({
      id: c.id, label: capitalize(c.id), hex: c.hex,
      selected: c.id === activeCosmetic(list, id).id, needs: Math.max(0, c.points - points),
    }));
    return { points, colors: view(COLORS, settings.color), trails: view(TRAILS, settings.trail) };
  }
  const showPause = () => menu.showPause(store.getSettings().muted, cosmeticsView());

  async function shareTrack(id) {
    const best = store.getBest(id);
    const url = best && best.ghostCode ? makeShareUrl(location.href, id, best.ghostCode) : null;
    if (!url) { showTracks({ notice: "That ghost is too big to share.", error: true }); return; }
    try {
      await navigator.clipboard.writeText(url);
      showTracks({ notice: 'Link copied' });
    } catch {
      showTracks({ shareUrl: url });
    }
  }

  let ui = 'tracks';   // 'tracks' | 'pause' | null
  const menu = createMenu(document.getElementById('menu'), {
    onSelect(id) { loadTrack(id); ui = null; menu.hide(); },
    onResume() { ui = null; menu.hide(); },
    onRestart() { restart(); ui = null; menu.hide(); },
    onTracks() { showTracks(); },
    onShare(id) { shareTrack(id); },
    onPickColor(id) { store.setSettings({ color: id }); applyCosmetics(); showPause(); },
    onPickTrail(id) { store.setSettings({ trail: id }); applyCosmetics(); showPause(); },
    onToggleMute() {
      const muted = !store.getSettings().muted;
      store.setSettings({ muted });
      audio.setMuted(muted);
      showPause();
    },
    onDismissControls() { store.setSettings({ seenControls: true }); },
  });
  function showTracks(extras = {}) {
    ui = 'tracks';
    menu.showTracks(trackRows(), { showControls: !store.getSettings().seenControls, ...extras });
  }

  const hud = createHud(document.getElementById('hud'), { onRestart: restart });

  function onEvent(e) {
    hud.event(e);
    fx.event(e);
    audio.event(e);
    const { world } = current;
    if (e.type === 'checkpoint') world.flashGate(e.index);
    else if (e.type === 'lap') { world.flashGate(0); world.resetPylons(); }
    else if (e.type === 'pylonHit') { world.setPylonHit(e.index); camera.kick(0.6); }
    else if (e.type === 'barrierHit') camera.kick(Math.min(1, e.impact / 10));
    else if (e.type === 'boost') camera.kick(0.3);
  }

  let debugEl = null, debugAt = 0, frames = 0, fps = 0, fpsAt = performance.now();
  if (debug) {
    debugEl = document.createElement('pre');
    debugEl.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;font:12px monospace;color:#9fe;pointer-events:none;z-index:5';
    document.body.append(debugEl);
    window.__game = {
      get session() { return current.session; },
      get sim() { return current.sim; },
      get track() { return current.track; },
      loadTrack, store, renderer,
    };
  }

  applyCosmetics();
  const sharedHash = location.hash.startsWith('#r=');
  const shared = sharedHash ? parseShareHash(location.hash) : null;
  loadTrack(shared ? shared.trackId : FIXED_TRACKS[0], shared ? shared.ghost : null);
  if (shared) {
    ui = null;
    hud.event({ type: 'banner', text: `Beat ${formatTime(shared.ghost.timeMs)}` });
  } else {
    showTracks(sharedHash ? { notice: 'That race link is broken', error: true } : {});
  }
  if (sharedHash) history.replaceState(null, '', location.pathname + location.search);

  let acc = 0, last = performance.now() / 1000;

  document.addEventListener('visibilitychange', () => {
    input.clear();
    last = performance.now() / 1000;
  });

  function frame(nowMs) {
    const now = nowMs / 1000;
    const dt = Math.min(0.1, Math.max(0, now - last));
    last = now;
    const { sim, session, track, world } = current;

    for (const name of input.consumePressed()) {
      if (name === 'restart' && ui === null) { restart(); acc = 0; }
      else if (name === 'mute') {
        const muted = !store.getSettings().muted;
        store.setSettings({ muted });
        audio.setMuted(muted);
        if (ui === 'pause') showPause();
      } else if (name === 'pause') {
        if (ui === null) { ui = 'pause'; showPause(); }
        else if (ui === 'pause') { ui = null; menu.hide(); }
      }
    }

    if (ui === null) {
      const r = advance(acc, dt);
      acc = r.accumulator;
      for (let i = 0; i < r.steps; i++) {
        for (const e of current.session.step(input.read())) onEvent(e);
      }
    }

    const alpha = Math.min(0.999, acc / DT);
    const pose = poseAt(alpha);
    carMesh.position.set(pose.x, 0, pose.z);
    carMesh.rotation.y = pose.heading;

    const { rival } = session;
    ghostMesh.visible = !!rival && sim.lapRunning;
    if (ghostMesh.visible) {
      const g = sampleGhost(rival, (sim.step - sim.lapStartStep + alpha) * DT * 1000);
      ghostMesh.position.set(g.x, 0, g.z);
      ghostMesh.rotation.y = g.heading;
    }

    const tangentSpeed = sim.car.vx * track.txs[sim.hint] + sim.car.vz * track.tzs[sim.hint];
    wrongTime = tangentSpeed < -5 ? wrongTime + dt : 0;

    if (targetFor !== session.bestMs) {
      targetFor = session.bestMs;
      const t = session.nextTarget();
      targetText = t ? `${capitalize(t.name)} in ${formatTime(t.timeMs)}` : '';
    }
    hud.update({
      lapMs: lapTimeMs(sim),
      bestMs: session.bestMs,
      target: targetText,
      speedKmh: pose.speed * 3.6,
      charge: sim.car.charge,
      wrongWay: wrongTime > 1,
    });

    camera.update({ ...pose }, dt);
    fx.update({ ...pose, drifting: sim.car.drifting, surface: sim.surface }, dt);
    audio.update({ speed: pose.speed, boosting: pose.boosting, drifting: sim.car.drifting, charge: sim.car.charge });
    if (ui === null && !document.hidden) audio.resume(); else audio.suspend();
    world.update(now);
    renderer.render();

    if (debugEl) {
      frames++;
      if (nowMs - fpsAt > 500) { fps = Math.round((frames * 1000) / (nowMs - fpsAt)); frames = 0; fpsAt = nowMs; }
      if (nowMs - debugAt > 100) {
        debugAt = nowMs;
        debugEl.textContent = [
          `surface ${sim.surface}  boost ${sim.car.boostTime.toFixed(2)}  progress ${sim.progress.toFixed(0)}`,
          `fps ${fps}  calls ${renderer.info.render.calls}  geometries ${renderer.info.memory.geometries}`,
        ].join('\n');
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (renderer) start();
