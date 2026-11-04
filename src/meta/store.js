import { MEDAL_POINTS, medalRank } from './medals.js';
import { dailyDate } from './daily.js';
import { newlyUnlocked } from './unlocks.js';

const SAVE_KEY = 'neonTT.v1';
const VERSION = 1;
const DAILY_GHOST_DAYS = 14;
const DAY_MS = 86400000;
const DEFAULT_SETTINGS = { color: 'cyan', trail: 'neon', muted: false };

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function cleanTracks(raw) {
  const tracks = {};
  for (const [id, t] of Object.entries(raw)) {
    if (!isObject(t) || !Number.isFinite(t.bestMs) || t.bestMs <= 0) continue;
    tracks[id] = {
      bestMs: Math.round(t.bestMs),
      ghost: typeof t.ghost === 'string' ? t.ghost : null,
      medal: medalRank(t.medal) > 0 ? t.medal : null,
    };
  }
  return tracks;
}

export function createStore(storage) {
  let data = { version: VERSION, tracks: {}, settings: { ...DEFAULT_SETTINGS } };
  let readOnly = false;   // a save from a newer version is kept untouched

  try {
    const text = storage?.getItem(SAVE_KEY);
    if (text) {
      const parsed = JSON.parse(text);
      if (isObject(parsed) && parsed.version > VERSION) readOnly = true;
      else if (isObject(parsed) && parsed.version === VERSION && isObject(parsed.tracks)) {
        data.tracks = cleanTracks(parsed.tracks);
        if (isObject(parsed.settings)) data.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
      }
    }
  } catch { /* unreadable storage: start fresh in memory */ }

  function persist() {
    if (readOnly || !storage) return;
    try { storage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* full or blocked: keep playing */ }
  }

  return {
    getBest(id) {
      const t = data.tracks[id];
      return t ? { timeMs: t.bestMs, ghostCode: t.ghost } : null;
    },
    getMedal(id) { return data.tracks[id]?.medal ?? null; },
    recordLap(id, { timeMs, ghostCode, medal }) {
      const pointsBefore = this.totalPoints();
      const t = data.tracks[id];
      if (!t) {
        data.tracks[id] = { bestMs: timeMs, ghost: ghostCode ?? null, medal: medal ?? null };
      } else {
        if (timeMs < t.bestMs) { t.bestMs = timeMs; t.ghost = ghostCode ?? null; }
        if (medalRank(medal) > medalRank(t.medal)) t.medal = medal;
      }
      persist();
      return { unlockedNow: newlyUnlocked(pointsBefore, this.totalPoints()) };
    },
    getSettings() { return { ...data.settings }; },
    setSettings(partial) {
      data.settings = { ...data.settings, ...partial };
      persist();
    },
    totalPoints() {
      let sum = 0;
      for (const t of Object.values(data.tracks)) sum += MEDAL_POINTS[t.medal] ?? 0;
      return sum;
    },
    pruneDailies(todayId) {
      const today = dailyDate(todayId);
      if (!today) return;
      let changed = false;
      for (const [id, t] of Object.entries(data.tracks)) {
        const date = dailyDate(id);
        if (date && t.ghost !== null && (today - date) / DAY_MS > DAILY_GHOST_DAYS) { t.ghost = null; changed = true; }
      }
      if (changed) persist();
    },
  };
}
