import { generateTrack } from '../src/sim/track.js';
import { botInput } from '../src/sim/bot.js';
import { createSession } from '../src/session.js';
import { encodeGhost, decodeGhost } from '../src/sim/ghost.js';

const track = generateTrack('neon-1');

function memoryStore(initial = null) {
  let best = initial, medal = null;
  const store = {
    records: 0,
    getBest: () => best,
    getMedal: () => medal,
    recordLap(_id, rec) {
      store.records++;
      best = { timeMs: rec.timeMs, ghostCode: rec.ghostCode };
      if (rec.medal) medal = rec.medal;
      return { unlockedNow: [] };
    },
  };
  return store;
}

// Drives with the bot until `stop(event)` is true for an event, and returns every event seen.
function driveUntil(session, stop, maxSteps = 120 * 120) {
  const seen = [];
  for (let i = 0; i < maxSteps; i++) {
    const events = session.step(botInput(session.sim));
    seen.push(...events);
    if (events.some(stop)) break;
  }
  return seen;
}
const isLap = (e) => e.type === 'lap';
const lapOf = (events) => events.find(isLap);

// A first lap recorded once, reused as fixtures.
const firstSession = createSession({ trackId: 'neon-1', track, store: memoryStore() });
const firstLap = lapOf(driveUntil(firstSession, isLap));
const baseGhost = decodeGhost(firstLap.ghostCode);
const fasterGhost = { ...baseGhost, timeMs: Math.round(baseGhost.timeMs * 0.95) };
const slowerGhost = { ...baseGhost, timeMs: Math.round(baseGhost.timeMs * 1.5) };

test('the first lap becomes best and is stored', () => {
  const store = memoryStore();
  const s = createSession({ trackId: 'neon-1', track, store });
  const lap = lapOf(driveUntil(s, isLap));
  expect(lap.isBest).toBe(true);
  expect(s.bestMs).toBe(lap.timeMs);
  expect(s.best.timeMs).toBe(lap.timeMs);
  expect(store.getBest('neon-1').timeMs).toBe(lap.timeMs);
  expect(decodeGhost(store.getBest('neon-1').ghostCode)).not.toBeNull();
});
test('a slower lap does not replace best', () => {
  const store = memoryStore({ timeMs: fasterGhost.timeMs, ghostCode: encodeGhost(fasterGhost) });
  const s = createSession({ trackId: 'neon-1', track, store });
  const lap = lapOf(driveUntil(s, isLap));
  expect(lap.isBest).toBe(false);
  expect(lap.deltaMs).toBeGreaterThan(0);
  expect(store.records).toBe(0);
  expect(store.getBest('neon-1').timeMs).toBe(fasterGhost.timeMs);
});
test('checkpoint delta is against the rival split', () => {
  const store = memoryStore({ timeMs: fasterGhost.timeMs, ghostCode: encodeGhost(fasterGhost) });
  const s = createSession({ trackId: 'neon-1', track, store });
  const e = driveUntil(s, (ev) => ev.type === 'checkpoint').find((ev) => ev.type === 'checkpoint');
  expect(e.deltaMs).toBe(e.splitMs - s.rival.splitsMs[e.index - 1]);
});
test('first-ever run has null deltas', () => {
  const s = createSession({ trackId: 'neon-1', track, store: memoryStore() });
  const seen = driveUntil(s, isLap);
  expect(seen.find((e) => e.type === 'checkpoint').deltaMs).toBeNull();
  expect(lapOf(seen).deltaMs).toBeNull();
});
test('a friend ghost is the rival but never overwrites stored best', () => {
  const store = memoryStore();
  const s = createSession({ trackId: 'neon-1', track, store, friendGhost: slowerGhost });
  expect(s.rival).toBe(slowerGhost);
  const lap = lapOf(driveUntil(s, isLap));
  expect(lap.deltaMs).toBe(lap.timeMs - slowerGhost.timeMs);
  expect(lap.isBest).toBe(true);
  expect(s.rival).toBe(slowerGhost);
  expect(store.getBest('neon-1').timeMs).toBe(lap.timeMs);
});
test('restart mid-lap discards recording', () => {
  const store = memoryStore();
  const s = createSession({ trackId: 'neon-1', track, store });
  for (let i = 0; i < 10 * 120; i++) s.step(botInput(s.sim));
  s.restart();
  const lap = lapOf(driveUntil(s, isLap));
  const g = decodeGhost(store.getBest('neon-1').ghostCode);
  const samples = g.samples.length / 3;
  expect(Math.abs(samples - lap.timeMs / 100)).toBeLessThanOrEqual(2);
  expect(g.samples[0]).toBeCloseTo(baseGhost.samples[0], 0);   // starts at the line, like the fixture
  expect(g.samples[1]).toBeCloseTo(baseGhost.samples[1], 0);
});
test('a lap too long for a ghost still counts without crashing', () => {
  const store = memoryStore();
  const s = createSession({ trackId: 'neon-1', track, store, maxSamples: 50 });
  const lap = lapOf(driveUntil(s, isLap));
  expect(lap.isBest).toBe(true);
  expect(lap.ghostCode).toBeNull();
  expect(s.bestMs).toBe(lap.timeMs);
  expect(s.best).toBeNull();
  expect(store.getBest('neon-1').ghostCode).toBeNull();
});
test('reaching a medal emits medalUpgraded once, and an equal lap does not repeat it', () => {
  const store = memoryStore();
  const first = lapOf(driveUntil(createSession({ trackId: 'neon-1', track, store }), isLap));
  expect(first.medal).toBe('gold');   // the bot lap defines the medal scale, so it lands just inside gold
  expect(first.medalUpgraded).toBe(true);
  const second = lapOf(driveUntil(createSession({ trackId: 'neon-1', track, store }), isLap));
  expect(second.medal).toBe('gold');
  expect(second.medalUpgraded).toBe(false);
});
test('nextTarget names the next medal for the saved best', () => {
  const s = createSession({ trackId: 'neon-1', track, store: memoryStore() });
  expect(s.nextTarget().name).toBe('bronze');
});
