import { medalTimes, medalFor, nextMedal } from '../src/meta/medals.js';
import { isValidTrackId, dailyTrackId } from '../src/meta/daily.js';

test('medal times scale from the bot time', () => {
  expect(medalTimes(40000)).toEqual({ bronze: 52000, silver: 46000, gold: 41200, neon: 38000 });
});
test('medalFor uses inclusive boundaries', () => {
  const t = medalTimes(40000);
  expect(medalFor(38000, t)).toBe('neon');
  expect(medalFor(38001, t)).toBe('gold');
  expect(medalFor(52001, t)).toBeNull();
});
test('nextMedal finds the next target', () => {
  const t = medalTimes(40000);
  expect(nextMedal(null, t)).toEqual({ name: 'bronze', timeMs: 52000 });
  expect(nextMedal(45000, t)).toEqual({ name: 'gold', timeMs: 41200 });
  expect(nextMedal(30000, t)).toBeNull();
});
test('track ids are validated strictly', () => {
  expect(isValidTrackId('neon-2')).toBe(true);
  expect(isValidTrackId('daily-2026-11-03')).toBe(true);
  for (const bad of ['neon-9', 'daily-x', '<script>', '', 'daily-2026-11-03x', 'daily-2026-13-45', null, 5]) {
    expect(isValidTrackId(bad)).toBe(false);
  }
});
test('daily id uses the UTC date', () => {
  expect(dailyTrackId(new Date('2026-11-03T23:30:00-05:00'))).toBe('daily-2026-11-04');
});
