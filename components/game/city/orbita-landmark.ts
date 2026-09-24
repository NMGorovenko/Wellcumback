import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { facadeText } from './facade-text.ts';

/** Pale Orbita towers with the broad curved balcony glazing visible from the river. */
export function createOrbitaLandmark(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  if (b.kind !== 'borisova' && b.kind !== 'orbita') return false;
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
  const white = '#e4dfd3',
    orange = '#e97b3d',
    glass = '#6e949e',
    frame = '#b6c1c0';
  const bodyFront = b.d * 0.29,
    floors = b.floors ?? Math.max(11, Math.round(b.h / 2.7));
  box(b.w * 0.9, b.h * 0.97, b.d * 0.74, white, 0, b.h * 0.485, -b.d * 0.08);
  box(
    b.w * 0.92,
    0.18,
    b.d * 0.76,
    '#68787a',
    0,
    b.h * 0.97 + 0.09,
    -b.d * 0.08,
  );
  const bayHeight = b.h * 0.93,
    bayBottom = b.h * 0.025;
  const arc = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    color: string,
    cap = false,
  ) => {
    const mesh = kit.mesh(
      new THREE.CylinderGeometry(
        1,
        1,
        height,
        8,
        1,
        !cap,
        -Math.PI / 2,
        Math.PI,
      ),
      kit.material(color),
      g,
    );
    mesh.scale.set(width / 2, 1, depth);
    mesh.position.set(x, y, bodyFront + 0.045);
    return mesh;
  };
  // Two deep glazed bays cover most of the facade, as in the developer's photos.
  for (const side of [-1, 1]) {
    const x = side * b.w * 0.225,
      width = b.w * 0.34,
      depth = b.d * 0.145;
    const bay = arc(
      width,
      bayHeight,
      depth,
      x,
      bayBottom + bayHeight / 2,
      glass,
    );
    bay.name = 'orbita:curved-balconies';
    for (let floor = 1; floor < floors; floor++) {
      const y = bayBottom + (floor * bayHeight) / floors;
      arc(width + 0.03, 0.13, depth + 0.026, x, y, orange);
      arc(width + 0.04, 0.055, depth + 0.045, x, y + 0.16, frame);
    }
    for (let i = 0; i <= 8; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 8;
      box(
        0.07,
        bayHeight,
        0.075,
        frame,
        x + (Math.sin(angle) * width) / 2,
        bayBottom + bayHeight / 2,
        bodyFront + 0.11 + Math.cos(angle) * depth,
      );
    }
    arc(width + 0.1, 0.22, depth + 0.09, x, b.h * 0.97 + 0.02, white, true);
    // Bright narrow vertical accents and small punched windows beside the glass.
    box(
      b.w * 0.038,
      b.h * 0.86,
      0.1,
      orange,
      side * b.w * 0.425,
      b.h * 0.53,
      bodyFront + 0.08,
    );
    if (side === -1)
      for (let floor = 0; floor < floors; floor++) {
        const y = 1.2 + (floor * (b.h * 0.91)) / floors;
        for (const dx of [-0.045, 0.045])
          box(b.w * 0.025, 1, 0.07, '#386078', b.w * dx, y, bodyFront + 0.065);
        for (const dx of [-0.3, -0.12, 0.12, 0.3])
          box(
            b.w * 0.064,
            1.1,
            0.07,
            '#6e949e',
            b.w * dx,
            y,
            -b.d * 0.45 - 0.05,
          );
      }
  }
  // Side elevations also face the bridge approach. Recessed window columns
  // and the orange corner band keep them from reading as blank concrete slabs.
  for (const side of [-1, 1]) {
    box(
      0.08,
      b.h * 0.88,
      b.d * 0.035,
      orange,
      side * (b.w * 0.45 + 0.045),
      b.h * 0.49,
      b.d * 0.23,
    );
    for (let floor = 0; floor < floors; floor++) {
      const y = 1.3 + (floor * (b.h * 0.9)) / floors;
      for (const column of [-0.31, -0.09, 0.12]) {
        box(
          0.055,
          1.4,
          b.d * 0.105,
          '#bcc5c1',
          side * (b.w * 0.45 + 0.028),
          y,
          b.d * column,
        );
        box(
          0.062,
          1.15,
          b.d * 0.082,
          glass,
          side * (b.w * 0.45 + 0.064),
          y,
          b.d * column,
        );
      }
    }
  }
  // A setback rooftop box and light parapet retain the stepped crown in silhouette.
  box(
    b.w * 0.32,
    b.h * 0.03,
    b.d * 0.33,
    white,
    -b.w * 0.1,
    b.h * 0.985,
    -b.d * 0.08,
  );
  box(b.w * 0.13, 0.45, 0.08, orange, -b.w * 0.195, b.h * 0.985, b.d * 0.086);
  box(b.w * 0.96, 0.24, b.d * 0.96, '#c8bdad', 0, 0.12, 0);
  box(b.w * 0.11, 1.8, 0.08, '#40545a', 0, 0.98, bodyFront + 0.1);
  if (b.kind === 'borisova')
    facadeText(
      kit,
      g,
      'БОРИСОВА, 30',
      '#4b5657',
      b.w * 0.3,
      0,
      2.8,
      bodyFront + 0.13,
    );
  return true;
}
