import { formatTime, formatDelta } from '../src/ui/format.js';

test('formatTime', () => {
  expect(formatTime(42180)).toBe('0:42.18');
  expect(formatTime(61005)).toBe('1:01.00');
  expect(formatTime(0)).toBe('0:00.00');
});
test('formatDelta', () => {
  expect(formatDelta(-240)).toBe('-0.24');
  expect(formatDelta(240)).toBe('+0.24');
  expect(formatDelta(0)).toBe('+0.00');
});
