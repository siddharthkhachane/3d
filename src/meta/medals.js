import { MEDAL_FACTORS } from '../sim/constants.js';

export const MEDAL_ORDER = ['bronze', 'silver', 'gold', 'neon'];   // worst to best
export const MEDAL_POINTS = { bronze: 1, silver: 2, gold: 3, neon: 5 };

export const medalRank = (name) => MEDAL_ORDER.indexOf(name) + 1;   // 0 when none

export function medalTimes(botMs) {
  const times = {};
  for (const name of MEDAL_ORDER) times[name] = Math.round((botMs * MEDAL_FACTORS[name]) / 100) * 100;
  return times;
}

export function medalFor(timeMs, times) {
  for (let i = MEDAL_ORDER.length - 1; i >= 0; i--) {
    if (timeMs <= times[MEDAL_ORDER[i]]) return MEDAL_ORDER[i];
  }
  return null;
}

export function nextMedal(bestMs, times) {
  const best = bestMs ?? Infinity;
  for (const name of MEDAL_ORDER) {
    if (best > times[name]) return { name, timeMs: times[name] };
  }
  return null;
}
