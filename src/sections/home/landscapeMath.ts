// Deterministic terrain: no downloaded models or texture requests.
export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const hash = (x: number, y: number) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

export function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  return mix(mix(hash(ix, iy), hash(ix + 1, iy), fx), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
}

function ridges(x: number, z: number): number {
  let sum = 0, amplitude = 0.55, frequency = 0.036;
  for (let octave = 0; octave < 5; octave++) {
    const ridge = 1 - Math.abs(noise(x * frequency + 17, z * frequency - 8) * 2 - 1);
    sum += ridge * ridge * amplitude;
    frequency *= 2.08;
    amplitude *= 0.48;
  }
  return sum;
}

export function valleyCenter(z: number): number {
  return 6 + 9 * Math.sin(z * 0.024) - 3 * Math.sin(z * 0.069);
}

export function terrainHeight(x: number, z: number): number {
  const distance = Math.abs(x - valleyCenter(z));
  const shore = smooth(clamp((distance - 5.5) / 21, 0, 1));
  const distanceLift = 15 + 20 * smooth(clamp((-z + 5) / 100, 0, 1));
  const peaks = ridges(x, z) * distanceLift + 2.5;
  const detail = (noise(x * 0.45, z * 0.45) - 0.5) * 0.65;
  return -1.2 + shore * (peaks + detail);
}
