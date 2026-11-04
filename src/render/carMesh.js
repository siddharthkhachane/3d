import * as THREE from 'three';

const ghostMaterial = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false });

export function createCarMesh({ color, ghost = false } = {}) {
  color ??= ghost ? 0x40f0ff : 0x00e5ff;
  const group = new THREE.Group();
  const lit = ghost ? ghostMaterial(color) : new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.55) });
  const dark = ghost ? lit : new THREE.MeshLambertMaterial({ color: 0x101423 });
  const glow = (c) => (ghost ? lit : new THREE.MeshBasicMaterial({ color: new THREE.Color(c) }));
  const part = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  part(1.9, 0.45, 4.2, lit, 0, 0.55, 0);
  part(1.5, 0.12, 1.6, lit, 0, 0.83, 1.2);       // low nose slope
  part(1.4, 0.5, 1.9, dark, 0, 1.0, -0.35);      // cabin
  const stripe = glow(new THREE.Color(color).multiplyScalar(2.5));
  for (const sx of [-1, 1]) {
    part(0.3, 0.5, 0.8, dark, sx * 0.95, 0.3, 1.3);
    part(0.3, 0.5, 0.8, dark, sx * 0.95, 0.3, -1.3);
    part(0.05, 0.08, 3.4, stripe, sx * 0.96, 0.5, 0);
  }
  part(1.6, 0.12, 0.08, glow(new THREE.Color(4, 0.15, 0.3)), 0, 0.7, -2.12);   // tail light
  part(1.5, 0.08, 0.08, glow(new THREE.Color(2.5, 2.5, 2)), 0, 0.6, 2.12);     // headlight bar
  group.userData.setColor = (c) => {
    const col = new THREE.Color(c);
    if (ghost) { lit.color.copy(col); return; }
    lit.color.copy(col).multiplyScalar(0.55);
    stripe.color.copy(col).multiplyScalar(2.5);
  };
  return group;
}
