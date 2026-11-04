import { generateTrack, queryTrack } from '../src/sim/track.js';
import { createSim, stepSim, resetSim, lapTimeMs } from '../src/sim/sim.js';
import { botInput } from '../src/sim/bot.js';
import { carSpeed } from '../src/sim/car.js';

const track = generateTrack('neon-1');
const idle = { throttle: false, brake: false, steer: 0, drift: false };
const brake = { throttle: false, brake: true, steer: 0, drift: false };
const gas = { throttle: true, brake: false, steer: 0, drift: false };

const drive = (sim, seconds) => {
  const all = [];
  for (let i = 0; i < seconds * 120; i++) { stepSim(sim, botInput(sim)); all.push(...sim.events); }
  return all;
};

// Puts the car `dist` metres from pylon p toward the road centre, moving along the tangent at `speed`,
// with hint/progress consistent so progress does not jump.
function placeNearPylon(sim, p, dist, speed) {
  const t = sim.track, i = p.index;
  const off = p.side * 5.8 - p.side * dist;
  sim.car.x = t.xs[i] + t.tzs[i] * off;
  sim.car.z = t.zs[i] - t.txs[i] * off;
  sim.car.heading = Math.atan2(t.txs[i], t.tzs[i]);
  sim.car.vx = t.txs[i] * speed;
  sim.car.vz = t.tzs[i] * speed;
  sim.hint = i;
  sim.lastS = sim.progress = i * t.spacing;
  sim.lapRunning = true;
  sim.lapStartStep = sim.step;
  sim.lapBase = 0;
  sim.nextCheckpoint = 99;   // keep checkpoints out of the way
}

test('timer starts only after crossing the line', () => {
  const s = createSim(track);
  expect(lapTimeMs(s)).toBe(0);
  const ev = drive(s, 3);
  expect(ev.filter(e => e.type === 'lapStart')).toHaveLength(1);
});
test('bot completes a lap with 7 increasing splits', () => {
  const lap = drive(createSim(track), 90).find(e => e.type === 'lap');
  expect(lap.splitsMs).toHaveLength(7);
  expect([...lap.splitsMs].sort((a, b) => a - b)).toEqual(lap.splitsMs);
  expect(lap.splitsMs[6]).toBeLessThan(lap.timeMs);
});
test('rocking over a checkpoint does not count it twice', () => {
  const s = createSim(track), seen = [];
  while (s.nextCheckpoint < 2) { stepSim(s, botInput(s)); seen.push(...s.events); }
  const checkpointProgress = s.progress;
  for (let i = 0; i < 960; i++) { stepSim(s, brake); seen.push(...s.events); }
  expect(s.progress).toBeLessThan(checkpointProgress);  // Proves the car really went back over it.
  for (let i = 0; i < 480; i++) { stepSim(s, gas); seen.push(...s.events); }
  expect(seen.filter(e => e.type === 'checkpoint' && e.index === 1)).toHaveLength(1);
});
test('reversing over the start line never completes a lap', () => {
  const s = createSim(track), seen = [];
  for (let i = 0; i < 3600; i++) { stepSim(s, brake); seen.push(...s.events); }
  expect(seen.some(e => e.type === 'lap')).toBe(false);
});
test('barrier holds at full boost speed', () => {
  const s = createSim(track);
  s.car.heading += Math.PI / 2; s.car.boostTime = 2;
  for (let i = 0; i < 1200; i++) {
    stepSim(s, gas);
    const q = queryTrack(track, s.car.x, s.car.z, s.hint);
    expect(Math.abs(q.lateral)).toBeLessThanOrEqual(12.01);
  }
});
test('resetSim clears everything mid-drift, mid-boost, mid-lap', () => {
  const s = createSim(track), fresh = createSim(track);
  drive(s, 20);
  s.car.drifting = true; s.car.charge = 1; s.car.boostTime = 1;
  resetSim(s);
  expect({ ...s, track: null, events: [] }).toEqual({ ...fresh, track: null, events: [] });
});
test('skimming a pylon awards boost once; hitting one slows the car', () => {
  const s = createSim(track), p = track.pylons[0];
  placeNearPylon(s, p, 2.5, 40);
  const seen = [];
  for (let i = 0; i < 120; i++) { stepSim(s, gas); seen.push(...s.events); }
  expect(seen.filter(e => e.type === 'nearMiss')).toHaveLength(1);

  const h = createSim(track);
  placeNearPylon(h, p, 0.5, 40);
  stepSim(h, idle);
  expect(h.events.some(e => e.type === 'pylonHit')).toBe(true);
  expect(carSpeed(h.car)).toBeLessThan(31);
});
