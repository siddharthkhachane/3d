import { makeShareUrl, parseShareHash } from '../src/meta/share.js';
import { encodeGhost } from '../src/sim/ghost.js';

const sampleLap = () => {
  const samples = [];
  for (let i = 0; i < 400; i++) {
    const a = i / 400 * Math.PI * 2;
    samples.push(Math.cos(a) * 255, Math.sin(a) * 255, a + Math.PI / 2);
  }
  return { timeMs: 40000, splitsMs: [5000, 10000, 15000, 20000, 25000, 30000, 35000], samples };
};

test('share round trip', () => {
  const code = encodeGhost(sampleLap());
  const url = makeShareUrl('https://x.test/game/', 'neon-2', code);
  const p = parseShareHash(new URL(url).hash);
  expect(p.trackId).toBe('neon-2');
  expect(p.ghost.timeMs).toBe(sampleLap().timeMs);
});
test('share keeps existing path and replaces any old fragment', () => {
  expect(makeShareUrl('https://x.test/a/?q=1#old', 'neon-1', 'abc')).toBe('https://x.test/a/?q=1#r=neon-1~abc');
});
test('oversized share returns null', () => {
  expect(makeShareUrl('https://x.test/', 'neon-1', 'a'.repeat(9000))).toBeNull();
});
test('a daily track id survives the round trip', () => {
  const url = makeShareUrl('https://x.test/', 'daily-2026-11-03', encodeGhost(sampleLap()));
  expect(parseShareHash(new URL(url).hash).trackId).toBe('daily-2026-11-03');
});
test.each(['', '#', '#r=', '#r=neon-1', '#r=bad-track~abc', '#r=neon-1~!!!', '#other=1', '#r=neon-1~' + 'A'.repeat(20000)])(
  'bad hash is ignored: %s', (h) => { expect(parseShareHash(h)).toBeNull(); });
