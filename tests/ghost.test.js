import { encodeGhost, decodeGhost, sampleGhost, angleDiff } from '../src/sim/ghost.js';

const lap = () => {
  const samples = [];
  for (let i = 0; i < 400; i++) {
    const a = i / 400 * Math.PI * 2;
    samples.push(Math.cos(a) * 255 + Math.sin(a * 5) * 30, Math.sin(a) * 255, a + Math.PI / 2);
  }
  return { timeMs: 40000, splitsMs: [5000, 10000, 15000, 20000, 25000, 30000, 35000], samples };
};

test('round trip stays within quantization', () => {
  const g = lap(), d = decodeGhost(encodeGhost(g));
  expect(d.timeMs).toBe(40000);
  expect(d.splitsMs).toEqual(g.splitsMs);
  expect(d.samples.length).toBe(g.samples.length);
  for (let i = 0; i < 1200; i += 3) {
    expect(Math.abs(d.samples[i] - g.samples[i])).toBeLessThanOrEqual(0.051);
    expect(Math.abs(d.samples[i + 1] - g.samples[i + 1])).toBeLessThanOrEqual(0.051);
    expect(Math.abs(angleDiff(d.samples[i + 2], g.samples[i + 2]))).toBeLessThanOrEqual(0.0125);
  }
});
test('a 40 second lap encodes in under 3000 characters', () => {
  expect(encodeGhost(lap()).length).toBeLessThan(3000);
});
test.each(['', '!!!', 'AAAA', 'not a ghost'])('rejects junk: %s', s => {
  expect(decodeGhost(s)).toBeNull();
});
test('rejects truncated, extended and out-of-range data', () => {
  const code = encodeGhost(lap());
  expect(decodeGhost(code.slice(0, -20))).toBeNull();
  expect(decodeGhost(code + 'AAAA')).toBeNull();
  expect(decodeGhost(encodeGhost({ ...lap(), timeMs: 400000 }))).toBeNull();
  expect(decodeGhost(encodeGhost({ ...lap(), splitsMs: [9, 8, 7, 6, 5, 4, 3] }))).toBeNull();
});
test('sampling interpolates and clamps', () => {
  const g = { timeMs: 200, splitsMs: [], samples: [0, 0, 0, 10, 0, 0, 20, 0, 0] };
  expect(sampleGhost(g, 50).x).toBeCloseTo(5);
  expect(sampleGhost(g, -10).x).toBe(0);
  expect(sampleGhost(g, 9999).x).toBe(20);
});
test('heading interpolation takes the short way', () => {
  const g = { timeMs: 100, splitsMs: [], samples: [0, 0, 3.1, 0, 0, -3.1] };
  expect(Math.abs(sampleGhost(g, 50).heading)).toBeGreaterThan(3);
});
