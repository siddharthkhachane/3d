import { COLORS, TRAILS, isUnlocked, newlyUnlocked } from '../src/meta/unlocks.js';

test('unlocks follow points, inclusive', () => {
  expect(isUnlocked(COLORS[1], 2)).toBe(false);
  expect(isUnlocked(COLORS[1], 3)).toBe(true);
});
test('the defaults are free', () => {
  expect(COLORS[0].points).toBe(0);
  expect(TRAILS[0].points).toBe(0);
});
test('newlyUnlocked reports only what crossed', () => {
  expect(newlyUnlocked(2, 5).map(i => i.id).sort()).toEqual(['magenta', 'pulse']);
  expect(newlyUnlocked(5, 5)).toEqual([]);
});
