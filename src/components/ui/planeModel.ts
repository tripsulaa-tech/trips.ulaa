import * as THREE from 'three';

// A small low-poly gold airliner for the countdown card, built from three.js
// primitives so there are no model files to ship. Nose points along +X, the
// wings run along Z and "up" is +Y. Same proportions as the old flat SVG
// plane: swept wings, small tailplanes, a fin, two wing-mounted engines.
//
// Everything is in units where the plane is 2 long (nose at +1, tail at -1).

const S = 2 / 45; // old SVG units -> model units
const CX = 24.5; // SVG x of the plane's centre

const GOLD_LIGHT = '#F4DDA0';
const GOLD = '#E9C77B';
const GOLD_DEEP = '#C8962A';
const BRONZE = '#8F5A1B';
const GLASS = '#3B2210';

function slab(points: Array<[number, number]>, depth: number, bevel = 0.012) {
  const shape = new THREE.Shape();
  points.forEach(([u, v], i) => (i === 0 ? shape.moveTo(u, v) : shape.lineTo(u, v)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

// Shape (u, v) in the horizontal plane: u = along the body, v = outwards.
function horizontalSlab(points: Array<[number, number]>, depth: number) {
  const geo = slab(points, depth);
  geo.rotateX(Math.PI / 2); // shape v -> Z, extrusion -> Y
  return geo;
}

const pt = (x: number, y: number): [number, number] => [(x - CX) * S, (24 - y) * S];

export interface PlaneModel {
  group: THREE.Group;
  dispose: () => void;
}

export function buildPlane(): PlaneModel {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(o: T) => {
    disposables.push(o);
    return o;
  };

  const metal = (color: string, roughness = 0.3, metalness = 0.85) =>
    track(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  const bodyMat = metal(GOLD_LIGHT, 0.26, 0.8);
  const wingMat = metal(GOLD, 0.3, 0.85);
  const tailMat = metal(GOLD_DEEP, 0.34, 0.8);
  const engineMat = metal(BRONZE, 0.45, 0.7);
  const glassMat = track(new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.15, metalness: 0.4 }));

  // ── Fuselage: a capsule that tapers toward the tail ──
  const R = 0.135;
  const fuselageGeo = track(new THREE.CapsuleGeometry(R, 2 - 2 * R, 10, 20));
  fuselageGeo.rotateZ(-Math.PI / 2); // axis Y -> X
  const pos = fuselageGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let k = 1;
    if (x < -0.3) k = 1 - 0.6 * Math.min(1, (-0.3 - x) / 0.7); // slim tail cone
    else if (x > 0.62) k = 1 - 0.18 * Math.min(1, (x - 0.62) / 0.38); // slightly pointed nose
    pos.setY(i, pos.getY(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
    // lift the tail end a touch so the body reads as an upswept rear
    if (x < -0.5) pos.setY(i, pos.getY(i) + (-0.5 - x) * 0.06);
  }
  fuselageGeo.computeVertexNormals();
  group.add(new THREE.Mesh(fuselageGeo, bodyMat));

  // ── Cockpit glass ──
  const cockpitGeo = track(new THREE.SphereGeometry(1, 16, 12));
  const cockpit = new THREE.Mesh(cockpitGeo, glassMat);
  cockpit.scale.set(0.12, 0.06, 0.09);
  cockpit.position.set(0.7, 0.085, 0);
  group.add(cockpit);

  // ── Main wings (right wing built, left is its mirror) ──
  const wingGeo = track(
    horizontalSlab([pt(28, 20), pt(15.4, 3.6), pt(11.8, 3.6), pt(19.6, 20)], 0.032),
  );
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.y = -0.03;
  const wingL = wingR.clone();
  wingL.scale.z = -1;
  group.add(wingR, wingL);

  // ── Tailplanes ──
  const tailGeo = track(horizontalSlab([pt(10, 20), pt(5.2, 13.8), pt(2.8, 13.8), pt(5.4, 20)], 0.024));
  const tailR = new THREE.Mesh(tailGeo, tailMat);
  tailR.position.set(0, 0.03, 0);
  const tailL = tailR.clone();
  tailL.scale.z = -1;
  group.add(tailR, tailL);

  // ── Vertical fin ──
  const finGeo = track(slab([[-0.6, 0.06], [-0.88, 0.4], [-0.99, 0.4], [-0.99, 0.04]], 0.03));
  const fin = new THREE.Mesh(finGeo, tailMat);
  fin.position.y = 0.05;
  group.add(fin);

  // ── Engines under the wings ──
  const engineGeo = track(new THREE.CylinderGeometry(0.058, 0.05, 0.26, 16));
  engineGeo.rotateZ(-Math.PI / 2);
  const intakeGeo = track(new THREE.CircleGeometry(0.046, 16));
  intakeGeo.rotateY(Math.PI / 2);
  for (const side of [1, -1]) {
    const engine = new THREE.Mesh(engineGeo, engineMat);
    engine.position.set(-0.02, -0.095, side * 0.5);
    const intake = new THREE.Mesh(intakeGeo, glassMat);
    intake.position.set(0.112, -0.095, side * 0.5);
    group.add(engine, intake);
  }

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
