import * as THREE from 'three';
import type { PersonPreset } from '@/lib/game/presets';

type BoxFactory = (
  w: number,
  h: number,
  d: number,
  color: string,
  x?: number,
  y?: number,
  z?: number,
  parent?: THREE.Object3D,
) => THREE.Mesh;
type CylinderFactory = (
  r: number,
  h: number,
  color: string,
  x: number,
  y: number,
  z: number,
  parent?: THREE.Object3D,
) => THREE.Mesh;

/** Procedural blockout, not a photo scan. Resource ownership stays with the scene. */
export function createCharacter(
  p: PersonPreset,
  box: BoxFactory,
  round: CylinderFactory,
  parent: THREE.Object3D,
  x: number,
  z: number,
) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  parent.add(g);
  box(0.7, 0.9, 0.4, p.color, 0, 1.3, 0, g);
  for (const i of [-1, 1]) {
    box(
      0.24,
      0.68,
      0.26,
      p.uniform ? '#59617b' : '#484b3f',
      i * 0.2,
      0.5,
      0,
      g,
    );
    box(0.27, 0.19, 0.43, '#30342c', i * 0.2, 0.16, 0.08, g);
    const a = box(0.23, 0.77, 0.25, p.color, i * 0.49, 1.3, 0, g);
    a.rotation.z = i * 0.18;
    box(0.19, 0.23, 0.2, p.skin, i * 0.57, 0.87, 0, g);
  }
  box(0.62, 0.64, 0.51, p.skin, 0, 2.1, 0, g);
  box(0.12, 0.19, 0.2, p.skin, -0.34, 2.08, 0, g);
  box(0.12, 0.19, 0.2, p.skin, 0.34, 2.08, 0, g);
  box(
    0.61,
    p.hairstyle === 'buzz' ? 0.055 : 0.16,
    0.53,
    p.hair,
    0,
    2.42,
    -0.015,
    g,
  );
  box(0.6, 0.36, 0.13, p.hair, 0, 2.2, -0.24, g);
  if (p.hairstyle === 'curls') {
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 4; j++)
        round(
          0.084,
          0.13 + ((i + j) % 2) * 0.04,
          p.hair,
          (i - 2) * 0.12,
          2.54,
          (j - 1.5) * 0.12,
          g,
        );
  } else if (p.hairstyle === 'parted') {
    for (const sign of [-1, 1]) {
      const hair = box(0.31, 0.23, 0.59, p.hair, sign * 0.19, 2.48, 0, g);
      hair.rotation.z = sign * 0.27;
      box(0.095, 0.39, 0.48, p.hair, sign * 0.32, 2.26, -0.03, g);
      const collar = box(
        0.18,
        0.18,
        0.46,
        '#c3ad88',
        sign * 0.24,
        1.7,
        0.02,
        g,
      );
      collar.rotation.z = sign * 0.4;
    }
  }
  if (p.beard) {
    box(0.5, 0.25, 0.075, p.hair, 0, 1.88, 0.26, g);
    for (const sign of [-1, 1])
      box(0.09, 0.32, 0.06, p.hair, sign * 0.27, 1.99, 0.26, g);
    box(0.24, 0.055, 0.06, p.hair, 0, 2.01, 0.3, g);
  }
  for (const sign of [-1, 1]) {
    box(0.115, 0.07, 0.023, '#e5dac5', sign * 0.14, 2.14, 0.265, g);
    box(0.05, 0.055, 0.035, p.eye, sign * 0.14, 2.14, 0.28, g);
    const brow = box(0.15, 0.032, 0.03, p.hair, sign * 0.14, 2.23, 0.28, g);
    brow.rotation.z = sign * -0.05;
  }
  box(0.1, 0.12, 0.09, p.skin, 0, 2.04, 0.3, g);
  box(0.17, 0.03, 0.025, p.beard ? '#b68b76' : '#9a6858', 0, 1.94, 0.3, g);
  if (p.uniform) {
    box(0.87, 0.42, 0.7, '#202635', 0, 2.65, 0, g);
    box(0.87, 0.18, 0.2, '#171e29', 0, 2.49, 0.32, g);
    for (const sign of [-1, 1])
      box(0.17, 0.42, 0.62, '#252d3f', sign * 0.43, 2.58, -0.02, g);
    for (let i = 0; i < 12; i++)
      box(
        0.09 + (i % 3) * 0.04,
        0.075,
        0.012,
        i % 2 ? '#a1aec4' : '#414a63',
        (((i * 7) % 6) - 2.5) * 0.095,
        1 + Math.floor(i / 3) * 0.19,
        0.211,
        g,
      );
    box(0.12, 0.12, 0.035, '#c6b77f', 0, 2.63, 0.37, g);
  }
  return g;
}
