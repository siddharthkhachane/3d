import { DT } from './sim/constants.js';

const MAX_FRAME_SECONDS = 0.1;
const EPSILON = 1e-9;

export function advance(accumulator, frameSeconds) {
  const frame = Math.min(MAX_FRAME_SECONDS, Math.max(0, frameSeconds));
  let acc = accumulator + frame;
  const steps = Math.floor(acc / DT + EPSILON);
  acc = Math.max(0, acc - steps * DT);
  return { steps, accumulator: acc, alpha: Math.min(acc / DT, 0.999999) };
}
