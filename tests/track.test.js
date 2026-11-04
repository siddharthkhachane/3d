import { generateTrack, queryTrack, minSectionGap, fallbackControlPoints, buildTrackFromPoints, isValidLayout } from '../src/sim/track.js';

const ids = Array.from({ length: 50 }, (_, i) => `test-${i}`);

test('same id gives identical track', () => {
  expect(generateTrack('neon-1').xs).toEqual(generateTrack('neon-1').xs);
});
test('tracks meet layout rules', () => {
  for (const id of ids) {
    const t = generateTrack(id);
    expect(t.count).toBe(800);
    expect(Math.abs(t.length - 1600)).toBeLessThan(5);
    expect(Math.max(...t.curvature.map(Math.abs))).toBeLessThanOrEqual(1 / 28 + 1e-6);
    expect(minSectionGap(t)).toBeGreaterThanOrEqual(30);
    expect(t.pylons.length).toBeLessThanOrEqual(8);
  }
});
test('start is on a gentle section', () => {
  for (const id of ids) {
    expect(Math.abs(generateTrack(id).curvature[0])).toBeLessThan(1 / 100);
  }
});
test('fallback ellipse is valid', () => {
  const t = buildTrackFromPoints('fb', fallbackControlPoints());
  expect(isValidLayout(t)).toBe(true);
});
test('query reports lateral with left positive', () => {
  const t = generateTrack('neon-1'), i = 100;
  const q = queryTrack(t, t.xs[i] + t.tzs[i] * 5, t.zs[i] - t.txs[i] * 5, i);
  expect(q.lateral).toBeCloseTo(5, 1);
  expect(q.s).toBeCloseTo(i * t.spacing, 0);
});
test('query wraps across the seam', () => {
  const t = generateTrack('neon-1');
  expect(queryTrack(t, t.xs[1], t.zs[1], t.count - 1).index).toBe(1);
});
