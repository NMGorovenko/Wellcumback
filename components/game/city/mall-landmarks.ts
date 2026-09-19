import * as THREE from 'three';
import {
  CITY_PARKING,
  cityRoads,
  cityStops,
  distanceToRoad,
  type CityBuilding,
} from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { facadeText } from './facade-text.ts';
import { addMallSurroundings } from './mall-surroundings.ts';

const white = '#e4dfd3',
  glass = '#386078',
  frame = '#6e949e',
  orange = '#c88145';

/** Photographic references and the deliberate simplifications live in the city references doc. */
export function createMallLandmark(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
) {
  if (!['planeta', 'komsomoll', 'kubatura'].includes(b.kind ?? ''))
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
    name?: string,
  ) => {
    const mesh = kit.box(w, h, d, c, x, y, z, g, 0);
    if (name) mesh.name = name;
    return mesh;
  };
  const grid = (
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    cols: number,
    rows: number,
  ) => {
    for (let i = 0; i <= cols; i++)
      box(0.085, h, 0.11, frame, x - w / 2 + (i * w) / cols, y, z);
    for (let i = 0; i <= rows; i++)
      box(w, 0.08, 0.11, frame, x, y - h / 2 + (i * h) / rows, z);
  };
  const text = (
    t: string,
    c: string,
    w: number,
    x: number,
    y: number,
    z: number,
  ) => facadeText(kit, g, t, c, w, x, y, z);
  const { w, h, d } = b;
  if (b.kind === 'planeta') {
    const wingH = h * 0.46,
      front = d * 0.21,
      portalW = w * 0.39,
      portalD = d * 0.27,
      portalZ = d * 0.34,
      pierW = w * 0.028;
    // The long, low wings remain visible through a genuinely open elevated portal.
    box(
      w - 0.4,
      wingH,
      d * 0.71 - 0.4,
      white,
      0,
      wingH / 2,
      -d * 0.145,
      'planeta:low-wings',
    );
    box(w, 0.28, d * 0.72, white, 0, wingH, -d * 0.14);
    box(w - 0.7, 0.08, d * 0.72 - 0.7, '#56616a', 0, wingH + 0.15, -d * 0.14);
    box(
      w * 0.995,
      wingH * 0.28,
      0.12,
      '#25474e',
      0,
      wingH * 0.73,
      front + 0.07,
    );
    // Unequal horizontal colour strips, as on the actual shopfront cladding.
    const colors = [orange, '#e0bc42', '#8baca6', white, '#c36a41', '#d2c7aa'];
    const lengths = [0.07, 0.12, 0.045, 0.09, 0.055, 0.11, 0.08];
    const stripH = wingH * 0.075;
    for (let row = 0; row < 7; row++) {
      let left = -w / 2;
      for (let i = 0; left < w / 2 - 0.01; i++) {
        const width = Math.min(
          w * lengths[(i + row * 2) % lengths.length],
          w / 2 - left,
        );
        box(
          width,
          stripH - 0.025,
          0.14,
          colors[(i * 3 + row) % colors.length],
          left + width / 2,
          0.25 + row * stripH,
          front + 0.12,
        );
        left += width;
      }
    }
    for (let i = 0; i < 25; i++)
      box(
        0.11,
        wingH * 0.28,
        0.12,
        white,
        -w * 0.48 + i * w * 0.04,
        wingH * 0.73,
        front + 0.16,
      );
    // Recessed dark entrance and the smaller glazed upper hall behind the canopy.
    box(
      portalW * 0.82,
      wingH * 0.69,
      0.16,
      glass,
      0,
      wingH * 0.345,
      front + 0.25,
      'planeta:entrance',
    );
    grid(portalW * 0.82, wingH * 0.69, 0, wingH * 0.345, front + 0.36, 12, 3);
    box(
      portalW * 0.6,
      h * 0.25,
      d * 0.16,
      glass,
      0,
      wingH + h * 0.125,
      d * 0.09,
    );
    grid(portalW * 0.6, h * 0.25, 0, wingH + h * 0.125, d * 0.17 + 0.05, 12, 2);
    for (const side of [-1, 1]) {
      box(
        pierW,
        h,
        pierW,
        white,
        side * (portalW / 2 - pierW / 2),
        h / 2,
        portalZ + portalD / 2 - pierW / 2,
        'planeta:portal-pier',
      );
      box(
        pierW,
        h - wingH,
        pierW,
        white,
        side * (portalW / 2 - pierW / 2),
        (h + wingH) / 2,
        portalZ - portalD / 2 + pierW / 2,
      );
      box(
        pierW,
        h * 0.095,
        portalD,
        white,
        side * (portalW / 2 - pierW / 2),
        h * 0.953,
        portalZ,
      );
    }
    for (const side of [-1, 1])
      box(
        portalW,
        h * 0.095,
        pierW,
        white,
        0,
        h * 0.953,
        portalZ + side * (portalD / 2 - pierW / 2),
        'planeta:portal-lintel',
      );
    for (const [i, c] of [orange, '#bca437', '#418266'].entries())
      text(
        'ПЛАНЕТА',
        c,
        portalW * 0.3,
        (i - 1) * portalW * 0.318,
        h * 0.952,
        portalZ + portalD / 2 + 0.03,
      );
    // Slender glass tower, coloured cap, and low pyramidal rooflights.
    const towerW = w * 0.055,
      towerH = h * 0.8,
      towerX = -w * 0.37;
    box(
      towerW,
      towerH,
      d * 0.09,
      glass,
      towerX,
      towerH / 2,
      front - d * 0.055,
      'planeta:glass-tower',
    );
    grid(towerW, towerH, towerX, towerH / 2, front - d * 0.01 + 0.06, 4, 9);
    for (let i = 0; i < 3; i++)
      box(
        towerW + 0.3,
        h * 0.023,
        d * 0.09 + 0.3,
        colors[i],
        towerX,
        towerH - i * h * 0.025,
        front - d * 0.055,
      );
    for (const x of [-w * 0.29, w * 0.31]) {
      const pyramid = kit.mesh(
        new THREE.ConeGeometry(w * 0.048, h * 0.16, 4),
        kit.material(frame, 0.32, 0.25),
        g,
      );
      pyramid.name = 'planeta:rooflight';
      pyramid.rotation.y = Math.PI / 4;
      pyramid.position.set(x, wingH + h * 0.08, -d * 0.02);
      for (const side of [-1, 1])
        kit.rod(
          new THREE.Vector3(x, wingH + h * 0.16, -d * 0.02),
          new THREE.Vector3(x + side * w * 0.034, wingH, -d * 0.02 + w * 0.034),
          0.07,
          white,
          g,
        );
    }
    box(
      w * 0.35,
      h * 0.15,
      d * 0.26,
      white,
      w * 0.29,
      wingH + h * 0.075,
      -d * 0.34,
      'planeta:rear-volume',
    );
  } else if (b.kind === 'komsomoll') {
    const front = d * 0.44,
      glass = '#216c8f';
    box(
      w - 0.4,
      h * 0.68,
      d * 0.93 - 0.4,
      white,
      0,
      h * 0.34,
      -d * 0.035,
      'komsomoll:white-wings',
    );
    box(
      w * 0.7,
      h * 0.85,
      d * 0.69,
      '#b6c1c0',
      -w * 0.04,
      h * 0.425,
      -d * 0.13,
    );
    // Two unequal glass blades: the right one rises prominently toward the outer edge.
    for (const side of [-1, 1]) {
      const x1 = side < 0 ? -w * 0.34 : w * 0.09,
        x2 = side < 0 ? -w * 0.2 : w * 0.32;
      const y1 = side < 0 ? h * 0.82 : h * 0.89,
        y2 = side < 0 ? h * 0.75 : h;
      const shape = new THREE.Shape();
      shape.moveTo(x1, 0);
      shape.lineTo(x2, 0);
      shape.lineTo(x2, y2);
      shape.lineTo(x1, y1);
      shape.closePath();
      const blade = kit.mesh(
        new THREE.ExtrudeGeometry(shape, {
          depth: d * 0.1,
          bevelEnabled: false,
        }),
        kit.material(glass, 0.33, 0.18),
        g,
      );
      blade.name = 'komsomoll:sloped-glass';
      blade.position.z = front - d * 0.1;
      for (let i = 0; i <= 12; i++) {
        const t = i / 12,
          roofY = y1 + (y2 - y1) * t;
        box(
          0.075,
          roofY,
          0.12,
          frame,
          x1 + (x2 - x1) * t,
          roofY / 2,
          front + 0.05,
        );
      }
      for (let i = 1; i <= 10; i++)
        box(
          x2 - x1,
          0.075,
          0.11,
          frame,
          (x1 + x2) / 2,
          (Math.min(y1, y2) * i) / 11,
          front + 0.06,
        );
      kit.rod(
        new THREE.Vector3(x1, y1, front),
        new THREE.Vector3(x2, y2, front),
        0.1,
        frame,
        g,
      );
    }
    const panelX = -w * 0.06,
      panelW = w * 0.4;
    box(
      panelW,
      h * 0.35,
      0.24,
      white,
      panelX,
      h * 0.46,
      front + 0.14,
      'komsomoll:central-billboard',
    );
    for (let i = 0; i < 3; i++)
      box(
        panelW / 3 - 0.4,
        h * 0.29,
        0.1,
        ['#c8bdad', '#40545a', '#68787a'][i],
        panelX + ((i - 1) * panelW) / 3,
        h * 0.46,
        front + 0.29,
      );
    box(
      panelW * 1.07,
      0.27,
      2.2,
      '#b44436',
      panelX,
      h * 0.272,
      front - 0.85,
      'komsomoll:red-canopy',
    );
    box(w * 0.17, h * 0.2, 0.14, '#25474e', 0, h * 0.1, front + 0.06);
    grid(w * 0.17, h * 0.2, 0, h * 0.1, front + 0.16, 6, 2);
    text('КОМСОМОЛЛ', '#cb4032', panelW * 0.98, panelX, h * 0.72, front + 0.21);
    for (const side of [-1, 1]) {
      box(
        w * 0.17,
        h * 0.29,
        0.16,
        side < 0 ? '#b44436' : glass,
        side * w * 0.407,
        h * 0.51,
        front - 0.11,
      );
      box(
        w * 0.18,
        0.18,
        0.2,
        white,
        side * w * 0.407,
        h * 0.665,
        front - 0.07,
      );
    }
    // Large looping leaf outlines, rather than an unrelated flower logo on a box.
    for (const [cx, cy, radius] of [
      [w * 0.16, h * 0.54, h * 0.18],
      [-w * 0.27, h * 0.43, h * 0.12],
    ]) {
      for (let n = 0; n < 3; n++) {
        const a = (n * Math.PI * 2) / 3;
        const leaf = kit.torus(
          radius * 0.54,
          0.075,
          white,
          cx + Math.cos(a) * radius * 0.4,
          cy + Math.sin(a) * radius * 0.4,
          front + 0.14,
          g,
        );
        leaf.scale.set(0.72, 1.25, 1);
        leaf.rotation.z = a - Math.PI / 2;
      }
    }
    for (const [x, y, color] of [
      [w * 0.28, h * 0.79, '#b44436'],
      [w * 0.24, h * 0.42, orange],
      [-w * 0.31, h * 0.18, orange],
    ] as const)
      for (let n = 0; n < 5; n++)
        kit.torus(
          h * 0.028,
          0.045,
          color,
          x + Math.cos(n * Math.PI * 0.4) * h * 0.025,
          y + Math.sin(n * Math.PI * 0.4) * h * 0.025,
          front + 0.18,
          g,
        );
  } else {
    const dark = '#40545a';
    const front = d * 0.27,
      bodyH = h * 0.86;
    box(
      w - 1.2,
      bodyH,
      d * 0.77 - 0.4,
      white,
      0,
      bodyH / 2,
      -d * 0.115,
      'kubatura:metal-panel-block',
    );
    box(w, 0.23, d * 0.77, '#b6c1c0', 0, bodyH, -d * 0.115);
    // Main parking facade, confirmed by the official aerial: two rounded glass ends,
    // orange vertical stair towers, and a broad white advertising wall between them.
    for (const [bayX, bayW, bulge] of [
      [-w * 0.398, w * 0.15, d * 0.1],
      [w * 0.355, w * 0.25, d * 0.17],
    ]) {
      const bottom = h * 0.12,
        top = h * 0.91,
        segments = 16;
      const curve = (t: number) =>
        new THREE.Vector3(
          bayX + (t - 0.5) * bayW,
          0,
          front + bulge * Math.sin(t * Math.PI),
        );
      for (let i = 0; i < segments; i++) {
        const a = curve(i / segments),
          c = curve((i + 1) / segments),
          center = a.clone().add(c).multiplyScalar(0.5),
          length = a.distanceTo(c);
        const pane = box(
          length + 0.025,
          top - bottom,
          0.13,
          glass,
          center.x,
          (top + bottom) / 2,
          center.z,
          'kubatura:bowed-glazing',
        );
        pane.rotation.y = -Math.atan2(c.z - a.z, c.x - a.x);
        for (let j = 0; j <= 8; j++) {
          const rib = box(
            length + 0.03,
            0.07,
            0.2,
            frame,
            center.x,
            bottom + ((top - bottom) * j) / 8,
            center.z + 0.04,
          );
          rib.rotation.y = pane.rotation.y;
        }
        for (const y of [bottom - 0.1, top + 0.1]) {
          const edge = box(
            length + 0.08,
            0.16,
            0.55,
            white,
            center.x,
            y,
            center.z,
          );
          edge.rotation.y = pane.rotation.y;
        }
        box(
          0.07,
          top - bottom,
          0.15,
          frame,
          a.x,
          (top + bottom) / 2,
          a.z + 0.09,
        );
      }
      box(
        bayW,
        bottom - 0.1,
        0.12,
        glass,
        bayX,
        bottom / 2,
        front + 0.06,
        'kubatura:recessed-entrance',
      );
      grid(bayW, bottom - 0.1, bayX, bottom / 2, front + 0.15, 7, 2);
      for (const t of [0.1, 0.4, 0.72, 0.94]) {
        const p = curve(t);
        box(0.65, bottom, 0.65, white, p.x, bottom / 2, p.z - 0.35);
      }
      for (const level of [0.28, 0.5, 0.72])
        box(
          bayW * 0.53,
          0.35,
          0.28,
          orange,
          bayX - bayW * 0.23,
          h * level,
          front + bulge * 0.78,
        );
    }
    for (const x of [-w * 0.27, w * 0.215]) {
      box(
        w * 0.08,
        h * 0.94,
        d * 0.105,
        orange,
        x,
        h * 0.47,
        front - d * 0.017,
        'kubatura:orange-tower',
      );
      box(
        w * 0.026,
        h * 0.79,
        0.1,
        glass,
        x + w * 0.014,
        h * 0.42,
        front + d * 0.036,
      );
      grid(
        w * 0.026,
        h * 0.79,
        x + w * 0.014,
        h * 0.42,
        front + d * 0.039,
        2,
        12,
      );
    }
    const panelW = w * 0.435,
      panelX = -w * 0.028;
    box(
      panelW,
      h * 0.44,
      0.35,
      white,
      panelX,
      h * 0.53,
      front + 0.25,
      'kubatura:white-sign-wall',
    );
    for (let i = 0; i < 6; i++)
      box(
        panelW / 6 - 0.4,
        h * 0.26,
        0.12,
        [glass, orange, orange, '#b44436', '#c88145', dark][i],
        panelX + ((i - 2.5) * panelW) / 6,
        h * 0.53,
        front + 0.49,
      );
    box(panelW, h * 0.13, 0.11, glass, panelX, h * 0.09, front + 0.08);
    grid(panelW, h * 0.13, panelX, h * 0.09, front + 0.17, 18, 1);
    // Barrel skylight on the central roof, retained in the silhouette above the plain white wings.
    const roofShape = new THREE.Shape();
    for (let i = 0; i <= 20; i++) {
      const a = (Math.PI * i) / 20,
        x = Math.cos(a) * d * 0.12,
        y = Math.sin(a) * h * 0.12;
      if (!i) roofShape.moveTo(x, y);
      else roofShape.lineTo(x, y);
    }
    roofShape.closePath();
    const roof = kit.mesh(
      new THREE.ExtrudeGeometry(roofShape, {
        depth: w * 0.37,
        bevelEnabled: false,
      }),
      kit.material(frame, 0.32, 0.25),
      g,
    );
    roof.name = 'kubatura:barrel-rooflight';
    roof.rotation.y = Math.PI / 2;
    roof.position.set(-w * 0.185, bodyH, -d * 0.05);
    for (let i = 0; i <= 10; i++) {
      const rib = kit.mesh(
        new THREE.TorusGeometry(d * 0.12, 0.045, 4, 16, Math.PI),
        kit.material(white),
        g,
      );
      rib.scale.y = h / d;
      rib.rotation.y = Math.PI / 2;
      rib.position.set((i / 10 - 0.5) * w * 0.37, bodyH, -d * 0.05);
    }
    text('КУБАТУРА', '#c36a41', w * 0.36, panelX, h * 0.9, front + 0.39);
    for (let x = -w / 2 + 2; x < w / 2; x += 4)
      box(0.035, bodyH, 0.04, '#b6c1c0', x, bodyH / 2, front + 0.08);
  }
  addMallSurroundings(kit, g, b);
  return true;
}

/** Raised objects cannot occupy a street, arrival area, or a lot's central through aisle. */
export function mallParkingPropClear(
  x: number,
  z: number,
  w: number,
  d: number,
  p: (typeof CITY_PARKING)[number],
) {
  if (
    Math.abs(x - p.x) + w / 2 > p.w / 2 - 0.3 ||
    Math.abs(z - p.z) + d / 2 > p.d / 2 - 0.3
  )
    return false;
  if (Math.abs(x - p.x) < w / 2 + 4 || Math.abs(z - p.z) < d / 2 + 4)
    return false;
  if (
    cityStops.some(
      (s) => Math.hypot(s.x - x, s.z - z) < Math.hypot(w, d) / 2 + 11,
    )
  )
    return false;
  return !cityRoads.some(
    (r) => distanceToRoad(x, z, r) < r.width / 2 + Math.hypot(w, d) / 2 + 2,
  );
}

export function createMallParking(kit: RenderKit, root: THREE.Group) {
  for (const p of CITY_PARKING) {
    const g = new THREE.Group();
    g.name = `parking:${p.id}`;
    g.position.set(p.x, 0, p.z);
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
    box(p.w, 0.025, p.d, '#68787a', 0, 0.076, 0);
    const line = (w: number, d: number, x: number, z: number) =>
      box(w, 0.012, d, white, x, 0.096, z);
    const clear = (x: number, z: number, w: number, d: number) =>
      mallParkingPropClear(p.x + x, p.z + z, w, d, p);
    const island = (x: number, z: number, w: number, d: number) => {
      if (!clear(x, z, w, d)) return;
      const curb = box(w, 0.16, d, '#b6c1c0', x, 0.14, z);
      curb.name = 'parking:raised-island';
      box(w - 0.25, 0.08, d - 0.25, '#63795d', x, 0.25, z);
    };
    if (p.id === 'komsomoll') {
      // Long double rows run towards the glazed entrance, as in the aerial facade photo.
      for (let x = -p.w / 2 + 7; x < p.w / 2 - 6; x += 15) {
        if (Math.abs(x) < 9) continue;
        for (let z = -p.d / 2 + 5; z < p.d / 2 - 3; z += 2.7) {
          if (Math.abs(z) < 4) continue;
          line(4.7, 0.09, x - 2.6, z);
          line(4.7, 0.09, x + 2.6, z);
        }
        for (const side of [-1, 1]) island(x, side * (p.d / 2 - 1.7), 9.8, 1.4);
      }
    } else {
      // Planeta has broad landscaped transverse rows; Kubatura retains a generous loading/entry court.
      const rows =
        p.id === 'planeta' ? [-0.34, -0.13, 0.2, 0.39] : [-0.36, 0.36];
      for (const row of rows) {
        const z = p.d * row;
        for (let x = -p.w / 2 + 3; x < p.w / 2 - 3; x += 2.8) {
          if (Math.abs(x) < 6) continue;
          line(0.09, 4.5, x, z);
        }
        for (const x of [-p.w * 0.37, p.w * 0.37])
          island(x, z + 2.6, p.id === 'planeta' ? p.w * 0.18 : 5.2, 0.8);
      }
    }
    // A painted pedestrian spine meets the front forecourt; the crossing is within the private lot.
    for (let z = -p.d / 2 + 1; z < p.d / 2 - 1; z += 1.25)
      line(3.2, 0.65, 0, z);
    if (p.id === 'planeta') {
      // Cream barrel-vault covers are recognizable underground parking entrances.
      // The game's ramps are closed shallow visual recesses; there is no invisible drop or extra level.
      for (const side of [-1, 1]) {
        const x = side * p.w * 0.34,
          z = -p.d * 0.3,
          w = 6.4,
          d = 8.5;
        if (!clear(x, z, w, d)) continue;
        const shape = new THREE.Shape();
        for (let i = 0; i <= 20; i++) {
          const a = (Math.PI * i) / 20,
            px = (Math.cos(a) * w) / 2,
            py = Math.sin(a) * 1.9;
          if (i === 0) shape.moveTo(px, py);
          else shape.lineTo(px, py);
        }
        for (let i = 20; i >= 0; i--) {
          const a = (Math.PI * i) / 20;
          shape.lineTo(Math.cos(a) * (w / 2 - 0.1), Math.sin(a) * 1.79);
        }
        shape.closePath();
        const roof = kit.mesh(
          new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }),
          kit.material('#d2c7aa'),
          g,
        );
        roof.name = 'parking:barrel-ramp';
        roof.position.set(x, 1.5, z - d / 2);
        box(w, 0.015, d, '#40545a', x, 0.105, z);
        for (const edge of [-1, 1])
          box(0.16, 1.5, d, white, x + edge * (w / 2 - 0.15), 0.83, z);
        for (let i = 0; i <= 4; i++) {
          const rib = kit.mesh(
            new THREE.TorusGeometry(w / 2, 0.045, 4, 18, Math.PI),
            kit.material(white),
            g,
          );
          rib.scale.y = 1.9 / (w / 2);
          rib.position.set(x, 1.5, z - d / 2 + (i * d) / 4);
        }
        box(w * 0.8, 0.48, 0.12, '#b44436', x, 1.3, z + d / 2);
        facadeText(
          kit,
          g,
          'ПАРКОВКА',
          white,
          w * 0.74,
          x,
          1.3,
          z + d / 2 + 0.07,
        );
      }
    }
    for (const side of [-1, 1]) {
      const x = side * (p.w / 2 - 2),
        z = -p.d * 0.37;
      if (!clear(x, z, 1.4, 0.6)) continue;
      const lamp = kit.cylinder(0.06, 0.09, 4.8, '#40545a', x, 2.4, z, g);
      lamp.name = 'parking:lamp';
      box(1.3, 0.12, 0.35, white, x, 4.8, z);
    }
  }
}
