import {
  TRACK_LENGTH, TRACK_SAMPLES, CONTROL_POINTS, ROAD_HALF_WIDTH,
  MIN_CORNER_RADIUS, MIN_SECTION_GAP, MAX_PYLONS, PYLON_MIN_CURVATURE,
  PYLON_MIN_SPACING, PYLON_START_CLEARANCE, PYLON_INSET,
} from './constants.js';
import { hashString, mulberry32 } from './rng.js';

const TAU = Math.PI * 2;
const DENSE_PER_SEGMENT = 100;
const START_WINDOW = 30;            // samples (60 m)
const START_MAX_CURVATURE = 1 / 120;
const MAX_ATTEMPTS = 200;

const wrapAngle = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a <= -Math.PI) a += TAU;
  return a;
};

function catmullRomClosed(pts, perSegment) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

function closedLength(poly) {
  let len = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len;
}

function resample(poly, count) {
  const n = poly.length, cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const total = cum[n], xs = new Float64Array(count), zs = new Float64Array(count);
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const d = (i / count) * total;
    while (cum[seg + 1] < d) seg++;
    const a = poly[seg], b = poly[(seg + 1) % n];
    const u = (d - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
    xs[i] = a[0] + (b[0] - a[0]) * u;
    zs[i] = a[1] + (b[1] - a[1]) * u;
  }
  return { xs, zs };
}

function rotate(arr, shift) {
  const n = arr.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = arr[(i + shift) % n];
  return out;
}

export function fallbackControlPoints() {
  const pts = [];
  for (let i = 0; i < CONTROL_POINTS; i++) {
    const a = (i / CONTROL_POINTS) * TAU;
    const w = 1 + 0.08 * Math.sin(3 * a);
    pts.push([280 * Math.cos(a) * w, 190 * Math.sin(a) * w]);
  }
  return pts;
}

export function buildTrackFromPoints(id, controlPoints) {
  const count = TRACK_SAMPLES;
  const raw = catmullRomClosed(controlPoints, DENSE_PER_SEGMENT);
  const k = TRACK_LENGTH / closedLength(raw);
  const scaled = controlPoints.map(([x, z]) => [x * k, z * k]);
  const dense = catmullRomClosed(scaled, DENSE_PER_SEGMENT);
  let { xs, zs } = resample(dense, count);
  const spacing = TRACK_LENGTH / count;

  const heading = new Float64Array(count);
  const curvature = new Float64Array(count);
  const txs = new Float64Array(count), tzs = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const a = (i + count - 1) % count, b = (i + 1) % count;
    const dx = xs[b] - xs[a], dz = zs[b] - zs[a], d = Math.hypot(dx, dz) || 1;
    txs[i] = dx / d; tzs[i] = dz / d;
    heading[i] = Math.atan2(txs[i], tzs[i]);
  }
  const rawK = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const a = (i + count - 1) % count, b = (i + 1) % count;
    rawK[i] = wrapAngle(heading[b] - heading[a]) / (2 * spacing);
  }
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let o = -2; o <= 2; o++) sum += rawK[(i + o + count) % count];
    curvature[i] = sum / 5;
  }

  // Rotate so index 0 sits in the gentlest 60 m window.
  let bestStart = 0, bestMax = Infinity;
  for (let s = 0; s < count; s++) {
    let m = 0;
    for (let o = 0; o < START_WINDOW; o++) m = Math.max(m, Math.abs(curvature[(s + o) % count]));
    if (m < bestMax) { bestMax = m; bestStart = s; }
  }
  const shift = (bestStart + START_WINDOW / 2) % count;
  xs = rotate(xs, shift);
  zs = rotate(zs, shift);

  const track = {
    id, length: TRACK_LENGTH, spacing, count, xs, zs,
    txs: rotate(txs, shift), tzs: rotate(tzs, shift),
    curvature: rotate(curvature, shift), pylons: [],
  };
  track.pylons = choosePylons(track);
  return track;
}

function arcDistance(track, i, j) {
  const d = Math.abs(i - j);
  return Math.min(d, track.count - d) * track.spacing;
}

function choosePylons(track) {
  const { count, curvature } = track;
  const peakRange = 10;
  const peaks = [];
  for (let i = 0; i < count; i++) {
    const c = Math.abs(curvature[i]);
    if (c < PYLON_MIN_CURVATURE) continue;
    let isPeak = true;
    for (let o = -peakRange; o <= peakRange && isPeak; o++) {
      if (o !== 0 && Math.abs(curvature[(i + o + count) % count]) > c) isPeak = false;
    }
    if (isPeak) peaks.push(i);
  }
  peaks.sort((a, b) => Math.abs(curvature[b]) - Math.abs(curvature[a]));
  const chosen = [];
  for (const i of peaks) {
    if (chosen.length >= MAX_PYLONS) break;
    if (arcDistance(track, i, 0) < PYLON_START_CLEARANCE) continue;
    if (chosen.some((j) => arcDistance(track, i, j) < PYLON_MIN_SPACING)) continue;
    chosen.push(i);
  }
  return chosen.sort((a, b) => a - b).map((index) => {
    const side = curvature[index] > 0 ? 1 : -1;
    const off = side * (ROAD_HALF_WIDTH - PYLON_INSET);
    return {
      index, side,
      x: track.xs[index] + track.tzs[index] * off,
      z: track.zs[index] - track.txs[index] * off,
    };
  });
}

export function minSectionGap(track) {
  const { count, xs, zs, spacing } = track;
  let best = Infinity;
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const d = Math.min(j - i, count - (j - i)) * spacing;
      if (d <= 100) continue;
      const dx = xs[i] - xs[j], dz = zs[i] - zs[j];
      const sq = dx * dx + dz * dz;
      if (sq < best) best = sq;
    }
  }
  return Math.sqrt(best);
}

export function isValidLayout(track) {
  let maxK = 0;
  for (let i = 0; i < track.count; i++) maxK = Math.max(maxK, Math.abs(track.curvature[i]));
  if (maxK > 1 / MIN_CORNER_RADIUS) return false;
  if (Math.abs(track.curvature[0]) >= 1 / 100) return false;
  return minSectionGap(track) >= MIN_SECTION_GAP;
}

export function generateTrack(id) {
  const rng = mulberry32(hashString(id));
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const step = TAU / CONTROL_POINTS, pts = [];
    for (let i = 0; i < CONTROL_POINTS; i++) {
      const a = i * step + (rng() - 0.5) * 0.5 * step;
      const r = 255 * (0.55 + 0.70 * rng());
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const track = buildTrackFromPoints(id, pts);
    // Cheap start-gentleness check first, then the expensive gap check.
    if (isValidLayout(track)) return track;
  }
  return buildTrackFromPoints(id, fallbackControlPoints());
}

export function queryTrack(track, x, z, hintIndex, window = 40) {
  const { count, spacing } = track;
  let best = 0, bestSq = Infinity;
  for (let o = -window; o <= window; o++) {
    const i = (((hintIndex + o) % count) + count) % count;
    const dx = x - track.xs[i], dz = z - track.zs[i];
    const sq = dx * dx + dz * dz;
    if (sq < bestSq) { bestSq = sq; best = i; }
  }
  const tx = track.txs[best], tz = track.tzs[best];
  const nx = tz, nz = -tx;
  const dx = x - track.xs[best], dz = z - track.zs[best];
  return {
    index: best,
    s: best * spacing + (dx * tx + dz * tz),
    lateral: dx * nx + dz * nz,
    tx, tz, nx, nz,
  };
}
