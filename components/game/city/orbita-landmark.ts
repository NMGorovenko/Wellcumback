import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { facadeText } from './facade-text.ts';

/** The address is a connected block; neighbouring phases retain tower silhouettes. */
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
  if (b.kind === 'borisova') {
    const floors = b.floors ?? 17;
    const wallTop = b.h * 0.96;
    const base = b.h * 0.035;
    const glazingHeight = wallTop - base - b.h * 0.035;
    // The long rear section joins two returns around an open river-facing court.
    // All parts remain inside the parcel: the courtyard is not a separate tower.
    box(b.w * 0.94, wallTop, b.d * 0.35, white, 0, wallTop / 2, -b.d * 0.295);
    for (const side of [-1, 1])
      box(
        b.w * 0.2,
        wallTop,
        b.d * 0.9,
        white,
        side * b.w * 0.37,
        wallTop / 2,
        0,
      );
    const field = (x: number, z: number, width: number) => {
      const bay = box(
        width,
        glazingHeight,
        b.d * 0.025,
        glass,
        x,
        base + glazingHeight / 2,
        z,
      );
      bay.name = 'borisova:shallow-glazing';
      for (let level = 0; level <= floors; level++) {
        const y = base + (level * glazingHeight) / floors;
        box(width + 0.06, 0.1, 0.08, frame, x, y, z + b.d * 0.013);
        if (level % 2 === 0)
          box(width, 0.075, 0.085, orange, x, y - 0.11, z + b.d * 0.013);
      }
      for (let column = 0; column <= 5; column++)
        box(
          0.065,
          glazingHeight,
          0.09,
          frame,
          x - width / 2 + (column * width) / 5,
          base + glazingHeight / 2,
          z + b.d * 0.014,
        );
    };
    for (const x of [-0.205, -0.07, 0.07, 0.205])
      field(x * b.w, -b.d * 0.106, b.w * 0.12);
    for (const side of [-1, 1]) {
      field(side * b.w * 0.37, b.d * 0.45, b.w * 0.165);
      // Open balcony stacks break up the long glass facade.
      const x = side * b.w * 0.142;
      box(
        b.w * 0.04,
        glazingHeight,
        0.08,
        '#566567',
        x,
        base + glazingHeight / 2,
        -b.d * 0.117,
      );
      for (let floor = 0; floor < floors; floor++) {
        const y = base + (floor * glazingHeight) / floors;
        box(b.w * 0.048, 0.14, b.d * 0.045, '#c0c4be', x, y, -b.d * 0.094);
        box(b.w * 0.044, 0.38, 0.08, '#d2d4cd', x, y + 0.38, -b.d * 0.071);
      }
      box(
        b.w * 0.018,
        wallTop,
        0.075,
        orange,
        side * b.w * 0.455,
        wallTop / 2,
        b.d * 0.453,
      );
      // Windows on the return walls keep the oblique bridge view legible.
      for (let floor = 0; floor < floors; floor++)
        for (const z of [-0.32, -0.1, 0.12, 0.34])
          box(
            0.055,
            (glazingHeight / floors) * 0.62,
            b.d * 0.105,
            glass,
            side * b.w * 0.471,
            base + ((floor + 0.5) * glazingHeight) / floors,
            z * b.d,
          );
      box(
        b.w * 0.2,
        b.h * 0.015,
        b.d * 0.905,
        orange,
        side * b.w * 0.37,
        wallTop - b.h * 0.018,
        0,
      );
    }
    box(
      b.w * 0.94,
      b.h * 0.015,
      b.d * 0.354,
      orange,
      0,
      wallTop - b.h * 0.018,
      -b.d * 0.295,
    );
    for (const x of [-0.36, 0, 0.36]) {
      box(
        b.w * 0.105,
        b.h * 0.04,
        b.d * 0.21,
        white,
        x * b.w,
        b.h * 0.98,
        -b.d * 0.295,
      );
      box(
        b.w * 0.108,
        0.15,
        b.d * 0.215,
        orange,
        x * b.w,
        b.h - 0.075,
        -b.d * 0.295,
      );
    }
    box(b.w * 0.97, 0.24, b.d * 0.96, '#c8bdad', 0, 0.12, 0);
    facadeText(
      kit,
      g,
      'БОРИСОВА, 30',
      '#4b5657',
      b.w * 0.15,
      -b.w * 0.37,
      2.5,
      b.d * 0.469,
    );
    return true;
  }
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
  return true;
}
