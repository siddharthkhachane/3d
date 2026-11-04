import { hashString, mulberry32 } from '../src/sim/rng.js';

test('hashString is stable and distinguishes ids', () => {
  expect(hashString('neon-1')).toBe(hashString('neon-1'));
  expect(hashString('neon-1')).not.toBe(hashString('neon-2'));
});
test('mulberry32 repeats for a seed and stays in range', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const v = a();
    expect(v).toBe(b());
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});
