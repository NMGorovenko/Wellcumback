import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';

import { facadeText } from './facade-text.ts';
import { createMallParking } from './mall-landmarks.ts';
import { createKvantLandmark } from './kvant-landmark.ts';

export function createCentreLandmark(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  if (createKvantLandmark(kit, root, b)) return true;
  if (
    !['museum', 'pushkin', 'theatre', 'pho', 'frank', 'fresco'].includes(
      b.kind ?? '',
    )
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
    c: string,
    x: number,
    y: number,
    z: number,
  ) => kit.box(w, h, d, c, x, y, z, g, 0);
  const cyl = (
    r: number,
    h: number,
    c: string,
    x: number,
    y: number,
    z: number,
  ) => kit.cylinder(r, r, h, c, x, y, z, g);
  const sign = (
    t: string,
    c: string,
    w: number,
    x: number,
    y: number,
    z: number,
  ) => facadeText(kit, g, t, c, w, x, y, z);
  const front = b.d / 2 - 0.4;
  const glass = '#386078',
    white = '#e4dfd3',
    trim = '#c3b8a4',
    dark = '#40545a';
  function arch(x: number, y: number, z: number, w: number, h: number) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, h - w / 2);
    s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
    s.lineTo(-w / 2, 0);
    const m = kit.mesh(new THREE.ShapeGeometry(s), kit.material(glass), g);
    m.position.set(x, y, z);
    box(0.09, h - 0.1, 0.08, white, x, y + h / 2, z + 0.04);
    box(w, 0.08, 0.08, white, x, y + h * 0.55, z + 0.04);
  }
  if (b.kind === 'museum') {
    box(b.w - 1, b.h * 0.76, b.d * 0.75, '#bf815b', 0, b.h * 0.38, -b.d * 0.12);
    box(b.w * 0.52, b.h * 0.63, 0.14, dark, 0, b.h * 0.34, front - 0.6);
    for (const side of [-1, 1]) {
      const p = kit.mesh(
        new THREE.CylinderGeometry(1, 1.13, b.h, 4),
        kit.material('#c48a67'),
        g,
      );
      p.rotation.y = Math.PI / 4;
      p.scale.set(4.3, 1, 6.2);
      p.position.set(side * (b.w / 2 - 3.8), b.h / 2, -0.1);
      box(6.4, 0.28, b.d - 0.3, '#b6634c', side * (b.w / 2 - 3.8), b.h, 0);
      box(
        5.5,
        0.85,
        0.08,
        '#d7ba81',
        side * (b.w / 2 - 3.8),
        b.h - 0.75,
        front + 0.03,
      );
      for (const y of [1.4, 3.2])
        box(1.9, 1.2, 0.08, glass, side * (b.w / 2 - 3.8), y, front + 0.06);
    }
    for (const x of [-4.05, -1.35, 1.35, 4.05]) {
      // Four square painted pillars and flared capitals, not round classical columns.
      box(0.9, 4.1, 0.9, '#ba7357', x, 2.1, front - 0.3);
      for (const y of [0.55, 0.8, 1.05, 3.25, 3.5, 3.75])
        box(
          0.94,
          0.1,
          0.94,
          y < 1.2 ? '#8baca6' : '#d7ba81',
          x,
          y,
          front - 0.3,
        );
      for (const dx of [-0.3, 0, 0.3])
        box(0.06, 1.2, 0.03, '#8baca6', x + dx, 1.72, front + 0.17);
      box(1.25, 0.32, 1.15, '#d7ba81', x, 4.25, front - 0.3);
      for (const dx of [-0.42, 0, 0.42])
        box(0.12, 0.42, 0.06, '#8baca6', x + dx, 4.15, front + 0.3);
    }
    box(12, 0.65, 1, '#d7ba81', 0, 4.65, front - 0.3);
    const sun = cyl(0.36, 0.08, '#b6634c', 0, 4.67, front + 0.25);
    sun.rotation.x = Math.PI / 2;
    for (const side of [-1, 1])
      for (let n = 0; n < 7; n++) {
        const feather = box(
          0.5,
          0.12,
          0.06,
          white,
          side * (0.7 + n * 0.47),
          4.65 - n * 0.03,
          front + 0.3,
        );
        feather.rotation.z = side * 0.22;
      }
  } else if (b.kind === 'theatre') {
    box(b.w - 1, 3.8, b.d - 3, white, 0, 2, -1);
    const hall = cyl(4, 2.6, white, 0, 5, -1);
    hall.scale.z = 1.25;
    box(7, 7, 4, white, 0, 3.5, -b.d / 2 + 2.1);
    box(b.w - 2, 3.7, 0.1, glass, 0, 2.1, front - 1.4);
    for (let x = -b.w / 2 + 2; x < b.w / 2; x += 1.4)
      box(0.09, 3.7, 0.1, white, x, 2.1, front - 1.3);
    for (const y of [1, 2.4, 3.7])
      box(b.w - 2, 0.1, 0.12, white, 0, y, front - 1.3);
    for (const x of [-b.w / 2 + 1, -b.w / 2 + 2.8, b.w / 2 - 2.8, b.w / 2 - 1])
      cyl(0.3, 4, white, x, 2.1, front - 0.3);
    box(b.w, 0.5, 3, white, 0, 4.35, front - 1);
    for (const side of [-1, 1])
      for (let n = 0; n < 6; n++)
        box(
          0.3,
          0.4,
          0.3,
          '#806d50',
          side * 7 + (n % 2) * 0.35,
          1.5 + Math.floor(n / 2) * 0.6,
          front - 1.15,
        );
    sign('ОПЕРА И БАЛЕТ', '#776f60', 14, 0, 4.38, front + 0.55);
  } else if (b.kind === 'pushkin') {
    box(b.w - 1, b.h - 1, b.d - 1.6, '#a6a89c', 0, (b.h - 1) / 2, -0.3);
    for (let y = 0.35; y < 6; y += 0.36)
      box(b.w - 1, 0.035, 0.025, trim, 0, y, front - 0.65);
    for (const x of [-4.4, 0, 4.4]) arch(x, 1.25, front - 0.5, 2.4, 3.95);
    for (const x of [-6.8, -2.2, 2.2, 6.8]) {
      cyl(0.44, 5.6, white, x, 3, front - 0.1);
      box(1.1, 0.3, 1.1, white, x, 5.8, front - 0.1);
      for (let n = 0; n < 8; n++) {
        const a = (n * Math.PI) / 4;
        cyl(
          0.045,
          4.9,
          trim,
          x + Math.sin(a) * 0.45,
          3,
          front - 0.1 + Math.cos(a) * 0.45,
        );
      }
    }
    for (const [w, y] of [
      [b.w, 6.2],
      [18, 6.55],
      [12, 6.87],
    ])
      box(w, 0.38, 1.3, white, 0, y, front - 0.25);
    box(b.w - 1, 0.16, b.d - 0.6, '#536c69', 0, 6.2, -0.3);
    for (const side of [-1, 1]) {
      const medallion = cyl(0.62, 0.06, white, side * 10, 4.6, front - 0.5);
      medallion.rotation.x = Math.PI / 2;
    }
    sign('ТЕАТР ПУШКИНА', '#776f60', 10, 0, 6.65, front + 0.44);
  } else {
    const isPho = b.kind === 'pho',
      isFrank = b.kind === 'frank';
    const wall = isPho ? '#d7c4a2' : isFrank ? '#c6a496' : '#ad806b';
    const base = isPho ? '#a66758' : isFrank ? '#8f8c82' : '#ad806b';
    const face = b.d / 2 - 0.4;
    box(b.w - 0.3, b.h, b.d - 0.9, wall, 0, b.h / 2, -0.05);
    box(b.w - 0.25, 1.85, b.d - 1, base, 0, 0.925, -0.04);
    // Historical masonry is legible at street level; its storeys differ for each tenancy.
    for (let y = 0.28; y < (isFrank ? b.h : 1.85); y += 0.3)
      box(
        b.w - 0.3,
        0.026,
        0.025,
        isFrank ? '#a58b7e' : '#805e51',
        0,
        y,
        face + 0.045,
      );
    const floors = isFrank ? 3 : 2,
      step = (b.h - 2) / floors;
    for (let f = 0; f < floors; f++) {
      const y = 2 + (f + 0.5) * step;
      for (let i = 0; i < 8; i++) {
        const x = ((i - 3.5) * b.w) / 9;
        box(b.w / 14, step * 0.76, 0.05, glass, x, y, face + 0.08);
        for (const side of [-1, 1])
          box(
            0.08,
            step * 0.82,
            0.09,
            isFrank ? white : trim,
            x + (side * b.w) / 28,
            y,
            face + 0.13,
          );
        box(b.w / 13, 0.09, 0.14, white, x, y - step * 0.4, face + 0.12);
        box(b.w / 14, 0.06, 0.08, white, x, y + step * 0.05, face + 0.13);
      }
    }
    box(b.w, 0.22, b.d, isFrank ? dark : white, 0, b.h, 0);
    box(b.w - 0.1, 0.18, 0.35, isFrank ? dark : white, 0, 1.9, face - 0.1);
    if (isFrank) {
      box(
        b.w * 0.27,
        0.8,
        b.d * 0.24,
        wall,
        -b.w * 0.33,
        b.h + 0.4,
        face - b.d * 0.13,
      );
      box(
        b.w * 0.29,
        0.1,
        b.d * 0.25,
        dark,
        -b.w * 0.33,
        b.h + 0.85,
        face - b.d * 0.13,
      );
      box(b.w - 0.3, 0.42, 0.12, '#29383b', 0, 1.65, face + 0.1);
    }
    if (!isPho && !isFrank) {
      // Mira 49: a shallow pediment, tall pilasters, outer risalits and stone balustrades.
      const shape = new THREE.Shape();
      shape.moveTo(-7, 0);
      shape.lineTo(0, 1.1);
      shape.lineTo(7, 0);
      shape.closePath();
      const roof = kit.mesh(
        new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false }),
        kit.material(wall),
        g,
      );
      roof.position.set(0, b.h, face - 0.35);
      for (const x of [-5.8, -3.45, -1.15, 1.15, 3.45, 5.8]) {
        box(0.25, b.h - 2.15, 0.16, white, x, (b.h + 2.15) / 2, face + 0.18);
        box(0.44, 0.18, 0.24, white, x, b.h - 0.28, face + 0.18);
      }
      for (const x of [-7.8, 0, 7.8]) {
        box(2.9, 0.24, 0.55, trim, x, 2.15, face - 0.02);
        box(2.9, 0.12, 0.1, trim, x, 2.68, face + 0.23);
        for (let i = 0; i < 8; i++)
          cyl(0.065, 0.42, white, x - 1.23 + i * 0.35, 2.44, face + 0.23);
      }
      for (const side of [-1, 1])
        box(2.5, 0.45, 0.75, wall, side * 7.8, b.h + 0.22, face - 0.22);
      const crest = cyl(0.3, 0.06, white, 0, b.h + 0.45, face + 0.07);
      crest.rotation.x = Math.PI / 2;
    }
    for (let x = -b.w / 2 + 2; x < b.w / 2; x += 4) {
      box(2.2, 1.3, 0.08, dark, x, 0.8, face + 0.1);
      if (isPho) box(2.5, 0.12, 0.6, '#805e51', x, 1.56, face - 0.18);
    }
    if (!isPho && !isFrank)
      for (const side of [-1, 1])
        arch(side * 7.8, 0.25, face + 0.16, 1.8, 1.65);
    if (isPho) {
      box(5.7, 0.57, 0.12, white, 0, 1.49, face + 0.2);
      for (const x of [-6.4, 6.4]) {
        box(1.9, 0.18, 0.55, white, x, 3.63, face - 0.06);
        box(1.9, 0.06, 0.06, '#805e51', x, 4.13, face + 0.22);
        for (let i = 0; i < 7; i++)
          box(
            0.04,
            0.5,
            0.04,
            '#805e51',
            x - 0.87 + i * 0.29,
            3.88,
            face + 0.22,
          );
      }
    }
    const name =
      b.kind === 'pho'
        ? 'PHỞ VIỆT'
        : b.kind === 'frank'
          ? 'FRANK'
          : 'FRESCO ASIA';
    sign(
      name,
      isPho ? dark : white,
      isPho ? 5.2 : 7,
      0,
      isPho ? 1.49 : 1.65,
      face + 0.28,
    );
  }
  return true;
}
export function createCityParking(kit: RenderKit, root: THREE.Group) {
  createMallParking(kit, root);
}
