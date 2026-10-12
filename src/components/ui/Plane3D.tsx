import { useEffect, useRef } from 'react';
import { getShared, subscribe } from './plane3DRenderer';
import type { Drawer } from './plane3DRenderer';

// Real 3D gold airliner for the trip countdown card. The shared renderer and the
// shared animation loop live in plane3DRenderer.ts; each plane here just poses the
// shared model and copies the result onto its own small 2D canvas.

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
