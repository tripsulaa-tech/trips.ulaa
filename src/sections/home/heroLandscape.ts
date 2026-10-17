import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, noise, terrainHeight, valleyCenter } from './landscapeMath';

export interface LandscapeController {
  setPaused(value: boolean): void;
  setReducedMotion(value: boolean): void;
  reset(): void;
  dispose(): void;
}

interface Options {
  paused: boolean;
  reducedMotion: boolean;
  onReady(): void;
  onError(): void;
}

const lakeShader = {
  name: 'UlaaLake',
  uniforms: {
    color: { value: new THREE.Color('#536a67') },
    tDiffuse: { value: null },
    textureMatrix: { value: new THREE.Matrix4() },
    time: { value: 0 },
  },
  vertexShader: `
    uniform mat4 textureMatrix;
    varying vec4 vReflection;
    varying vec3 vWorld;
    void main() {
      vReflection = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec4 vReflection;
    varying vec3 vWorld;
    void main() {
      vec2 ripple = vec2(
        sin(vWorld.z * 1.7 + time * 0.38) + sin(vWorld.x * 2.1 + time * 0.27),
        cos(vWorld.x * 1.4 + vWorld.z * 0.9 + time * 0.3)
      );
      vec4 uv = vReflection;
      uv.xy += ripple * 0.0015 * uv.w;
      vec3 reflection = texture2DProj(tDiffuse, uv).rgb;
      vec3 view = normalize(cameraPosition - vWorld);
      vec3 normal = normalize(vec3(ripple.x * 0.018, 1.0, ripple.y * 0.018));
      float fresnel = 0.43 + 0.5 * pow(1.0 - max(dot(view, normal), 0.0), 3.0);
      vec3 lake = mix(color * 0.45, reflection, fresnel);
      vec3 sun = normalize(vec3(-0.35, 0.22, -0.9));
      float glint = pow(max(dot(reflect(-sun, normal), view), 0.0), 180.0);
      lake += vec3(1.0, 0.75, 0.43) * glint * 0.32;
      gl_FragColor = vec4(lake, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

/** A genuine mesh landscape with a reflected second camera, bounded camera
 * movement and instanced trees. No photo planes or carousel are used. */
export function createLandscape(canvas: HTMLCanvasElement, marker: HTMLElement, options: Options): LandscapeController {
  const compact = window.matchMedia('(max-width: 767px)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !compact, alpha: false, powerPreference: 'low-power' });
  let renderFailed = false;
  renderer.debug.onShaderError = () => { renderFailed = true; };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.84;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#c9b7a0', 0.0065);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.2, 650);
  const sky = new Sky();
  sky.scale.setScalar(450);
  const sun = new THREE.Vector3(-0.35, 0.22, -0.9).normalize();
  sky.material.uniforms.sunPosition.value.copy(sun);
  sky.material.uniforms.turbidity.value = 6;
  sky.material.uniforms.rayleigh.value = 1.3;
  sky.material.uniforms.mieCoefficient.value = 0.003;
  sky.material.uniforms.mieDirectionalG.value = 0.82;
  scene.add(sky);
  scene.add(new THREE.HemisphereLight('#e8e2d5', '#665e4c', 2.1));
  const sunlight = new THREE.DirectionalLight('#ffe0ac', 3.1);
  sunlight.position.copy(sun).multiplyScalar(100);
  scene.add(sunlight);

  const terrainGeometry = new THREE.PlaneGeometry(190, 185, compact ? 128 : 224, compact ? 128 : 224);
  terrainGeometry.rotateX(-Math.PI / 2);
  terrainGeometry.translate(0, 0, -50);
  const vertices = terrainGeometry.attributes.position;
  const colors = new Float32Array(vertices.count * 3);
  const woodland = new THREE.Color('#62634c');
  const stone = new THREE.Color('#a39882');
  const peak = new THREE.Color('#d8cbbb');
  const tint = new THREE.Color();
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), z = vertices.getZ(i), height = terrainHeight(x, z);
    vertices.setY(i, height);
    tint.copy(woodland).lerp(stone, clamp((height - 2) / 14, 0, 1));
    tint.lerp(peak, clamp((height - 19 - noise(x * 0.14, z * 0.14) * 5) / 9, 0, 0.8));
    tint.multiplyScalar(0.79 + noise(x * 0.55, z * 0.55) * 0.3);
    tint.toArray(colors, i * 3);
  }
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeometry.computeVertexNormals();
  const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 });
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  scene.add(terrain);

  const lake = new Reflector(new THREE.PlaneGeometry(260, 320), {
    textureWidth: compact ? 384 : 768,
    textureHeight: compact ? 384 : 768,
    multisample: 0,
    clipBias: 0.003,
    color: '#536a67',
    shader: lakeShader,
  });
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(0, 0.2, -50);
  scene.add(lake);
  const lakeMaterial = lake.material as THREE.ShaderMaterial;

  // A single instanced mesh supplies the trees' layered, narrow silhouettes.
  const treePositions: THREE.Vector3[] = [];
  for (let i = 0; i < 1100 && treePositions.length < (compact ? 170 : 330); i++) {
    const x = (noise(i * 2.73, 91) - 0.5) * 125;
    const z = noise(17, i * 1.91) * -110 + 15;
    const h = terrainHeight(x, z);
    if (h > 1.3 && h < 12 && Math.abs(x - valleyCenter(z)) < 38) treePositions.push(new THREE.Vector3(x, h - 0.1, z));
  }
  const trees = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.75, 2.5, 7),
    new THREE.MeshStandardMaterial({ color: '#3e4937', roughness: 1 }),
    treePositions.length * 3,
  );
  const dummy = new THREE.Object3D();
  treePositions.forEach((position, i) => {
    const size = 0.5 + noise(i, 9) * 0.8;
    for (let layer = 0; layer < 3; layer++) {
      const taper = 1 - layer * 0.22;
      dummy.position.copy(position).add(new THREE.Vector3(0, (1 + layer * 0.7) * size, 0));
      dummy.scale.set(size * taper, size * taper, size * taper);
      dummy.rotation.y = i * 1.73;
      dummy.updateMatrix();
      trees.setMatrixAt(i * 3 + layer, dummy.matrix);
    }
  });
  trees.instanceMatrix.needsUpdate = true;
  scene.add(trees);

  // A procedural radial texture keeps mist soft without external assets.
  const mistCanvas = document.createElement('canvas');
  mistCanvas.width = mistCanvas.height = 128;
  const ctx = mistCanvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(245,232,210,0.26)');
    gradient.addColorStop(0.45, 'rgba(245,232,210,0.12)');
    gradient.addColorStop(1, 'rgba(245,232,210,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  const mistTexture = new THREE.CanvasTexture(mistCanvas);
  mistTexture.colorSpace = THREE.SRGBColorSpace;
  const mistMaterial = new THREE.SpriteMaterial({ map: mistTexture, transparent: true, depthWrite: false, opacity: 0.65 });
  const mists: THREE.Sprite[] = [];
  for (let i = 0; i < 6; i++) {
    const mist = new THREE.Sprite(mistMaterial);
    mist.position.set(valleyCenter(-20 - i * 14), 2.5 + i * 0.3, -20 - i * 14);
    mist.scale.set(38 + i * 7, 4 + i, 1);
    scene.add(mist);
    mists.push(mist);
  }

  let width = 1, height = 1;
  let paused = options.paused, reduced = options.reducedMotion;
  let visible = true, disposed = false, ready = false;
  let pointerX = 0, pointerY = 0, orbit = 0, orbitTarget = 0;
  let tilt = 0, tiltTarget = 0, scrollProgress = 0;
  let drag: { id: number; x: number; y: number; orbit: number; horizontal: boolean } | null = null;
  let time = 0, lastFrame = 0;
  const target = new THREE.Vector3();
  const markerWorld = new THREE.Vector3(16, terrainHeight(16, -28) + 1.5, -28);
  const projected = new THREE.Vector3();
  const hero = canvas.closest('[data-home-hero]') as HTMLElement;
  const aimCamera = (delta: number) => {
    const ease = reduced ? 1 : 1 - Math.exp(-delta * 3.5);
    orbit += (orbitTarget - orbit) * ease;
    tilt += (tiltTarget - tilt) * ease;
    const portrait = width < height;
    const drift = paused || reduced ? 0 : Math.sin(time * 0.07) * 0.012;
    const angle = orbit + drift;
    const dolly = reduced || paused ? 0 : scrollProgress * 1.8;
    camera.position.set(6 + Math.sin(angle) * 23, (portrait ? 7 : 8.8) + tilt * 1.6, (portrait ? 27 : 23) - dolly);
    target.set(portrait ? 2 : 0, portrait ? 6 : 5.1, -32);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    projected.copy(markerWorld).project(camera);
    // Keep the small invitation away from the heading on narrow screens.
    marker.style.left = clamp(projected.x * 0.5 + 0.5, portrait ? 0.5 : 0.59, portrait ? 0.75 : 0.85) * width + 'px';
    marker.style.top = clamp(-projected.y * 0.5 + 0.5, 0.2, portrait ? 0.25 : 0.54) * height + 'px';
  };
  const render = (delta = 1 / 30) => {
    if (disposed || renderFailed) return;
    aimCamera(delta);
    lakeMaterial.uniforms.time.value = time;
    mists.forEach((mist, i) => { mist.position.x = valleyCenter(-20 - i * 14) + Math.sin(time * 0.025 + i) * 3; });
    try {
      renderer.render(scene, camera);
      if (renderFailed || (!ready && renderer.getContext().getError() !== 0)) throw new Error('Landscape renderer unavailable');
      if (!ready) { ready = true; options.onReady(); }
    } catch {
      renderFailed = true;
      renderer.setAnimationLoop(null);
      options.onError();
    }
  };
  const frame = (stamp: number) => {
    if (stamp - lastFrame < (compact ? 1000 / 30 : 1000 / 45)) return;
    const delta = Math.min((stamp - lastFrame) / 1000 || 1 / 30, 0.05);
    lastFrame = stamp;
    if (!paused && !reduced) time += delta;
    render(delta);
  };
  const syncLoop = () => {
    renderer.setAnimationLoop(!disposed && !renderFailed && visible && !document.hidden && !paused && !reduced ? frame : null);
    lastFrame = performance.now();
    if (visible && !document.hidden) render();
  };
  const resize = () => {
    if (disposed) return;
    width = Math.max(canvas.clientWidth, 1);
    height = Math.max(canvas.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < height ? 49 : 43;
    camera.updateProjectionMatrix();
    render();
  };
  const onMove = (event: PointerEvent) => {
    if (paused || reduced) return;
    if (drag && drag.id === event.pointerId) {
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        drag.horizontal = true;
        canvas.setPointerCapture(event.pointerId);
      }
      if (drag.horizontal) orbitTarget = clamp(drag.orbit - dx / width * 0.65, -0.22, 0.22);
    } else if (event.pointerType === 'mouse') {
      const rect = canvas.getBoundingClientRect();
      pointerX = (event.clientX - rect.left) / width - 0.5;
      pointerY = (event.clientY - rect.top) / height - 0.5;
      orbitTarget = pointerX * 0.2;
      tiltTarget = -pointerY * 0.55;
    }
  };
  const onDown = (event: PointerEvent) => {
    if (paused || reduced || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, orbit: orbitTarget, horizontal: false };
  };
  const onUp = () => { drag = null; };
  const onLeave = () => { if (!drag) { orbitTarget = 0; tiltTarget = 0; } };
  const onKey = (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') { orbitTarget = 0; tiltTarget = 0; }
    if (event.key === 'ArrowLeft') orbitTarget = clamp(orbitTarget - 0.05, -0.22, 0.22);
    if (event.key === 'ArrowRight') orbitTarget = clamp(orbitTarget + 0.05, -0.22, 0.22);
    if (event.key === 'ArrowUp') tiltTarget = clamp(tiltTarget + 0.15, -0.5, 0.5);
    if (event.key === 'ArrowDown') tiltTarget = clamp(tiltTarget - 0.15, -0.5, 0.5);
    // Explicit keyboard movement is available even with reduced motion.
    orbit = orbitTarget;
    tilt = tiltTarget;
    render();
  };
  const onScroll = () => {
    scrollProgress = clamp(-hero.getBoundingClientRect().top / height, 0, 1);
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    renderFailed = true;
    renderer.setAnimationLoop(null);
    options.onError();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('keydown', onKey);
  canvas.addEventListener('webglcontextlost', onContextLost);
  document.addEventListener('visibilitychange', syncLoop);
  window.addEventListener('scroll', onScroll, { passive: true });
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; syncLoop(); });
  io.observe(canvas);
  resize();
  syncLoop();

  return {
    setPaused(value) { paused = value; syncLoop(); },
    setReducedMotion(value) { reduced = value; syncLoop(); },
    reset() { orbitTarget = orbit = tiltTarget = tilt = 0; render(); },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      document.removeEventListener('visibilitychange', syncLoop);
      window.removeEventListener('scroll', onScroll);
      lake.dispose();
      lake.geometry.dispose();
      terrainGeometry.dispose();
      terrainMaterial.dispose();
      trees.geometry.dispose();
      (trees.material as THREE.Material).dispose();
      trees.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      mistTexture.dispose();
      mistMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
