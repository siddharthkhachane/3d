import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hashString, mulberry32 } from '../sim/rng.js';
import { ROAD_HALF_WIDTH, BARRIER_LATERAL, CHECKPOINTS } from '../sim/constants.js';

const BARRIER_HEIGHT = 1.2;
const FLASH_DECAY = 3;
const STAR_COUNT = 1500, STAR_RADIUS = 2800;

// Strip along the track between two lateral offsets (left positive) and two heights.
// aU runs -1 at the first edge to +1 at the second; aS is arc length.
function ribbon(track, latA, latB, yA, yB) {
  const { count, spacing, xs, zs, txs, tzs } = track;
  const verts = (count + 1) * 2;
  const pos = new Float32Array(verts * 3), aS = new Float32Array(verts), aU = new Float32Array(verts);
  for (let i = 0; i <= count; i++) {
    const k = i % count, nx = tzs[k], nz = -txs[k];
    [[latA, yA, -1], [latB, yB, 1]].forEach(([lat, y, u], side) => {
      const v = i * 2 + side;
      pos.set([xs[k] + nx * lat, y, zs[k] + nz * lat], v * 3);
      aS[v] = i * spacing;
      aU[v] = u;
    });
  }
  const index = [];
  for (let i = 0; i < count; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  geo.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
  geo.setIndex(index);
  return geo;
}

const roadMaterial = () => new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: `
    attribute float aS; attribute float aU;
    varying float vS; varying float vU;
    void main() { vS = aS; vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    varying float vS; varying float vU;
    void main() {
      float edge = smoothstep(0.86, 0.97, abs(vU));
      vec3 edgeColor = vU > 0.0 ? vec3(0.0, 1.3, 1.8) : vec3(1.8, 0.1, 1.2);
      float dash = step(mod(vS, 10.0), 5.0) * (1.0 - smoothstep(0.012, 0.03, abs(vU)));
      float cross = (1.0 - smoothstep(0.0, 0.25, abs(mod(vS, 25.0) - 12.5) - 12.2)) * 0.05;
      vec3 col = vec3(0.004, 0.005, 0.014) + vec3(cross * 0.2) + edgeColor * edge + vec3(0.55) * dash;
      gl_FragColor = vec4(col, 1.0);
    }`,
});

const groundMaterial = () => new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vW;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    varying vec3 vW;
    void main() {
      vec2 p = vW.xz / 20.0;
      vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
      float line = 1.0 - min(min(g.x, g.y), 1.0);
      float fade = 1.0 - smoothstep(80.0, 1400.0, distance(vW, cameraPosition));
      gl_FragColor = vec4(vec3(0.012, 0.014, 0.034) + vec3(0.35, 0.12, 0.9) * line * 0.55 * fade, 1.0);
    }`,
});

export function createWorld(scene, track) {
  const owned = [];
  const add = (obj) => { scene.add(obj); owned.push(obj); return obj; };

  add(new THREE.Mesh(ribbon(track, -ROAD_HALF_WIDTH, ROAD_HALF_WIDTH, 0, 0), roadMaterial()));
  add(new THREE.Mesh(ribbon(track, -BARRIER_LATERAL, BARRIER_LATERAL, -0.03, -0.03), new THREE.MeshBasicMaterial({ color: 0x07081a, side: THREE.DoubleSide })));
  const barrierColors = [new THREE.Color(0.1, 1.4, 1.8), new THREE.Color(1.8, 0.15, 1.2)];   // left cyan, right magenta
  [1, -1].forEach((side, i) => {
    const lat = side * BARRIER_LATERAL;
    add(new THREE.Mesh(ribbon(track, lat, lat, 0, BARRIER_HEIGHT), new THREE.MeshBasicMaterial({ color: barrierColors[i], side: THREE.DoubleSide })));
  });

  const ground = add(new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), groundMaterial()));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.frustumCulled = false;

  const rng = mulberry32(hashString('stars'));
  const starPos = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = rng() * Math.PI * 2, phi = Math.acos(rng() * 0.95 + 0.05);
    starPos.set([Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)].map((v) => v * STAR_RADIUS), i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, color: 0xaab4ff, fog: false, depthWrite: false })));
  stars.frustumCulled = false;

  // Checkpoint gates: one arch per checkpoint, index 0 is start/finish.
  const post = (x) => new THREE.BoxGeometry(0.5, 6, 0.5).translate(x, 3, 0);
  const gateGeo = mergeGeometries([post(-7.6), post(7.6), new THREE.BoxGeometry(15.7, 0.5, 0.5).translate(0, 6, 0)]);
  const gates = add(new THREE.InstancedMesh(gateGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), CHECKPOINTS));
  const gateBase = [], gateFlash = new Float32Array(CHECKPOINTS);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < CHECKPOINTS; k++) {
    const idx = Math.floor((k * track.count) / CHECKPOINTS);
    q.setFromAxisAngle(up, Math.atan2(track.txs[idx], track.tzs[idx]));
    m.compose(new THREE.Vector3(track.xs[idx], 0, track.zs[idx]), q, new THREE.Vector3(1, 1, 1));
    gates.setMatrixAt(k, m);
    gateBase.push(k === 0 ? new THREE.Color(0.9, 0.9, 1.0) : new THREE.Color(0.05, 0.5, 0.85));
    gates.setColorAt(k, gateBase[k]);
  }
  const flashColor = new THREE.Color(2.5, 2.5, 1.5), tmp = new THREE.Color();

  const PYLON_LIT = new THREE.Color(2.2, 0.9, 0.1), PYLON_DIM = new THREE.Color(0.25, 0.12, 0.03);
  const pylonGeo = new THREE.ConeGeometry(0.7, 2.2, 8).translate(0, 1.1, 0);
  const pylons = add(new THREE.InstancedMesh(pylonGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, track.pylons.length)));
  pylons.count = track.pylons.length;
  track.pylons.forEach((p, i) => {
    pylons.setMatrixAt(i, m.makeTranslation(p.x, 0, p.z));
    pylons.setColorAt(i, PYLON_LIT);
  });

  let lastTime = null;
  return {
    update(timeSec) {
      const dt = lastTime === null ? 0 : Math.min(0.1, Math.max(0, timeSec - lastTime));
      lastTime = timeSec;
      let dirty = false;
      for (let k = 0; k < CHECKPOINTS; k++) {
        if (gateFlash[k] <= 0) continue;
        gateFlash[k] = gateFlash[k] < 0.01 ? 0 : gateFlash[k] * Math.exp(-FLASH_DECAY * dt);
        gates.setColorAt(k, tmp.copy(gateBase[k]).lerp(flashColor, gateFlash[k]));
        dirty = true;
      }
      if (dirty) gates.instanceColor.needsUpdate = true;
    },
    flashGate(k) { gateFlash[k % CHECKPOINTS] = 1; },
    setPylonHit(i) { pylons.setColorAt(i, PYLON_DIM); pylons.instanceColor.needsUpdate = true; },
    resetPylons() {
      for (let i = 0; i < track.pylons.length; i++) pylons.setColorAt(i, PYLON_LIT);
      if (pylons.instanceColor) pylons.instanceColor.needsUpdate = true;
    },
    dispose() {
      for (const obj of owned) {
        scene.remove(obj);
        obj.geometry.dispose();
        obj.material.dispose();
        obj.dispose?.();
      }
      owned.length = 0;
    },
  };
}
