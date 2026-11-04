import { generateTrack } from '../src/sim/track.js';
import { measureBotLapMs } from '../src/sim/bot.js';

test('bot lap is playable on many seeds', () => {
  for (let i = 0; i < 20; i++) {
    const ms = measureBotLapMs(generateTrack(`seed-${i}`));
    expect(ms).not.toBeNull();
    expect(ms).toBeGreaterThanOrEqual(32000);
    expect(ms).toBeLessThanOrEqual(50000);
  }
});
