import * as THREE from 'three';
import type { RenderKit } from '../world/render-kit.ts';
import {
  ROUNDABOUT,
  CITY_BOUNDS,
  riverBankZ,
} from '../../../lib/game/city/layout.ts';

/** Small recognizable silhouettes; positions are compressed game geography. */
export function createEuropeMonument(kit: RenderKit, root: THREE.Group) {
  const g = new THREE.Group();
  g.name = 'predmostnaya-europe';
  g.position.set(ROUNDABOUT.x, 0.3, ROUNDABOUT.z);
  root.add(g);
  const bronze = '#56616a';
  kit.cylinder(2.5, 2.7, 0.38, '#8f8c82', 0, 0.2, 0, g);
  kit.box(3.8, 0.65, 1.9, '#a69c89', 0, 0.65, 0, g);
  // Broad bull, projecting horns and the seated figure make the outline readable.
  kit.sphere(1.25, 0.57, 0.56, bronze, 0, 1.65, 0, g, 12);
  for (const x of [-0.78, 0.76])
    for (const z of [-0.38, 0.38])
      kit.rod(
        new THREE.Vector3(x, 1.65, z),
        new THREE.Vector3(x * 1.1, 0.95, z),
        0.12,
        bronze,
        g,
      );
  kit.sphere(0.5, 0.5, 0.46, bronze, 1.28, 1.65, 0, g, 12);
  for (const side of [-1, 1]) {
    kit.rod(
      new THREE.Vector3(1.3, 1.9, side * 0.28),
      new THREE.Vector3(1.42, 2.23, side * 0.7),
      0.065,
      '#a5b397',
      g,
    );
    kit.rod(
      new THREE.Vector3(-0.05, 2.22, side * 0.25),
      new THREE.Vector3(0.25, 1.5, side * 0.63),
      0.09,
      bronze,
      g,
    );
  }
  kit.sphere(0.24, 0.48, 0.23, bronze, -0.07, 2.6, 0, g, 12);
  kit.sphere(0.21, 0.24, 0.2, bronze, 0.02, 3.27, 0, g, 12);
  kit.rod(
    new THREE.Vector3(0.02, 2.87, -0.1),
    new THREE.Vector3(0.9, 2.02, -0.21),
    0.065,
    bronze,
    g,
  );
  kit.rod(
    new THREE.Vector3(-1.1, 1.7, 0),
    new THREE.Vector3(-1.65, 1.4, 0.3),
    0.055,
    bronze,
    g,
  );
}

export function createWhiteHorse(kit: RenderKit, root: THREE.Group) {
  const p = { x: 128, z: riverBankZ(128, -1) - 12, radius: 1.3 };
  const g = new THREE.Group();
  g.name = 'yenisei-white-horse';
  g.position.set(p.x, 0, p.z);
  g.rotation.y = -0.28;
  root.add(g);
  const white = '#e4dfd3';
  kit.cylinder(1.14, 1.2, 0.18, '#a69c89', 0, 0.14, 0, g);
  kit.sphere(0.68, 0.33, 0.27, white, -0.03, 1.05, 0, g, 14);
  for (const x of [-0.48, 0.42])
    for (const side of [-1, 1]) {
      const foot = new THREE.Vector3(
        x + (x > 0 ? 0.08 : -0.1),
        0.27,
        side * 0.19,
      );
      kit.rod(new THREE.Vector3(x, 1.1, side * 0.2), foot, 0.065, white, g);
      kit.box(0.16, 0.09, 0.14, '#d4d2b7', foot.x + 0.03, foot.y, foot.z, g);
    }
  const neck = kit.sphere(0.2, 0.44, 0.2, white, 0.52, 1.39, 0, g, 12);
  neck.rotation.z = -0.4;
  kit.sphere(0.3, 0.16, 0.16, white, 0.69, 1.79, 0, g, 12);
  for (const side of [-1, 1]) {
    kit.sphere(0.047, 0.14, 0.045, white, 0.55, 1.99, side * 0.09, g, 8);
    kit.sphere(0.023, 0.023, 0.014, '#40545a', 0.7, 1.83, side * 0.15, g, 8);
  }
  kit.rod(
    new THREE.Vector3(-0.59, 1.18, 0),
    new THREE.Vector3(-0.83, 0.45, 0.07),
    0.07,
    '#d4d2b7',
    g,
  );
  return p;
}

export function createChapelCannon(kit: RenderKit, root: THREE.Group) {
  const g = new THREE.Group();
  g.name = 'karaulnaya-cannon';
  g.position.set(-7, 4.5, CITY_BOUNDS.minZ - 14);
  g.rotation.y = -0.35;
  root.add(g);
  kit.cylinder(1.3, 1.45, 0.2, '#a69c89', 0, 0, 0, g);
  kit.box(0.85, 0.3, 1.4, '#56616a', 0, 0.45, 0, g);
  for (const side of [-1, 1]) {
    const wheel = kit.cylinder(
      0.43,
      0.43,
      0.18,
      '#40545a',
      side * 0.54,
      0.45,
      0.25,
      g,
    );
    wheel.rotation.z = Math.PI / 2;
  }
  kit.rod(
    new THREE.Vector3(0, 0.72, 0.5),
    new THREE.Vector3(0, 1.05, -1),
    0.16,
    '#56616a',
    g,
  );
}
