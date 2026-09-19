import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { makeLabel } from '../world/labels.ts';
import { createMallLandmark } from './mall-landmarks.ts';
import { facadeText } from './facade-text.ts';
import { createOrbitaLandmark } from './orbita-landmark.ts';
import { createDonerLandmark } from './doner-landmark.ts';

/** Landmark masses use the same parcels as collision, with details kept inside. */
export function createDistrictLandmark(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  if (createMallLandmark(kit, root, b)) return true;
  if (createOrbitaLandmark(kit, root, b)) return true;
  if (createDonerLandmark(kit, root, b)) return true;
  if (!['ikit', 'udachny', 'arena'].includes(b.kind ?? '')) return false;
  const g = new THREE.Group();
  g.name = `landmark:${b.kind}`;
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
  ) => kit.box(w, h, d, color, x, y, z, g, 0);
  const sign = (text: string, width: number, y: number, z: number) => {
    const label = makeLabel(kit, text, '#ede4bd', width);
    label.position.set(0, y, z);
    g.add(label);
  };
  box(b.w, 0.35, b.d, '#d4d2b7', 0, 0.18, 0);
  if (b.kind === 'ikit') {
    const cream = '#d2c7aa',
      burgundy = '#805e51',
      glass = '#386078';
    const clad = (
      w: number,
      h: number,
      d: number,
      x: number,
      z: number,
      base = 0,
    ) => {
      const body = box(w, h, d, cream, x, base + h / 2, z);
      const front = z + d / 2;
      // Fine panel seams sit outside the wall, not coplanar with it.
      for (let y = base + 0.7; y < base + h; y += 0.8)
        box(w, 0.018, 0.025, '#c3b8a4', x, y, front + 0.018);
      for (let dx = -w / 2 + 0.8; dx < w / 2; dx += 0.8)
        box(0.018, h, 0.025, '#c3b8a4', x + dx, base + h / 2, front + 0.018);
      return body;
    };
    const windows = (
      x: number,
      width: number,
      front: number,
      rows: number,
      bottom: number,
      step: number,
    ) => {
      for (let floor = 0; floor < rows; floor++) {
        const y = bottom + floor * step;
        box(width, 0.3, 0.08, burgundy, x, y + 0.82, front + 0.06);
        for (let dx = -width / 2 + 1.25; dx < width / 2 - 0.6; dx += 2.45) {
          box(1.5, 1.38, 0.07, '#e4dfd3', x + dx, y, front + 0.06);
          box(1.26, 1.17, 0.055, glass, x + dx, y, front + 0.12);
          box(0.055, 1.17, 0.05, '#e4dfd3', x + dx, y, front + 0.17);
        }
      }
    };
    const leftFront = b.d * 0.09,
      rightFront = b.d * 0.15;
    clad(b.w * 0.49, b.h * 0.83, b.d * 0.56, -b.w * 0.245, -b.d * 0.19);
    windows(-b.w * 0.245, b.w * 0.48, leftFront, 5, 1.15, b.h * 0.16);
    box(
      b.w * 0.49,
      0.2,
      b.d * 0.56,
      burgundy,
      -b.w * 0.245,
      b.h * 0.83 + 0.1,
      -b.d * 0.19,
    );
    // The upper right teaching wing spans a dark, genuinely recessed ground entrance.
    clad(
      b.w * 0.32,
      b.h * 0.67,
      b.d * 0.65,
      b.w * 0.28,
      -b.d * 0.175,
      b.h * 0.2,
    );
    windows(b.w * 0.28, b.w * 0.31, rightFront, 4, b.h * 0.28, b.h * 0.16);
    const entry = box(
      b.w * 0.22,
      b.h * 0.2,
      0.12,
      '#29383b',
      b.w * 0.28,
      b.h * 0.1,
      -b.d * 0.15,
    );
    entry.name = 'ikit:recessed-entry';
    box(
      b.w * 0.24,
      0.16,
      0.65,
      burgundy,
      b.w * 0.28,
      b.h * 0.205,
      rightFront + 0.2,
    );
    facadeText(
      kit,
      g,
      'ИКИТ · СФУ',
      '#dfbd99',
      b.w * 0.21,
      b.w * 0.28,
      b.h * 0.235,
      rightFront + 0.18,
    );
    for (let step = 0; step < 4; step++)
      box(
        b.w * 0.23,
        0.1,
        0.75,
        '#8f8c82',
        b.w * 0.28,
        0.05 + step * 0.1,
        b.d * 0.445 - step * 0.75,
      );
    // The wide almost-blank tower and low forward wing define the actual silhouette.
    const tower = clad(
      b.w * 0.16,
      b.h * 0.97,
      b.d * 0.79,
      b.w * 0.07,
      b.d * 0.01,
    );
    tower.name = 'ikit:blank-tower';
    box(
      b.w * 0.16,
      0.28,
      b.d * 0.79,
      burgundy,
      b.w * 0.07,
      b.h * 0.97 + 0.14,
      b.d * 0.01,
    );
    for (const dx of [-0.035, 0.035])
      box(
        b.w * 0.015,
        b.h * 0.1,
        0.07,
        burgundy,
        b.w * (0.07 + dx),
        b.h * 0.8,
        b.d * 0.405 + 0.06,
      );
    box(
      b.w * 0.06,
      0.3,
      0.07,
      burgundy,
      b.w * 0.07,
      b.h * 0.72,
      b.d * 0.405 + 0.06,
    );
    clad(b.w * 0.105, b.h * 0.87, b.d * 0.68, b.w * 0.44, -b.d * 0.08);
    box(
      b.w * 0.105,
      0.18,
      b.d * 0.68,
      burgundy,
      b.w * 0.44,
      b.h * 0.87 + 0.09,
      -b.d * 0.08,
    );
    clad(b.w * 0.34, b.h * 0.45, b.d * 0.4, -b.w * 0.28, b.d * 0.24);
    box(
      b.w * 0.34,
      0.16,
      b.d * 0.4,
      burgundy,
      -b.w * 0.28,
      b.h * 0.45 + 0.08,
      b.d * 0.24,
    );
    for (const x of [-0.4, -0.36, -0.16])
      box(0.9, 1.2, 0.07, glass, b.w * x, b.h * 0.33, b.d * 0.44 + 0.06);
  } else if (b.kind === 'arena') {
    const arena = kit.cylinder(1, 1, b.h, '#aebec1', 0, b.h / 2, 0, g);
    arena.scale.set(b.w * 0.48, 1, b.d * 0.48);
    box(b.w * 0.8, 0.75, b.d * 0.75, '#6e7e82', 0, b.h, 0);
    sign('ПЛАТИНУМ АРЕНА', 12, b.h + 1.4, 0);
  } else {
    for (const side of [-1, 1]) {
      box(5.2, 3, 6.5, '#c3b192', side * 3, 1.5, 0);
      const roof = kit.mesh(
        new THREE.ConeGeometry(4.1, 1.6, 4),
        kit.material('#536c69'),
        g,
      );
      roof.position.set(side * 3, 3.6, 0);
      roof.rotation.y = Math.PI / 4;
      roof.scale.z = 0.8;
      for (const dx of [-1.1, 1.1])
        box(0.8, 1, 0.06, '#536671', side * 3 + dx, 1.65, 3.28);
    }
    sign('УДАЧНЫЙ', 8, 5.5, 0);
  }
  return true;
}
