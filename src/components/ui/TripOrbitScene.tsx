import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Ambient three.js background for the countdown card: a slowly tumbling
// wireframe polyhedron — standing in for the destination itself — orbited
// by a thin particle ring that fills in as departure approaches, drifting
// through a sparse starfield. Purely decorative: every number the visitor
// actually needs is in the HTML overlay on top, so if WebGL is unavailable
// or the visitor prefers reduced motion this simply renders nothing rather
// than degrading the page.
const HUE_NORMAL = new THREE.Color('#A78BFA'); // violet
const HUE_NORMAL_DIM = new THREE.Color('#4C3D99');
const HUE_URGENT = new THREE.Color('#FB923C'); // warm coral/orange
const HUE_URGENT_DIM = new THREE.Color('#7A2E1F');

const STAR_COUNT = 140;
const RING_SEGMENTS = 120;
const RING_RADIUS = 1.35;

interface TripOrbitSceneProps {
  // 0–1: how far through the "final stretch" toward departure this trip is
  // — see the progress calc in TripCountdownCard. Drives how far the
  // particle ring has filled and where the marker sits on it.
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
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
    camera.position.set(0, 0.15, 4.2);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';

    // ── Starfield — sparse dots scattered through the depth of the card ──
    const starPositions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      starPositions[i * 3] = (Math.random() * 2 - 1) * 3.4;
      starPositions[i * 3 + 1] = (Math.random() * 2 - 1) * 1.3;
      starPositions[i * 3 + 2] = (Math.random() * 2 - 1) * 1.6 - 0.4;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.014,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    // ── Center waypoint — a faceted wireframe icosahedron that slowly
    // tumbles in place. ──
    const coreGeometry = new THREE.IcosahedronGeometry(0.62, 1);
    const coreEdges = new THREE.EdgesGeometry(coreGeometry);
    const coreMaterial = new THREE.LineBasicMaterial({
      color: urgent ? HUE_URGENT : HUE_NORMAL,
      transparent: true,
      opacity: 0.45,
    });
    const core = new THREE.LineSegments(coreEdges, coreMaterial);
    scene.add(core);

    // Faint solid fill inside the wireframe so it doesn't read as hollow.
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: urgent ? HUE_URGENT_DIM : HUE_NORMAL_DIM,
      transparent: true,
      opacity: 0.08,
    });
    const fill = new THREE.Mesh(coreGeometry, fillMaterial);
    scene.add(fill);

    // ── Progress ring — a dim full track plus a bright trail of particles
    // riding it up to `progress`, tilted so it reads as an orbit. ──
    const track = new THREE.Group();
    track.rotation.x = 1.15;
    track.rotation.z = 0.25;
    scene.add(track);

    const trackPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const t = (i / RING_SEGMENTS) * Math.PI * 2;
      trackPoints.push(new THREE.Vector3(Math.cos(t) * RING_RADIUS, Math.sin(t) * RING_RADIUS, 0));
    }
    const trackGeometry = new THREE.BufferGeometry().setFromPoints(trackPoints);
    const trackLineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 });
    const trackLine = new THREE.LineLoop(trackGeometry, trackLineMaterial);
    track.add(trackLine);

    const arcPositions = new Float32Array((RING_SEGMENTS + 1) * 3);
    const arcGeometry = new THREE.BufferGeometry();
    arcGeometry.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
    arcGeometry.setDrawRange(0, 0);
    const arcMaterial = new THREE.PointsMaterial({
      color: urgent ? HUE_URGENT : HUE_NORMAL,
      size: 0.05,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const arcPoints = new THREE.Points(arcGeometry, arcMaterial);
    track.add(arcPoints);

    // Marker riding the leading edge of the filled arc.
    const markerGeometry = new THREE.SphereGeometry(0.045, 12, 12);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: urgent ? HUE_URGENT : HUE_NORMAL });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    track.add(marker);

    const updateArc = (p: number) => {
      const count = Math.max(1, Math.round(p * RING_SEGMENTS));
      const posAttr = arcGeometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i <= count; i++) {
        const t = (i / RING_SEGMENTS) * Math.PI * 2;
        posAttr.setXYZ(i, Math.cos(t) * RING_RADIUS, Math.sin(t) * RING_RADIUS, 0);
      }
      posAttr.needsUpdate = true;
      arcGeometry.setDrawRange(0, count + 1);
      const endT = (count / RING_SEGMENTS) * Math.PI * 2;
      marker.position.set(Math.cos(endT) * RING_RADIUS, Math.sin(endT) * RING_RADIUS, 0);
    };
    updateArc(progressRef.current);

    let frameId = 0;
    let elapsed = 0;
    let lastRenderedProgress = progressRef.current;
    const clock = new THREE.Clock();

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      elapsed += delta;

      // Swap palette live if urgency flips mid-session, without rebuilding
      // the scene.
      const wantsUrgent = urgentRef.current;
      const isCurrentlyUrgent = coreMaterial.color.equals(HUE_URGENT);
      if (wantsUrgent !== isCurrentlyUrgent) {
        const nextColor = wantsUrgent ? HUE_URGENT : HUE_NORMAL;
        const nextDim = wantsUrgent ? HUE_URGENT_DIM : HUE_NORMAL_DIM;
        coreMaterial.color.copy(nextColor);
        fillMaterial.color.copy(nextDim);
        arcMaterial.color.copy(nextColor);
        markerMaterial.color.copy(nextColor);
      }

      if (Math.abs(progressRef.current - lastRenderedProgress) > 0.0008) {
        lastRenderedProgress = progressRef.current;
        updateArc(lastRenderedProgress);
      }

      if (!prefersReducedMotion) {
        core.rotation.y += delta * 0.18;
        core.rotation.x += delta * 0.07;
        fill.rotation.copy(core.rotation);
        track.rotation.y = 1.15 + Math.sin(elapsed * 0.15) * 0.08;
        marker.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.25);
        stars.rotation.y += delta * 0.01;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      coreGeometry.dispose();
      coreEdges.dispose();
      coreMaterial.dispose();
      fillMaterial.dispose();
      trackGeometry.dispose();
      trackLineMaterial.dispose();
      arcGeometry.dispose();
      arcMaterial.dispose();
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
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[27px]"
      aria-hidden="true"
    />
  );
}
