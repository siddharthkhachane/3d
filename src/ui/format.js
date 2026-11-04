export function formatTime(ms) {
  const cs = Math.floor(Math.max(0, ms) / 10);
  const minutes = Math.floor(cs / 6000);
  const seconds = Math.floor(cs / 100) % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

export function formatDelta(ms) {
  const cs = Math.round(ms / 10);
  return `${cs < 0 ? '-' : '+'}${(Math.abs(cs) / 100).toFixed(2)}`;
}
