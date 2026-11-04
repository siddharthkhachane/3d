import { DT } from './sim/constants.js';
import { generateTrack } from './sim/track.js';
import { createSim, stepSim, resetSim, lapTimeMs } from './sim/sim.js';
import { carSpeed } from './sim/car.js';
import { advance } from './loop.js';
import { createInput } from './input.js';
import { createRenderer } from './render/renderer.js';
import { createWorld } from './render/world.js';
import { createCarMesh } from './render/carMesh.js';
import { createChaseCamera } from './render/chaseCamera.js';

const debug = new URLSearchParams(location.search).has('debug');
const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);

if (!renderer) {
  const msg = document.createElement('p');
  msg.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;margin:0;padding:24px;text-align:center';
  msg.textContent = "This game needs WebGL, which isn't available in this browser.";
  document.body.append(msg);
} else {
  start();
}

function start() {
  const track = generateTrack('neon-1');
  const sim = createSim(track);
  const world = createWorld(renderer.scene, track);
  const carMesh = createCarMesh({ color: 0x00e5ff });
  renderer.scene.add(carMesh);
  const camera = createChaseCamera(renderer.camera);
  const input = createInput(window);

  const wrapAngle = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return a;
  };

  function poseAt(alpha) {
    const { car, prev } = sim;
    return {
      x: prev.x + (car.x - prev.x) * alpha,
      z: prev.z + (car.z - prev.z) * alpha,
      heading: prev.heading + wrapAngle(car.heading - prev.heading) * alpha,
      speed: carSpeed(car),
      boosting: car.boostTime > 0,
    };
  }

  function restart() {
    resetSim(sim);
    world.resetPylons();
    camera.snap(poseAt(0));
  }

  function onEvent(e) {
    if (e.type === 'checkpoint') world.flashGate(e.index);
    else if (e.type === 'lap') { world.flashGate(0); world.resetPylons(); }
    else if (e.type === 'pylonHit') { world.setPylonHit(e.index); camera.kick(0.6); }
    else if (e.type === 'barrierHit') camera.kick(Math.min(1, e.impact / 10));
    else if (e.type === 'boost') camera.kick(0.3);
  }

  let debugEl = null, debugAt = 0, frames = 0, fps = 0, fpsAt = performance.now();
  if (debug) {
    debugEl = document.createElement('pre');
    debugEl.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;font:12px monospace;color:#9fe;pointer-events:none';
    document.body.append(debugEl);
    window.__game = { sim, track, renderer, world };
  }

  let acc = 0, last = performance.now() / 1000, paused = false;
  camera.snap(poseAt(0));

  document.addEventListener('visibilitychange', () => {
    input.clear();
    last = performance.now() / 1000;
  });

  function frame(nowMs) {
    const now = nowMs / 1000;
    const dt = Math.min(0.1, Math.max(0, now - last));
    last = now;

    for (const name of input.consumePressed()) {
      if (name === 'restart') { restart(); acc = 0; }
      else if (name === 'pause') paused = !paused;
    }

    if (!paused) {
      const r = advance(acc, dt);
      acc = r.accumulator;
      for (let i = 0; i < r.steps; i++) {
        stepSim(sim, input.read());
        for (const e of sim.events) onEvent(e);
      }
    }

    const pose = poseAt(Math.min(0.999, acc / DT));
    carMesh.position.set(pose.x, 0, pose.z);
    carMesh.rotation.y = pose.heading;
    camera.update({ ...pose }, dt);
    world.update(now);
    renderer.render();

    if (debugEl) {
      frames++;
      if (nowMs - fpsAt > 500) { fps = Math.round((frames * 1000) / (nowMs - fpsAt)); frames = 0; fpsAt = nowMs; }
      if (nowMs - debugAt > 100) {
        debugAt = nowMs;
        debugEl.textContent = [
          `speed ${(carSpeed(sim.car) * 3.6).toFixed(0)} km/h`,
          `lap ${(lapTimeMs(sim) / 1000).toFixed(2)}s  progress ${sim.progress.toFixed(0)}`,
          `surface ${sim.surface}  charge ${sim.car.charge.toFixed(2)}  boost ${sim.car.boostTime.toFixed(2)}`,
          `fps ${fps}  calls ${renderer.info.render.calls}  geometries ${renderer.info.memory.geometries}`,
        ].join('\n');
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
