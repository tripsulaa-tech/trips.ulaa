import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Ambient three.js background for the countdown card: a sparse field of
// slow-drifting embers kept to the outer margins, plus a dotted "flight
// path" arcing across the bottom of the card — climbing away from the
// left edge, peaking mid-card, descending back down toward the right —
// with a small plane shape riding the leading edge of the filled
// (traveled) portion, banking to match the curve's slope as it climbs
// and descends. Deliberately stays clear of the horizontal band across
// the middle of the card, since that's where the digit tiles sit —
// nothing here renders behind them. Purely decorative: every number the
// visitor actually needs is in the HTML overlay on top, so if WebGL is
// unavailable or the visitor prefers reduced motion this simply renders
// nothing rather than degrading the page.

// Brand palette (see src/styles/globals.css @theme) expressed as three.js
// colors — kept in sync by hand since three.js can't read CSS custom
// properties. gold / primary-light are the warm ambers this site already
// uses for its "trip starts in" accents; red-400 is Tailwind's stock red,
// matching the urgency palette used elsewhere on this card.
const EMBER_COLOR = new THREE.Color('#C8962A');
const EMBER_COLOR_URGENT = new THREE.Color('#f87171');
const PATH_COLOR = new THREE.Color('#C4703A');
const PATH_COLOR_URGENT = new THREE.Color('#ef4444');

const PARTICLE_COUNT = 70;
const PATH_SEGMENTS = 48;
const PATH_Y_BASE = -0.86; // near the bottom edge, clear of the digit row
const ARC_HEIGHT = 0.22; // how high the flight path climbs at its mid-card peak
const DASH_SIZE = 0.035;
const DASH_GAP = 0.03;
const PLANE_SIZE = 0.05;

interface TripOrbitSceneProps {
  // 0–1: how far through the "final stretch" toward departure this trip is
  // — see the progress calc in TripCountdownCard. Drives how far the
  // bottom flight-path line has filled.
  progress: number;
  urgent: boolean;
}

export default function TripOrbitScene({ progress, urgent }: TripOrbitSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Mutable refs for the values the animation loop needs to read live
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

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }

    const scene = new THREE.Scene();
    // Orthographic, aspect-corrected so the flight path's arc keeps a
    // consistent shape and doesn't stretch/flatten unevenly on the wide
    // desktop banner vs. the taller mobile card.
    let aspect = 1;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 5;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';

    // ── Embers — kept to the outer left/right margins so they never read
    // as clutter behind the digit tiles, which sit in the horizontal
    // center of the card. ──
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT);
    const lanes = new Float32Array(PARTICLE_COUNT); // 0 = left margin, 1 = right margin
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const lane = Math.random() < 0.5 ? 0 : 1;
      lanes[i] = lane;
      const marginX = 0.62 + Math.random() * 0.36;
      positions[i * 3] = lane === 0 ? -marginX : marginX;
      positions[i * 3 + 1] = Math.random() * 2 - 1;
      positions[i * 3 + 2] = 0;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: urgent ? EMBER_COLOR_URGENT : EMBER_COLOR,
      size: 0.016,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // ── Bottom flight path — a dim dotted track plus a brighter dotted
    // fill riding up to `progress`, arcing up from the left edge, peaking
    // mid-card, and back down toward the right — like a short takeoff/
    // landing arc rather than a flat line. Sits low enough that even its
    // peak stays clear of the digit tiles above it. ──
    const curvePoint = (t: number, half: number) =>
      new THREE.Vector3(-half + t * half * 2, PATH_Y_BASE + ARC_HEIGHT * Math.sin(t * Math.PI), 0);

    const buildPathPoints = (p: number) => {
      const count = Math.max(2, Math.round(PATH_SEGMENTS * p) + 1);
      const pts: THREE.Vector3[] = [];
      const half = 0.9 * aspect;
      for (let i = 0; i < count; i++) {
        const t = i / PATH_SEGMENTS;
        pts.push(curvePoint(t, half));
      }
      return pts;
    };

    const buildTrackPoints = (half: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= PATH_SEGMENTS; i++) {
        pts.push(curvePoint(i / PATH_SEGMENTS, half));
      }
      return pts;
    };

    const trackGeometry = new THREE.BufferGeometry().setFromPoints(buildTrackPoints(0.9 * aspect));
    const trackMaterial = new THREE.LineDashedMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
      dashSize: DASH_SIZE,
      gapSize: DASH_GAP,
    });
    const track = new THREE.Line(trackGeometry, trackMaterial);
    track.computeLineDistances();
    scene.add(track);

    let filledGeometry = new THREE.BufferGeometry().setFromPoints(buildPathPoints(progressRef.current));
    const filledMaterial = new THREE.LineDashedMaterial({
      color: urgent ? PATH_COLOR_URGENT : PATH_COLOR,
      transparent: true,
      opacity: 0.9,
      dashSize: DASH_SIZE,
      gapSize: DASH_GAP,
    });
    const filledTrack = new THREE.Line(filledGeometry, filledMaterial);
    filledTrack.computeLineDistances();
    scene.add(filledTrack);

    // Small paper-plane silhouette (nose pointing along +x by default) that
    // rides the leading edge of the filled arc and banks to match the
    // curve's slope — climbing nose-up on the way up, leveling at the
    // peak, nose-down on the way down.
    const buildPlaneShape = () => {
      const shape = new THREE.Shape();
      shape.moveTo(PLANE_SIZE, 0);
      shape.lineTo(-PLANE_SIZE * 0.7, PLANE_SIZE * 0.5);
      shape.lineTo(-PLANE_SIZE * 0.35, 0);
      shape.lineTo(-PLANE_SIZE * 0.7, -PLANE_SIZE * 0.5);
      shape.closePath();
      return shape;
    };
    const markerGeometry = new THREE.ShapeGeometry(buildPlaneShape());
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: urgent ? PATH_COLOR_URGENT : PATH_COLOR,
      transparent: true,
      opacity: 0.95,
    });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    scene.add(marker);

    const updateMarker = (p: number) => {
      const half = 0.9 * aspect;
      const { x, y } = curvePoint(p, half);
      marker.position.set(x, y, 0);
      // Tangent of the arc at t=p — banks the plane's nose to follow the
      // climb/descent instead of always pointing flat along the x-axis.
      const dydt = ARC_HEIGHT * Math.PI * Math.cos(p * Math.PI);
      const dxdt = half * 2;
      marker.rotation.z = Math.atan2(dydt, dxdt);
    };
    updateMarker(progressRef.current);

    let frameId = 0;
    let lastRenderedProgress = progressRef.current;
    const clock = new THREE.Clock();

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      aspect = clientWidth / clientHeight;
      camera.left = -aspect;
      camera.right = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight, false);
      // Rebuild the path geometry against the new aspect so it still spans
      // the card edge-to-edge after a resize.
      const half = 0.9 * aspect;
      trackGeometry.setFromPoints(buildTrackPoints(half));
      track.computeLineDistances();
      filledTrack.geometry.dispose();
      filledTrack.geometry = new THREE.BufferGeometry().setFromPoints(buildPathPoints(lastRenderedProgress));
      filledTrack.computeLineDistances();
      updateMarker(lastRenderedProgress);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const render = () => {
      const elapsed = clock.getElapsedTime();
      const posAttr = particleGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const seed = seeds[i];
        // Slow upward drift with a little horizontal sway — wraps back to
        // the bottom once it drifts off the top, so the field looks
        // continuous rather than emptying out over time.
        let y = posAttr.getY(i) + 0.0007 + Math.sin(elapsed * 0.4 + seed) * 0.00004;
        if (y > 1.05) y = -1.05;
        posAttr.setY(i, y);
        const marginX = 0.62 + (Math.sin(elapsed * 0.3 + seed) * 0.5 + 0.5) * 0.36;
        posAttr.setX(i, lanes[i] === 0 ? -marginX : marginX);
      }
      posAttr.needsUpdate = true;
      particleMaterial.opacity = 0.3 + Math.sin(elapsed * 0.6) * 0.1;

      const currentUrgent = urgentRef.current;
      const targetEmberColor = currentUrgent ? EMBER_COLOR_URGENT : EMBER_COLOR;
      particleMaterial.color.lerp(targetEmberColor, 0.05);
      const targetPathColor = currentUrgent ? PATH_COLOR_URGENT : PATH_COLOR;
      filledMaterial.color.lerp(targetPathColor, 0.05);
      (marker.material as THREE.MeshBasicMaterial).color.lerp(targetPathColor, 0.05);

      if (Math.abs(progressRef.current - lastRenderedProgress) > 0.0008) {
        lastRenderedProgress = progressRef.current;
        filledTrack.geometry.dispose();
        filledTrack.geometry = new THREE.BufferGeometry().setFromPoints(buildPathPoints(lastRenderedProgress));
        filledTrack.computeLineDistances();
        updateMarker(lastRenderedProgress);
      }
      const pulse = 1 + Math.sin(elapsed * 3) * 0.12;
      marker.scale.set(pulse, pulse, 1);

      renderer.render(scene, camera);
      if (!prefersReducedMotion) frameId = requestAnimationFrame(render);
    };

    if (prefersReducedMotion) {
      renderer.render(scene, camera);
    } else {
      frameId = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      trackGeometry.dispose();
      trackMaterial.dispose();
      filledTrack.geometry.dispose();
      filledMaterial.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // Only re-run the full three.js setup on mount/unmount — progress and
    // urgent flow through the refs above so the scene isn't torn down and
    // rebuilt on every timer tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
      aria-hidden="true"
    />
  );
}
