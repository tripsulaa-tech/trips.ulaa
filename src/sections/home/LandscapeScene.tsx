import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { LandscapeController } from './heroLandscape';

interface Props {
  markerRef: RefObject<HTMLDivElement | null>;
  paused: boolean;
  reducedMotion: boolean;
  resetKey: number;
  onReady(): void;
  onError(): void;
}

export default function LandscapeScene({ markerRef, paused, reducedMotion, resetKey, onReady, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<LandscapeController | null>(null);
  const settings = useRef({ paused, reducedMotion });
  useEffect(() => {
    settings.current = { paused, reducedMotion };
    controllerRef.current?.setPaused(paused);
    controllerRef.current?.setReducedMotion(reducedMotion);
  }, [paused, reducedMotion]);

  useEffect(() => {
    let cancelled = false;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) { onError(); return; }
    const timeout = window.setTimeout(onError, 10000);
    // Three.js is downloaded separately; text and booking links render first.
    import('./heroLandscape').then(({ createLandscape }) => {
      if (cancelled || !canvasRef.current || !markerRef.current) return;
      try {
        controllerRef.current = createLandscape(canvasRef.current, markerRef.current, {
          ...settings.current,
          onReady: () => { window.clearTimeout(timeout); onReady(); },
          onError: () => { window.clearTimeout(timeout); onError(); },
        });
      } catch {
        onError();
      }
    }).catch(() => { if (!cancelled) onError(); });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [markerRef, onReady, onError]);

  useEffect(() => { controllerRef.current?.reset(); }, [resetKey]);

  return (
    <canvas
      ref={canvasRef}
      className="ulaa-landscape-canvas"
      tabIndex={0}
      role="group"
      aria-roledescription="interactive landscape"
      aria-label="Mountain lake at sunrise. Move your pointer or drag horizontally to look around. Keyboard: arrow keys to look around, Home to reset."
    />
  );
}
