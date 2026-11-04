import {
  DT, START_OFFSET, CHECKPOINTS, ROAD_HALF_WIDTH, BARRIER_LATERAL,
  BARRIER_MAX_SPEED_LOSS, BARRIER_EVENT_MIN_IMPACT, BOOST_CAP,
  PYLON_HIT_DIST, PYLON_NEAR_DIST, PYLON_CLEAR_DIST, NEAR_MISS_MIN_SPEED,
  NEAR_MISS_BOOST, PYLON_HIT_SPEED_MULT,
} from './constants.js';
import { createCar, resetCar, stepCar, carSpeed } from './car.js';
import { queryTrack } from './track.js';

export function createSim(track) {
  const sim = {
    track, car: createCar(0, 0, 0), prev: { x: 0, z: 0, heading: 0 },
    step: 0, progress: 0, lastS: 0, hint: 0, surface: 'road',
    lapStartStep: 0, lapRunning: false, lapIndex: 0, lapBase: 0,
    nextCheckpoint: 1, splits: [], pylonState: [], events: [],
  };
  resetSim(sim);
  return sim;
}

export function resetSim(sim) {
  const { track } = sim;
  const sIdx = track.count - Math.ceil(START_OFFSET / track.spacing);   // sample just behind the start
  const a = sIdx, b = (sIdx + 1) % track.count;
  const frac = (track.count * track.spacing - START_OFFSET - a * track.spacing) / track.spacing;
  const x = track.xs[a] + (track.xs[b] - track.xs[a]) * frac;
  const z = track.zs[a] + (track.zs[b] - track.zs[a]) * frac;
  const tx = track.txs[a] + (track.txs[b] - track.txs[a]) * frac;
  const tz = track.tzs[a] + (track.tzs[b] - track.tzs[a]) * frac;
  const heading = Math.atan2(tx, tz);

  resetCar(sim.car, x, z, heading);
  sim.prev = { x, z, heading };
  sim.step = 0;
  sim.progress = -START_OFFSET;
  sim.lastS = track.length - START_OFFSET;
  sim.hint = a;
  sim.surface = 'road';
  sim.lapStartStep = 0;
  sim.lapRunning = false;
  sim.lapIndex = 0;
  sim.lapBase = 0;
  sim.nextCheckpoint = 1;
  sim.splits = [];
  sim.pylonState = track.pylons.map(() => ({ armed: false, done: false }));
  sim.events = [];
}

export function lapTimeMs(sim) {
  return sim.lapRunning ? Math.round((sim.step - sim.lapStartStep) * DT * 1000) : 0;
}

function applyBarrier(sim, q) {
  const { car, track } = sim;
  for (let iter = 0; iter < 3 && Math.abs(q.lateral) > BARRIER_LATERAL; iter++) {
    const sign = q.lateral > 0 ? 1 : -1;
    const excess = q.lateral - sign * BARRIER_LATERAL + sign * 1e-4;
    car.x -= q.nx * excess;
    car.z -= q.nz * excess;
    if (iter === 0) {
      const speed = Math.hypot(car.vx, car.vz);
      const vn = (car.vx * q.nx + car.vz * q.nz) * sign;   // outward component
      if (vn > 0) {
        car.vx -= vn * sign * q.nx;
        car.vz -= vn * sign * q.nz;
        const keep = 1 - BARRIER_MAX_SPEED_LOSS * (speed > 0 ? vn / speed : 0);
        car.vx *= keep;
        car.vz *= keep;
        car.charge = 0;
        if (vn >= BARRIER_EVENT_MIN_IMPACT) sim.events.push({ type: 'barrierHit', impact: vn });
      }
    }
    q = queryTrack(track, car.x, car.z, q.index);
  }
  return q;
}

function updatePylons(sim) {
  const { car, track, pylonState, events } = sim;
  const speed = carSpeed(car);
  for (let i = 0; i < track.pylons.length; i++) {
    const st = pylonState[i];
    if (st.done) continue;
    const p = track.pylons[i];
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < PYLON_HIT_DIST) {
      st.done = true;
      car.vx *= PYLON_HIT_SPEED_MULT;
      car.vz *= PYLON_HIT_SPEED_MULT;
      car.charge = 0;
      events.push({ type: 'pylonHit', index: i });
    } else if (d < PYLON_NEAR_DIST) {
      if (speed >= NEAR_MISS_MIN_SPEED) st.armed = true;
    } else if (st.armed && d > PYLON_CLEAR_DIST) {
      st.done = true;
      car.boostTime = Math.min(BOOST_CAP, car.boostTime + NEAR_MISS_BOOST);
      events.push({ type: 'nearMiss', index: i });
    }
  }
}

export function stepSim(sim, input) {
  const { car, track } = sim;
  sim.events.length = 0;
  sim.prev.x = car.x; sim.prev.z = car.z; sim.prev.heading = car.heading;

  stepCar(car, input, sim.surface, DT, sim.events);
  sim.step++;

  let q = queryTrack(track, car.x, car.z, sim.hint);
  q = applyBarrier(sim, q);
  sim.hint = q.index;

  let ds = q.s - sim.lastS;
  const half = track.length / 2;
  while (ds > half) ds -= track.length;
  while (ds < -half) ds += track.length;
  sim.progress += ds;
  sim.lastS = q.s;
  sim.surface = Math.abs(q.lateral) > ROAD_HALF_WIDTH ? 'offroad' : 'road';

  if (!sim.lapRunning && sim.progress >= 0) {
    sim.lapRunning = true;
    sim.lapStartStep = sim.step;
    sim.events.push({ type: 'lapStart' });
  }
  if (sim.lapRunning) {
    const segment = track.length / CHECKPOINTS;
    const k = sim.nextCheckpoint;
    if (sim.progress >= sim.lapBase + k * segment) {
      const timeMs = lapTimeMs(sim);
      if (k < CHECKPOINTS) {
        sim.splits.push(timeMs);
        sim.nextCheckpoint++;
        sim.events.push({ type: 'checkpoint', index: k, splitMs: timeMs });
      } else {
        sim.events.push({ type: 'lap', timeMs, splitsMs: sim.splits.slice() });
        sim.lapIndex++;
        sim.lapBase += track.length;
        sim.lapStartStep = sim.step;
        sim.nextCheckpoint = 1;
        sim.splits = [];
        for (const st of sim.pylonState) { st.armed = false; st.done = false; }
      }
    }
  }

  updatePylons(sim);
}
