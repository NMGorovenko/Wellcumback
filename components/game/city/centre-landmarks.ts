import * as THREE from 'three';
import {
  CITY_PARKING,
  type CityBuilding,
} from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';

/** Facades are geometry, including lettering: they keep their orientation in the world. */
function facadeText(
  kit: RenderKit,
  g: THREE.Group,
  text: string,
  color: string,
  w: number,
  x: number,
  y: number,
  z: number,
) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.font = 'bold 78px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 512, 64, 1010);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  kit.textures.add(tex);
  const material = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  kit.materials.add(material);
  const mesh = kit.mesh(new THREE.PlaneGeometry(w, w / 8), material, g);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
}
export function createCentreLandmark(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  if (
    ![
      'komsomoll',
      'museum',
      'pushkin',
      'theatre',
      'kubatura',
      'pho',
      'frank',
      'fresco',
    ].includes(b.kind ?? '')
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
  function windows(w: number, h: number, z: number, spacing = 2) {
    for (let x = -w / 2 + 1; x < w / 2; x += spacing)
      for (let y = 1.2; y < h - 0.5; y += 1.7) {
        box(0.85, 1.04, 0.06, glass, x, y, z);
        box(1.02, 0.1, 0.13, white, x, y - 0.57, z + 0.04);
      }
  }
  if (b.kind === 'komsomoll') {
    box(b.w, b.h * 0.68, b.d, white, 0, b.h * 0.34, 0);
    box(b.w * 0.66, b.h * 0.84, b.d * 0.8, glass, 0, b.h * 0.42, 1);
    // The right-hand glazed sail rises diagonally above the low white wings.
    const shape = new THREE.Shape();
    shape.moveTo(4, 0);
    shape.lineTo(14, 0);
    shape.lineTo(14, b.h + 3);
    shape.lineTo(4, b.h + 1);
    shape.closePath();
    const sail = kit.mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }),
      kit.material(glass),
      g,
    );
    sail.position.z = front - 2;
    for (let x = -13; x <= 14; x += 1.1) {
      const h = x >= 4 ? b.h + 1 + (x - 4) * 0.2 : b.h * 0.84;
      box(0.07, h, 0.12, '#6e949e', x, h / 2, front + 0.03);
    }
    for (let y = 1; y < 8.8; y += 1)
      box(10, 0.06, 0.12, '#6e949e', 9, y, front + 0.05);
    box(20, 0.2, 1.6, '#b44436', -1, 2.4, front - 0.6);
    box(19, 1.7, 0.22, white, -3, 5.7, front + 0.06);
    sign('КОМСОМОЛЛ', '#cb4032', 19, -3, 6.9, front + 0.22);
    for (const [x, y, r] of [
      [8, 5.8, 1.4],
      [11.7, 3.7, 0.65],
      [7, 2.8, 0.6],
      [-11, 3.8, 1.1],
    ])
      for (let n = 0; n < 4; n++) {
        const a = (n * Math.PI) / 2;
        kit.torus(
          r * 0.55,
          0.06,
          n % 2 ? '#d26646' : white,
          x + Math.cos(a) * r * 0.45,
          y + Math.sin(a) * r * 0.45,
          front + 0.14,
          g,
        );
      }
  } else if (b.kind === 'museum') {
    box(b.w - 1, b.h * 0.76, b.d - 1, '#bf815b', 0, b.h * 0.38, -0.25);
    box(b.w * 0.52, b.h * 0.63, 0.14, dark, 0, b.h * 0.34, front - 0.6);
    for (const side of [-1, 1]) {
      const p = kit.mesh(
        new THREE.CylinderGeometry(1, 1.13, b.h, 4),
        kit.material('#c48a67'),
        g,
      );
      p.rotation.y = Math.PI / 4;
      p.scale.set(4.3, 1, 4.5);
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
    for (const x of [-3.6, 0, 3.6]) {
      cyl(0.47, 4.1, '#ba7357', x, 2.1, front - 0.3);
      for (let y = 2.8; y < 4.2; y += 0.3)
        cyl(0.49, 0.11, y % 1 < 0.5 ? '#8baca6' : '#d7ba81', x, y, front - 0.3);
      box(1.25, 0.32, 1.15, '#d7ba81', x, 4.25, front - 0.3);
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
    box(b.w - 1, b.h - 1, b.d - 1, '#c8bdad', 0, (b.h - 1) / 2, -0.3);
    for (const x of [-4.4, 0, 4.4]) arch(x, 1, front - 0.5, 2.4, 4.2);
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
    for (const side of [-1, 1])
      for (const y of [1.6, 3.6]) arch(side * 10, y, front, 1.4, 1.55);
    sign('ТЕАТР ПУШКИНА', '#776f60', 10, 0, 6.65, front + 0.44);
  } else if (b.kind === 'kubatura') {
    box(b.w, b.h, b.d, white, 0, b.h / 2, 0);
    const bay = cyl(4.8, b.h - 0.5, glass, -7, b.h / 2, front - 2);
    bay.scale.z = 0.65;
    for (let y = 1; y < b.h; y += 1.5)
      box(b.w - 0.2, 0.16, 0.12, '#c88145', 0, y, front + 0.04);
    for (let x = 1; x < b.w / 2 - 1; x += 4)
      box(2.6, 3, 0.12, '#c88145', x, 4.6, front + 0.08);
    box(11, 0.3, 1.8, '#c88145', -6, 2, front - 0.5);
    sign('КУБАТУРА', '#b6634c', 14, 5, b.h - 0.8, front + 0.16);
  } else {
    box(b.w, b.h, b.d, b.color, 0, b.h / 2, 0);
    box(
      b.w,
      1.65,
      b.d + 0.04,
      b.kind === 'pho' ? '#805e51' : '#8f8c82',
      0,
      0.85,
      0,
    );
    for (let y = 1.9; y < b.h; y += 1.7)
      box(b.w + 0.15, 0.14, b.d + 0.12, white, 0, y, 0);
    windows(b.w, b.h, front + 0.45);
    box(b.w + 0.18, 0.25, b.d + 0.18, white, 0, b.h, 0);
    if (b.kind === 'frank')
      box(4, 1.3, 4, '#c6a496', -b.w / 2 + 2, b.h + 0.5, front - 1.6);
    if (b.kind === 'fresco') {
      const shape = new THREE.Shape();
      shape.moveTo(-7, 0);
      shape.lineTo(0, 1.8);
      shape.lineTo(7, 0);
      shape.closePath();
      const roof = kit.mesh(
        new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false }),
        kit.material(white),
        g,
      );
      roof.position.set(0, b.h, front);
      for (const x of [-8, -5, 5, 8])
        box(0.3, b.h - 1.7, 0.2, white, x, b.h / 2 + 0.85, front + 0.5);
    }
    for (let x = -b.w / 2 + 2; x < b.w / 2; x += 4) {
      box(2.8, 1.3, 0.08, dark, x, 0.8, front + 0.5);
      box(3, 0.12, 0.7, trim, x, 1.6, front + 0.2);
    }
    const name =
      b.kind === 'pho'
        ? 'PHỞ VIỆT'
        : b.kind === 'frank'
          ? 'FRANK'
          : 'FRESCO ASIA';
    sign(name, white, Math.min(10, b.w * 0.7), 0, 1.1, front + 0.58);
  }
  return true;
}
export function createCityParking(kit: RenderKit, root: THREE.Group) {
  for (const p of CITY_PARKING) {
    kit.box(p.w, 0.025, p.d, '#68787a', p.x, 0.076, p.z, root, 0);
    // Empty stalls and a wide through aisle are genuinely available to drive in.
    for (const side of [-1, 1])
      for (let x = -p.w / 2 + 1; x < p.w / 2; x += 3.1) {
        kit.box(
          0.09,
          0.01,
          3.1,
          '#e4dfc0',
          p.x + x,
          0.094,
          p.z + side * (p.d / 2 - 1.8),
          root,
          0,
        );
      }
    for (const x of [-p.w / 2 + 1, p.w / 2 - 1]) {
      kit.cylinder(0.07, 0.1, 3.8, '#40545a', p.x + x, 1.9, p.z, root);
      kit.box(1.2, 0.1, 0.3, '#e4dfc0', p.x + x, 3.8, p.z, root, 0);
    }
  }
}
