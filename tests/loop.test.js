import { advance } from '../src/loop.js';

test('a normal frame runs matching steps and keeps the remainder', () => {
  const r = advance(0, 1 / 60);
  expect(r.steps).toBe(2);
  expect(r.alpha).toBeGreaterThanOrEqual(0);
  expect(r.alpha).toBeLessThan(1);
});
test('a huge frame is clamped so nothing teleports', () => {
  expect(advance(0, 30).steps).toBe(12);
});
test('a negative frame does nothing', () => {
  expect(advance(0, -1).steps).toBe(0);
});
