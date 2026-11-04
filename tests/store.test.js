import { createStore } from '../src/meta/store.js';

function fakeStorage(initial = null) {
  const s = { value: initial, getItem: () => s.value, setItem: (_k, v) => { s.value = v; } };
  return s;
}
const lap = (timeMs, medal, ghostCode = 'abc') => ({ timeMs, ghostCode, medal });

test.each([
  ['null storage', () => null],
  ['throwing storage', () => ({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } })],
  ['corrupt JSON', () => fakeStorage('{not json')],
  ['wrong shape', () => fakeStorage('{"version":1,"tracks":"nope"}')],
  ['future version', () => fakeStorage('{"version":99}')],
])('store survives %s', (_, make) => {
  const s = createStore(make());
  s.recordLap('neon-1', lap(40000, 'gold'));
  expect(s.getBest('neon-1').timeMs).toBe(40000);
});
test('a future-version save is never overwritten', () => {
  const storage = fakeStorage('{"version":99,"keep":true}');
  createStore(storage).recordLap('neon-1', lap(40000, 'gold'));
  expect(storage.value).toBe('{"version":99,"keep":true}');
});
test('quota failure keeps the session running', () => {
  const storage = { getItem: () => null, setItem() { throw new Error('quota'); } };
  const s = createStore(storage);
  expect(() => s.recordLap('neon-1', lap(40000, 'gold'))).not.toThrow();
  expect(s.getBest('neon-1')).toEqual({ timeMs: 40000, ghostCode: 'abc' });
  expect(s.getMedal('neon-1')).toBe('gold');
});
test('records persist to a new store on the same storage', () => {
  const storage = fakeStorage();
  createStore(storage).recordLap('neon-2', lap(41000, 'silver'));
  const again = createStore(storage);
  expect(again.getBest('neon-2').timeMs).toBe(41000);
  expect(again.getMedal('neon-2')).toBe('silver');
});
test('a worse lap never lowers best or medal', () => {
  const s = createStore(fakeStorage());
  s.recordLap('neon-1', lap(40000, 'gold'));
  s.recordLap('neon-1', lap(50000, 'bronze', 'worse'));
  expect(s.getBest('neon-1')).toEqual({ timeMs: 40000, ghostCode: 'abc' });
  expect(s.getMedal('neon-1')).toBe('gold');
});
test('total points add up medal points across tracks', () => {
  const s = createStore(fakeStorage());
  s.recordLap('neon-1', lap(40000, 'gold'));
  s.recordLap('neon-2', lap(40000, 'bronze'));
  expect(s.totalPoints()).toBe(4);
});
test('settings merge and persist', () => {
  const storage = fakeStorage();
  const s = createStore(storage);
  expect(s.getSettings().muted).toBe(false);
  s.setSettings({ muted: true });
  expect(createStore(storage).getSettings().muted).toBe(true);
  expect(createStore(storage).getSettings().color).toBe('cyan');
});
test('pruning removes old daily ghosts but keeps points', () => {
  const s = createStore(fakeStorage());
  s.recordLap('daily-2026-10-19', lap(40000, 'gold', 'old'));    // 15 days before 2026-11-03
  s.recordLap('daily-2026-10-21', lap(40000, 'silver', 'recent')); // 13 days before
  s.recordLap('neon-1', lap(40000, 'bronze', 'fixed'));
  const before = s.totalPoints();
  s.pruneDailies('daily-2026-11-03');
  expect(s.getBest('daily-2026-10-19')).toEqual({ timeMs: 40000, ghostCode: null });
  expect(s.getBest('daily-2026-10-21').ghostCode).toBe('recent');
  expect(s.getBest('neon-1').ghostCode).toBe('fixed');
  expect(s.totalPoints()).toBe(before);
});
test('recordLap reports cosmetics unlocked by the new points', () => {
  const s = createStore(fakeStorage());
  expect(s.recordLap('neon-1', lap(40000, 'gold')).unlockedNow.map((i) => i.id)).toEqual(['magenta']);   // 3 points
  expect(s.recordLap('neon-1', lap(39000, 'gold')).unlockedNow).toEqual([]);
  expect(s.recordLap('neon-2', lap(40000, 'silver')).unlockedNow.map((i) => i.id)).toEqual(['pulse']);   // 5 points
});
