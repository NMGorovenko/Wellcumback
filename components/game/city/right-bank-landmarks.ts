import * as THREE from 'three';
import type { CityBuilding } from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { facadeText } from './facade-text.ts';

// Original low-poly geometry from inspected Krasnoyarsk photographs. Source
// notes and parcel suggestions: docs/city-rightbank-reference-020.md.
// These local objects start at y=0; their owning terrain group lifts them once.
// Reuse the city palette and default surface material so spatial batching can
// combine these details with existing buildings without changing shared materials.
const colors = {
  ivory: '#e4dfd3',
  white: '#e4dfd3',
  grey: '#b6c1c0',
  plinth: '#68787a',
  glass: '#6e949e',
  dark: '#40545a',
  blue: '#386078',
  red: '#b44436',
};
type Pane = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  side?: 'x';
  flip?: boolean;
};

/** Coplanar facade panes are one mesh per color, rather than hundreds of boxes. */
function windowBatch(
  kit: RenderKit,
  g: THREE.Group,
  panes: Pane[],
  color = colors.glass,
) {
  const positions: number[] = [],
    indices: number[] = [];
  for (const { x, y, z, w, h, side, flip } of panes) {
    const n = positions.length / 3;
    if (side === 'x')
      positions.push(
        x,
        y - h / 2,
        z - w / 2,
        x,
        y - h / 2,
        z + w / 2,
        x,
        y + h / 2,
        z + w / 2,
        x,
        y + h / 2,
        z - w / 2,
      );
    else
      positions.push(
        x - w / 2,
        y - h / 2,
        z,
        x + w / 2,
        y - h / 2,
        z,
        x + w / 2,
        y + h / 2,
        z,
        x - w / 2,
        y + h / 2,
        z,
      );
    if (flip) indices.push(n, n + 2, n + 1, n, n + 3, n + 2);
    else indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  if (!positions.length) return;
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
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Outward winding makes a shared front-side material sufficient. UV keeps
  // attributes compatible with box/cylinder geometry in the city merger.
  const mesh = kit.mesh(geometry, kit.material(color), g);
  mesh.name = 'rightbank:window-batch';
}

function rectangleFrame(
  panes: Pane[],
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  thick = 0.17,
  flip = false,
) {
  for (const side of [-1, 1]) {
    panes.push({ x: x + (side * w) / 2, y, z, w: thick, h, flip });
    panes.push({ x, y: y + (side * h) / 2, z, w: w + thick, h: thick, flip });
  }
}

function zori(kit: RenderKit, g: THREE.Group, b: CityBuilding) {
  const box = (
    w: number,
    h: number,
    d: number,
    c: string,
    x: number,
    y: number,
    z: number,
  ) => kit.box(w, h, d, c, x, y, z, g, 0);
  const panes: Pane[] = [],
    bluePanes: Pane[] = [],
    whitePanes: Pane[] = [];
  const depth = b.d * 0.84,
    segmentW = b.w * 0.306;
  const reverse = Math.round(Math.abs(b.x)) % 2 ? 1 : -1;
  // The river silhouette is a continuous stepped wall, not isolated glass towers.
  for (let segment = 0; segment < 3; segment++) {
    const x = (segment - 1) * segmentW;
    const height =
      b.h * [0.99, 0.86, 0.75][reverse > 0 ? segment : 2 - segment];
    const floors = Math.max(12, Math.round(height / 2.65));
    const floorH = (height - 3.1) / floors;
    box(segmentW, height, depth, colors.ivory, x, height / 2, 0);
    box(segmentW, 3, depth + 0.05, colors.plinth, x, 1.5, 0);
    box(segmentW + 0.25, 0.2, depth + 0.26, colors.white, x, height + 0.1, 0);
    box(
      segmentW * 0.25,
      1.4,
      depth * 0.29,
      colors.grey,
      x - segmentW * 0.18,
      height + 0.8,
      0,
    );
    box(
      segmentW * 0.22,
      1,
      depth * 0.24,
      colors.ivory,
      x + segmentW * 0.22,
      height + 0.6,
      0,
    );
    const columns = Math.max(4, Math.round(segmentW / 3.8));
    for (const side of [-1, 1]) {
      const z = side * (depth / 2 + 0.035);
      for (let f = 0; f < floors; f++)
        for (let c = 0; c < columns; c++) {
          panes.push({
            x: x - segmentW * 0.44 + ((c + 0.5) * segmentW * 0.88) / columns,
            y: 3.1 + (f + 0.53) * floorH,
            z,
            w: (segmentW * 0.49) / columns,
            h: floorH * 0.57,
            flip: side < 0,
          });
        }
      // Broad blue frames around 4-floor glazing fields are the key address cue.
      for (const c of [-1, 1]) {
        const frameX = x + c * segmentW * 0.23,
          frameW = segmentW * 0.32;
        for (let tier = 0; tier < 3; tier++) {
          const frameH = floorH * 4,
            y = height - floorH * (2.6 + tier * 4.15);
          if (y - frameH / 2 < 6) continue;
          rectangleFrame(
            bluePanes,
            frameX,
            y,
            z + side * 0.09,
            frameW,
            frameH,
            0.2,
            side < 0,
          );
          for (let k = 1; k < 4; k++)
            bluePanes.push({
              x: frameX,
              y: y - frameH / 2 + (k * frameH) / 4,
              z: z + side * 0.1,
              w: frameW,
              h: 0.065,
              flip: side < 0,
            });
        }
      }
      // Thin enclosed balcony stacks project a little from the repeated windows.
      for (const edge of [-1, 1]) {
        const bx = x + edge * segmentW * 0.425;
        box(
          segmentW * 0.115,
          height - 3.3,
          0.24,
          '#b6c1c0',
          bx,
          (height + 3.3) / 2,
          z + side * 0.1,
        );
        for (let f = 0; f <= floors; f++)
          whitePanes.push({
            x: bx,
            y: 3.1 + f * floorH,
            z: z + side * 0.27,
            w: segmentW * 0.123,
            h: 0.09,
            flip: side < 0,
          });
      }
      box(segmentW * 0.14, 0.28, 1.2, colors.blue, x, 2.9, z + side * 0.58);
      panes.push({
        x,
        y: 1.32,
        z: z + side * 0.04,
        w: segmentW * 0.11,
        h: 2.3,
        flip: side < 0,
      });
    }
    if (segment === 0 || segment === 2) {
      const side = segment === 0 ? -1 : 1;
      const sideX = x + side * (segmentW / 2 + 0.04);
      for (let f = 0; f < floors; f++)
        for (let c = 0; c < 3; c++)
          panes.push({
            x: sideX,
            y: 3.1 + (f + 0.53) * floorH,
            z: (c - 1) * depth * 0.24,
            w: depth * 0.115,
            h: floorH * 0.57,
            side: 'x',
            flip: side > 0,
          });
    }
  }
  windowBatch(kit, g, panes);
  windowBatch(kit, g, bluePanes, colors.blue);
  windowBatch(kit, g, whitePanes, colors.white);
  g.userData.landmarkName = 'Тихие Зори';
}

function aerokos(kit: RenderKit, g: THREE.Group, b: CityBuilding) {
  const box = (
    w: number,
    h: number,
    d: number,
    c: string,
    x: number,
    y: number,
    z: number,
  ) => kit.box(w, h, d, c, x, y, z, g, 0);
  const panes: Pane[] = [];
  const wingH = Math.min(b.h * 0.63, 20.5),
    rearZ = -b.d * 0.23,
    frontZ = -b.d * 0.1;
  box(b.w * 0.96, 0.18, b.d * 0.96, '#b6c1c0', 0, 0.09, 0);
  // A high vertical-window wing, curved central stair volume and broad lower wing.
  box(
    b.w * 0.28,
    wingH * 1.12,
    b.d * 0.36,
    colors.ivory,
    -b.w * 0.32,
    wingH * 0.56,
    rearZ,
  );
  box(
    b.w * 0.55,
    wingH * 0.87,
    b.d * 0.3,
    colors.ivory,
    b.w * 0.195,
    wingH * 0.435,
    rearZ,
  );
  const connector = kit.cylinder(
    b.w * 0.09,
    b.w * 0.09,
    wingH * 0.83,
    colors.ivory,
    -b.w * 0.09,
    wingH * 0.415,
    rearZ,
    g,
  );
  connector.scale.z = 0.8;
  const dome = kit.mesh(
    new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    kit.material('#b6c1c0'),
    g,
  );
  dome.scale.set(b.w * 0.092, 2.1, b.w * 0.074);
  dome.position.set(-b.w * 0.09, wingH * 0.83, rearZ);
  for (const [x, w, h, z] of [
    [-b.w * 0.32, b.w * 0.28, wingH * 1.12, rearZ + b.d * 0.18],
    [b.w * 0.195, b.w * 0.55, wingH * 0.87, frontZ + b.d * 0.02],
  ]) {
    box(w, h * 0.87, 0.11, colors.glass, x, h * 0.55, z + 0.08);
    const count = Math.round(w / 5);
    for (let i = 0; i <= count; i++)
      box(
        0.35,
        h * 0.9,
        0.26,
        colors.white,
        x - w / 2 + (i * w) / count,
        h * 0.55,
        z + 0.2,
      );
    for (let floor = 1; floor < 6; floor++)
      box(w, 0.15, 0.15, '#b6c1c0', x, 2 + (floor * (h - 2)) / 6, z + 0.2);
    box(w, 1.9, 0.32, colors.plinth, x, 0.95, z + 0.1);
    box(w, 0.22, 0.42, colors.red, x, 2.2, z + 0.13);
  }
  for (let f = 0; f < 4; f++)
    for (let c = 0; c < 3; c++)
      panes.push({
        x: -b.w * 0.09 + (c - 1) * b.w * 0.04,
        y: 3.5 + f * 3.1,
        z: rearZ + b.w * 0.074 + 0.03,
        w: b.w * 0.028,
        h: 1.9,
      });
  windowBatch(kit, g, panes);
  box(b.w * 0.09, 3.5, b.d * 0.07, '#68787a', b.w * 0.195, 1.75, -b.d * 0.055);
  box(
    b.w * 0.12,
    0.35,
    b.d * 0.095,
    colors.ivory,
    b.w * 0.195,
    3.55,
    -b.d * 0.045,
  );
  facadeText(
    kit,
    g,
    'АЭРОКОС',
    colors.blue,
    b.w * 0.27,
    b.w * 0.195,
    wingH * 0.78,
    frontZ + b.d * 0.025,
  );
  // Gridded forecourt with planted squares; no inaccessible tall plinth.
  for (const x of [-0.35, 0.26])
    box(b.w * 0.19, 0.16, b.d * 0.22, '#82966d', x * b.w, 0.2, b.d * 0.27);
  for (const x of [-0.37, 0.32])
    for (const z of [0.19, 0.37]) {
      box(3, 0.4, 1.05, '#b6c1c0', x * b.w, 0.3, z * b.d);
      box(2.85, 0.12, 0.85, '#805e51', x * b.w, 0.56, z * b.d);
    }
  const r = new THREE.Group();
  r.name = 'aerokos:cosmos-3m';
  r.position.set(-b.w * 0.055, 0, b.d * 0.265);
  g.add(r);
  const rocketH = Math.min(b.h, 34),
    sy = rocketH / 32;
  r.scale.setScalar(sy);
  kit.cylinder(3.6, 3.8, 0.35, '#68787a', 0, 0.18, 0, r);
  kit.cylinder(1.45, 1.75, 1.7, colors.white, 0, 1.35, 0, r);
  kit.cylinder(1.2, 1.45, 21.2, colors.white, 0, 12.8, 0, r);
  for (const y of [4, 7.5, 15.6, 22.6]) {
    const radius = 1.48 - ((y - 2.2) / 21.2) * 0.25;
    kit.cylinder(radius, radius + 0.012, 0.62, colors.red, 0, y, 0, r);
  }
  kit.cylinder(1.12, 1.16, 6.1, '#56616a', 0, 26.2, 0, r);
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const rib = kit.box(
      0.32,
      3.7,
      0.26,
      '#40545a',
      Math.sin(a) * 1.24,
      26.3,
      Math.cos(a) * 1.24,
      r,
      0,
    );
    rib.rotation.y = a;
  }
  kit.cylinder(0, 1.12, 2.6, colors.red, 0, 30.55, 0, r);
  kit.cylinder(1.13, 1.13, 0.38, colors.white, 0, 29.2, 0, r);
  // Vertical letters preserve the real rocket's readily visible blue inscription.
  for (const [i, letter] of Array.from('КОСМОС').entries()) {
    const text = facadeText(
      kit,
      r,
      letter,
      colors.blue,
      1.4,
      0,
      20.2 - i * 1.2,
      1.43,
    );
    if (text) text.scale.set(12, 5.5, 1);
  }
  g.userData.landmarkName = 'Аэрокос — ракета «Космос»';
}

/** Solid thin prism for the aircraft's sharply swept wings and tailplanes. */
function wing(
  kit: RenderKit,
  g: THREE.Group,
  points: [number, number][],
  y: number,
  color: string,
) {
  const p: number[] = [],
    idx: number[] = [],
    n = points.length;
  for (const dy of [-0.07, 0.07])
    for (const [x, z] of points) p.push(x, y + dy, z);
  for (let i = 1; i < n - 1; i++) {
    idx.push(0, i + 1, i, n, n + i, n + i + 1);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(i, j, n + j, i, n + j, n + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(new Float32Array((p.length / 3) * 2), 2),
  );
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return kit.mesh(geo, kit.material(color), g);
}

function fighter(kit: RenderKit, g: THREE.Group, b: CityBuilding) {
  const metal = '#b6c1c0';
  kit.cylinder(b.w * 0.32, b.w * 0.33, 0.65, '#c8bdad', 0, 0.325, 0, g);
  kit.cylinder(b.w * 0.29, b.w * 0.29, 0.1, '#82966d', 0, 0.7, 0, g);
  // A broad tilted blade stands beneath the tail, the defining monument profile.
  const support = kit.box(2.5, 10.5, 1.1, '#b6c1c0', 0, 5.13, 5.75, g, 0);
  support.rotation.x = -0.55;
  const plane = new THREE.Group();
  plane.name = 'fighter:mig-21f';
  plane.position.set(0, 14.0, -2.0);
  plane.rotation.x = 0.72;
  g.add(plane);
  const fuselage = kit.cylinder(0.6, 0.9, 12.3, metal, 0, 0, 0, plane);
  fuselage.rotation.x = Math.PI / 2;
  const nose = kit.cylinder(0.38, 0.6, 3.3, metal, 0, 0, -7.8, plane);
  nose.rotation.x = Math.PI / 2;
  const intake = kit.cylinder(0.33, 0.33, 0.14, '#40545a', 0, 0, -9.51, plane);
  intake.rotation.x = Math.PI / 2;
  const cone = kit.cylinder(0, 0.24, 0.9, '#68787a', 0, 0, -9.94, plane);
  cone.rotation.x = -Math.PI / 2;
  kit.rod(
    new THREE.Vector3(0.2, 0.12, -9.3),
    new THREE.Vector3(0.2, 0.12, -11.3),
    0.035,
    metal,
    plane,
  );
  const jet = kit.cylinder(0.57, 0.67, 1.1, '#40545a', 0, 0, 6.6, plane);
  jet.rotation.x = Math.PI / 2;
  const canopy = kit.mesh(
    new THREE.SphereGeometry(1, 12, 6),
    kit.material('#6e949e'),
    plane,
  );
  canopy.scale.set(0.47, 0.43, 1.5);
  canopy.position.set(0, 0.56, -3.9);
  const wings = wing(
    kit,
    plane,
    [
      [-0.4, -2.7],
      [-5.4, 3.3],
      [-0.8, 2.5],
      [0.8, 2.5],
      [5.4, 3.3],
      [0.4, -2.7],
    ],
    -0.12,
    metal,
  );
  wings.name = 'fighter:delta-wing';
  for (const side of [-1, 1])
    wing(
      kit,
      plane,
      [
        [side * 0.5, 3.8],
        [side * 2.7, 6.5],
        [side * 0.7, 6],
      ],
      0.15,
      metal,
    );
  const fin = wing(
    kit,
    plane,
    [
      [0, 2.3],
      [2.2, 5.9],
      [0, 6.1],
    ],
    0,
    metal,
  );
  fin.rotation.z = Math.PI / 2;
  // Small red wing stars, built as original flat polygons.
  for (const side of [-1, 1]) {
    const points: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5;
      const r = i % 2 ? 0.18 : 0.46;
      points.push([side * 3.4 + Math.sin(a) * r, 1.9 + Math.cos(a) * r]);
    }
    wing(kit, plane, points, 0.005, colors.red);
  }
  const number = facadeText(kit, plane, '24', colors.red, 1.4, 0.65, 0.0, -7.0);
  if (number) {
    number.rotation.y = Math.PI / 2;
    number.scale.set(3, 3, 1);
  }
  g.userData.landmarkName = 'МиГ-21Ф — сквер Авиаторов';
}

function fuel(kit: RenderKit, g: THREE.Group, b: CityBuilding) {
  const box = (
    w: number,
    h: number,
    d: number,
    c: string,
    x: number,
    y: number,
    z: number,
  ) => kit.box(w, h, d, c, x, y, z, g, 0);
  box(b.w * 0.97, 0.09, b.d * 0.97, '#56616a', 0, 0.045, 0);
  // Brand-free muted petrol colors and the single requested generic name.
  const canopyW = b.w * 0.64,
    canopyD = b.d * 0.57,
    canopyZ = b.d * 0.09;
  box(canopyW, 0.45, canopyD, '#e4dfd3', -b.w * 0.1, 4.8, canopyZ);
  box(
    canopyW + 0.2,
    0.54,
    0.22,
    '#56616a',
    -b.w * 0.1,
    4.7,
    canopyZ + canopyD / 2,
  );
  const canopyText = facadeText(
    kit,
    g,
    'ЗАПРАВКА',
    '#e4dfd3',
    canopyW * 0.58,
    -b.w * 0.1,
    4.71,
    canopyZ + canopyD / 2 + 0.12,
  );
  if (canopyText) canopyText.scale.y = 0.26;
  for (const x of [-0.31, 0.11])
    for (const z of [-0.13, 0.3])
      box(0.22, 4.55, 0.22, '#b6c1c0', x * b.w, 2.3, z * b.d);
  for (const x of [-0.29, 0.075]) {
    box(2.05, 0.2, b.d * 0.33, '#b6c1c0', x * b.w, 0.2, canopyZ);
    for (const z of [-0.05, 0.25]) {
      box(0.78, 1.45, 0.48, '#e4dfd3', x * b.w, 0.975, z * b.d);
      box(0.7, 0.47, 0.06, '#40545a', x * b.w, 1.4, z * b.d + 0.27);
      box(0.67, 0.4, 0.5, '#56616a', x * b.w, 0.62, z * b.d);
      for (const side of [-1, 1]) {
        const hose = new THREE.CatmullRomCurve3([
          new THREE.Vector3(x * b.w + side * 0.39, 1.45, z * b.d),
          new THREE.Vector3(x * b.w + side * 0.64, 0.35, z * b.d),
          new THREE.Vector3(x * b.w + side * 0.8, 1.13, z * b.d),
        ]);
        kit.mesh(
          new THREE.TubeGeometry(hose, 6, 0.035, 4, false),
          kit.material('#40545a'),
          g,
        );
      }
    }
  }
  box(b.w * 0.21, 3.8, b.d * 0.58, '#b6c1c0', b.w * 0.34, 1.9, -b.d * 0.1);
  box(b.w * 0.23, 0.22, b.d * 0.6, '#56616a', b.w * 0.34, 3.91, -b.d * 0.1);
  windowBatch(kit, g, [
    { x: b.w * 0.34, y: 1.85, z: b.d * 0.191, w: b.w * 0.16, h: 2.5 },
  ]);
  box(0.12, 2.65, 0.13, colors.white, b.w * 0.355, 1.8, b.d * 0.2);
  box(5.2, 5.2, 0.35, '#56616a', -b.w * 0.4, 2.6, -b.d * 0.36);
  const label = facadeText(
    kit,
    g,
    'ЗАПРАВКА',
    '#e4dfd3',
    4.7,
    -b.w * 0.4,
    4.75,
    -b.d * 0.36 + 0.2,
  );
  if (label) label.scale.y = 1.8;
  g.userData.landmarkName = 'Заправка';
}

export function createRightBankLandmark(
  kit: RenderKit,
  root: THREE.Group,
  b: CityBuilding,
): boolean {
  const kind = String(b.kind);
  if (!['aerokos', 'fighter', 'zori', 'fuel'].includes(kind)) return false;
  const g = new THREE.Group();
  g.name = `landmark:${kind}`;
  g.position.set(b.x, 0, b.z);
  g.rotation.y = b.angle ?? 0;
  root.add(g);
  if (kind === 'aerokos') aerokos(kit, g, b);
  else if (kind === 'fighter') fighter(kit, g, b);
  else if (kind === 'zori') zori(kit, g, b);
  else fuel(kit, g, b);
  return true;
}
