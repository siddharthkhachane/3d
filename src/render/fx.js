import * as THREE from 'three';

const RIBBONS = 2, SLOTS = 200, TRAIL_LIFE = 1.6, TRAIL_HALF_WIDTH = 0.2, MIN_POINT_GAP = 0.4;
const REAR_OFFSET = 1.3, WHEEL_OFFSET = 0.95;
const STREAKS = 80, STREAK_DEPTH = 60;
const SPARKS = 40, SPARK_LIFE = 0.6, GRAVITY = 22;

const hsl = new THREE.Color();

// Writes the colour of a trail point into out[o..o+3]. f is freshness 1 (new) to 0 (gone); age in seconds.
function trailColor(style, f, age, time, out, o) {
  let r, g, b;
  if (style === 'pulse') {
    const wave = 0.6 + 0.6 * Math.sin(time * 10 - age * 14);
    [r, g, b] = [0.15 * wave, 1.1 * wave, 1.7 * wave];
  } else if (style === 'ember') {
    r = 2.2 - 1.0 * (1 - f); g = 1.0 * f; b = 0.12 * f;
  } else if (style === 'prism') {
    hsl.setHSL((time * 0.3 + age * 0.8) % 1, 1, 0.6);
    [r, g, b] = [hsl.r * 1.8, hsl.g * 1.8, hsl.b * 1.8];
  } else {
    [r, g, b] = [0.1, 1.2, 1.6];
  }
  out[o] = r; out[o + 1] = g; out[o + 2] = b;
  out[o + 3] = Math.pow(f, 1.5) * 0.9;
}

export function createFx(scene, camera, { reducedMotion = false } = {}) {
  let time = 0, style = 'neon', last = { x: 0, z: 0, heading: 0, speed: 0 };

  // Drift trails: one mesh, two ribbons, ring buffers.
  const ring = Array.from({ length: RIBBONS }, () => ({
    head: 0, x: new Float32Array(SLOTS), z: new Float32Array(SLOTS), nx: new Float32Array(SLOTS), nz: new Float32Array(SLOTS),
    birth: new Float32Array(SLOTS), alive: new Uint8Array(SLOTS), broken: new Uint8Array(SLOTS),
    lastX: 0, lastZ: 0, hasLast: false,
  }));
  const trailVerts = RIBBONS * SLOTS * 2;
  const trailPos = new Float32Array(trailVerts * 3), trailCol = new Float32Array(trailVerts * 4);
  const trailIndex = new Uint16Array(RIBBONS * (SLOTS - 1) * 6);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 4).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setIndex(new THREE.BufferAttribute(trailIndex, 1).setUsage(THREE.DynamicDrawUsage));
  const trailMesh = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  trailMesh.frustumCulled = false;
  scene.add(trailMesh);

  // Speed lines in camera space.
  const lineGeo = new THREE.BufferGeometry();
  const linePos = new Float32Array(STREAKS * 6);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xa8f4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  lines.frustumCulled = false;
  lines.visible = false;
  scene.add(lines);
  const streak = Array.from({ length: STREAKS }, (_, i) => {
    const angle = (i * 2.399963) % (Math.PI * 2), radius = 2.5 + ((i * 7919) % 100) / 100 * 7;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.6, phase: ((i * 104729) % 1000) / 1000 };
  });
  const tmpV = new THREE.Vector3();

  // Sparks.
  const sparkPos = new Float32Array(SPARKS * 3), sparkCol = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3), sparkLife = new Float32Array(SPARKS);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkNext = 0;

  // Boost flame behind the car.
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 3.2, 10).rotateX(-Math.PI / 2).translate(0, 0.65, -1.6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.7, 0.15), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flame.visible = false;
  scene.add(flame);

  // Radial boost flash over the screen.
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity 0.45s ease-out;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(38,232,255,0.55) 100%)';
  document.body.append(overlay);
  let overlayTimer = 0;

  function spawnTrailPoint(r, x, z, nx, nz) {
    const ring_ = ring[r], i = ring_.head;
    ring_.x[i] = x; ring_.z[i] = z; ring_.nx[i] = nx; ring_.nz[i] = nz;
    ring_.birth[i] = time; ring_.alive[i] = 1;
    ring_.broken[i] = ring_.hasLast ? 0 : 1;
    ring_.hasLast = true; ring_.lastX = x; ring_.lastZ = z;
    ring_.head = (i + 1) % SLOTS;
  }

  function updateTrails(s) {
    const sin = Math.sin(s.heading), cos = Math.cos(s.heading);
    const lx = cos, lz = -sin;   // left of heading
    if (s.drifting && s.speed > 8) {
      for (let r = 0; r < RIBBONS; r++) {
        const side = r === 0 ? 1 : -1;
        const x = s.x - sin * REAR_OFFSET + lx * WHEEL_OFFSET * side;
        const z = s.z - cos * REAR_OFFSET + lz * WHEEL_OFFSET * side;
        const rg = ring[r];
        if (!rg.hasLast || Math.hypot(x - rg.lastX, z - rg.lastZ) >= MIN_POINT_GAP) spawnTrailPoint(r, x, z, lx, lz);
      }
    } else {
      for (const rg of ring) rg.hasLast = false;
    }

    let ii = 0;
    for (let r = 0; r < RIBBONS; r++) {
      const rg = ring[r], base = r * SLOTS * 2;
      for (let k = 0; k < SLOTS; k++) {
        const slot = (rg.head + k) % SLOTS, age = time - rg.birth[slot];
        const alive = rg.alive[slot] === 1 && age < TRAIL_LIFE;
        if (!alive) rg.alive[slot] = 0;
        const v = base + k * 2;
        const x = rg.x[slot], z = rg.z[slot], nx = rg.nx[slot] * TRAIL_HALF_WIDTH, nz = rg.nz[slot] * TRAIL_HALF_WIDTH;
        trailPos.set([x + nx, 0.06, z + nz, x - nx, 0.06, z - nz], v * 3);
        if (alive) {
          trailColor(style, 1 - age / TRAIL_LIFE, age, time, trailCol, v * 4);
          trailCol.copyWithin((v + 1) * 4, v * 4, v * 4 + 4);
        } else {
          trailCol.fill(0, v * 4, v * 4 + 8);
        }
        if (k < SLOTS - 1) {
          const next = (slot + 1) % SLOTS;
          if (alive && rg.alive[next] === 1 && !rg.broken[next]) {
            const a = v, b = v + 1, c = v + 2, d = v + 3;
            trailIndex[ii++] = a; trailIndex[ii++] = b; trailIndex[ii++] = c;
            trailIndex[ii++] = b; trailIndex[ii++] = d; trailIndex[ii++] = c;
          }
        }
      }
    }
    trailGeo.setDrawRange(0, ii);
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;
    trailGeo.index.needsUpdate = true;
  }

  function updateSpeedLines(s) {
    const strength = Math.min(1, Math.max(0, (s.speed - 38) / 22)) * 0.5 + (s.boosting ? 0.3 : 0);
    lines.visible = !reducedMotion && strength > 0.02;
    if (!lines.visible) return;
    lines.material.opacity = strength;
    camera.updateMatrixWorld();
    const len = 1 + s.speed * 0.06;
    for (let i = 0; i < STREAKS; i++) {
      const st = streak[i];
      const d = STREAK_DEPTH + 2 - ((st.phase * STREAK_DEPTH + time * s.speed * 1.1) % STREAK_DEPTH);
      tmpV.set(st.x, st.y, -d).applyMatrix4(camera.matrixWorld);
      linePos.set([tmpV.x, tmpV.y, tmpV.z], i * 6);
      tmpV.set(st.x, st.y, -(d + len)).applyMatrix4(camera.matrixWorld);
      linePos.set([tmpV.x, tmpV.y, tmpV.z], i * 6 + 3);
    }
    lineGeo.attributes.position.needsUpdate = true;
  }

  function updateSparks(dt) {
    for (let i = 0; i < SPARKS; i++) {
      if (sparkLife[i] <= 0) { sparkCol[i * 3] = sparkCol[i * 3 + 1] = sparkCol[i * 3 + 2] = 0; continue; }
      sparkLife[i] -= dt;
      sparkVel[i * 3 + 1] -= GRAVITY * dt;
      for (let k = 0; k < 3; k++) sparkPos[i * 3 + k] += sparkVel[i * 3 + k] * dt;
      if (sparkPos[i * 3 + 1] < 0.05) { sparkPos[i * 3 + 1] = 0.05; sparkVel[i * 3 + 1] *= -0.3; }
      const f = Math.max(0, sparkLife[i] / SPARK_LIFE);
      sparkCol[i * 3] = 2.2 * f; sparkCol[i * 3 + 1] = 1.1 * f; sparkCol[i * 3 + 2] = 0.3 * f;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;
  }

  function burst(count) {
    for (let n = 0; n < count; n++) {
      const i = sparkNext;
      sparkNext = (sparkNext + 1) % SPARKS;
      sparkPos.set([last.x, 0.6, last.z], i * 3);
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 10;
      sparkVel.set([Math.cos(a) * sp, 3 + Math.random() * 7, Math.sin(a) * sp], i * 3);
      sparkLife[i] = SPARK_LIFE * (0.6 + Math.random() * 0.4);
    }
  }

  return {
    update(s, dt) {
      time += dt;
      last = s;
      updateTrails(s);
      updateSpeedLines(s);
      updateSparks(dt);
      flame.visible = s.boosting;
      if (s.boosting) {
        flame.position.set(s.x, 0, s.z);
        flame.rotation.y = s.heading;
        const flicker = 0.85 + 0.3 * Math.sin(time * 60);
        flame.scale.set(flicker, flicker, 0.8 + 0.4 * Math.sin(time * 47));
      }
    },
    event(e) {
      if (e.type === 'barrierHit') burst(Math.min(SPARKS, Math.round(10 + e.impact * 2)));
      else if (e.type === 'pylonHit') burst(18);
      else if (e.type === 'boost' && !reducedMotion) {
        overlay.style.transition = 'none';
        overlay.style.opacity = '0.7';
        clearTimeout(overlayTimer);
        overlayTimer = setTimeout(() => { overlay.style.transition = 'opacity 0.45s ease-out'; overlay.style.opacity = '0'; }, 40);
      }
    },
    setTrail(next) { style = next; },
    reset() {
      for (const rg of ring) { rg.alive.fill(0); rg.hasLast = false; }
      sparkLife.fill(0);
      sparkCol.fill(0);
      flame.visible = false;
      lines.visible = false;
      clearTimeout(overlayTimer);
      overlay.style.transition = 'none';
      overlay.style.opacity = '0';
    },
  };
}
