import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const SLOW_FRAME_MS = 22;
const WINDOW_MS = 2000;

export function createRenderer(canvas) {
  let gl;
  try {
    gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  gl.setPixelRatio(pixelRatio);
  gl.info.autoReset = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060f);
  scene.add(new THREE.AmbientLight(0x8a8cff, 1.1));
  const sun = new THREE.DirectionalLight(0xbfd8ff, 1.6);
  sun.position.set(-0.4, 1, 0.3);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(68, 1, 0.5, 6000);

  const composer = new EffectComposer(gl);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.4, 0.75);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let bloomOn = true;

  let windowStart = performance.now(), windowFrames = 0, lastFrame = windowStart;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    gl.setPixelRatio(pixelRatio);
    gl.setSize(w, h, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function stepDownQuality(now) {
    windowFrames++;
    if (now - windowStart < WINDOW_MS) return;
    const avg = (now - windowStart) / windowFrames;
    windowStart = now; windowFrames = 0;
    if (avg <= SLOW_FRAME_MS) return;
    if (pixelRatio > 1) { pixelRatio = 1; resize(); }
    else if (bloomOn) { bloomOn = false; bloom.enabled = false; }
  }

  return {
    scene, camera, gl,
    get info() { return gl.info; },
    render() {
      const now = performance.now();
      if (now - lastFrame < 500) stepDownQuality(now); else { windowStart = now; windowFrames = 0; }
      lastFrame = now;
      gl.info.reset();
      composer.render();
    },
    resize,
    dispose() {
      window.removeEventListener('resize', resize);
      composer.dispose();
      gl.dispose();
    },
  };
}
