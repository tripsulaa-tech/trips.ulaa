import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildPlane, type PlaneModel } from './planeModel';

// Real 3D gold airliner drawn with three.js, used wherever the countdown card
// shows the plane (route, the phone fly-down copy, the button sweep).
//
// The card can show up to three planes at once, so instead of one WebGL
// context each they all share a single offscreen renderer: every frame the
// shared scene is posed, rendered once per plane and copied onto that
// plane's own small 2D canvas. If WebGL isn't available isPlane3DSupported()
// returns false and the caller falls back to the flat SVG plane.

const RENDER_SIZE = 192; // square, px. Plenty for a 26-40px plane at 2-3x DPR

interface Shared {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  model: PlaneModel;
}

let shared: Shared | null | undefined; // undefined = not tried yet, null = unavailable

function getShared(): Shared | null {
  if (shared !== undefined) return shared;
  try {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(RENDER_SIZE, RENDER_SIZE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-1, 3, 2);
    scene.add(key);

    // Looking down at the plane from slightly behind and to the side so the
    // wings read as solid. Screen right = the plane's nose direction (+X).
    const camera = new THREE.PerspectiveCamera(23.5, 1, 0.1, 20);
    camera.up.set(0, 0, -1);
    camera.position.set(-0.1, 0.92, 0.38).normalize().multiplyScalar(5.4);
    camera.lookAt(0, 0, 0);

    const model = buildPlane();
    scene.add(model.group);

    shared = { renderer, scene, camera, model };
  } catch {
    shared = null;
  }
  return shared;
}

export function isPlane3DSupported(): boolean {
  return typeof document !== 'undefined' && getShared() !== null;
}

// ── One shared animation loop for every visible plane ──
type Drawer = (t: number) => void;
const drawers = new Set<Drawer>();
let rafId = 0;
const clock = { start: 0 };

function tick(now: number) {
  if (!clock.start) clock.start = now;
  const t = (now - clock.start) / 1000;
  drawers.forEach((draw) => draw(t));
  rafId = drawers.size ? requestAnimationFrame(tick) : 0;
}

function subscribe(draw: Drawer, animate: boolean) {
  if (!animate) {
    draw(0);
    return () => {};
  }
  drawers.add(draw);
  if (!rafId) rafId = requestAnimationFrame(tick);
  return () => {
    drawers.delete(draw);
    if (!drawers.size && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}

export default function Plane3D({ size = 40 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const s = getShared();
    if (!canvas || !s) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const px = Math.round(size * dpr);
    canvas.width = px;
    canvas.height = px;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Each plane banks out of step with the others.
    const phase = Math.random() * Math.PI * 2;

    const draw: Drawer = (t) => {
      const { renderer, scene, camera, model } = s;
      // A lazy roll about the nose axis plus a slight pitch and yaw drift, so
      // the plane looks like it's gliding rather than sliding along a rail.
      const roll = reduceMotion ? 0.16 : Math.sin(t * 1.5 + phase) * 0.32;
      const pitch = reduceMotion ? 0 : Math.sin(t * 0.9 + phase * 1.7) * 0.04;
      const yaw = reduceMotion ? 0 : Math.sin(t * 0.7 + phase * 0.6) * 0.05;
      model.group.rotation.set(roll, yaw, pitch);
      renderer.render(scene, camera);
      ctx.clearRect(0, 0, px, px);
      ctx.drawImage(renderer.domElement, 0, 0, px, px);
    };

    return subscribe(draw, !reduceMotion);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="relative block drop-shadow-[0_2px_8px_rgba(233,199,123,0.6)]"
    />
  );
}
