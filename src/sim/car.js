import {
  MAX_SPEED, BOOST_MAX_SPEED, OFFROAD_MAX_SPEED, REVERSE_MAX_SPEED,
  ACCEL, BOOST_ACCEL_MULT, BRAKE, REVERSE_ACCEL, COAST_DRAG, OVERSPEED_DECAY,
  STEER_RATE_LOW, STEER_RATE_HIGH, STEER_RESPONSE, FULL_STEER_SPEED,
  GRIP_ROAD, GRIP_DRIFT, GRIP_OFFROAD,
  DRIFT_ENTER_SPEED, DRIFT_EXIT_SPEED, DRIFT_ENTER_STEER, DRIFT_STEER_MULT, DRIFT_MIN_SLIP,
  CHARGE_TIER1, CHARGE_TIER2, BOOST_TIER1, BOOST_TIER2, BOOST_CAP,
} from './constants.js';

export function createCar(x, z, heading) {
  const car = {};
  resetCar(Object.assign(car, { x, z, heading }), x, z, heading);
  return car;
}

export function resetCar(car, x, z, heading) {
  car.x = x; car.z = z; car.heading = heading;
  car.vx = 0; car.vz = 0; car.steer = 0;
  car.drifting = false; car.charge = 0; car.boostTime = 0;
}

export const carSpeed = (car) => Math.hypot(car.vx, car.vz);

export function stepCar(car, input, surface, dt, events) {
  const offroad = surface === 'offroad';
  const target = Math.max(-1, Math.min(1, input.steer));
  car.steer += (target - car.steer) * (1 - Math.exp(-STEER_RESPONSE * dt));

  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const lx = Math.cos(car.heading), lz = -Math.sin(car.heading);
  let vF = car.vx * fx + car.vz * fz;
  let vL = car.vx * lx + car.vz * lz;
  const speed = Math.hypot(car.vx, car.vz);

  if (!car.drifting) {
    if (input.drift && Math.abs(car.steer) > DRIFT_ENTER_STEER && speed > DRIFT_ENTER_SPEED) {
      car.drifting = true;
      events?.push({ type: 'driftStart' });
    }
  } else if (!input.drift || speed < DRIFT_EXIT_SPEED) {
    car.drifting = false;
    events?.push({ type: 'driftEnd' });
    const tier = car.charge >= CHARGE_TIER2 ? 2 : car.charge >= CHARGE_TIER1 ? 1 : 0;
    if (tier > 0) {
      car.boostTime = Math.min(BOOST_CAP, car.boostTime + (tier === 2 ? BOOST_TIER2 : BOOST_TIER1));
      events?.push({ type: 'boost', tier });
    }
    car.charge = 0;
  }
  if (car.drifting && Math.abs(Math.atan2(vL, Math.abs(vF))) > DRIFT_MIN_SLIP) car.charge += dt;

  const boosting = car.boostTime > 0;
  const top = offroad ? OFFROAD_MAX_SPEED : boosting ? BOOST_MAX_SPEED : MAX_SPEED;

  if (input.brake) {
    if (vF > 0.5) vF -= BRAKE * dt;
    else vF = Math.max(-REVERSE_MAX_SPEED, vF - REVERSE_ACCEL * dt);
  } else if (input.throttle) {
    if (vF < top) {
      const x = Math.max(0, vF) / top;
      vF += ACCEL * (boosting ? BOOST_ACCEL_MULT : 1) * (1 - x * x) * dt;
    }
  } else if (vF > 0) {
    vF = Math.max(0, vF - COAST_DRAG * dt);
  } else if (vF < 0) {
    vF = Math.min(0, vF + COAST_DRAG * dt);
  }
  if (vF > top) vF = Math.max(top, vF - OVERSPEED_DECAY * dt);

  const grip = car.drifting ? GRIP_DRIFT : offroad ? GRIP_OFFROAD : GRIP_ROAD;
  vL *= Math.exp(-grip * dt);

  car.vx = vF * fx + vL * lx;
  car.vz = vF * fz + vL * lz;

  const speedT = Math.min(1, Math.abs(vF) / MAX_SPEED);
  let rate = (STEER_RATE_LOW + (STEER_RATE_HIGH - STEER_RATE_LOW) * speedT) * Math.min(1, Math.abs(vF) / FULL_STEER_SPEED);
  if (car.drifting) rate *= DRIFT_STEER_MULT;
  car.heading += car.steer * rate * (vF < 0 ? -1 : 1) * dt;

  car.x += car.vx * dt;
  car.z += car.vz * dt;
  car.boostTime = Math.max(0, car.boostTime - dt);
}
