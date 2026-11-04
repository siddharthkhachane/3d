const BEHIND = 9, ABOVE = 3.6, LOOK_AHEAD = 6, LOOK_HEIGHT = 1.2;
const FOV_REST = 68, FOV_TOP = 84, FOV_BOOST = 90, MAX_SPEED_REF = 55;
const POS_RATE = 8, HEADING_RATE = 5, FOV_RATE = 6, SHAKE_DECAY = 8, SHAKE_SCALE = 0.35;

const wrapAngle = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
};

export function createChaseCamera(camera) {
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let camHeading = 0, fov = FOV_REST, shake = 0;

  const desired = (s) => ({
    x: s.x - Math.sin(camHeading) * BEHIND,
    y: ABOVE,
    z: s.z - Math.cos(camHeading) * BEHIND,
  });
  const targetFov = (s) => (s.boosting ? FOV_BOOST : FOV_REST + (FOV_TOP - FOV_REST) * Math.min(1, s.speed / MAX_SPEED_REF));
  const aim = (s) => camera.lookAt(s.x + Math.sin(s.heading) * LOOK_AHEAD, LOOK_HEIGHT, s.z + Math.cos(s.heading) * LOOK_AHEAD);

  return {
    snap(s) {
      camHeading = s.heading;
      const d = desired(s);
      camera.position.set(d.x, d.y, d.z);
      fov = targetFov(s);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      shake = 0;
      aim(s);
    },
    update(s, dt) {
      camHeading += wrapAngle(s.heading - camHeading) * (1 - Math.exp(-HEADING_RATE * dt));
      const d = desired(s), k = 1 - Math.exp(-POS_RATE * dt);
      camera.position.x += (d.x - camera.position.x) * k;
      camera.position.y += (d.y - camera.position.y) * k;
      camera.position.z += (d.z - camera.position.z) * k;
      if (shake > 0.001) {
        camera.position.x += (Math.random() - 0.5) * shake * SHAKE_SCALE;
        camera.position.y += (Math.random() - 0.5) * shake * SHAKE_SCALE;
        shake *= Math.exp(-SHAKE_DECAY * dt);
      }
      const f = targetFov(s);
      fov += (f - fov) * (1 - Math.exp(-FOV_RATE * dt));
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      aim(s);
    },
    kick(strength) { if (!reducedMotion) shake = Math.max(shake, strength); },
  };
}
