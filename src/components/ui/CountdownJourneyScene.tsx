import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Brand palette (see src/styles/globals.css @theme) expressed as three.js
// colors — kept in sync by hand since three.js can't read CSS custom
// properties. primary-light / gold / secondary are the warm ambers this
// site already uses for its "trip starts in" accents; red-400 is Tailwind's
// stock red, matching the urgency palette used elsewhere on this card.
const EMBER_COLOR = new THREE.Color('#C4703A');
const EMBER_COLOR_URGENT = new THREE.Color('#f87171');
const ARC_COLOR = new THREE.Color('#C8962A');
const ARC_COLOR_URGENT = new THREE.Color('#ef4444');

const PARTICLE_COUNT = 90;

interface CountdownJourneySceneProps {
  // 0–1: how far through the "final stretch" toward departure this trip is
  // — see the progress calc in TripDetailPage. Drives how far the glowing
  // arc has filled and where the marker sits on it.
  progress: number;
  urgent: boolean;
}

/**
 * Ambient three.js background for the countdown card: a slow field of warm
 * embers plus a glowing arc (a stand-in flight path) that fills in as
 * departure approaches, with a small marker travelling along it. Purely
 * decorative — every number the visitor actually needs is in the HTML
 * overlay on top of this, so if WebGL is unavailable or the visitor prefers
 * reduced motion, this component simply renders nothing rather than
 * degrading the page.
 */
export default function CountdownJourneyScene({ progress, urgent }: CountdownJourneySceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Mutable refs for the few things the animation loop needs to read live
  // without re-running the whole three.js setup effect on every tick.
  const progressRef = useRef(progress);
  const urgentRef = useRef(urgent);
  useEffect(() => {
    progressRef.current = progress;
    urgentRef.current = urgent;
  }, [progress, urgent]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Static, motionless field is still a fine bit of texture for the card
    // even when we skip the animation loop — just don't tick it.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 5;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';

    // ── Embers ──────────────────────────────────────────────────────────
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * 1.05;
      positions[i * 3 + 1] = Math.random() * 2 - 1;
      positions[i * 3 + 2] = 0;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: urgent ? EMBER_COLOR_URGENT : EMBER_COLOR,
      size: 0.018,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // ── Journey arc — a gentle curve spanning the card, filled up to
    // `progress` in a brighter color with a marker riding the fill edge. ──
    const arcPoints: THREE.Vector3[] = [];
    const ARC_SEGMENTS = 64;
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const x = (t * 2 - 1) * 0.92;
      const y = -0.32 + Math.sin(t * Math.PI) * 0.16;
      arcPoints.push(new THREE.Vector3(x, y, 0));
    }
    const trackGeometry = new THREE.BufferGeometry().setFromPoints(arcPoints);
    const trackMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 });
    const track = new THREE.Line(trackGeometry, trackMaterial);
    scene.add(track);

    const filledCount = Math.max(2, Math.round(ARC_SEGMENTS * progressRef.current) + 1);
    const filledGeometry = new THREE.BufferGeometry().setFromPoints(arcPoints.slice(0, filledCount));
    const filledMaterial = new THREE.LineBasicMaterial({
      color: urgent ? ARC_COLOR_URGENT : ARC_COLOR,
      transparent: true,
      opacity: 0.75,
    });
    const filledTrack = new THREE.Line(filledGeometry, filledMaterial);
    scene.add(filledTrack);

    const markerGeometry = new THREE.CircleGeometry(0.014, 20);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: urgent ? ARC_COLOR_URGENT : ARC_COLOR,
      transparent: true,
      opacity: 0.95,
    });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    const markerPoint = arcPoints[Math.min(arcPoints.length - 1, filledCount - 1)];
    marker.position.copy(markerPoint);
    scene.add(marker);

    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight, false);
    };
    resize();

    const render = () => {
      const elapsed = clock.getElapsedTime();
      const posAttr = particleGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const seed = seeds[i];
        // Slow upward drift with a little horizontal sway — wraps back to
        // the bottom once it drifts off the top, so the field looks
        // continuous rather than emptying out over time.
        let y = posAttr.getY(i) + 0.0009 + Math.sin(elapsed * 0.4 + seed) * 0.00005;
        if (y > 1.05) y = -1.05;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
      particleMaterial.opacity = 0.4 + Math.sin(elapsed * 0.6) * 0.15;

      const currentUrgent = urgentRef.current;
      const targetColor = currentUrgent ? EMBER_COLOR_URGENT : EMBER_COLOR;
      particleMaterial.color.lerp(targetColor, 0.05);
      const targetArcColor = currentUrgent ? ARC_COLOR_URGENT : ARC_COLOR;
      filledMaterial.color.lerp(targetArcColor, 0.05);
      (marker.material as THREE.MeshBasicMaterial).color.lerp(targetArcColor, 0.05);
      const markerPulse = 1 + Math.sin(elapsed * 3) * 0.15;
      marker.scale.setScalar(markerPulse);

      renderer.render(scene, camera);
      if (!disposed && !prefersReducedMotion) frameId = requestAnimationFrame(render);
    };

    if (prefersReducedMotion) {
      renderer.render(scene, camera);
    } else {
      frameId = requestAnimationFrame(render);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      particleGeometry.dispose();
      particleMaterial.dispose();
      trackGeometry.dispose();
      trackMaterial.dispose();
      filledGeometry.dispose();
      filledMaterial.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
    // Re-running this whole setup on every progress/urgent tick would rebuild
    // the entire scene each second — the live values are read from the refs
    // above instead, so this only re-runs if the component itself remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden rounded-[27px]" aria-hidden="true" />;
}
