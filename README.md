# Neon Time Trial

A short-lap racing game in the browser. Beat your own ghost, earn medals, race a friend's ghost from a link. Built with plain JS and three.js, with no backend and no asset files.

**Play it: https://siddharthkhachane.github.io/3d/**

## Run

```bash
npm install
npm run dev        # http://localhost:5173  (add ?debug for fps and draw calls)
npm test           # headless tests for the simulation and save data
npm run build      # static site in dist/
npm run preview    # serve dist/ locally
```

## Deploy

`dist/` is a static site with relative paths. Upload it to any static host, including a subfolder.

## Controls

| Key | Action |
| --- | --- |
| W / Up | Gas |
| S / Down | Brake and reverse |
| A D / Left Right | Steer |
| Space / Shift | Drift (hold, then release for a boost) |
| R | Instant restart |
| Esc | Pause menu (tracks, cosmetics, sound) |
| M | Mute |

On touch screens the car accelerates itself. Touch the left or right half to steer, and use a second finger to drift.

## How it works

- `src/sim`: deterministic physics, tracks, ghosts. No DOM, no three.js, no randomness.
- `src/meta`: medals, save data, unlocks, share links, daily track.
- `src/render`, `src/audio`, `src/ui`: read the session state and never change gameplay.

## Tuning

All gameplay numbers live in `src/sim/constants.js`. Medal difficulty is `MEDAL_FACTORS`, multiples of an autopilot lap time on each track.

Saves live in `localStorage` under `neonTT.v1`. Share links keep the ghost in the URL fragment, so no server ever sees it.
