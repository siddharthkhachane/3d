# Neon Time Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight browser time-trial racer whose short laps, instant restarts, ghosts and medals make people want one more go.

**Architecture:** A pure, deterministic simulation (`src/sim`) and progression layer (`src/meta`) run at a fixed 120 Hz and are tested headlessly in Node. `src/session.js` joins them into one playable run. Three.js rendering, Web Audio and the DOM HUD only read session state and events, and never change gameplay.

**Tech Stack:** Plain JavaScript ES modules, three.js, Vite, Vitest, Web Audio API, HTML/CSS. No React, no TypeScript, no physics library, no backend, no asset files.

**Spec:** Embedded in the "Product Spec" section below. This file is the only document an executor needs.

## Product Spec

**Why it exists:** Fun, quick to load, and hard to put down because the player can see themselves improving.

**The loop:** Pick a track and drive immediately. Each lap takes 30-45 seconds. One key restarts instantly. A ghost of the best lap shows where time was lost, checkpoint splits show the gain or loss, and medals give the next target.

**In scope**
- Three fixed tracks (`neon-1`, `neon-2`, `neon-3`) and one daily track, all generated from a seed.
- Arcade driving with a drift that charges a speed boost.
- Apex pylons: skim one for bonus boost, hit one and lose speed.
- Off-road slowdown and solid barriers.
- Best-lap ghost, checkpoint splits, medals, cosmetic unlocks.
- Share links that let a friend race your ghost, with no server.
- Neon night look, speed effects, synthesized audio.
- Keyboard and basic touch controls.

**Out of scope:** AI opponents, multiplayer, servers, accounts, leaderboards, imported models, gamepad, car-to-car collisions.

**Anti-goals: never add these**
- Streak penalties, countdowns to a reset, notifications, fake scarcity, or anything else that pressures people to return.
- Anything between a keypress and driving: no countdown, loading screen or confirmation on restart.
- A post-lap screen that interrupts driving.

**Decision changed since the chat discussion:** The near-miss bonus uses pylons, not barriers. Barriers sit beyond the off-road strip, so rewarding barrier skims would reward being slow.

## Global Constraints

- Runtime dependency: `three` only. Dev dependencies: `vite`, `vitest` only.
- `src/sim` and `src/meta` must not import `three` or touch `window`, `document` or `localStorage` directly.
- Never use `Math.random()` or wall-clock time in `src/sim`.
- Fixed step: `DT = 1/120`. Units are metres, seconds and radians. Stored times are integer milliseconds.
- World plane is XZ with Y up. Heading `h` gives forward `(sin h, cos h)` and left `(cos h, -sin h)`. Positive steer and positive lateral both mean left.
- All tuning numbers live in `src/sim/constants.js`.
- Build output: at most 300 KB gzipped JS, no binary assets.
- Runtime targets: 60 fps on an integrated GPU, at most 60 draw calls.
- Respect `prefers-reduced-motion`: no camera shake, no speed lines.
- Save key: `neonTT.v1`. Daily tracks use the UTC date.

## Review Focus

1. **Tab hidden or long frame:** The car must not teleport and the timer must not jump. Pinned in Task 5.
2. **Corrupt, full or blocked `localStorage`:** The game still runs and simply does not persist. Pinned in Task 8.
3. **Malformed or oversized share link:** Ignored with a small notice, no crash. Pinned in Tasks 6 and 10.
4. **Reversing over the start line or checkpoints:** Never counts a lap or a checkpoint twice. Pinned in Task 4.
5. **Restart mid-drift, mid-boost or mid-lap:** Nothing leaks into the next run. Pinned in Tasks 4 and 7.

## Rules for the Executor

- Do not change a decision in this plan to make a task easier. If one proves wrong, stop and report it.
- Tuning values may change in `constants.js` only, and the tests must still pass.
- **Task 5 ends in a human gate.** Stop and wait for the person to drive the car. You can't judge driving feel, and Tasks 6-11 depend on it.
- Run `npm test` before every commit. Each commit message ends with the repository's required attribution line, if one is in force.
- Work on branch `feat/time-trial`, created after the first commit if `main` has no commits yet.

## File Structure

```text
index.html                 Canvas, HUD and menu containers
vite.config.js             base: './', vitest node environment
src/main.js                Bootstrap and wiring only
src/loop.js                Fixed-step accumulator (pure)
src/input.js               Keyboard and touch to input object
src/session.js             One playable run: sim, ghost, best, medals
src/sim/constants.js       All tuning numbers
src/sim/rng.js             hashString, mulberry32
src/sim/track.js           Track generation and queries
src/sim/car.js             stepCar
src/sim/sim.js             createSim, stepSim, resetSim
src/sim/bot.js             Autopilot for calibration and medal times
src/sim/ghost.js           Recorder, sampling, encode, decode
src/meta/medals.js         Medal times and points
src/meta/store.js          Save data with safe storage
src/meta/unlocks.js        Cosmetics from points
src/meta/share.js          Share link build and parse
src/meta/daily.js          Track ids and daily id
src/render/renderer.js     Renderer, bloom, quality step-down
src/render/world.js        Road, barriers, gates, pylons, sky
src/render/carMesh.js      Code-built car, also used for ghosts
src/render/chaseCamera.js  Follow camera
src/render/fx.js           Trails, speed lines, boost flash
src/audio/audio.js         Web Audio engine and cues
src/ui/format.js           Time formatting (pure)
src/ui/hud.js              In-race DOM HUD
src/ui/menu.js             Track select, pause, cosmetics, share
tests/*.test.js            One test file per pure module
```

---

### Task 1: Project scaffold, constants and RNG

**Files:**
- Create: `package.json`, `vite.config.js`, `.gitignore`, `index.html`, `src/sim/constants.js`, `src/sim/rng.js`
- Test: `tests/rng.test.js`

**Interfaces:**
- Produces: `hashString(str: string) -> uint32`, `mulberry32(seed: uint32) -> () => number in [0,1)`, and the constants below.

- [ ] **Step 1: Scaffold**

Run `npm init -y`, `npm i three`, `npm i -D vite vitest`. Commit the lockfile. Scripts: `dev` = `vite`, `build` = `vite build`, `preview` = `vite preview`, `test` = `vitest run`. Add `"type": "module"`. `.gitignore`: `node_modules`, `dist`. `vite.config.js` sets `base: './'` and `test: { globals: true, environment: 'node' }`. Test snippets in this plan omit imports of the module under test; add them.

- [ ] **Step 2: Create `src/sim/constants.js` with these exact starting values**

```js
export const DT = 1 / 120;
// Track
export const TRACK_LENGTH = 1600, TRACK_SAMPLES = 800, CONTROL_POINTS = 12;
export const ROAD_HALF_WIDTH = 7, BARRIER_LATERAL = 12;
export const MIN_CORNER_RADIUS = 28, MIN_SECTION_GAP = 30, CHECKPOINTS = 8;
export const START_OFFSET = 15;
// Car
export const MAX_SPEED = 55, BOOST_MAX_SPEED = 74, OFFROAD_MAX_SPEED = 24, REVERSE_MAX_SPEED = 12;
export const ACCEL = 30, BOOST_ACCEL_MULT = 1.8, BRAKE = 60, REVERSE_ACCEL = 15;
export const COAST_DRAG = 6, OVERSPEED_DECAY = 35;
export const STEER_RATE_LOW = 2.6, STEER_RATE_HIGH = 1.25, STEER_RESPONSE = 9, FULL_STEER_SPEED = 8;
export const GRIP_ROAD = 10, GRIP_DRIFT = 3, GRIP_OFFROAD = 4;
// Drift
export const DRIFT_ENTER_SPEED = 18, DRIFT_EXIT_SPEED = 12, DRIFT_ENTER_STEER = 0.3;
export const DRIFT_STEER_MULT = 1.3, DRIFT_MIN_SLIP = 0.12;
export const CHARGE_TIER1 = 0.55, CHARGE_TIER2 = 1.3;
export const BOOST_TIER1 = 0.6, BOOST_TIER2 = 1.2, BOOST_CAP = 2.0;
// Pylons
export const MAX_PYLONS = 8, PYLON_MIN_CURVATURE = 1 / 70, PYLON_MIN_SPACING = 100, PYLON_START_CLEARANCE = 60;
export const PYLON_INSET = 1.2, PYLON_HIT_DIST = 1.6, PYLON_NEAR_DIST = 3.5, PYLON_CLEAR_DIST = 6;
export const NEAR_MISS_MIN_SPEED = 25, NEAR_MISS_BOOST = 0.35, PYLON_HIT_SPEED_MULT = 0.75;
// Barrier
export const BARRIER_MAX_SPEED_LOSS = 0.25, BARRIER_EVENT_MIN_IMPACT = 2;
// Ghost
export const GHOST_STEPS_PER_SAMPLE = 12, GHOST_MAX_SAMPLES = 1800, GHOST_MAX_TIME_MS = 300000;
// Medals: multiples of the bot's lap time
export const MEDAL_FACTORS = { bronze: 1.30, silver: 1.15, gold: 1.03, neon: 0.95 };
```

- [ ] **Step 3: Write the failing test `tests/rng.test.js`**

```js
test('hashString is stable and distinguishes ids', () => {
  expect(hashString('neon-1')).toBe(hashString('neon-1'));
  expect(hashString('neon-1')).not.toBe(hashString('neon-2'));
});
test('mulberry32 repeats for a seed and stays in range', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const v = a();
    expect(v).toBe(b());
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});
```

- [ ] **Step 4: Run `npm test`**

Expected: FAIL, module not found.

- [ ] **Step 5: Implement `src/sim/rng.js`**

`hashString` is 32-bit FNV-1a. `mulberry32` is the standard algorithm.

- [ ] **Step 6: Create `index.html`**

Contains `<canvas id="game">`, `<div id="hud">`, `<div id="menu">`, `<script type="module" src="/src/main.js">`, and inline CSS making the canvas fill the window on a near-black `#05060f` background. Create an empty `src/main.js`.

- [ ] **Step 7: Verify**

Run `npm test` (PASS) and `npm run build` (succeeds).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold project with constants and seeded rng"
```

---

### Task 2: Track generation and queries

**Files:**
- Create: `src/sim/track.js`
- Test: `tests/track.test.js`

**Interfaces:**
- Consumes: `hashString`, `mulberry32`, constants.
- Produces:
  - `generateTrack(id: string) -> Track`
  - `queryTrack(track, x, z, hintIndex, window = 40) -> { index, s, lateral, tx, tz, nx, nz }`
  - `Track = { id, length, spacing, count, xs, zs, txs, tzs, curvature, pylons }`, with `Float64Array` samples.
  - Pylon: `{ index, side, x, z }`.
  - Normal is left of travel: `(nx, nz) = (tz, -tx)`. Signed `curvature` is positive when turning left. `side` is `+1` for a left-hand inside edge, `-1` for right.

- [ ] **Step 1: Write the failing tests**

```js
const ids = Array.from({ length: 50 }, (_, i) => `test-${i}`);
test('same id gives identical track', () => {
  expect(generateTrack('neon-1').xs).toEqual(generateTrack('neon-1').xs);
});
test('tracks meet layout rules', () => {
  for (const id of ids) {
    const t = generateTrack(id);
    expect(t.count).toBe(800);
    expect(Math.abs(t.length - 1600)).toBeLessThan(5);
    expect(Math.max(...t.curvature.map(Math.abs))).toBeLessThanOrEqual(1 / 28 + 1e-6);
    expect(minSectionGap(t)).toBeGreaterThanOrEqual(30);
    expect(t.pylons.length).toBeLessThanOrEqual(8);
  }
});
test('start is on a gentle section', () => {
  const t = generateTrack('neon-1');
  expect(Math.abs(t.curvature[0])).toBeLessThan(1 / 100);
});
test('query reports lateral with left positive', () => {
  const t = generateTrack('neon-1'), i = 100;
  const q = queryTrack(t, t.xs[i] + t.tzs[i] * 5, t.zs[i] - t.txs[i] * 5, i);
  expect(q.lateral).toBeCloseTo(5, 1);
  expect(q.s).toBeCloseTo(i * t.spacing, 0);
});
test('query wraps across the seam', () => {
  const t = generateTrack('neon-1');
  expect(queryTrack(t, t.xs[1], t.zs[1], t.count - 1).index).toBe(1);
});
```

`minSectionGap(t)` is a test helper: the smallest distance between two samples more than 100 m apart along the track. Export it from `track.js` because the generator also needs it.

- [ ] **Step 2: Run `npm test`**

Expected: FAIL, `generateTrack` not defined.

- [ ] **Step 3: Implement `generateTrack`**

Use this algorithm:
1. Seed the RNG from `hashString(id)`. Loop up to 200 attempts, consuming the RNG continuously.
2. Build `CONTROL_POINTS` points at evenly spaced angles, each jittered by up to ±0.25 of the step. Radius is `255 * (0.55 + 0.70 * rng())`.
3. Sample a closed Catmull-Rom spline densely (at least 40 points per segment) and measure its length. Scale the control points by `TRACK_LENGTH / length`.
4. Resample to `TRACK_SAMPLES` points evenly by arc length.
5. Compute tangents and signed curvature using central differences, then smooth curvature with a 5-sample box filter.
6. Reject the attempt if absolute curvature exceeds `1/MIN_CORNER_RADIUS` or `minSectionGap < MIN_SECTION_GAP`.
7. Rotate the arrays so index 0 is the centre of the lowest-curvature 60 m window.
8. Choose pylons: peaks of absolute curvature above `PYLON_MIN_CURVATURE`, strongest first, at least `PYLON_MIN_SPACING` apart and `PYLON_START_CLEARANCE` from the start, up to `MAX_PYLONS`. Position each at lateral `side * (ROAD_HALF_WIDTH - PYLON_INSET)`.
9. If all attempts fail, use a gently wobbling ellipse scaled to length, so the function always returns a valid track. Add `test('fallback ellipse is valid')` by exporting `fallbackControlPoints()`.

- [ ] **Step 4: Implement `queryTrack`**

Find the nearest sample within `±window` of `hintIndex`, wrapping at the seam. Project the position onto the adjoining segment to get a continuous `s`. `lateral` is the dot product of the offset from the centreline and the normal.

- [ ] **Step 5: Run `npm test`**

Expected: PASS. If generation rejects too often, widen the radius range in the generator only. Don't relax the layout rules.

- [ ] **Step 6: Commit**

```bash
git add src/sim/track.js tests/track.test.js
git commit -m "feat: add seeded closed-loop track generation and queries"
```

---

### Task 3: Car physics and drift boost

**Files:**
- Create: `src/sim/car.js`
- Test: `tests/car.test.js`

**Interfaces:**
- Consumes: constants.
- Produces:
  - `createCar(x, z, heading) -> Car`
  - `Car = { x, z, heading, vx, vz, steer, drifting, charge, boostTime }`
  - `resetCar(car, x, z, heading)`
  - `carSpeed(car) -> number`
  - `stepCar(car, input, surface, dt, events)`
  - `input = { throttle: bool, brake: bool, steer: -1..1, drift: bool }`, `surface = 'road' | 'offroad'`
  - Events pushed: `{ type: 'driftStart' }`, `{ type: 'driftEnd' }`, `{ type: 'boost', tier: 1 | 2 }`.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run `npm test`**

Expected: FAIL, `createCar` not defined.

- [ ] **Step 3: Implement `stepCar` in this order**

1. Move `car.steer` toward `input.steer` at rate `STEER_RESPONSE`.
2. Compute `vF` and `vL`, the velocity along forward and left.
3. Drift state: enter when `input.drift`, `|steer| > DRIFT_ENTER_STEER` and `speed > DRIFT_ENTER_SPEED`. Exit when `input.drift` is released or speed falls below `DRIFT_EXIT_SPEED`.
4. On exit: `charge >= CHARGE_TIER2` adds `BOOST_TIER2`; `>= CHARGE_TIER1` adds `BOOST_TIER1`; cap `boostTime` at `BOOST_CAP`; emit events; zero `charge`.
5. While drifting: add `dt` to `charge` when `|atan2(vL, |vF|)| > DRIFT_MIN_SLIP`.
6. Top speed: `OFFROAD_MAX_SPEED` off-road (boost does not override it), otherwise `BOOST_MAX_SPEED` with boost active, otherwise `MAX_SPEED`.
7. Throttle: `vF += accel * (1 - (vF/top)^2) * dt`, skipped when `vF >= top`. `accel` is `ACCEL`, times `BOOST_ACCEL_MULT` with boost active.
8. Brake: when `vF > 0.5`, `vF -= BRAKE*dt`; otherwise reverse at `REVERSE_ACCEL` down to `-REVERSE_MAX_SPEED`.
9. No throttle or brake: move `vF` toward 0 by `COAST_DRAG*dt`.
10. If `vF > top`: `vF = max(top, vF - OVERSPEED_DECAY*dt)`.
11. Lateral grip: `vL *= exp(-grip*dt)`. Grip is `GRIP_DRIFT` drifting, `GRIP_OFFROAD` off-road, otherwise `GRIP_ROAD`.
12. Rebuild the world velocity from the old heading. Then turn: `rate = lerp(STEER_RATE_LOW, STEER_RATE_HIGH, min(1,|vF|/MAX_SPEED)) * min(1,|vF|/FULL_STEER_SPEED)`, times `DRIFT_STEER_MULT` when drifting, sign reversed when `vF < 0`. `heading += steer*rate*dt`. Do not rotate the velocity; the slip comes from this.
13. Integrate position. Reduce `boostTime` by `dt`, floored at 0.

- [ ] **Step 4: Run `npm test`**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/car.js tests/car.test.js
git commit -m "feat: add arcade car physics with drift-charged boost"
```

---

### Task 4: Race simulation, barriers, pylons and bot

**Files:**
- Create: `src/sim/sim.js`, `src/sim/bot.js`
- Test: `tests/sim.test.js`, `tests/bot.test.js`

**Interfaces:**
- Consumes: `generateTrack`, `queryTrack`, `createCar`, `resetCar`, `stepCar`, `carSpeed`.
- Produces:
  - `createSim(track) -> Sim`, `resetSim(sim)` (in place), `stepSim(sim, input)` (clears then fills `sim.events`).
  - `Sim = { track, car, prev: {x,z,heading}, step, progress, hint, surface, lapStartStep, lapRunning, lapIndex, nextCheckpoint, splits, pylonState, events }`
  - `lapTimeMs(sim) -> integer`
  - Additional events: `{type:'lapStart'}`, `{type:'checkpoint', index: 1..7, splitMs}`, `{type:'lap', timeMs, splitsMs}`, `{type:'barrierHit', impact}`, `{type:'pylonHit', index}`, `{type:'nearMiss', index}`.
  - `botInput(sim) -> input`, `measureBotLapMs(track) -> integer | null`

**Rules**
- Start: car at `s = -START_OFFSET`, stationary, on the centreline, facing along the tangent. `progress = -START_OFFSET`. The timer starts when `progress >= 0`, so there is no countdown.
- Each step: copy `prev`, step the car with the previous surface, query the track, apply barrier, update progress, surface, checkpoints, pylons.
- Progress: add the wrapped change in `s`, in `[-L/2, L/2]`.
- Checkpoint `k` (1-7) triggers when `progress >= lapBase + k*L/8` and `nextCheckpoint === k`. Finish is `k = 8`. After a lap, `lapBase += L`, the next lap starts immediately, and pylons reset.
- Barrier: when `|lateral| > BARRIER_LATERAL`, put the car on the barrier line and remove outward velocity. Multiply speed by `1 - BARRIER_MAX_SPEED_LOSS * |vn|/|v|`, zero `charge`, and emit `barrierHit` when `|vn| >= BARRIER_EVENT_MIN_IMPACT`.
- Surface: `offroad` when `|lateral| > ROAD_HALF_WIDTH`.
- Pylons: distance below `PYLON_HIT_DIST` means hit once per lap, velocity times `PYLON_HIT_SPEED_MULT`, charge zeroed. Distance below `PYLON_NEAR_DIST` at speed at least `NEAR_MISS_MIN_SPEED` arms it. An armed, unhit pylon past `PYLON_CLEAR_DIST` awards `NEAR_MISS_BOOST` (respecting `BOOST_CAP`) and emits `nearMiss`.

- [ ] **Step 1: Write the failing tests `tests/sim.test.js`**

```js
const track = generateTrack('neon-1');
const drive = (sim, seconds) => {
  const all = [];
  for (let i = 0; i < seconds * 120; i++) { stepSim(sim, botInput(sim)); all.push(...sim.events); }
  return all;
};
test('timer starts only after crossing the line', () => {
  const s = createSim(track);
  expect(lapTimeMs(s)).toBe(0);
  const ev = drive(s, 3);
  expect(ev.filter(e => e.type === 'lapStart')).toHaveLength(1);
});
test('bot completes a lap with 7 increasing splits', () => {
  const lap = drive(createSim(track), 90).find(e => e.type === 'lap');
  expect(lap.splitsMs).toHaveLength(7);
  expect([...lap.splitsMs].sort((a, b) => a - b)).toEqual(lap.splitsMs);
  expect(lap.splitsMs[6]).toBeLessThan(lap.timeMs);
});
test('rocking over a checkpoint does not count it twice', () => {
  const s = createSim(track), seen = [];
  while (s.nextCheckpoint < 2) { stepSim(s, botInput(s)); seen.push(...s.events); }
  const checkpointProgress = s.progress;
  for (let i = 0; i < 960; i++) { stepSim(s, { throttle: false, brake: true, steer: 0, drift: false }); seen.push(...s.events); }
  expect(s.progress).toBeLessThan(checkpointProgress);  // Proves the car really went back over it.
  for (let i = 0; i < 480; i++) { stepSim(s, { throttle: true, brake: false, steer: 0, drift: false }); seen.push(...s.events); }
  expect(seen.filter(e => e.type === 'checkpoint' && e.index === 1)).toHaveLength(1);
});
test('reversing over the start line never completes a lap', () => {
  const s = createSim(track), seen = [];
  for (let i = 0; i < 3600; i++) { stepSim(s, { throttle: false, brake: true, steer: 0, drift: false }); seen.push(...s.events); }
  expect(seen.some(e => e.type === 'lap')).toBe(false);
});
test('barrier holds at full boost speed', () => {
  const s = createSim(track);
  s.car.heading += Math.PI / 2; s.car.boostTime = 2;
  for (let i = 0; i < 1200; i++) {
    stepSim(s, { throttle: true, brake: false, steer: 0, drift: false });
    const q = queryTrack(track, s.car.x, s.car.z, s.hint);
    expect(Math.abs(q.lateral)).toBeLessThanOrEqual(12.01);
  }
});
test('resetSim clears everything mid-drift, mid-boost, mid-lap', () => {
  const s = createSim(track), fresh = createSim(track);
  drive(s, 20);
  s.car.drifting = true; s.car.charge = 1; s.car.boostTime = 1;
  resetSim(s);
  expect({ ...s, track: null, events: [] }).toEqual({ ...fresh, track: null, events: [] });
});
test('skimming a pylon awards boost once; hitting one slows the car', () => {
  const s = createSim(track), p = track.pylons[0];
  // Test helper: puts the car `dist` metres from p toward the road centre, moving along the tangent
  // at `speed`, and sets s.hint = p.index and s.progress to match, so progress does not jump.
  placeNearPylon(s, p, 2.5, 40);
  const seen = [];
  for (let i = 0; i < 120; i++) { stepSim(s, { throttle: true, brake: false, steer: 0, drift: false }); seen.push(...s.events); }
  expect(seen.filter(e => e.type === 'nearMiss')).toHaveLength(1);

  const h = createSim(track);
  placeNearPylon(h, p, 0.5, 40);
  stepSim(h, { throttle: false, brake: false, steer: 0, drift: false });
  expect(h.events.some(e => e.type === 'pylonHit')).toBe(true);
  expect(carSpeed(h.car)).toBeLessThan(31);
});
```

- [ ] **Step 2: Write the failing test `tests/bot.test.js`**

```js
test('bot lap is playable on many seeds', () => {
  for (let i = 0; i < 20; i++) {
    const ms = measureBotLapMs(generateTrack(`seed-${i}`));
    expect(ms).not.toBeNull();
    expect(ms).toBeGreaterThanOrEqual(32000);
    expect(ms).toBeLessThanOrEqual(50000);
  }
});
```

The bot does not drift, so it is slower than a good player. That keeps good human laps in the 30-45 second target.

- [ ] **Step 3: Run `npm test`**

Expected: FAIL, `createSim` not defined.

- [ ] **Step 4: Implement `sim.js`**

Follow the rules above.

- [ ] **Step 5: Implement `bot.js`**

- Steering: aim at the centreline `speed*0.45 + 6` m ahead. `steer = clamp(angleError*2.5, -1, 1)`.
- Speed: highest absolute curvature `κ` over the next `speed*1.2 + 10` m gives `target = min(MAX_SPEED, sqrt(22/κ))`. Throttle below target, brake if more than 2 m/s above.
- `measureBotLapMs` returns the first lap's `timeMs`, or `null` after 180 simulated seconds.

- [ ] **Step 6: Run `npm test`**

Expected: PASS. If bot times are out of range, change `TRACK_LENGTH` only.

- [ ] **Step 7: Commit**

```bash
git add src/sim tests
git commit -m "feat: add race simulation with barriers, pylons and calibration bot"
```

---

### Task 5: Playable driving build (HUMAN GATE)

**Files:**
- Create: `src/loop.js`, `src/input.js`, `src/render/renderer.js`, `src/render/world.js`, `src/render/carMesh.js`, `src/render/chaseCamera.js`, and fill in `src/main.js`
- Test: `tests/loop.test.js`

**Interfaces:**
- Consumes: `generateTrack`, `createSim`, `stepSim`, `resetSim`, `carSpeed`.
- Produces:
  - `advance(accumulator, frameSeconds) -> { steps, accumulator, alpha }`
  - `createInput(target) -> { read() -> input, consumePressed() -> string[], clear() }`. Pressed names: `restart`, `pause`, `mute`.
  - `createRenderer(canvas) -> { scene, camera, render(), resize(), dispose() } | null` (null when WebGL is unavailable)
  - `createWorld(scene, track) -> { update(timeSec), flashGate(k), setPylonHit(i), dispose() }`
  - `createCarMesh({ color, ghost = false }) -> THREE.Group` (+Z is forward)
  - `createChaseCamera(camera) -> { update(state, dt), snap(state), kick(strength) }`, with `state = { x, z, heading, speed, boosting }`

- [ ] **Step 1: Write the failing test `tests/loop.test.js`**

```js
test('a normal frame runs matching steps and keeps the remainder', () => {
  const r = advance(0, 1 / 60);
  expect(r.steps).toBe(2);
  expect(r.alpha).toBeGreaterThanOrEqual(0);
  expect(r.alpha).toBeLessThan(1);
});
test('a huge frame is clamped so nothing teleports', () => {
  expect(advance(0, 30).steps).toBe(12);
});
test('a negative frame does nothing', () => {
  expect(advance(0, -1).steps).toBe(0);
});
```

- [ ] **Step 2: Run `npm test`**

Expected: FAIL, `advance` not defined.

- [ ] **Step 3: Implement `src/loop.js`**

Clamp `frameSeconds` to `[0, 0.1]`.

- [ ] **Step 4: Run `npm test`**

Expected: PASS.

- [ ] **Step 5: Implement `src/input.js`**

- Arrows or WASD drive. Space or Shift drifts. `R` restarts, `Esc` pauses, `M` mutes. Call `preventDefault` on these keys.
- Key repeat must not fire pressed actions.
- Clear held keys on `blur`.
- Touch devices: auto-throttle, left or right half of the screen steers, a second finger drifts.

- [ ] **Step 6: Implement `src/render/renderer.js`**

- `WebGLRenderer` with `antialias: false`, pixel ratio `min(devicePixelRatio, 2)`.
- Post-processing: `EffectComposer` with `UnrealBloomPass` from `three/addons`, strength 0.7, radius 0.4, threshold 0.75.
- Quality step-down: when average frame time exceeds 22 ms over 2 seconds, set pixel ratio to 1. If it is still over after another 2 seconds, turn off bloom. Never step back up.

- [ ] **Step 7: Implement `src/render/world.js`**

- Road: one ribbon `BufferGeometry` from samples at lateral ±7, with a small `ShaderMaterial` for dark asphalt, glowing edges and centre dashes driven by arc length.
- Off-road strip: one darker ribbon out to ±12.
- Barriers: two 1.2 m vertical emissive ribbons at ±12, cyan on the left and magenta on the right.
- Gates: one arch per checkpoint, `InstancedMesh`; `flashGate` brightens one briefly.
- Pylons: `InstancedMesh` of glowing orange cones; `setPylonHit` dims one until the next lap.
- Ground: large dark plane with a faint shader grid.
- Sky: dark blue-violet background, one `Points` starfield of 1500 stars generated from `mulberry32`.
- `dispose()` frees every geometry and material, because tracks change at runtime.

- [ ] **Step 8: Implement `carMesh.js` and `chaseCamera.js`**

- Car: about 4.2 m long, wedge body, cabin, emissive tail-light and side strips. All from `BoxGeometry` or simple extruded shapes, sharing materials. `ghost: true` uses transparent cyan at 0.35 opacity with `depthWrite: false`.
- Camera: 9 m behind, 3.6 m above, looking 6 m ahead of the car. Smooth position with `1 - exp(-8*dt)`, ease heading more slowly. FOV goes from 68 at rest to 84 at top speed and 90 with boost. `kick` adds a brief shake, disabled under `prefers-reduced-motion`.

- [ ] **Step 9: Wire `src/main.js`**

- Track `neon-1`, one car, chase camera, fixed-step loop with `advance`.
- Render by interpolating `sim.prev` and `sim.car` using `alpha`, with shortest-arc heading.
- `R` calls `resetSim` then `snap`. Pause on `document.hidden`.
- Null renderer shows the message: "This game needs WebGL, which isn't available in this browser."
- Add a plain debug line only under `?debug`, showing speed, lap time, surface, charge, fps and draw calls. Expose `window.__game` only under `?debug`.

- [ ] **Step 10: Verify automatically**

Run `npm test` and `npm run build`. Both must succeed. With `npm run dev` running, load `/?debug` in a browser. Confirm no console errors, a visible track and car, and draw calls at or below 60 under `renderer.info`. Take a screenshot.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add playable driving build with neon world and chase camera"
```

- [ ] **Step 12: HUMAN GATE**

Stop. Ask the person to run `npm run dev`, drive for five minutes and answer:
- Does the car feel fast and controllable?
- Can you hold a drift through a corner and feel the boost when you release?
- Are tight corners hard but fair?
- Is a lap roughly 30-45 seconds?

Apply their feedback in `constants.js`, keep tests passing, and repeat until they approve. Do not start Task 6 without approval.

---

### Task 6: Ghost recording and encoding

**Files:**
- Create: `src/sim/ghost.js`
- Test: `tests/ghost.test.js`

**Interfaces:**
- Consumes: ghost constants.
- Produces:
  - `Ghost = { timeMs, splitsMs: number[7], samples: number[] }`, with `samples` a flat `[x, z, h, ...]` at 10 Hz from lap start.
  - `sampleGhost(ghost, ms) -> {x, z, heading}`: interpolated with shortest-arc heading, clamped at both ends.
  - `encodeGhost(ghost) -> string`, `decodeGhost(str) -> Ghost | null`

**Format:** bytes encoded as unpadded base64url:
1. version byte `1`
2. varint `timeMs`
3. 7 varint splits
4. varint sample count
5. first sample: zigzag varint x and z in 0.1 m units, heading byte (1/256 of a turn)
6. each next sample: zigzag varint dx, dz and wrapped heading delta

- [ ] **Step 1: Write the failing tests**

```js
const lap = () => {
  const samples = [];
  for (let i = 0; i < 400; i++) {
    const a = i / 400 * Math.PI * 2;
    samples.push(Math.cos(a) * 255 + Math.sin(a * 5) * 30, Math.sin(a) * 255, a + Math.PI / 2);
  }
  return { timeMs: 40000, splitsMs: [5000, 10000, 15000, 20000, 25000, 30000, 35000], samples };
};
test('round trip stays within quantization', () => {
  const g = lap(), d = decodeGhost(encodeGhost(g));
  expect(d.timeMs).toBe(40000);
  expect(d.splitsMs).toEqual(g.splitsMs);
  for (let i = 0; i < 1200; i += 3) {
    expect(Math.abs(d.samples[i] - g.samples[i])).toBeLessThanOrEqual(0.051);
    expect(Math.abs(d.samples[i + 1] - g.samples[i + 1])).toBeLessThanOrEqual(0.051);
    expect(Math.abs(angleDiff(d.samples[i + 2], g.samples[i + 2]))).toBeLessThanOrEqual(0.0125);
  }
});
test('a 40 second lap encodes in under 3000 characters', () => {
  expect(encodeGhost(lap()).length).toBeLessThan(3000);
});
test.each(['', '!!!', 'AAAA', 'not a ghost'])('rejects junk: %s', s => {
  expect(decodeGhost(s)).toBeNull();
});
test('rejects truncated, extended and out-of-range data', () => {
  const code = encodeGhost(lap());
  expect(decodeGhost(code.slice(0, -20))).toBeNull();
  expect(decodeGhost(code + 'AAAA')).toBeNull();
  expect(decodeGhost(encodeGhost({ ...lap(), timeMs: 400000 }))).toBeNull();
  expect(decodeGhost(encodeGhost({ ...lap(), splitsMs: [9, 8, 7, 6, 5, 4, 3] }))).toBeNull();
});
test('sampling interpolates and clamps', () => {
  const g = { timeMs: 200, splitsMs: [], samples: [0, 0, 0, 10, 0, 0, 20, 0, 0] };
  expect(sampleGhost(g, 50).x).toBeCloseTo(5);
  expect(sampleGhost(g, -10).x).toBe(0);
  expect(sampleGhost(g, 9999).x).toBe(20);
});
test('heading interpolation takes the short way', () => {
  const g = { timeMs: 100, splitsMs: [], samples: [0, 0, 3.1, 0, 0, -3.1] };
  expect(Math.abs(sampleGhost(g, 50).heading)).toBeGreaterThan(3);
});
```

Export `angleDiff(a, b)` from `ghost.js`, returning a value in `(-π, π]`.

- [ ] **Step 2: Run `npm test`**

Expected: FAIL, `encodeGhost` not defined.

- [ ] **Step 3: Implement `ghost.js`**

`decodeGhost` must validate:
- strict base64url alphabet, version equals 1, no truncation and no trailing bytes
- `0 < timeMs <= GHOST_MAX_TIME_MS`
- exactly 7 strictly increasing splits, all below `timeMs`
- `1 <= count <= GHOST_MAX_SAMPLES`
- absolute position at most 5000 m

Quantize each sample's absolute position and heading first, then take deltas between quantized values, so rounding error does not build up along the lap. Encoding must not throw on data that decoding would reject, because the test above relies on that. Use `btoa`/`atob`, available in browsers and Node.

- [ ] **Step 4: Run `npm test`**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/ghost.js tests/ghost.test.js
git commit -m "feat: add compact ghost encoding and playback sampling"
```

---

### Task 7: Session, HUD, ghost playback and instant restart

**Files:**
- Create: `src/session.js`, `src/ui/format.js`, `src/ui/hud.js`
- Modify: `src/main.js`
- Test: `tests/session.test.js`, `tests/format.test.js`

**Interfaces:**
- Consumes: sim, ghost, bot; store interface as defined in Task 8.
- Produces:
  - `createSession({ trackId, track, store, friendGhost = null }) -> Session`
  - `Session = { sim, bestMs: number|null, best: Ghost|null, rival: Ghost|null, step(input) -> events[], restart() }`
  - `bestMs` decides `isBest`. `best` can be null while `bestMs` is set, when the best lap was too long to keep a ghost.
  - `rival` is `friendGhost` when present, otherwise `best`.
  - `checkpoint` events gain `deltaMs: number|null`, measured against `rival`.
  - `lap` events gain `{ isBest, deltaMs, ghostCode }`.
  - `formatTime(ms) -> "0:42.18"`, `formatDelta(ms) -> "-0.24" | "+0.24"`
  - `createHud(root) -> { update(state), event(e), setVisible(b) }`

The session uses a minimal store until Task 8: `store.getBest(trackId) -> { timeMs, ghostCode: string|null } | null`, `store.recordLap(trackId, { timeMs, ghostCode, medal }) -> { unlockedNow: [] }`. Use an in-memory stub in tests and in `main.js` until Task 8 replaces it. Task 8 adds `medal` and medal events.

- [ ] **Step 1: Write the failing tests `tests/format.test.js`**

```js
test('formatTime', () => {
  expect(formatTime(42180)).toBe('0:42.18');
  expect(formatTime(61005)).toBe('1:01.00');
  expect(formatTime(0)).toBe('0:00.00');
});
test('formatDelta', () => {
  expect(formatDelta(-240)).toBe('-0.24');
  expect(formatDelta(240)).toBe('+0.24');
  expect(formatDelta(0)).toBe('+0.00');
});
```

- [ ] **Step 2: Write the failing tests `tests/session.test.js`**

```js
test('the first lap becomes best and is stored', () => { /* Drive with botInput to the first lap.
  Expect lap.isBest true, session.best.timeMs === lap.timeMs, store has the code, decodeGhost(code) not null. */ });
test('a slower lap does not replace best', () => { /* Seed the store with a faster ghost. Expect isBest false
  and lap.deltaMs > 0, store unchanged. */ });
test('checkpoint delta is against the rival split', () => { /* Set a rival with known splits and expect
  deltaMs === e.splitMs - rival.splitsMs[e.index - 1]. */ });
test('first-ever run has null deltas', () => { /* No rival: checkpoint.deltaMs is null. */ });
test('a friend ghost is the rival but never overwrites stored best', () => { /* A lap faster than the friend
  updates the stored best with the player's own ghost, and rival stays the friend. */ });
test('restart mid-lap discards recording', () => { /* Drive 10 seconds, restart, drive a full lap.
  Stored ghost samples begin at the start line, sample count ≈ timeMs / 100 ± 2. */ });
test('a lap too long for a ghost still counts without crashing', () => { /* Exceed GHOST_MAX_SAMPLES:
  isBest may be true, ghostCode is null, nothing throws. */ });
```

Replace each comment with real assertions matching the sentence inside it.

- [ ] **Step 3: Run `npm test`**

Expected: FAIL, modules not found.

- [ ] **Step 4: Implement `format.js` and `session.js`**

- The recorder takes a sample every `GHOST_STEPS_PER_SAMPLE` sim steps from `lapStart`, and begins fresh after each `lap`.
- A lap over `GHOST_MAX_SAMPLES` samples stops recording and yields `ghostCode: null`.

- [ ] **Step 5: Run `npm test`**

Expected: PASS.

- [ ] **Step 6: Implement `src/ui/hud.js`**

DOM only, no frameworks.
- Large lap time at top centre. Best time beneath it.
- Speed in km/h (`speed * 3.6`) bottom right. Boost charge bar with marks at tiers 1 and 2 bottom centre.
- Checkpoint delta in the centre for 1.5 s: green when negative, red when positive.
- Short pops for near-miss and new best.
- "WRONG WAY" after 1 second moving backward along the track at more than 5 m/s.
- On touch devices, a restart button.
- All HUD writes must skip the DOM when text has not changed.
- The HUD never blocks driving and has `pointer-events: none`, except its buttons.

- [ ] **Step 7: Wire `src/main.js`**

- Use `createSession`. Add a second car mesh for `rival`, hidden until the timer starts, placed using `sampleGhost(rival, lapTimeMs(sim))`.
- Route events: HUD, `flashGate`, `setPylonHit`, camera `kick`.
- Restart: `session.restart()`, `camera.snap`, reset pylons, hide ghost. It must complete within one frame with no allocation of new geometry.

- [ ] **Step 8: Verify**

Run `npm test` and `npm run build`. In a browser under `?debug`, press `R` during a drift and confirm the car is at the start, stopped, with the charge bar empty, with no console errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add session with best-lap ghost, splits, HUD and instant restart"
```

---

### Task 8: Medals, save data and track menu

**Files:**
- Create: `src/meta/medals.js`, `src/meta/store.js`, `src/meta/daily.js`, `src/ui/menu.js`
- Modify: `src/session.js`, `src/main.js`, `src/ui/hud.js`, `tests/session.test.js`
- Test: `tests/medals.test.js`, `tests/store.test.js`

**Interfaces:**
- Consumes: `measureBotLapMs`, `MEDAL_FACTORS`.
- Produces:
  - `medalTimes(botMs) -> { bronze, silver, gold, neon }`, in ms, rounded to the nearest 100.
  - `medalFor(timeMs, times) -> 'bronze'|'silver'|'gold'|'neon'|null`
  - `nextMedal(bestMs, times) -> { name, timeMs } | null`
  - `MEDAL_POINTS = { bronze: 1, silver: 2, gold: 3, neon: 5 }`
  - `FIXED_TRACKS = ['neon-1', 'neon-2', 'neon-3']`, `isValidTrackId(id) -> bool`, `dailyTrackId(date = new Date()) -> 'daily-YYYY-MM-DD'`
  - `createStore(storage) -> Store`. `storage` may be `null` or throw on any call.
  - `Store`: `getBest(id) -> { timeMs, ghostCode: string|null } | null`, `getMedal(id)`, `recordLap(id, { timeMs, ghostCode, medal }) -> { unlockedNow: [] }`, `getSettings()`, `setSettings(partial)`, `totalPoints()`, `pruneDailies(todayId)`
  - The `lap` session event gains `{ medal, medalUpgraded, unlockedNow }`.
  - `createMenu(root, handlers) -> { showTracks(rows), showPause(), hide() }`

Save format: `{ version: 1, tracks: { [id]: { bestMs, ghost, medal } }, settings: { color, trail, muted } }`.

- [ ] **Step 1: Write the failing tests**

```js
test('medal times scale from the bot time', () => {
  expect(medalTimes(40000)).toEqual({ bronze: 52000, silver: 46000, gold: 41200, neon: 38000 });
});
test('medalFor uses inclusive boundaries', () => {
  const t = medalTimes(40000);
  expect(medalFor(38000, t)).toBe('neon');
  expect(medalFor(38001, t)).toBe('gold');
  expect(medalFor(52001, t)).toBeNull();
});
test('nextMedal finds the next target', () => {
  const t = medalTimes(40000);
  expect(nextMedal(null, t)).toEqual({ name: 'bronze', timeMs: 52000 });
  expect(nextMedal(45000, t)).toEqual({ name: 'gold', timeMs: 41200 });
  expect(nextMedal(30000, t)).toBeNull();
});
test('track ids are validated strictly', () => {
  expect(isValidTrackId('neon-2')).toBe(true);
  expect(isValidTrackId('daily-2026-11-03')).toBe(true);
  for (const bad of ['neon-9', 'daily-x', '<script>', '', 'daily-2026-11-03x']) expect(isValidTrackId(bad)).toBe(false);
});
test('daily id uses the UTC date', () => {
  expect(dailyTrackId(new Date('2026-11-03T23:30:00-05:00'))).toBe('daily-2026-11-04');
});
test.each([
  ['null storage', () => null],
  ['throwing storage', () => ({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } })],
  ['corrupt JSON', () => fakeStorage('{not json')],
  ['wrong shape', () => fakeStorage('{"version":1,"tracks":"nope"}')],
  ['future version', () => fakeStorage('{"version":99}')],
])('store survives %s', (_, make) => {
  const s = createStore(make());
  s.recordLap('neon-1', { timeMs: 40000, ghostCode: 'abc', medal: 'gold' });
  expect(s.getBest('neon-1').timeMs).toBe(40000);
});
test('quota failure keeps the session running', () => { /* setItem throws only on write:
  recordLap does not throw, best stays available in memory. */ });
test('a worse lap never lowers best or medal', () => { /* Record gold 40000, then bronze 50000;
  best remains 40000 and medal remains gold. */ });
test('pruning removes old daily ghosts but keeps points', () => { /* Daily from 15 days earlier:
  getBest().ghostCode is null, getBest().timeMs is kept, and totalPoints is unchanged. A daily from 13 days earlier keeps its ghost. */ });
```

`fakeStorage(initial)` is a small in-memory helper. Replace comments with real assertions.

- [ ] **Step 2: Run `npm test`**

Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `medals.js`, `daily.js`, `store.js`**

- `recordLap` always updates the in-memory copy first, then attempts to persist in a try/catch.
- On a future save version, do not overwrite the existing save: run in memory only.
- Keep dailies' `medal` when pruning so points survive; set only `ghost` to null. Prune ghosts older than 14 days.

- [ ] **Step 4: Run `npm test`**

Expected: PASS.

- [ ] **Step 5: Extend `session.js` and its tests**

Add `times` (from a cached `measureBotLapMs` per track id). Add `medal`, `medalUpgraded` and `unlockedNow` to `lap`. Add a test that crossing gold on a lap emits `medalUpgraded: true`, and that a later equal lap emits `false`.

- [ ] **Step 6: Implement `src/ui/menu.js`**

- Track rows: name, best time, medal, target time for the next medal. Clicking starts driving at once.
- Pause (`Esc`): Resume, Restart, Tracks, Mute. Show a small controls reminder.
- First run: show controls once, as a dismissible line in the track menu, not a modal.

- [ ] **Step 7: Wire `src/main.js` and `src/ui/hud.js`**

- HUD adds "Gold in 0:41.20" from `nextMedal`, and a brief medal banner when `medalUpgraded`.
- Switching tracks disposes the old world and creates the new one. Calling `pruneDailies` happens once on startup.

- [ ] **Step 8: Verify**

Run `npm test` and `npm run build`. In a browser: set a lap via `?debug`, reload, and confirm best and medal persist. Switch tracks 10 times and confirm `renderer.info.memory.geometries` does not grow.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add medals, safe save data and track menu"
```

---

### Task 9: Speed effects and audio

**Files:**
- Create: `src/render/fx.js`, `src/audio/audio.js`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: session events and car state.
- Produces:
  - `createFx(scene, camera, { reducedMotion }) -> { update(state, dt), event(e), setTrail(style), reset() }`
  - `createAudio() -> { unlock(), update(state), event(e), setMuted(b), suspend(), resume() }`
  - `state = { speed, boosting, drifting, surface }`

There is nothing meaningful to unit test here, so this task is verified in the browser.

- [ ] **Step 1: Implement `fx.js`**

All in at most 4 draw calls with pre-allocated buffers:
- **Drift trails:** two ring-buffer ribbons, 200 points each, behind the rear wheels, fading out. Trail style is set in Task 10.
- **Speed lines:** up to 80 instanced streaks around the camera, starting above 40 m/s and strongest with boost. Off under reduced motion.
- **Boost flash:** brief bloom-style flash on the tail lights plus a short radial screen overlay in CSS.
- **Sparks:** a pooled `Points` burst of 40 on `barrierHit` and `pylonHit`.

- [ ] **Step 2: Implement `audio.js`**

Create the `AudioContext` on first key or touch, as browsers require.
- **Engine:** sawtooth plus triangle through a lowpass. Frequency `70 + speed*5` Hz; boost adds an octave blend.
- **Drift:** looping filtered noise, gain rising with charge. A short rising blip at each charge tier.
- **Boost:** noise whoosh with a falling filter sweep.
- **Checkpoints:** high blip when ahead, low when behind, neutral when no delta.
- **New best:** four-note rising arpeggio. **Medal:** the same an octave up with a held note.
- **Barrier or pylon hit:** short low thud. **Near miss:** short airy zip.
- Master gain default 0.5. Mute persists through `store.setSettings`. Suspend on blur or pause.

- [ ] **Step 3: Wire into `src/main.js`**

`restart` calls `fx.reset()` and stops one-shot audio immediately.

- [ ] **Step 4: Verify**

In a browser:
- With `?debug`, full FX active at top speed: draw calls at or below 60, no console errors.
- Emulate `prefers-reduced-motion` and confirm no speed lines or camera shake.
- Report the items that need human ears: engine tone, cue levels. Don't claim those were verified.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add drift trails, speed effects and synthesized audio"
```

---

### Task 10: Daily track, unlocks and share links

**Files:**
- Create: `src/meta/unlocks.js`, `src/meta/share.js`
- Modify: `src/session.js`, `src/ui/menu.js`, `src/ui/hud.js`, `src/render/fx.js`, `src/main.js`, `src/meta/store.js`
- Test: `tests/unlocks.test.js`, `tests/share.test.js`

**Interfaces:**
- Consumes: `decodeGhost`, `isValidTrackId`, `dailyTrackId`, `store.totalPoints()`.
- Produces:
  - `COLORS = [{id:'cyan',points:0},{id:'magenta',points:3},{id:'lime',points:8},{id:'gold',points:15},{id:'white',points:25}]`
  - `TRAILS = [{id:'neon',points:0},{id:'pulse',points:5},{id:'ember',points:12},{id:'prism',points:22}]`
  - `isUnlocked(item, points) -> bool`, `newlyUnlocked(before, after) -> item[]`
  - `makeShareUrl(baseUrl, trackId, ghostCode) -> string | null` (null above 8000 characters)
  - `parseShareHash(hash) -> { trackId, ghost } | null`

Share format: URL fragment `#r=<trackId>~<ghostCode>`. A fragment is not sent to the web server.

- [ ] **Step 1: Write the failing tests**

```js
test('unlocks follow points, inclusive', () => {
  expect(isUnlocked(COLORS[1], 2)).toBe(false);
  expect(isUnlocked(COLORS[1], 3)).toBe(true);
});
test('newlyUnlocked reports only what crossed', () => {
  expect(newlyUnlocked(2, 5).map(i => i.id).sort()).toEqual(['magenta', 'pulse']);
  expect(newlyUnlocked(5, 5)).toEqual([]);
});
test('share round trip', () => {
  const code = encodeGhost(sampleLap());
  const url = makeShareUrl('https://x.test/game/', 'neon-2', code);
  const p = parseShareHash(new URL(url).hash);
  expect(p.trackId).toBe('neon-2');
  expect(p.ghost.timeMs).toBe(sampleLap().timeMs);
});
test('share keeps existing path and replaces any old fragment', () => {
  expect(makeShareUrl('https://x.test/a/?q=1#old', 'neon-1', 'abc')).toBe('https://x.test/a/?q=1#r=neon-1~abc');
});
test('oversized share returns null', () => {
  expect(makeShareUrl('https://x.test/', 'neon-1', 'a'.repeat(9000))).toBeNull();
});
test.each(['', '#', '#r=', '#r=neon-1', '#r=bad-track~abc', '#r=neon-1~!!!', '#other=1', '#r=neon-1~' + 'A'.repeat(20000)])(
  'bad hash is ignored: %s', h => { expect(parseShareHash(h)).toBeNull(); });
```

`sampleLap()` is a helper in the test file, with a lap like the one in Task 6.

- [ ] **Step 2: Run `npm test`**

Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `unlocks.js` and `share.js`**

`parseShareHash` rejects any fragment over 8100 characters before decoding.

- [ ] **Step 4: Run `npm test`**

Expected: PASS.

- [ ] **Step 5: Wire up the daily track**

- Menu adds a row titled "Daily" using `dailyTrackId()`, read once when the menu opens. A run in progress keeps its track across midnight.
- Do not show a countdown or a streak.

- [ ] **Step 6: Wire up cosmetics**

- Pause menu shows colours and trails. Locked ones show the points needed. Save the selection through `store.setSettings`, and apply it to the player's car and trail immediately and on startup.
- Session `unlockedNow` shows a short HUD pop.
- If a saved cosmetic isn't recognized, fall back to the default.
- Implement `pulse` (brightness wave), `ember` (orange fading to red), `prism` (hue along length) in `fx.js` trail colour logic.

- [ ] **Step 7: Wire up sharing**

- Track menu: a "Share ghost" button on any track with a saved ghost. Copy with `navigator.clipboard`, falling back to a selected read-only text field. Say "Link copied" only after the copy succeeded.
- On startup: `parseShareHash(location.hash)`. When valid, start that track with `friendGhost` and a banner "Beat 0:41.20", shown in a magenta ghost.
- When the hash is present but invalid, show "That race link is broken" in the menu.
- After loading, clear the fragment with `history.replaceState` so reloading doesn't reload the friend's race.

- [ ] **Step 8: Verify**

Run `npm test` and `npm run build`. In a browser: copy a share link, open it in a new tab, and confirm the track, ghost and banner are right and your stored best is unchanged. Load `/#r=neon-1~garbage` and confirm the notice appears with no console error.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add daily track, cosmetic unlocks and ghost share links"
```

---

### Task 11: Release check

**Files:**
- Create: `README.md`
- Modify: only what the checks below expose

**Interfaces:**
- Consumes: the whole game.

- [ ] **Step 1: Check the production build**

Run `npm test`, `npm run build`, `npm run preview`. Sum the gzipped size of `dist/assets/*.js`. Expected: at most 300 KB, and no binary files in `dist`. Report the actual number.

- [ ] **Step 2: Check subfolder hosting**

Confirm `dist/index.html` uses relative asset paths. The game must work from a subfolder.

- [ ] **Step 3: Walk through in a browser against `npm run preview`**

Confirm each item and report any failure:
- Clean profile: menu, pick track, drive, restart with no delay.
- One full lap sets best. Second lap shows ghost and deltas.
- Reload keeps best, medal and cosmetics.
- Daily track loads. Share link round trip works.
- Hide the tab for 10 seconds: paused on return, timer unaffected.
- `localStorage` blocked: game still plays.
- Phone-sized viewport with touch emulation: controls and HUD fit.
- No console errors at any point.

- [ ] **Step 4: Check against the anti-goals**

Search the code and UI for streaks, reset countdowns, notification requests and post-lap interrupting screens. Expected: none.

- [ ] **Step 5: Write `README.md`**

How to run, build and deploy to any static host, the controls, and how tuning works (`constants.js`). Keep it under 40 lines.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: add readme and complete release checks"
```

- [ ] **Step 7: Final human playtest**

Stop. Ask the person to play for 15 minutes and report whether they wanted another go, and whether medals feel reachable. Medal difficulty is tuned through `MEDAL_FACTORS`. List honestly anything verified only by automation.
