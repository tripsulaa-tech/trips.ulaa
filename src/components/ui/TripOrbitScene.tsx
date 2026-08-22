import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Ambient three.js background for the countdown card: a sparse field of
// slow-drifting embers kept to the outer margins. Purely decorative: every
// number the visitor actually needs is in the HTML overlay on top, so if
// WebGL is unavailable or the visitor prefers reduced motion this simply
// renders nothing rather than degrading the page.
//
// This used to also draw a dotted "flight path" arcing across the bottom of
// the card with a small plane riding it. That line kept colliding with
// whatever HTML sat in the same bottom strip — first the "Don't miss out"
// CTA text, then (after clipping the scene to dodge that) the seconds
// digit tile — across the mobile/tablet stacked layout where that strip is
// tight. Removed rather than keep chasing pixel-perfect coordination
// between a 3D curve and a responsive HTML layout.

// Brand palette (see src/styles/globals.css @theme) expressed as three.js
// colors — kept in sync by hand since three.js can't read CSS custom
// properties. gold / primary-light are the warm ambers this site already
// uses for its "trip starts in" accents; red-400 is Tailwind's stock red,
// matching the urgency palette used elsewhere on this card.
const EMBER_COLOR = new THREE.Color('#C8962A');
const EMBER_COLOR_URGENT = new THREE.Color('#f87171');

const PARTICLE_COUNT = 70;

interface TripOrbitSceneProps {
  urgent: boolean;
}

export default function TripOrbitScene({ urgent }: TripOrbitSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Mutable ref for the value the animation loop needs to read live
  // without re-running the whole three.js setup effect on every tick.
  const urgentRef = useRef(urgent);
  useEffect(() => {
    urgentRef.current = urgent;
  }, [urgent]);

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

    let frameId = 0;
    const clock = new THREE.Clock();

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      const aspect = clientWidth / clientHeight;
      camera.left = -aspect;
      camera.right = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight, false);
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

      const targetEmberColor = urgentRef.current ? EMBER_COLOR_URGENT : EMBER_COLOR;
      particleMaterial.color.lerp(targetEmberColor, 0.05);

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
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // Only re-run the full three.js setup on mount/unmount — urgent flows
    // through the ref above so the scene isn't torn down and rebuilt on
    // every timer tick.
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
