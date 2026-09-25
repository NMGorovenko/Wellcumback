import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CityState } from '../../../lib/game/city/engine.ts';
import { people } from '../../../lib/game/presets.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { createRig } from '../world/rig.ts';

/** Road-going, two-door AMG GT Coupé (C192), rather than the mid-engine ONE.
 * Local -Z is forward; proportions follow the 4.728 m / 2.700 m wheelbase car.
 * Reference: https://www.mercedes-amg.com/en/gt-coupe
 * The glass roof stays translucent in cabin view so the existing faces remain visible. */
export const AMG_GT_DIMENSIONS = {
  length: 4.728,
  width: 1.984,
  height: 1.354,
  wheelbase: 2.7,
  wheelRadius: 0.365,
} as const;

type Point = [number, number, number];
type Section = readonly [
  z: number,
  width: number,
  shoulder: number,
  deck: number,
];
const profile: readonly Section[] = [
  [-2.364, 0.82, 0.65, 0.71],
  [-2.18, 0.85, 0.77, 0.81],
  [-1.9, 0.935, 0.865, 0.87],
  [-1.35, 0.97, 0.925, 0.91],
  [-0.8, 0.925, 0.94, 0.935],
  [-0.52, 0.9, 0.925, 0.94],
  [0.3, 0.9, 0.93, 0.93],
  [0.86, 0.956, 0.975, 0.965],
  [1.35, 0.992, 1.005, 0.965],
  [1.84, 0.965, 0.97, 0.925],
  [2.18, 0.875, 0.845, 0.87],
  [2.364, 0.79, 0.69, 0.78],
];
function sectionAt(z: number): Section {
  let i = 0;
  while (i < profile.length - 2 && profile[i + 1][0] < z) i++;
  const a = profile[i],
    b = profile[i + 1];
  const t = THREE.MathUtils.clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
  const blend = t * t * (3 - 2 * t);
  return [
    z,
    THREE.MathUtils.lerp(a[1], b[1], blend),
    THREE.MathUtils.lerp(a[2], b[2], blend),
    THREE.MathUtils.lerp(a[3], b[3], blend),
  ];
}
function cockpitDepth(z: number) {
  const enter = THREE.MathUtils.smoothstep(z, -0.62, -0.38);
  const leave = 1 - THREE.MathUtils.smoothstep(z, 1.39, 1.68);
  return enter * leave;
}
/** An outward-wound shell with an inset cabin floor and actual wheel-arch relief. */
export function amgGtBodyGeometry() {
  const points: number[] = [],
    indices: number[] = [];
  const rings = 96,
    ringSize = 11;
  for (let n = 0; n <= rings; n++) {
    const z = THREE.MathUtils.lerp(-2.364, 2.364, n / rings);
    const [, w, shoulder, deck] = sectionAt(z);
    const bottom = 0.22;
    let arch = bottom;
    for (const axle of [-1.35, 1.35]) {
      const dz = z - axle;
      if (Math.abs(dz) < 0.445)
        arch = Math.max(arch, 0.365 + Math.sqrt(0.445 ** 2 - dz ** 2));
    }
    const lower = Math.min(arch, shoulder - 0.08);
    const cabin = cockpitDepth(z);
    const inboard = THREE.MathUtils.lerp(deck, 0.47, cabin);
    const ring = [
      [-w * 0.66, bottom - 0.035],
      [-w * 0.98, lower],
      [-w, Math.max(lower + 0.025, shoulder - 0.075)],
      [-w * 0.91, shoulder],
      [-w * 0.7, inboard],
      [0, inboard + (1 - cabin) * 0.014],
      [w * 0.7, inboard],
      [w * 0.91, shoulder],
      [w, Math.max(lower + 0.025, shoulder - 0.075)],
      [w * 0.98, lower],
      [w * 0.66, bottom - 0.035],
    ];
    for (const [x, y] of ring) points.push(x, y, z);
    if (n === 0) continue;
    for (let i = 0; i < ringSize; i++) {
      const a = (n - 1) * ringSize + i;
      const b = (n - 1) * ringSize + ((i + 1) % ringSize);
      indices.push(a, b + ringSize, b, a, a + ringSize, b + ringSize);
    }
  }
  for (let i = 1; i < ringSize - 1; i++) {
    indices.push(0, i, i + 1);
    const last = rings * ringSize;
    indices.push(last, last + i + 1, last + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = 'amg-gt-sculpted-shell';
  return geometry;
}

/** Consolidate static opaque detail by material. Glass, occupants and moving
 * groups retain their own transforms; detail does not cost one draw per louvre. */
function mergeStaticBody(kit: RenderKit, body: THREE.Group) {
  const batches = new Map<string, THREE.Mesh[]>();
  for (const child of body.children) {
    if (
      !(child instanceof THREE.Mesh) ||
      Array.isArray(child.material) ||
      child.material.transparent
    )
      continue;
    const key = `${child.material.uuid}/${child.castShadow}/${child.receiveShadow}`;
    const batch = batches.get(key) ?? [];
    batch.push(child);
    batches.set(key, batch);
  }
  for (const batch of batches.values()) {
    if (batch.length < 2) continue;
    const transformed = batch.map((mesh) => {
      mesh.updateMatrix();
      const geometry = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      for (const name of Object.keys(geometry.attributes))
        if (name !== 'position' && name !== 'normal')
          geometry.deleteAttribute(name);
      return geometry.applyMatrix4(mesh.matrix);
    });
    const merged = mergeGeometries(transformed, false);
    transformed.forEach((geometry) => geometry.dispose());
    if (!merged) continue;
    const material = batch[0].material as THREE.Material;
    const mesh = kit.mesh(merged, material, body);
    mesh.name = `amg-gt-detail-${material.name || 'material'}`;
    mesh.castShadow = batch[0].castShadow;
    mesh.receiveShadow = batch[0].receiveShadow;
    batch.forEach((part) => body.remove(part));
  }
}

export function createAmgGt(
  kit: RenderKit,
  color = '#101419',
  driverId = 'nikita',
) {
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.name = 'amg-gt';
  body.name = 'amg-gt-body';
  root.add(body);
  kit.scene.add(root);
  const paint = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.48,
    roughness: 0.29,
    clearcoat: 1,
    clearcoatRoughness: 0.13,
  });
  paint.name = 'amg-gt-paint';
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#a9c4d0',
    metalness: 0.1,
    roughness: 0.12,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const roofGlass = glass.clone();
  roofGlass.color.set('#3b5667');
  roofGlass.opacity = 0.22;
  const carbon = kit.material('#12191e', 0.61, 0.18);
  carbon.name = 'carbon';
  const grilleBlack = kit.material('#05080b', 0.74, 0.08);
  grilleBlack.name = 'intakes';
  const silver = kit.material('#a9b4bb', 0.29, 0.78);
  silver.name = 'satin-metal';
  const darkMetal = kit.material('#3b4851', 0.38, 0.64);
  darkMetal.name = 'dark-metal';
  const leather = kit.material('#29323a', 0.88, 0.02);
  leather.name = 'interior';
  const stitching = kit.material('#a99c88', 0.8, 0);
  const whiteLamp = new THREE.MeshStandardMaterial({
    color: '#edfaff',
    emissive: '#c7ebff',
    emissiveIntensity: 1.6,
    roughness: 0.25,
  });
  const redLamp = new THREE.MeshStandardMaterial({
    color: '#dc302c',
    emissive: '#ff2319',
    emissiveIntensity: 0.85,
    roughness: 0.28,
  });
  const screen = new THREE.MeshStandardMaterial({
    color: '#18232f',
    emissive: '#447384',
    emissiveIntensity: 0.35,
    roughness: 0.4,
  });
  for (const material of [paint, glass, roofGlass, whiteLamp, redLamp, screen])
    kit.materials.add(material);
  const box = (
    material: THREE.Material,
    size: Point,
    at: Point,
    parent: THREE.Object3D = body,
    radius = 0.014,
  ) => {
    // Sub-centimetre bevel tessellation adds no visible detail to these thin parts.
    const rounded = Math.min(...size) < 0.032 ? 0 : radius;
    const mesh = kit.box(...size, '#12191e', ...at, parent, rounded);
    mesh.material = material;
    return mesh;
  };
  const surface = (
    name: string,
    points: Point[],
    material: THREE.Material,
    normal: Point,
    parent: THREE.Object3D = body,
  ) => {
    const positions = points.flat(),
      indices: number[] = [];
    const a = new THREE.Vector3(...points[0]);
    const b = new THREE.Vector3(...points[1]).sub(a);
    const c = new THREE.Vector3(...points[2]).sub(a);
    const reverse = b.cross(c).dot(new THREE.Vector3(...normal)) < 0;
    for (let i = 1; i < points.length - 1; i++)
      indices.push(0, reverse ? i + 1 : i, reverse ? i : i + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = kit.mesh(geometry, material, parent);
    mesh.name = name;
    mesh.castShadow = !material.transparent;
    return mesh;
  };
  const line = (
    points: Point[],
    radius: number,
    material: THREE.Material,
    parent: THREE.Object3D = body,
  ) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
      false,
      'centripetal',
    );
    const geometry = new THREE.TubeGeometry(
      curve,
      Math.max(8, points.length * 4),
      radius,
      5,
      false,
    );
    const mesh = kit.mesh(geometry, material, parent);
    mesh.castShadow = false;
    return mesh;
  };
  const ellipsoid = (
    material: THREE.Material,
    size: Point,
    at: Point,
    parent: THREE.Object3D = body,
  ) => {
    const mesh = kit.mesh(
      new THREE.SphereGeometry(1, 20, 12),
      material,
      parent,
    );
    mesh.scale.set(...size);
    mesh.position.set(...at);
    return mesh;
  };
  kit.mesh(amgGtBodyGeometry(), paint, body);
  box(carbon, [1.73, 0.055, 4.38], [0, 0.205, 0]);
  box(carbon, [1.84, 0.055, 0.36], [0, 0.245, -2.22]);
  box(carbon, [1.58, 0.15, 0.31], [0, 0.31, 2.2]);

  // Long, convex bonnet: two raised powerdomes and panel gaps, ahead of the cabin.
  for (const side of [-1, 1]) {
    const dome = ellipsoid(
      paint,
      [0.12, 0.035, 0.69],
      [side * 0.34, 0.927, -1.18],
    );
    dome.rotation.x = -0.028;
    line(
      [
        [side * 0.52, 0.945, -0.6],
        [side * 0.58, 0.921, -1.12],
        [side * 0.54, 0.848, -1.94],
      ],
      0.006,
      carbon,
    );
    line(
      [
        [side * 0.8, 0.937, -0.52],
        [side * 0.824, 0.925, 0.34],
        [side * 0.87, 0.96, 0.91],
      ],
      0.006,
      carbon,
    );
    // Single frameless coupe door and recessed handle; no rear-door seam.
    line(
      [
        [side * 0.889, 0.88, -0.53],
        [side * 0.892, 0.39, -0.43],
        [side * 0.911, 0.39, 0.73],
        [side * 0.934, 0.9, 0.88],
      ],
      0.007,
      carbon,
    );
    box(darkMetal, [0.014, 0.033, 0.18], [side * 0.917, 0.83, 0.65]);
    box(carbon, [0.075, 0.09, 1.84], [side * 0.905, 0.285, 0.15]);
    line(
      [
        [side * 0.927, 0.36, -0.65],
        [side * 0.91, 0.34, 0.42],
        [side * 0.954, 0.4, 0.88],
      ],
      0.008,
      darkMetal,
    );
    // Vent behind the front wheel, with a small metallic strake.
    box(
      grilleBlack,
      [0.019, 0.17, 0.31],
      [side * 0.94, 0.72, -0.7],
      body,
      0.026,
    );
    box(silver, [0.027, 0.026, 0.22], [side * 0.95, 0.75, -0.7]);
    const mirror = ellipsoid(
      paint,
      [0.105, 0.064, 0.14],
      [side * 1.005, 0.98, -0.4],
    );
    mirror.rotation.y = side * -0.15;
    box(carbon, [0.14, 0.037, 0.05], [side * 0.952, 0.946, -0.4]);
    ellipsoid(silver, [0.085, 0.043, 0.008], [side * 1.005, 0.981, -0.26]);
    // Painted lip follows the open wheel arch, rather than covering the tire.
    for (const axle of [-1.35, 1.35]) {
      const arch: Point[] = [];
      for (let i = 0; i <= 16; i++) {
        const angle = (Math.PI * i) / 16;
        const z = axle - Math.cos(angle) * 0.441;
        arch.push([
          side * sectionAt(z)[1] * 1.002,
          0.365 + Math.sin(angle) * 0.441,
          z,
        ]);
      }
      line(arch, 0.014, paint);
    }
  }

  // Deep grille, a real three-point star, and seventeen vertical Panamericana bars.
  const grilleOutline: Point[] = [
    [-0.665, 0.665, -2.381],
    [-0.47, 0.365, -2.393],
    [0.47, 0.365, -2.393],
    [0.665, 0.665, -2.381],
  ];
  surface('amg-gt-grille', grilleOutline, grilleBlack, [0, 0, -1]);
  line([...grilleOutline, grilleOutline[0]], 0.012, darkMetal);
  for (let i = -8; i <= 8; i++) {
    const x = i * 0.07;
    const height = 0.273 - 0.085 * (Math.abs(i) / 8) ** 2;
    const bar = box(
      silver,
      [0.017, height, 0.02],
      [x, 0.523, -2.405],
      body,
      0.006,
    );
    bar.rotation.z = -x * 0.12;
    bar.castShadow = false;
  }
  const star = new THREE.Group();
  star.name = 'mercedes-grille-emblem';
  star.position.set(0, 0.535, -2.432);
  body.add(star);
  const ring = kit.mesh(
    new THREE.TorusGeometry(0.126, 0.012, 6, 32),
    silver,
    star,
  );
  ring.castShadow = false;
  for (let i = 0; i < 3; i++) {
    const angle = Math.PI / 2 + (i * Math.PI * 2) / 3;
    const tip: Point = [Math.cos(angle) * 0.118, Math.sin(angle) * 0.118, 0];
    const left: Point = [
      Math.cos(angle + Math.PI / 2) * 0.02,
      Math.sin(angle + Math.PI / 2) * 0.02,
      -0.008,
    ];
    const right: Point = [-left[0], -left[1], -0.008];
    surface(
      'mercedes-star-spoke',
      [tip, left, right],
      silver,
      [0, 0, -1],
      star,
    );
  }
  // Side intakes and swept DIGITAL LIGHT housings with three bright elements.
  for (const side of [-1, 1]) {
    const intake = box(
      grilleBlack,
      [0.22, 0.18, 0.075],
      [side * 0.745, 0.43, -2.365],
      body,
      0.04,
    );
    intake.rotation.y = side * 0.25;
    for (let n = 0; n < 3; n++)
      box(
        darkMetal,
        [0.22, 0.012, 0.022],
        [side * 0.745, 0.38 + n * 0.047, -2.415],
      );
    const lightPoints: Point[] = [
      [side * 0.475, 0.847, -2.12],
      [side * 0.806, 0.836, -2.21],
      [side * 0.898, 0.9, -1.892],
      [side * 0.586, 0.917, -1.862],
    ];
    surface('amg-gt-headlamp-housing', lightPoints, carbon, [0, 1, -0.25]);
    line(
      [
        [side * 0.487, 0.86, -2.12],
        [side * 0.803, 0.849, -2.205],
        [side * 0.895, 0.913, -1.895],
      ],
      0.013,
      whiteLamp,
    );
    for (let n = 0; n < 3; n++) {
      const light = box(
        whiteLamp,
        [0.055, 0.049, 0.025],
        [side * (0.55 + n * 0.106), 0.866 + n * 0.006, -2.096 + n * 0.033],
        body,
        0.014,
      );
      light.rotation.y = side * 0.32;
      light.castShadow = false;
    }
  }

  // Raked windscreen and a curved fastback; the cabin sits behind the long bonnet.
  surface(
    'amg-gt-windscreen',
    [
      [-0.727, 0.952, -0.6],
      [0.727, 0.952, -0.6],
      [0.58, 1.315, -0.09],
      [-0.58, 1.315, -0.09],
    ],
    glass,
    [0, 0.6, -1],
  );
  surface(
    'amg-gt-rear-glass',
    [
      [-0.575, 1.283, 0.87],
      [0.575, 1.283, 0.87],
      [0.73, 0.967, 1.7],
      [-0.73, 0.967, 1.7],
    ],
    glass,
    [0, 0.6, 1],
  );
  // Compound curvature gives the roof a coupe crown and a falling fastback edge.
  const roofVertices: number[] = [],
    roofIndices: number[] = [];
  const roofColumns = 6,
    roofRows = 8;
  for (let row = 0; row <= roofRows; row++) {
    const t = row / roofRows,
      z = -0.085 + t * 0.955;
    const edge =
      1.321 +
      Math.sin(t * Math.PI) * 0.012 -
      THREE.MathUtils.smoothstep(z, 0.32, 0.87) * 0.04;
    for (let column = 0; column <= roofColumns; column++) {
      const x = -0.582 + (column * 1.164) / roofColumns;
      roofVertices.push(x, edge + 0.023 * (1 - (x / 0.582) ** 2), z);
      if (row < roofRows && column < roofColumns) {
        const a = row * (roofColumns + 1) + column,
          b = a + roofColumns + 1;
        roofIndices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const roofGeometry = new THREE.BufferGeometry();
  roofGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(roofVertices, 3),
  );
  roofGeometry.setIndex(roofIndices);
  roofGeometry.computeVertexNormals();
  const roof = kit.mesh(roofGeometry, roofGlass, body);
  roof.name = 'amg-gt-panoramic-roof';
  roof.castShadow = false;
  for (const side of [-1, 1]) {
    surface(
      'amg-gt-door-glass',
      [
        [side * 0.73, 0.955, -0.57],
        [side * 0.582, 1.319, -0.08],
        [side * 0.582, 1.31, 0.66],
        [side * 0.747, 0.977, 0.87],
      ],
      glass,
      [side, 0.2, 0],
    );
    surface(
      'amg-gt-quarter-glass',
      [
        [side * 0.588, 1.302, 0.7],
        [side * 0.584, 1.287, 0.85],
        [side * 0.744, 0.98, 1.41],
        [side * 0.748, 0.98, 0.91],
      ],
      glass,
      [side, 0.3, 0.3],
    );
    line(
      [
        [side * 0.743, 0.942, -0.64],
        [side * 0.665, 1.11, -0.4],
        [side * 0.589, 1.329, -0.083],
        [side * 0.592, 1.338, 0.42],
        [side * 0.585, 1.292, 0.89],
        [side * 0.66, 1.14, 1.28],
        [side * 0.756, 0.977, 1.72],
      ],
      0.029,
      paint,
    );
    line(
      [
        [side * 0.749, 0.958, -0.59],
        [side * 0.754, 0.97, 0.92],
        [side * 0.759, 0.971, 1.46],
      ],
      0.009,
      silver,
    );
    line(
      [
        [side * 0.59, 1.306, 0.681],
        [side * 0.752, 0.979, 0.891],
      ],
      0.017,
      carbon,
    );
    surface(
      'amg-gt-rear-pillar',
      [
        [side * 0.591, 1.291, 0.88],
        [side * 0.762, 0.974, 1.72],
        [side * 0.876, 0.969, 1.7],
        [side * 0.699, 1.14, 1.12],
      ],
      paint,
      [side, 0.5, 0.3],
    );
  }
  line(
    [
      [-0.59, 1.329, -0.09],
      [0, 1.354, -0.09],
      [0.59, 1.329, -0.09],
    ],
    0.025,
    paint,
  );
  line(
    [
      [-0.589, 1.288, 0.885],
      [0, 1.311, 0.91],
      [0.589, 1.288, 0.885],
    ],
    0.027,
    paint,
  );
  line(
    [
      [-0.59, 0.966, -0.592],
      [-0.27, 0.978, -0.568],
      [0.12, 0.973, -0.588],
    ],
    0.009,
    carbon,
  );
  line(
    [
      [0.12, 0.97, -0.592],
      [0.37, 0.978, -0.568],
      [0.61, 0.966, -0.59],
    ],
    0.009,
    carbon,
  );

  // Sports seats, stitched bolsters, console, instrument binnacle and portrait MBUX display.
  box(leather, [1.37, 0.055, 1.79], [0, 0.525, 0.47]);
  for (const side of [-1, 1]) {
    box(leather, [0.46, 0.1, 0.54], [side * 0.35, 0.635, 0.37], body, 0.047);
    const back = box(
      leather,
      [0.43, 0.47, 0.12],
      [side * 0.35, 0.89, 0.68],
      body,
      0.05,
    );
    back.rotation.x = -0.14;
    box(leather, [0.255, 0.15, 0.13], [side * 0.35, 1.145, 0.7], body, 0.035);
    for (const offset of [-0.205, 0.205]) {
      ellipsoid(
        leather,
        [0.05, 0.24, 0.095],
        [side * 0.35 + offset, 0.91, 0.61],
      );
      line(
        [
          [side * 0.35 + offset * 0.86, 0.71, 0.593],
          [side * 0.35 + offset * 0.9, 0.93, 0.555],
          [side * 0.35 + offset * 0.75, 1.105, 0.622],
        ],
        0.005,
        stitching,
      );
    }
    box(darkMetal, [0.25, 0.045, 0.022], [side * 0.35, 1.045, 0.615]);
    box(leather, [0.07, 0.23, 1.2], [side * 0.7, 0.705, 0.28]);
    box(silver, [0.018, 0.026, 0.16], [side * 0.66, 0.845, 0.24]);
  }
  box(leather, [1.31, 0.15, 0.29], [0, 0.9, -0.37], body, 0.04);
  box(carbon, [0.16, 0.18, 0.85], [0, 0.69, 0.06], body, 0.025);
  const display = box(
    screen,
    [0.17, 0.245, 0.019],
    [0, 0.855, -0.167],
    body,
    0.012,
  );
  display.rotation.x = -0.43;
  box(screen, [0.33, 0.12, 0.026], [-0.35, 0.967, -0.242], body, 0.018);
  for (const x of [-0.52, -0.16, 0.16, 0.52]) {
    const vent = kit.mesh(
      new THREE.TorusGeometry(0.036, 0.007, 5, 12),
      silver,
      body,
    );
    vent.position.set(x, 0.953, -0.21);
  }
  const steering = new THREE.Group();
  steering.name = 'amg-gt-steering-wheel';
  steering.position.set(-0.35, 0.86, -0.135);
  steering.rotation.x = 0.3;
  body.add(steering);
  const rim = kit.mesh(
    new THREE.TorusGeometry(0.136, 0.018, 6, 24),
    leather,
    steering,
  );
  rim.scale.y = 0.91;
  box(darkMetal, [0.19, 0.025, 0.024], [0, 0, 0], steering, 0.005);
  box(silver, [0.026, 0.107, 0.026], [0, -0.044, 0], steering, 0.004);
  ellipsoid(carbon, [0.044, 0.037, 0.02], [0, 0, 0.01], steering);

  const person = people.find((p) => p.id === driverId) ?? people[0];
  const rig = createRig(kit, person, body);
  body.attach(rig.head);
  rig.root.removeFromParent();
  rig.head.name = `passenger-${person.id}`;
  // Roma's headwear needs a lower seat to remain below the same coupe roof.
  rig.head.position.set(-0.35, person.id === 'roma' ? 1.01 : 1.055, 0.36);
  rig.head.scale.setScalar(0.95);
  rig.head.rotation.set(0.08, Math.PI, 0);
  rig.head.traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      object.material instanceof THREE.MeshStandardMaterial &&
      object.material.map
    ) {
      object.material.color.set('#ffffff');
      object.material.emissive.set('#ffffff');
      object.material.emissiveMap = object.material.map;
      object.material.emissiveIntensity = 0.2;
    }
  });
  ellipsoid(
    kit.material(person.color, 0.9),
    [0.2, 0.2, 0.135],
    [-0.35, 0.837, 0.37],
  );
  for (const side of [-1, 1]) {
    line(
      [
        [-0.35 + side * 0.17, 0.91, 0.3],
        [-0.35 + side * 0.19, 0.82, 0.065],
        [-0.35 + side * 0.115, 0.86, -0.12],
      ],
      0.044,
      kit.material(person.color, 0.9),
    );
    ellipsoid(
      kit.material(person.skin, 0.92),
      [0.04, 0.037, 0.043],
      [-0.35 + side * 0.113, 0.86, -0.12],
    );
  }
  line(
    [
      [-0.5, 0.99, 0.5],
      [-0.37, 0.885, 0.219],
      [-0.19, 0.72, 0.3],
    ],
    0.018,
    carbon,
  );

  // Slim rear light signatures, integrated exhaust pairs, diffuser and moving lip.
  line(
    [
      [-0.79, 0.847, 2.19],
      [-0.47, 0.854, 2.27],
      [0, 0.85, 2.299],
      [0.47, 0.854, 2.27],
      [0.79, 0.847, 2.19],
    ],
    0.023,
    carbon,
  );
  for (const side of [-1, 1]) {
    line(
      [
        [side * 0.28, 0.865, 2.29],
        [side * 0.54, 0.862, 2.267],
        [side * 0.815, 0.847, 2.189],
      ],
      0.02,
      redLamp,
    );
    for (let n = 0; n < 4; n++) {
      const led = box(
        redLamp,
        [0.045, 0.022, 0.018],
        [side * (0.35 + n * 0.115), 0.825, 2.281 - n * 0.032],
        body,
        0.008,
      );
      led.castShadow = false;
    }
    for (const offset of [-0.07, 0.07]) {
      box(
        silver,
        [0.112, 0.078, 0.115],
        [side * 0.64 + offset, 0.318, 2.326],
        body,
        0.019,
      );
      box(
        grilleBlack,
        [0.084, 0.05, 0.012],
        [side * 0.64 + offset, 0.318, 2.389],
        body,
        0.016,
      );
    }
  }
  for (const x of [-0.46, -0.23, 0, 0.23, 0.46])
    box(carbon, [0.021, 0.14, 0.46], [x, 0.3, 2.14], body, 0.004);
  box(grilleBlack, [0.42, 0.13, 0.019], [0, 0.58, 2.37]);
  box(silver, [0.35, 0.088, 0.022], [0, 0.58, 2.385]);
  const spoiler = new THREE.Group();
  spoiler.name = 'amg-gt-active-rear-lip';
  spoiler.position.set(0, 0.926, 2.016);
  body.add(spoiler);
  box(paint, [1.54, 0.04, 0.185], [0, 0, 0], spoiler, 0.018);
  box(carbon, [1.46, 0.018, 0.075], [0, -0.014, 0.046], spoiler);

  // Staggered tires, rim barrels, drilled rotors, fixed calipers and ten split spokes.
  const wheels: {
    root: THREE.Group;
    steering: THREE.Group;
    roll: THREE.Group;
    front: boolean;
  }[] = [];
  for (const z of [-1.35, 1.35])
    for (const side of [-1, 1]) {
      const front = z < 0,
        width = front ? 0.295 : 0.305;
      const wheel = new THREE.Group(),
        roll = new THREE.Group();
      wheel.name = `amg-gt-wheel-${front ? 'front' : 'rear'}-${side < 0 ? 'left' : 'right'}`;
      wheel.position.set(
        side * (front ? 0.8415 : 0.843),
        AMG_GT_DIMENSIONS.wheelRadius,
        z,
      );
      root.add(wheel);
      wheel.add(roll);
      const tire = kit.mesh(
        new THREE.CylinderGeometry(0.365, 0.365, width, 32, 1),
        kit.material('#10161b', 0.93),
        roll,
      );
      tire.rotation.z = Math.PI / 2;
      const barrel = kit.mesh(
        new THREE.CylinderGeometry(0.274, 0.274, width + 0.004, 32, 1),
        darkMetal,
        roll,
      );
      barrel.rotation.z = Math.PI / 2;
      const rotor = kit.mesh(
        new THREE.CylinderGeometry(
          front ? 0.195 : 0.18,
          front ? 0.195 : 0.18,
          0.021,
          24,
        ),
        silver,
        roll,
      );
      rotor.rotation.z = Math.PI / 2;
      rotor.position.x = side * (width / 2 + 0.009);
      const rimFace = side * (width / 2 + 0.025);
      const outerRing = kit.mesh(
        new THREE.TorusGeometry(0.264, 0.011, 6, 32),
        silver,
        roll,
      );
      outerRing.rotation.y = Math.PI / 2;
      outerRing.position.x = rimFace;
      for (let n = 0; n < 5; n++)
        for (const fork of [-1, 1]) {
          const angle = (n * Math.PI * 2) / 5 + fork * 0.09;
          const spoke = box(
            darkMetal,
            [0.025, 0.024, 0.216],
            [rimFace, Math.sin(angle) * 0.147, Math.cos(angle) * 0.147],
            roll,
            0.004,
          );
          spoke.rotation.x = -angle;
          const edge = box(
            silver,
            [0.008, 0.008, 0.198],
            [
              rimFace + side * 0.015,
              Math.sin(angle) * 0.149,
              Math.cos(angle) * 0.149,
            ],
            roll,
            0.002,
          );
          edge.rotation.x = -angle;
        }
      const hub = kit.mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.037, 16),
        silver,
        roll,
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.x = rimFace;
      for (let n = 0; n < 12; n++) {
        const angle = (n * Math.PI) / 6;
        const dot = kit.mesh(
          new THREE.CircleGeometry(0.007, 5),
          grilleBlack,
          roll,
        );
        dot.rotation.y = (side * Math.PI) / 2;
        dot.position.set(
          side * (width / 2 + 0.021),
          Math.sin(angle) * 0.15,
          Math.cos(angle) * 0.15,
        );
        dot.castShadow = false;
      }
      box(
        kit.material('#9b2e28', 0.45, 0.3),
        [0.075, 0.17, 0.061],
        [side * width * 0.46, 0.04, -0.163],
        wheel,
        0.015,
      );
      mergeStaticBody(kit, roll);
      wheels.push({ root: wheel, steering: wheel, roll, front });
    }
  mergeStaticBody(kit, body);
  let spin = 0,
    previousForward = 0,
    lift = 0;
  return {
    root,
    body,
    wheels,
    passengers: [rig.head],
    update(s: CityState, dt: number, cabinView = true) {
      const step = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
      root.position.set(s.x, 0.025, s.z);
      root.rotation.y = -s.heading;
      glass.opacity = cabinView ? 0.055 : 0.17;
      roofGlass.opacity = cabinView ? 0.06 : 0.26;
      const forward = s.vx * Math.sin(s.heading) - s.vz * Math.cos(s.heading);
      const lateral = s.vx * Math.cos(s.heading) + s.vz * Math.sin(s.heading);
      spin =
        (spin - (forward * step) / AMG_GT_DIMENSIONS.wheelRadius) %
        (Math.PI * 2);
      for (const wheel of wheels) {
        wheel.steering.rotation.y = wheel.front ? -s.steering * 0.4 : 0;
        wheel.roll.rotation.x = spin;
      }
      const smooth = 1 - Math.exp(-step * 9);
      body.rotation.z = THREE.MathUtils.lerp(
        body.rotation.z,
        THREE.MathUtils.clamp(-lateral * 0.012, -0.075, 0.075),
        smooth,
      );
      body.rotation.x = THREE.MathUtils.lerp(
        body.rotation.x,
        THREE.MathUtils.clamp(
          (forward - previousForward) * 0.02,
          -0.025,
          0.025,
        ),
        smooth,
      );
      body.position.y = s.flight?.suspension?.offset ?? 0;
      if (step > 0) previousForward = forward;
      steering.rotation.z = -s.steering * 0.52;
      rig.head.rotation.z =
        THREE.MathUtils.clamp(lateral * 0.01, -0.09, 0.09) +
        Math.sin(s.elapsed * 1.8) * 0.018;
      lift = THREE.MathUtils.lerp(
        lift,
        s.speed > 18 ? 1 : 0,
        1 - Math.exp(-step * 3),
      );
      spoiler.position.y = 0.926 + lift * 0.085;
      spoiler.rotation.x = -lift * 0.075;
      redLamp.emissiveIntensity = (s.throttle ?? 0) < -0.05 ? 2.3 : 0.85;
    },
  };
}
