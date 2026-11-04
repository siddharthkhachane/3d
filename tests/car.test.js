import { createCar, stepCar, carSpeed } from '../src/sim/car.js';
import { DT } from '../src/sim/constants.js';

const run = (car, input, seconds, surface = 'road', events = []) => {
  for (let i = 0; i < seconds * 120; i++) stepCar(car, input, surface, DT, events);
  return events;
};
const gas = { throttle: true, brake: false, steer: 0, drift: false };

test('reaches 50 m/s within 4s and never exceeds max', () => {
  const c = createCar(0, 0, 0);
  run(c, gas, 4); expect(carSpeed(c)).toBeGreaterThanOrEqual(50);
  run(c, gas, 6); expect(carSpeed(c)).toBeLessThanOrEqual(55.01);
});
test('positive steer turns left and increases heading', () => {
  const c = createCar(0, 0, 0);
  run(c, gas, 1); run(c, { ...gas, steer: 1 }, 0.5);
  expect(c.heading).toBeGreaterThan(0);
  expect(c.x).toBeGreaterThan(0);
});
test('no steering at a standstill', () => {
  const c = createCar(0, 0, 0);
  run(c, { ...gas, throttle: false, steer: 1 }, 1);
  expect(c.heading).toBe(0);
});
test('off-road caps speed quickly', () => {
  const c = createCar(0, 0, 0);
  run(c, gas, 6); run(c, gas, 3, 'offroad');
  expect(carSpeed(c)).toBeLessThanOrEqual(24.5);
});
test('long drift gives tier 2 boost and short drift gives none', () => {
  const long = createCar(0, 0, 0), events = [];
  run(long, gas, 3);
  run(long, { ...gas, steer: 1, drift: true }, 1.8, 'road', events);
  run(long, gas, DT, 'road', events);
  expect(events.some(e => e.type === 'boost' && e.tier === 2)).toBe(true);
  expect(long.charge).toBe(0);

  const short = createCar(0, 0, 0), ev2 = [];
  run(short, gas, 3);
  run(short, { ...gas, steer: 1, drift: true }, 0.2, 'road', ev2);
  run(short, gas, DT, 'road', ev2);
  expect(ev2.some(e => e.type === 'boost')).toBe(false);
});
test('boost exceeds normal top speed, then decays back', () => {
  const c = createCar(0, 0, 0);
  run(c, gas, 6); c.boostTime = 1.5; run(c, gas, 1.4);
  expect(carSpeed(c)).toBeGreaterThan(58);
  run(c, gas, 3); expect(carSpeed(c)).toBeLessThanOrEqual(55.5);
});
test('identical input gives identical result', () => {
  const a = createCar(0, 0, 0), b = createCar(0, 0, 0);
  run(a, { ...gas, steer: 0.4 }, 5); run(b, { ...gas, steer: 0.4 }, 5);
  expect(a).toEqual(b);
});
