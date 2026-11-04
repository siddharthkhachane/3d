export const FIXED_TRACKS = ['neon-1', 'neon-2', 'neon-3'];

const DAILY_PATTERN = /^daily-(\d{4})-(\d{2})-(\d{2})$/;

export function dailyDate(id) {
  const m = typeof id === 'string' ? DAILY_PATTERN.exec(id) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  return real ? date : null;
}

export const isValidTrackId = (id) => FIXED_TRACKS.includes(id) || dailyDate(id) !== null;

export function dailyTrackId(date = new Date()) {
  return `daily-${date.toISOString().slice(0, 10)}`;
}
