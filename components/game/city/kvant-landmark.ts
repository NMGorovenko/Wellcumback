import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { facadeText } from './facade-text.ts';

/** The glazed Krasnoy Armii frontage, reduced to the canonical collision parcel. */
export function createKvantLandmark(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  if (b.kind !== 'kvant') return false;
  const g = new THREE.Group();
  g.name = 'landmark:kvant';
  g.position.set(b.x, 0, b.z);
  root.add(g);
  const box = (
    w: number,
    h: number,
    d: number,
    color: string,
    x: number,
    y: number,
    z: number,
    name = '',
  ) => {
    const mesh = kit.box(w, h, d, color, x, y, z, g, 0);
    mesh.name = name;
    return mesh;
  };
  const glass = '#6e949e',
    frame = '#40545a',
    pale = '#c8bdad';
  const glazed = (
    w: number,
    h: number,
    d: number,
    x: number,
    z: number,
    name: string,
  ) => {
    const body = box(w, h, d, glass, x, h / 2, z, name);
    body.material = kit.material(glass, 0.28, 0.32);
    // Large, continuous curtain walls: the panes are not punched masonry windows.
    const front = z + d / 2;
    for (let y = 1.35; y < h; y += 2.25) {
      box(w, 0.045, 0.055, frame, x, y, front + 0.04);
      for (const side of [-1, 1])
        box(0.055, 0.045, d, frame, x + side * (w / 2 + 0.035), y, z);
    }
    for (let dx = -w / 2 + 1.6; dx < w / 2; dx += 1.8)
      box(0.045, h, 0.055, frame, x + dx, h / 2, front + 0.04);
    for (let dz = -d / 2 + 1.5; dz < d / 2; dz += 1.8)
      for (const side of [-1, 1])
        box(0.055, h, 0.045, frame, x + side * (w / 2 + 0.035), h / 2, z + dz);
    box(w + 0.08, 0.16, d + 0.08, '#56616a', x, h + 0.08, z);
  };
  // The official oblique photograph shows higher glazed projections either side
  // of the entrance. The unobserved back is deliberately left without invented docks.
  glazed(b.w - 0.7, b.h * 0.8, b.d * 0.65, 0, -b.d * 0.15, 'kvant:main-wing');
  glazed(
    b.w * 0.2,
    b.h * 0.985,
    b.d * 0.31,
    -b.w * 0.22,
    b.d * 0.19,
    'kvant:left-risalit',
  );
  glazed(
    b.w * 0.155,
    b.h * 0.91,
    b.d * 0.31,
    b.w * 0.4,
    b.d * 0.19,
    'kvant:right-risalit',
  );

  const entryX = b.w * 0.09,
    wallZ = b.d * 0.175;
  box(
    b.w * 0.25,
    3.15,
    0.1,
    '#25474e',
    entryX,
    1.88,
    wallZ + 0.08,
    'kvant:recessed-entry',
  );
  for (let i = -2; i <= 2; i++)
    box(0.08, 2.85, 0.08, pale, entryX + i * b.w * 0.041, 1.85, wallZ + 0.18);
  // The screen is an architectural frame with simple original graphics, no ad texture.
  const screenY = b.h * 0.52,
    screenZ = wallZ + 0.6;
  box(
    b.w * 0.205,
    b.h * 0.3,
    0.75,
    pale,
    entryX,
    screenY,
    screenZ,
    'kvant:screen-frame',
  );
  box(
    b.w * 0.177,
    b.h * 0.249,
    0.06,
    '#29383b',
    entryX,
    screenY,
    screenZ + 0.42,
  );
  box(
    b.w * 0.105,
    0.17,
    0.04,
    '#b6c1c0',
    entryX,
    screenY + 0.65,
    screenZ + 0.47,
  );
  box(
    b.w * 0.072,
    0.15,
    0.04,
    '#c36a41',
    entryX,
    screenY - 0.25,
    screenZ + 0.47,
  );
  facadeText(kit, g, 'КВАНТ', '#c53b3b', b.w * 0.16, entryX, 4.9, wallZ + 0.55);
  const canopyZ = b.d * 0.32;
  box(
    b.w * 0.31,
    0.24,
    b.d * 0.29,
    '#68787a',
    entryX,
    3.6,
    canopyZ,
    'kvant:canopy',
  );
  for (const side of [-1, 1])
    box(0.25, 3.25, 0.25, pale, entryX + side * b.w * 0.135, 1.76, b.d * 0.44);
  for (let step = 0; step < 3; step++)
    box(
      b.w * 0.27,
      0.13,
      0.6,
      '#b4afa2',
      entryX,
      0.065 + step * 0.13,
      b.d * 0.47 - step * 0.6,
    );

  // Low glazed café volume at the left end is visible in the official photo.
  const pavilionX = -b.w * 0.39,
    pavilionZ = b.d * 0.34;
  box(b.w * 0.18, 3.1, b.d * 0.24, '#386078', pavilionX, 1.55, pavilionZ);
  for (let i = -2; i <= 2; i++)
    box(
      0.055,
      3,
      0.06,
      pale,
      pavilionX + i * b.w * 0.033,
      1.55,
      b.d * 0.46 + 0.05,
    );
  const awning = box(
    b.w * 0.185,
    0.14,
    b.d * 0.25,
    '#9eaeb0',
    pavilionX,
    3.21,
    pavilionZ,
  );
  awning.rotation.x = 0.045;
  for (const dx of [-0.42, -0.37, 0.28])
    box(0.6, 0.6, 0.6, '#c8bdad', b.w * dx, b.h * 0.8 + 0.42, -b.d * 0.12);
  return true;
}
