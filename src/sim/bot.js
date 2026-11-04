import { MAX_SPEED } from './constants.js';
import { queryTrack } from './track.js';
import { carSpeed } from './car.js';
import { createSim, stepSim } from './sim.js';

const LATERAL_ACCEL = 22;
const MAX_BOT_STEPS = 180 * 120;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrapAngle = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
};

export function botInput(sim) {
  const { track, car } = sim;
  const speed = carSpeed(car);
  const q = queryTrack(track, car.x, car.z, sim.hint);

  const aheadIdx = (q.index + Math.round((speed * 0.45 + 6) / track.spacing)) % track.count;
  const want = Math.atan2(track.xs[aheadIdx] - car.x, track.zs[aheadIdx] - car.z);
  const steer = clamp(wrapAngle(want - car.heading) * 2.5, -1, 1);

  const span = Math.ceil((speed * 1.2 + 10) / track.spacing);
  let maxK = 1e-4;
  for (let o = 0; o <= span; o++) maxK = Math.max(maxK, Math.abs(track.curvature[(q.index + o) % track.count]));
  const target = Math.min(MAX_SPEED, Math.sqrt(LATERAL_ACCEL / maxK));

  return { throttle: speed < target, brake: speed > target + 2, steer, drift: false };
}

export function measureBotLapMs(track) {
  const sim = createSim(track);
  for (let i = 0; i < MAX_BOT_STEPS; i++) {
    stepSim(sim, botInput(sim));
    for (const e of sim.events) if (e.type === 'lap') return e.timeMs;
  }
  return null;
}
