export const COLORS = [
  { id: 'cyan', points: 0, hex: 0x00e5ff },
  { id: 'magenta', points: 3, hex: 0xff2bd6 },
  { id: 'lime', points: 8, hex: 0x8dff3a },
  { id: 'gold', points: 15, hex: 0xffc83a },
  { id: 'white', points: 25, hex: 0xf4f8ff },
];

export const TRAILS = [
  { id: 'neon', points: 0 },
  { id: 'pulse', points: 5 },
  { id: 'ember', points: 12 },
  { id: 'prism', points: 22 },
];

export const isUnlocked = (item, points) => points >= item.points;

export function newlyUnlocked(before, after) {
  return [...COLORS, ...TRAILS].filter((item) => item.points > before && item.points <= after);
}
