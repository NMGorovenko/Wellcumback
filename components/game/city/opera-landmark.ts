import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { facadeText } from './facade-text.ts';

export function createTheatreSquareGround(kit: RenderKit, root: THREE.Group) {
  const g = new THREE.Group();
  g.name = 'theatre-square-paving';
  root.add(g);
  kit.box(48, 0.03, 46, '#bab7a9', 146, 0.045, 116, g, 0);
  for (let x = 122; x <= 170; x += 2)
    kit.box(0.035, 0.01, 46, '#aaa99f', x, 0.07, 116, g, 0);
  for (let z = 93; z <= 139; z += 2)
    kit.box(48, 0.01, 0.035, '#aaa99f', 146, 0.071, z, g, 0);
  for (const x of [123, 169])
    kit.box(0.34, 0.018, 46, '#858c88', x, 0.08, 116, g, 0);
}

/** Broad marble canopy, faceted glazing and the curved auditorium behind it.
 * Proportions follow the front photograph, compressed to the existing parcel. */
export function createOperaLandmark(
  kit: RenderKit,
  root: THREE.Group,
  footprint: CityBuilding,
) {
  const b = { ...footprint, w: footprint.d, d: footprint.w };
  if (b.kind !== 'theatre') return false;
  const g = new THREE.Group();
  g.name = 'landmark:theatre';
  g.position.set(b.x, 0, b.z);
  g.rotation.y = Math.PI / 2;
  root.add(g);
  const stone = '#d5d2c8',
    bright = '#e3e0d6',
    seam = '#b9b6ac',
    glass = '#30454d';
  const box = (
    w: number,
    h: number,
    d: number,
    c: string,
    x: number,
    y: number,
    z: number,
  ) => kit.box(w, h, d, c, x, y, z, g, 0);
  const front = b.d / 2 - 0.3,
    facade = front - 2;
  box(b.w - 2, 3.75, b.d - 3, stone, 0, 1.9, -1.2);
  // Stage tower and semicircular auditorium are separate, recognisable roof masses.
  box(b.w * 0.49, 6.8, b.d * 0.38, stone, 0, 3.4, -b.d * 0.29);
  const drum = kit.cylinder(5.1, 5.1, 1.65, bright, 0, 4.75, -0.5, g);
  drum.scale.z = 0.78;
  kit.cylinder(5.18, 5.18, 0.11, seam, 0, 5.61, -0.5, g).scale.z = 0.78;
  for (let y = 4.25; y < 6.7; y += 0.48)
    box(b.w * 0.49, 0.025, 0.035, seam, 0, y, -b.d * 0.1 + 0.03);
  box(b.w, 0.69, 3.1, bright, 0, 4.13, front - 1.2);
  box(b.w + 0.1, 0.09, 3.2, seam, 0, 4.52, front - 1.2);
  // Pale irregular stone joints across the horizontal fascia.
  for (let i = 0; i < 25; i++) {
    const x = -b.w / 2 + 0.6 + (i * (b.w - 1.2)) / 24;
    const joint = box(
      0.025,
      0.54,
      0.014,
      i % 3 === 0 ? '#c5c1b9' : '#cecac2',
      x,
      4.14,
      front + 0.36,
    );
    joint.rotation.z = ((i % 3) - 1) * 0.21;
  }
  for (const x of [
    -b.w / 2 + 0.9,
    -b.w / 2 + 2.2,
    b.w / 2 - 2.2,
    b.w / 2 - 0.9,
  ])
    kit.cylinder(0.3, 0.32, 3.8, bright, x, 1.98, front - 0.05, g);
  box(b.w - 5, 3.5, 0.08, glass, 0, 2.04, facade);
  const bays = 12,
    bay = (b.w - 5) / bays;
  for (let i = 0; i < bays; i++) {
    const x = -(b.w - 5) / 2 + bay * (i + 0.5);
    // Chamfered polygonal frames are the distinctive rhythm of this facade.
    const outline = [
      [-bay * 0.46, 1.3],
      [-bay * 0.46, 3.55],
      [0, 3.68],
      [bay * 0.46, 3.55],
      [bay * 0.46, 1.3],
      [0, 1.2],
      [-bay * 0.46, 1.3],
    ];
    for (let j = 1; j < outline.length; j++)
      kit.rod(
        new THREE.Vector3(
          x + outline[j - 1][0],
          outline[j - 1][1],
          facade + 0.1,
        ),
        new THREE.Vector3(x + outline[j][0], outline[j][1], facade + 0.1),
        0.045,
        stone,
        g,
      );
    box(0.055, 2.3, 0.06, seam, x, 2.45, facade + 0.1);
    box(bay - 0.07, 0.05, 0.08, stone, x, 2.22, facade + 0.11);
  }
  for (let i = -3; i <= 3; i++) {
    box(1.02, 1.15, 0.08, glass, i * 1.09, 0.78, front - 0.76);
    box(0.06, 1.25, 0.09, bright, i * 1.09 - 0.54, 0.8, front - 0.65);
    box(0.025, 0.33, 0.08, bright, i * 1.09 + 0.32, 0.7, front - 0.62);
  }
  box(8.5, 0.18, 1.4, stone, 0, 1.47, front - 1.1);
  for (const side of [-1, 1]) {
    for (let n = 0; n < 7; n++) {
      box(
        0.06,
        2.2,
        0.82,
        glass,
        side * (b.w / 2 - 0.95),
        2.3,
        -b.d / 2 + 1.5 + n * 1.6,
      );
      box(
        0.12,
        0.12,
        1.4,
        seam,
        side * (b.w / 2 - 0.92),
        3.6,
        -b.d / 2 + 1.5 + n * 1.6,
      );
    }
    box(
      2.15,
      2.05,
      0.06,
      side < 0 ? '#924c49' : '#567c8b',
      side * 7.7,
      2.48,
      facade + 0.2,
    );
    facadeText(
      kit,
      g,
      side < 0 ? 'ОПЕРА' : 'БАЛЕТ',
      '#ede3cf',
      1.8,
      side * 7.7,
      2.55,
      facade + 0.25,
    );
  }
  for (let i = 0; i < 3; i++)
    box(
      b.w - 1,
      0.12,
      0.55,
      stone,
      0,
      0.06 + i * 0.07,
      front + 0.12 - i * 0.35,
    );
  facadeText(
    kit,
    g,
    'ТЕАТР ОПЕРЫ И БАЛЕТА',
    '#676962',
    b.w - 4,
    0,
    4.13,
    front + 0.4,
  );
  return true;
}

export function createTheatreSquareProp(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  if (b.kind !== 'apollo' && b.kind !== 'theatre-fountain') return false;
  const g = new THREE.Group();
  g.name = `landmark:${b.kind}`;
  g.position.set(b.x, 0, b.z);
  root.add(g);
  const stone = '#7b817e',
    bronze = '#5e6658';
  if (b.kind === 'apollo') {
    kit.box(2, 0.28, 2, stone, 0, 0.14, 0, g, 0);
    kit.box(1.45, 0.9, 1.45, '#535f60', 0, 0.7, 0, g, 0);
    kit.cylinder(0.48, 0.59, 5.4, stone, 0, 3.65, 0, g);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      kit.rod(
        new THREE.Vector3(Math.cos(a) * 0.53, 1.1, Math.sin(a) * 0.53),
        new THREE.Vector3(Math.cos(a) * 0.46, 6.2, Math.sin(a) * 0.46),
        0.026,
        '#a2a59b',
        g,
      );
    }
    kit.box(1.25, 0.22, 1.25, '#a2a59b', 0, 6.43, 0, g, 0);
    kit.box(0.45, 0.72, 0.26, bronze, 0, 7.21, 0, g, 0);
    kit.sphere(0.18, 0.22, 0.19, bronze, 0, 7.78, 0, g, 8);
    const limb = (a: number[], b: number[], r: number) =>
      kit.rod(
        new THREE.Vector3(a[0], a[1], a[2]),
        new THREE.Vector3(b[0], b[1], b[2]),
        r,
        bronze,
        g,
      );
    limb([-0.12, 6.56, 0], [-0.13, 6.94, 0], 0.075);
    limb([0.19, 6.56, 0.04], [0.12, 6.94, 0], 0.075);
    limb([-0.2, 7.48, 0], [-0.5, 7.67, 0.04], 0.066);
    limb([0.2, 7.49, 0], [0.72, 7.22, 0.03], 0.066);
    kit.torus(0.24, 0.028, bronze, -0.58, 7.32, 0.01, g);
  } else {
    // Shallow circular stone basin with two rings of fine water jets.
    kit.cylinder(4.8, 4.95, 0.2, '#999c94', 0, 0.1, 0, g);
    kit.cylinder(4.5, 4.6, 0.35, stone, 0, 0.3, 0, g);
    kit.cylinder(4.22, 4.22, 0.02, '#79a9b3', 0, 0.49, 0, g);
    const rim = kit.torus(4.4, 0.17, '#b5b8ad', 0, 0.46, 0, g);
    rim.rotation.x = Math.PI / 2;
    for (let ring = 0; ring < 2; ring++)
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8,
          r = ring ? 1.3 : 3.8,
          height = ring ? 2.3 : 1.15;
        const points = Array.from({ length: 7 }, (_, n) => {
          const t = n / 6,
            reach = ring ? 0.35 : -1.4;
          return new THREE.Vector3(
            Math.cos(a) * (r + t * reach),
            0.52 + Math.sin(Math.PI * t) * height,
            Math.sin(a) * (r + t * reach),
          );
        });
        const water = kit.mesh(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(points),
            8,
            0.023,
            4,
            false,
          ),
          kit.material('#bee0e1'),
          g,
        );
        water.castShadow = false;
      }
  }
  return true;
}
