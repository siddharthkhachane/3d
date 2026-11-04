import { DT, GHOST_STEPS_PER_SAMPLE, GHOST_MAX_SAMPLES, GHOST_MAX_TIME_MS } from './constants.js';

const VERSION = 1;
const POS_UNIT = 0.1;                 // metres
const TURN_STEPS = 256;               // heading resolution per full turn
const MAX_ABS_POS_UNITS = 5000 / POS_UNIT;
const SAMPLE_MS = GHOST_STEPS_PER_SAMPLE * DT * 1000;
const TAU = Math.PI * 2;

export function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}

const zigzag = (n) => (n >= 0 ? n * 2 : -n * 2 - 1);
const unzigzag = (n) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);

function writeVarint(bytes, n) {
  n = Math.max(0, Math.round(n));
  while (n >= 128) { bytes.push((n % 128) | 128); n = Math.floor(n / 128); }
  bytes.push(n);
}

export function encodeGhost(ghost) {
  const bytes = [VERSION];
  writeVarint(bytes, ghost.timeMs);
  for (let i = 0; i < 7; i++) writeVarint(bytes, ghost.splitsMs[i] ?? 0);
  const count = Math.floor(ghost.samples.length / 3);
  writeVarint(bytes, count);

  let px = 0, pz = 0, ph = 0;
  for (let i = 0; i < count; i++) {
    const x = Math.round(ghost.samples[i * 3] / POS_UNIT);
    const z = Math.round(ghost.samples[i * 3 + 1] / POS_UNIT);
    const h = ((Math.round((ghost.samples[i * 3 + 2] / TAU) * TURN_STEPS) % TURN_STEPS) + TURN_STEPS) % TURN_STEPS;
    let dh = h - ph;
    if (dh >= TURN_STEPS / 2) dh -= TURN_STEPS;
    else if (dh < -TURN_STEPS / 2) dh += TURN_STEPS;
    writeVarint(bytes, zigzag(x - px));
    writeVarint(bytes, zigzag(z - pz));
    writeVarint(bytes, zigzag(i === 0 ? h : dh));
    px = x; pz = z; ph = h;
  }

  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

class Reader {
  constructor(bytes) { this.bytes = bytes; this.pos = 0; }
  varint() {
    let n = 0, mul = 1;
    for (let i = 0; i < 6; i++) {
      if (this.pos >= this.bytes.length) throw new RangeError('truncated');
      const b = this.bytes[this.pos++];
      n += (b & 127) * mul;
      if (b < 128) return n;
      mul *= 128;
    }
    throw new RangeError('varint too long');
  }
  get done() { return this.pos === this.bytes.length; }
}

export function decodeGhost(code) {
  if (typeof code !== 'string' || code.length === 0 || !/^[A-Za-z0-9_-]+$/.test(code) || code.length % 4 === 1) return null;
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    if (bytes[0] !== VERSION) return null;
    const r = new Reader(bytes);
    r.pos = 1;
    const timeMs = r.varint();
    if (!(timeMs > 0 && timeMs <= GHOST_MAX_TIME_MS)) return null;
    const splitsMs = [];
    for (let i = 0; i < 7; i++) {
      const s = r.varint();
      if (s <= 0 || s >= timeMs || (i > 0 && s <= splitsMs[i - 1])) return null;
      splitsMs.push(s);
    }
    const count = r.varint();
    if (count < 1 || count > GHOST_MAX_SAMPLES) return null;

    const samples = [];
    let x = 0, z = 0, h = 0;
    for (let i = 0; i < count; i++) {
      x += unzigzag(r.varint());
      z += unzigzag(r.varint());
      const hv = unzigzag(r.varint());
      h = i === 0 ? hv : (((h + hv) % TURN_STEPS) + TURN_STEPS) % TURN_STEPS;
      if (Math.abs(x) > MAX_ABS_POS_UNITS || Math.abs(z) > MAX_ABS_POS_UNITS || h < 0 || h >= TURN_STEPS) return null;
      samples.push(x * POS_UNIT, z * POS_UNIT, (h / TURN_STEPS) * TAU);
    }
    if (!r.done) return null;
    return { timeMs, splitsMs, samples };
  } catch {
    return null;
  }
}

export function sampleGhost(ghost, ms) {
  const n = Math.floor(ghost.samples.length / 3);
  const f = Math.min(n - 1, Math.max(0, ms / SAMPLE_MS));
  const i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), t = f - i0;
  const s = ghost.samples, a = i0 * 3, b = i1 * 3;
  return {
    x: s[a] + (s[b] - s[a]) * t,
    z: s[a + 1] + (s[b + 1] - s[a + 1]) * t,
    heading: s[a + 2] + angleDiff(s[b + 2], s[a + 2]) * t,
  };
}
