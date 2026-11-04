import { CHARGE_TIER1, CHARGE_TIER2 } from '../sim/constants.js';

const MASTER_VOLUME = 0.5;

const NOTE = { c5: 523.25, e5: 659.25, g5: 783.99, c6: 1046.5, e6: 1318.5, g6: 1567.98, c7: 2093 };

// Web Audio only exists in browsers; every method is a safe no-op until unlock() succeeds.
export function createAudio() {
  let ctx = null, master = null, sfx = null, noise = null;
  let engine = null, drift = null;
  let muted = false, prevCharge = 0;

  function noiseBuffer() {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function newSfxBus() {
    sfx = ctx.createGain();
    sfx.connect(master);
  }

  function build() {
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    master.connect(ctx.destination);
    newSfxBus();
    noise = noiseBuffer();

    // Engine: saw + triangle through a lowpass.
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const gain = ctx.createGain(); gain.gain.value = 0.12;
    const saw = ctx.createOscillator(); saw.type = 'sawtooth';
    const tri = ctx.createOscillator(); tri.type = 'triangle';
    const octave = ctx.createGain(); octave.gain.value = 0;
    saw.connect(lp); tri.connect(octave); octave.connect(lp); lp.connect(gain); gain.connect(master);
    saw.start(); tri.start();
    engine = { saw, tri, lp, gain, octave };

    // Drift squeal: looped noise through a bandpass.
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 2;
    const dg = ctx.createGain(); dg.gain.value = 0;
    src.connect(bp); bp.connect(dg); dg.connect(master);
    src.start();
    drift = { bp, gain: dg };
  }

  function tone(freq, { start = 0, length = 0.12, type = 'sine', gain = 0.25, slideTo = null } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(g); g.connect(sfx);
    osc.start(t); osc.stop(t + length + 0.05);
  }

  function whoosh({ from, to, length, gain }) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + length);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(bp); bp.connect(g); g.connect(sfx);
    src.start(t, Math.random()); src.stop(t + length + 0.05);
  }

  return {
    unlock() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        build();
      } catch { ctx = null; }
    },
    // state: { speed (m/s), boosting, drifting, charge }
    update(s) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const freq = 70 + s.speed * 5;
      engine.saw.frequency.setTargetAtTime(freq, t, 0.05);
      engine.tri.frequency.setTargetAtTime(freq * 2, t, 0.05);
      engine.octave.gain.setTargetAtTime(s.boosting ? 0.6 : 0, t, 0.1);
      engine.lp.frequency.setTargetAtTime(500 + s.speed * 20 + (s.boosting ? 600 : 0), t, 0.08);
      drift.gain.gain.setTargetAtTime(s.drifting ? 0.05 + Math.min(1, s.charge / CHARGE_TIER2) * 0.07 : 0, t, 0.06);
      drift.bp.frequency.setTargetAtTime(1200 + s.charge * 500, t, 0.1);
      if (s.drifting) {
        if (prevCharge < CHARGE_TIER1 && s.charge >= CHARGE_TIER1) tone(700, { length: 0.1, slideTo: 1000, gain: 0.18 });
        if (prevCharge < CHARGE_TIER2 && s.charge >= CHARGE_TIER2) tone(900, { length: 0.14, slideTo: 1500, gain: 0.2 });
      }
      prevCharge = s.drifting ? s.charge : 0;
    },
    event(e) {
      if (!ctx) return;
      if (e.type === 'checkpoint') {
        const f = e.deltaMs === null ? 600 : e.deltaMs <= 0 ? 880 : 330;
        tone(f, { length: 0.13, type: 'triangle' });
      } else if (e.type === 'lap') {
        const notes = [NOTE.c5, NOTE.e5, NOTE.g5, NOTE.c6];
        if (e.medalUpgraded) {
          [NOTE.c6, NOTE.e6, NOTE.g6, NOTE.c7].forEach((n, i) => tone(n, { start: i * 0.09, length: i === 3 ? 0.6 : 0.12, type: 'triangle' }));
        } else if (e.isBest) {
          notes.forEach((n, i) => tone(n, { start: i * 0.09, length: 0.12, type: 'triangle' }));
        } else {
          tone(NOTE.e5, { length: 0.15, type: 'triangle' });
        }
      } else if (e.type === 'boost') {
        whoosh({ from: 3500, to: 300, length: 0.6, gain: 0.3 });
      } else if (e.type === 'barrierHit' || e.type === 'pylonHit') {
        tone(110, { length: 0.18, slideTo: 40, gain: 0.35 });
      } else if (e.type === 'nearMiss') {
        whoosh({ from: 800, to: 4500, length: 0.14, gain: 0.12 });
      }
    },
    // Cuts every one-shot still playing, e.g. on restart.
    reset() {
      if (!ctx) return;
      sfx.disconnect();
      newSfxBus();
      prevCharge = 0;
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, ctx.currentTime, 0.02);
    },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
  };
}
