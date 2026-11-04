import { GHOST_STEPS_PER_SAMPLE, GHOST_MAX_SAMPLES } from './sim/constants.js';
import { createSim, stepSim, resetSim } from './sim/sim.js';
import { encodeGhost, decodeGhost } from './sim/ghost.js';

export function createSession({ trackId, track, store, friendGhost = null, maxSamples = GHOST_MAX_SAMPLES }) {
  const sim = createSim(track);
  const saved = store.getBest(trackId);

  const session = {
    sim,
    bestMs: saved ? saved.timeMs : null,
    best: saved && saved.ghostCode ? decodeGhost(saved.ghostCode) : null,
    rival: null,
    step,
    restart,
  };
  session.rival = friendGhost ?? session.best;

  let samples = [], overflow = false;

  function resetRecorder() { samples = []; overflow = false; }

  function record() {
    if (overflow) return;
    if (samples.length / 3 >= maxSamples) { overflow = true; samples = []; return; }
    samples.push(sim.car.x, sim.car.z, sim.car.heading);
  }

  function finishLap(e) {
    const ghost = overflow ? null : { timeMs: e.timeMs, splitsMs: e.splitsMs, samples };
    const ghostCode = ghost ? encodeGhost(ghost) : null;
    const isBest = session.bestMs === null || e.timeMs < session.bestMs;
    const out = {
      ...e,
      isBest,
      deltaMs: session.rival ? e.timeMs - session.rival.timeMs : null,
      ghostCode,
    };
    if (isBest) {
      session.bestMs = e.timeMs;
      session.best = ghost;
      if (!friendGhost) session.rival = ghost;
      store.recordLap(trackId, { timeMs: e.timeMs, ghostCode, medal: null });
    }
    resetRecorder();
    return out;
  }

  function step(input) {
    stepSim(sim, input);
    const out = [];
    for (const e of sim.events) {
      if (e.type === 'checkpoint') {
        out.push({ ...e, deltaMs: session.rival ? e.splitMs - session.rival.splitsMs[e.index - 1] : null });
      } else if (e.type === 'lap') {
        out.push(finishLap(e));
      } else {
        out.push({ ...e });
      }
    }
    if (sim.lapRunning && (sim.step - sim.lapStartStep) % GHOST_STEPS_PER_SAMPLE === 0) record();
    return out;
  }

  function restart() {
    resetSim(sim);
    resetRecorder();
  }

  return session;
}
