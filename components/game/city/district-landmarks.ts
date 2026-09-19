import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { makeLabel } from '../world/labels.ts';

/** Landmark masses use the same parcels as collision, with details kept inside. */
export function createDistrictLandmark(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  if (
    !['borisova', 'ikit', 'planeta', 'udachny', 'arena'].includes(b.kind ?? '')
  )
    return false;
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
  if (b.kind === 'borisova') {
    // Орбита: two pale towers, orange strips and glazed rounded balcony bays.
    for (const side of [-1, 1]) {
      box(6.2, b.h, b.d - 2, '#d7d9d0', side * 4.6, b.h / 2, -0.5);
      box(6.4, 0.22, b.d - 1.7, '#6e7e82', side * 4.6, b.h + 0.1, -0.5);
      box(
        0.55,
        b.h - 0.4,
        0.12,
        '#b76b55',
        side * 6.7,
        b.h / 2,
        b.d / 2 - 1.44,
      );
      const bay = kit.cylinder(
        1.35,
        1.35,
        b.h - 0.6,
        '#8baca6',
        side * 4.2,
        b.h / 2,
        b.d / 2 - 1.55,
        g,
      );
      bay.scale.z = 0.75;
      for (let floor = 1; floor < 11; floor++) {
        const y = floor * 1.6;
        box(6.3, 0.1, b.d - 1.9, '#e4dfc0', side * 4.6, y, -0.5);
        for (const dx of [-1.7, 0, 1.7]) {
          box(
            0.9,
            0.9,
            0.08,
            '#536671',
            side * 4.6 + dx,
            y - 0.6,
            -b.d / 2 + 0.46,
          );
          box(
            0.09,
            0.95,
            0.62,
            '#40545a',
            side * 4.2 + dx * 0.55,
            y - 0.48,
            b.d / 2 - 1,
          );
        }
      }
    }
    box(3.2, 1.2, b.d - 3, '#aebec1', 0, 0.6, 0);
    for (let n = 0; n < 4; n++)
      box(
        2.5,
        0.14,
        0.35,
        '#e4dfc0',
        0,
        n * 0.14 + 0.07,
        b.d / 2 - 0.3 - n * 0.35,
      );
    sign('БОРИСОВА, 30', 9, 3.2, b.d / 2);
  } else if (b.kind === 'ikit') {
    box(b.w - 0.4, b.h, b.d - 1, '#d4d2b7', 0, b.h / 2, -0.3);
    for (let floor = 0; floor < 5; floor++) {
      const y = 0.65 + floor * 1.06;
      box(b.w - 0.2, 0.18, 0.12, '#805e51', 0, y + 0.52, b.d / 2 - 0.75);
      for (let x = -b.w / 2 + 1; x < b.w / 2 - 0.5; x += 1.4)
        box(0.92, 0.66, 0.07, '#536671', x, y, b.d / 2 - 0.77);
    }
    box(2.2, b.h + 0.7, 0.34, '#ccb79a', 1.5, (b.h + 0.7) / 2, b.d / 2 - 0.5);
    box(2.4, 1.5, 0.12, '#40545a', 5.6, 0.85, b.d / 2 - 0.62);
    sign('ИКИТ · СФУ', 8, b.h + 1.5, 1);
  } else if (b.kind === 'planeta') {
    box(b.w - 0.4, b.h, b.d - 0.5, '#ad806b', 0, b.h / 2, 0);
    box(b.w - 0.1, 0.4, b.d - 0.2, '#e4dfc0', 0, b.h, 0);
    box(b.w * 0.66, b.h * 0.64, 0.08, '#8baca6', 0, b.h * 0.42, b.d / 2 - 0.2);
    for (let x = -11; x <= 11; x += 2)
      box(0.1, 3.6, 0.12, '#e4dfc0', x, 2, b.d / 2 - 0.1);
    box(9, 1.3, 0.24, '#805e51', 0, b.h - 0.5, b.d / 2 - 0.03);
    sign('ПЛАНЕТА', 13, b.h + 1.4, b.d / 2);
    for (const side of [-1, 1])
      box(
        1,
        b.h + 1.5,
        1,
        '#cbb98d',
        side * (b.w / 2 - 0.8),
        (b.h + 1.5) / 2,
        b.d / 2 - 0.8,
      );
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
