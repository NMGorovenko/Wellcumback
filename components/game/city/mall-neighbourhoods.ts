import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { facadeText } from './facade-text.ts';

/** Recognizable compact frontages, not extra towers filling the mall grounds. */
export function createMallNeighbour(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  if (
    ![
      'neo-hotel',
      'central-market',
      'belinskogo-office',
      'bus-shelter',
    ].includes(b.kind ?? '')
  )
    return false;
  const g = new THREE.Group();
  g.name = `landmark:${b.kind}${b.kind === 'bus-shelter' ? `:${b.district}:${b.x}` : ''}`;
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
  const sign = (
    text: string,
    c: string,
    w: number,
    x: number,
    y: number,
    z: number,
  ) => facadeText(kit, g, text, c, w, x, y, z);
  const { w, h, d } = b;
  const pale = '#d8d9cf',
    dark = '#343e42',
    glass = '#4a6571';
  if (b.kind === 'bus-shelter') {
    g.rotation.y = b.angle ?? 0;
    box(7.8, 0.12, 2.8, '#68787a', 0, 0.1, 0);
    box(7.8, 0.14, 2.7, dark, 0, 2.8, 0);
    box(7.4, 0.25, 0.14, '#244e69', 0, 2.65, 1.25);
    for (const x of [-3.6, 0, 3.6]) box(0.1, 2.65, 0.1, dark, x, 1.4, -1.1);
    box(7.3, 1.55, 0.05, '#76959b', 0, 1.65, -1.14);
    box(4.7, 0.12, 0.5, '#aa8263', -0.7, 0.58, -0.75);
    for (const x of [-2.6, 1.2]) box(0.12, 0.5, 0.45, dark, x, 0.3, -0.75);
    box(0.7, 1.9, 0.08, pale, 3, 1.45, -1.07);
    for (let i = 0; i < 6; i++)
      box(0.51, 0.035, 0.02, '#879293', 3, 1 + i * 0.15, -1.02);
    sign(
      b.district === 'planeta' ? 'ПЛАНЕТА' : 'ДУБЕНСКОГО',
      pale,
      3.7,
      0,
      2.65,
      1.34,
    );
    return true;
  }
  if (b.kind === 'neo-hotel') {
    const wingH = 9.6,
      wingW = w * 0.72,
      wingX = -w * 0.132;
    box(wingW, wingH, d - 0.5, pale, wingX, wingH / 2, 0);
    box(wingW + 0.15, 0.16, d - 0.35, dark, wingX, wingH + 0.08, 0);
    // Low silver wing with projecting black window surrounds; the bright
    // primary colours belong to the taller end tower, as in the facade photo.
    for (const face of [-1, 1])
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 6; col++) {
          const x = wingX - wingW / 2 + 2.1 + (col * (wingW - 4.2)) / 5,
            y = 1.7 + row * 2.8;
          const z = face * (d / 2 - 0.28);
          box(2.15, 2.12, 0.2, dark, x, y, z + face * 0.09);
          box(1.8, 1.77, 0.08, glass, x, y, z + face * 0.23);
          box(0.026, 2.7, 0.025, '#b6c1c0', x + 1.6, y, z + face * 0.08);
        }
      }
    const tx = w * 0.34,
      tz = -d * 0.28,
      tw = w * 0.26,
      td = d * 0.4;
    box(tw, h - 0.25, td, dark, tx, (h - 0.25) / 2, tz);
    const colors = ['#3d7092', pale, '#d5b843', pale, '#b83c38', pale];
    for (const face of [-1, 1])
      for (let floor = 0; floor < 6; floor++) {
        const y = 1.6 + floor * 2.8,
          front = tz + face * (td / 2 + 0.07);
        box(tw * 0.56, 2.65, 0.12, colors[floor], tx - tw * 0.19, y, front);
        box(
          tw * 0.35,
          2.65,
          0.12,
          floor === 2 ? '#d5b843' : pale,
          tx + tw * 0.3,
          y,
          front,
        );
        box(1.1, 0.8, 0.13, glass, tx + tw * 0.3, y + 0.6, front + face * 0.03);
      }
    box(5.5, 2.5, 0.25, dark, -4, 1.3, d / 2 - 0.15);
    box(6, 0.16, 1.4, dark, -4, 2.9, d / 2 - 0.72);
    sign('ОТЕЛЬ', pale, 4, -4, 3.45, d / 2 - 0.03);
    sign('NEO', pale, tw * 0.85, tx, h - 0.5, tz + td / 2 + 0.2);
    return true;
  }
  if (b.kind === 'central-market') {
    box(w - 1, h * 0.48, d - 1, pale, 0, h * 0.24, 0);
    box(w - 1.2, 1.5, 0.1, glass, 0, h * 0.4, d / 2 - 0.38);
    const positions: number[] = [];
    const nx = 20,
      nz = 8;
    const point = (i: number, j: number) => {
      const x = (i / nx) * 2 - 1,
        z = (j / nz) * 2 - 1;
      return [
        x * w * 0.497,
        h * (0.66 + 0.31 * x * x - 0.12 * z * z),
        z * d * 0.497,
      ];
    };
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++)
        positions.push(
          ...point(i, j),
          ...point(i, j + 1),
          ...point(i + 1, j),
          ...point(i + 1, j),
          ...point(i, j + 1),
          ...point(i + 1, j + 1),
        );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        new Float32Array((positions.length / 3) * 2),
        2,
      ),
    );
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: pale,
      side: THREE.DoubleSide,
      roughness: 0.85,
    });
    kit.mesh(geometry, material, g).name = 'market:saddle-roof';
    const paneMaterial = new THREE.MeshStandardMaterial({
      color: glass,
      side: THREE.DoubleSide,
      roughness: 0.6,
    });
    // Clerestory closes the volume beneath the rising roof edges.
    for (const face of [-1, 1])
      for (let i = 0; i < 20; i++) {
        const x1 = ((i / 20) * 2 - 1) * w * 0.495;
        const x2 = (((i + 1) / 20) * 2 - 1) * w * 0.495;
        const y1 = h * (0.54 + 0.31 * ((i / 20) * 2 - 1) ** 2);
        const y2 = h * (0.54 + 0.31 * (((i + 1) / 20) * 2 - 1) ** 2);
        const z = face * d * 0.48,
          base = h * 0.47;
        const pane = new THREE.BufferGeometry();
        pane.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            [
              x1,
              base,
              z,
              x2,
              base,
              z,
              x1,
              y1,
              z,
              x2,
              base,
              z,
              x2,
              y2,
              z,
              x1,
              y1,
              z,
            ],
            3,
          ),
        );
        pane.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(new Float32Array(12), 2),
        );
        pane.computeVertexNormals();
        kit.mesh(pane, paneMaterial, g);
        box(0.12, y1 - base, 0.14, pale, x1, (base + y1) / 2, z);
        kit.rod(
          new THREE.Vector3(x1, y1, z),
          new THREE.Vector3(x2, y2, z),
          0.13,
          pale,
          g,
        );
      }
    // The saddle rises along both end walls too; close those gables so the
    // hall remains a volume when seen from the road behind the hotel.
    for (const side of [-1, 1]) {
      const x = side * w * 0.49,
        base = h * 0.47;
      for (let j = 0; j < nz; j++) {
        const z1 = ((j / nz) * 2 - 1) * d * 0.48;
        const z2 = (((j + 1) / nz) * 2 - 1) * d * 0.48;
        const roofY = (z: number) =>
          h *
          (0.66 +
            0.31 * (x / (w * 0.497)) ** 2 -
            0.12 * (z / (d * 0.497)) ** 2);
        const y1 = roofY(z1),
          y2 = roofY(z2);
        const pane = new THREE.BufferGeometry();
        pane.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            [
              x,
              base,
              z1,
              x,
              base,
              z2,
              x,
              y1,
              z1,
              x,
              base,
              z2,
              x,
              y2,
              z2,
              x,
              y1,
              z1,
            ],
            3,
          ),
        );
        pane.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(new Float32Array(12), 2),
        );
        pane.computeVertexNormals();
        kit.mesh(pane, paneMaterial, g);
        box(0.14, y1 - base, 0.12, pale, x, (base + y1) / 2, z1);
      }
    }
    for (let col = 0; col < 11; col++)
      box(
        0.15,
        h * 0.48,
        0.16,
        pale,
        -w * 0.46 + col * w * 0.092,
        h * 0.24,
        d / 2 - 0.23,
      );
    for (const x of [-8, 0, 8]) box(3.3, 2.6, 0.15, dark, x, 1.3, d / 2 - 0.18);
    sign('ЦЕНТРАЛЬНЫЙ РЫНОК', '#b83c38', w * 0.75, 0, 4.8, d / 2 - 0.06);
    return true;
  }
  // Belinskogo office frontage across the road from the mall, with its own court.
  box(w - 0.6, h - 0.3, d - 0.6, pale, 0, (h - 0.3) / 2, 0);
  box(w * 0.29, h - 0.5, d - 0.35, '#a87969', -w * 0.34, (h - 0.5) / 2, 0);
  for (const face of [-1, 1])
    for (let row = 0; row < 5; row++) {
      box(
        w * 0.65,
        2.1,
        0.11,
        glass,
        w * 0.145,
        1.65 + row * 2.9,
        face * (d / 2 - 0.2),
      );
      for (let col = 0; col < 10; col++)
        box(
          0.075,
          2.1,
          0.13,
          pale,
          -w * 0.16 + col * w * 0.068,
          1.65 + row * 2.9,
          face * (d / 2 - 0.1),
        );
    }
  box(w - 0.25, 0.18, d - 0.25, dark, 0, h - 0.2, 0);
  sign('ОФИСЫ', dark, 6.2, -w * 0.34, 4.3, d / 2 - 0.02);
  return true;
}
