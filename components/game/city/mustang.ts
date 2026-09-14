import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CityState } from '../../../lib/game/city/engine.ts';
import { people } from '../../../lib/game/presets.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { createRig } from '../world/rig.ts';

/** S550 convertible, top fully down. The supplied front/rear photographs guide
 * the fascia, bonnet, wheels and tail. Coordinates retain the existing city car
 * footprint, rather than introducing a different collision/parking scale. */
export const MUSTANG_DIMENSIONS = {
  length: 4.18,
  bodyWidth: 1.84,
  wheelbase: 2.57,
  wheelRadius: 0.405,
  wheelWidth: 0.245,
  frontAxle: -1.27,
  rearAxle: 1.3,
} as const;
type Point = [number, number, number];
type Section = readonly [
  z: number,
  width: number,
  shoulder: number,
  deck: number,
];
const profile: readonly Section[] = [
  [-2.13, 0.72, 0.75, 0.77],
  [-1.94, 0.835, 0.865, 0.86],
  [-1.55, 0.885, 0.966, 0.976],
  [-1.15, 0.89, 1.008, 1.023],
  [-0.72, 0.852, 1.012, 1.026],
  [-0.45, 0.835, 0.998, 1.016],
  [0.5, 0.85, 0.995, 1.0],
  [1.12, 0.913, 1.038, 1.005],
  [1.45, 0.92, 1.021, 0.997],
  [1.79, 0.89, 0.948, 0.963],
  [2.05, 0.83, 0.865, 0.885],
];
function sectionAt(z: number): Section {
  let i = 0;
  while (i < profile.length - 2 && profile[i + 1][0] < z) i++;
  const a = profile[i],
    b = profile[i + 1];
  const t = THREE.MathUtils.clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
  const u = t * t * (3 - 2 * t);
  return [
    z,
    THREE.MathUtils.lerp(a[1], b[1], u),
    THREE.MathUtils.lerp(a[2], b[2], u),
    THREE.MathUtils.lerp(a[3], b[3], u),
  ];
}
/** Closed, outward-wound shell with a lowered cockpit, not a painted slab
 * underneath the occupants. The outer lower edge follows the tire cut-outs. */
export function mustangBodyGeometry() {
  const vertices: number[] = [],
    indices: number[] = [];
  const rings = 104,
    count = 11;
  for (let n = 0; n <= rings; n++) {
    const z = THREE.MathUtils.lerp(-2.13, 2.05, n / rings);
    const [, w, shoulder, deck] = sectionAt(z);
    const cabin =
      THREE.MathUtils.smoothstep(z, -0.71, -0.45) *
      (1 - THREE.MathUtils.smoothstep(z, 1.3, 1.55));
    const floor = THREE.MathUtils.lerp(deck, 0.515, cabin);
    let arch = 0.27;
    for (const axle of [-1.27, 1.3]) {
      const dz = z - axle;
      if (Math.abs(dz) < 0.452)
        arch = Math.max(arch, 0.405 + Math.sqrt(0.452 ** 2 - dz ** 2));
    }
    const lower = Math.min(arch, shoulder - 0.078);
    for (const [x, y] of [
      [-w * 0.66, 0.235],
      [-w * 0.975, lower],
      [-w, Math.max(lower + 0.025, shoulder - 0.075)],
      [-w * 0.918, shoulder],
      [-w * 0.715, floor],
      [0, floor + (1 - cabin) * 0.018],
      [w * 0.715, floor],
      [w * 0.918, shoulder],
      [w, Math.max(lower + 0.025, shoulder - 0.075)],
      [w * 0.975, lower],
      [w * 0.66, 0.235],
    ])
      vertices.push(x, y, z);
    if (!n) continue;
    for (let j = 0; j < count; j++) {
      const a = (n - 1) * count + j,
        b = (n - 1) * count + ((j + 1) % count);
      indices.push(a, b + count, b, a, a + count, b + count);
    }
  }
  for (let j = 1; j < count - 1; j++) {
    indices.push(0, j, j + 1);
    const end = rings * count;
    indices.push(end, end + j + 1, end + j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = 'mustang-convertible-shell';
  return geometry;
}

/** Preserve face UVs and every moving/anchor group; batch only direct opaque
 * untextured meshes. All originals and merged buffers remain RenderKit-owned. */
function mergeStaticDetail(kit: RenderKit, parent: THREE.Group) {
  const batches = new Map<string, THREE.Mesh[]>();
  for (const child of parent.children) {
    if (
      !(child instanceof THREE.Mesh) ||
      Array.isArray(child.material) ||
      child.material.transparent ||
      ('map' in child.material && child.material.map)
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
      const g = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      for (const name of Object.keys(g.attributes))
        if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      return g.applyMatrix4(mesh.matrix);
    });
    const geometry = mergeGeometries(transformed, false);
    transformed.forEach((g) => g.dispose());
    if (!geometry) continue;
    const material = batch[0].material as THREE.Material;
    const merged = kit.mesh(geometry, material, parent);
    merged.name = `mustang-detail-${material.name || 'material'}`;
    merged.castShadow = batch[0].castShadow;
    merged.receiveShadow = batch[0].receiveShadow;
    batch.forEach((mesh) => parent.remove(mesh));
  }
}

export function createMustang(
  kit: RenderKit,
  options: { color?: string; driverId?: string } = {},
) {
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.name = 'red-mustang';
  body.name = 'mustang-convertible-body';
  root.add(body);
  kit.scene.add(root);
  const paint = new THREE.MeshPhysicalMaterial({
    color: options.color ?? '#c52236',
    metalness: 0.46,
    roughness: 0.27,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
  });
  paint.name = 'mustang-paint';
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#bad7df',
    metalness: 0.08,
    roughness: 0.1,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  glass.name = 'mustang-windscreen-glass';
  const trim = kit.material('#131b23', 0.62, 0.12);
  trim.name = 'mustang-black-trim';
  const recess = kit.material('#060a10', 0.86, 0.06);
  recess.name = 'mustang-intakes';
  const metal = kit.material('#b4c0c8', 0.25, 0.83);
  metal.name = 'mustang-machined-metal';
  const darkMetal = kit.material('#34414b', 0.37, 0.7);
  darkMetal.name = 'mustang-dark-metal';
  const leather = kit.material('#30363c', 0.91, 0.02);
  leather.name = 'mustang-leather';
  const seatCenter = kit.material('#414951', 0.92);
  seatCenter.name = 'mustang-seat-inserts';
  const stitching = kit.material('#978d83', 0.9);
  stitching.name = 'mustang-stitching';
  const whiteLamp = new THREE.MeshStandardMaterial({
    color: '#effaff',
    emissive: '#d5f2ff',
    emissiveIntensity: 1.5,
    roughness: 0.22,
  });
  whiteLamp.name = 'mustang-white-led';
  const redLamp = new THREE.MeshStandardMaterial({
    color: '#e9363e',
    emissive: '#ff1521',
    emissiveIntensity: 0.95,
    roughness: 0.25,
  });
  redLamp.name = 'mustang-tail-led';
  const amber = new THREE.MeshStandardMaterial({
    color: '#ffb75a',
    emissive: '#e77624',
    emissiveIntensity: 0.25,
    roughness: 0.3,
  });
  amber.name = 'mustang-amber';
  const display = new THREE.MeshStandardMaterial({
    color: '#1a3544',
    emissive: '#458995',
    emissiveIntensity: 0.4,
    roughness: 0.36,
  });
  display.name = 'mustang-instruments';
  for (const m of [paint, glass, whiteLamp, redLamp, amber, display])
    kit.materials.add(m);
  const box = (
    mat: THREE.Material,
    size: Point,
    at: Point,
    parent: THREE.Object3D = body,
    radius = 0.014,
  ) => {
    const bevel =
      Math.min(...size) < 0.032
        ? 0
        : Math.min(radius, ...size.map((v) => v / 3));
    const geometry =
      bevel > 0
        ? new RoundedBoxGeometry(...size, 1, bevel)
        : new THREE.BoxGeometry(...size);
    const mesh = kit.mesh(geometry, mat, parent);
    mesh.position.set(...at);
    return mesh;
  };
  const blob = (
    mat: THREE.Material,
    size: Point,
    at: Point,
    parent: THREE.Object3D = body,
  ) => {
    const mesh = kit.mesh(new THREE.SphereGeometry(1, 16, 10), mat, parent);
    mesh.scale.set(...size);
    mesh.position.set(...at);
    return mesh;
  };
  const line = (
    points: Point[],
    radius: number,
    mat: THREE.Material,
    parent: THREE.Object3D = body,
  ) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
      false,
      'centripetal',
    );
    const mesh = kit.mesh(
      new THREE.TubeGeometry(
        curve,
        Math.max(6, points.length * 3),
        radius,
        5,
        false,
      ),
      mat,
      parent,
    );
    mesh.castShadow = false;
    return mesh;
  };
  const surface = (
    name: string,
    points: Point[],
    mat: THREE.Material,
    normal: Point,
    parent: THREE.Object3D = body,
  ) => {
    const a = new THREE.Vector3(...points[0]);
    const reverse =
      new THREE.Vector3(...points[1])
        .sub(a)
        .cross(new THREE.Vector3(...points[2]).sub(a))
        .dot(new THREE.Vector3(...normal)) < 0;
    const indices: number[] = [];
    for (let i = 1; i < points.length - 1; i++)
      indices.push(0, reverse ? i + 1 : i, reverse ? i : i + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points.flat(), 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = kit.mesh(geometry, mat, parent);
    mesh.name = name;
    mesh.castShadow = !mat.transparent;
    return mesh;
  };
  const ring = (
    radius: number,
    thickness: number,
    mat: THREE.Material,
    at: Point,
    parent: THREE.Object3D = body,
    segments = 24,
  ) => {
    const mesh = kit.mesh(
      new THREE.TorusGeometry(radius, thickness, 5, segments),
      mat,
      parent,
    );
    mesh.position.set(...at);
    return mesh;
  };
  kit.mesh(mustangBodyGeometry(), paint, body);
  box(trim, [1.51, 0.06, 3.87], [0, 0.245, -0.02]);
  box(trim, [1.59, 0.055, 0.24], [0, 0.32, -2.075]);
  box(trim, [1.6, 0.11, 0.26], [0, 0.365, 1.985]);

  // Long bonnet with two heat extractors and the raised centre seen in the photo.
  surface(
    'mustang-hood-power-bulge',
    [
      [-0.27, 0.894, -1.91],
      [0.27, 0.894, -1.91],
      [0.36, 1.047, -0.88],
      [0.32, 1.041, -0.71],
      [-0.32, 1.041, -0.71],
      [-0.36, 1.047, -0.88],
    ],
    paint,
    [0, 1, 0],
  );
  for (const side of [-1, 1]) {
    line(
      [
        [side * 0.51, 1.027, -0.7],
        [side * 0.57, 1.002, -1.08],
        [side * 0.54, 0.955, -1.57],
        [side * 0.46, 0.853, -1.965],
      ],
      0.006,
      recess,
    );
    const vent = box(
      recess,
      [0.195, 0.028, 0.31],
      [side * 0.407, 1.025, -1.045],
      body,
      0.026,
    );
    vent.rotation.y = side * 0.1;
    for (let i = 0; i < 5; i++) {
      const louvre = box(
        darkMetal,
        [0.17, 0.01, 0.014],
        [side * 0.407, 1.043, -1.16 + i * 0.051],
      );
      louvre.rotation.y = side * 0.1;
    }
    line(
      [
        [side * 0.787, 1.002, -0.64],
        [side * 0.798, 0.994, 0.3],
        [side * 0.837, 1.033, 1.07],
        [side * 0.838, 1.018, 1.42],
      ],
      0.008,
      paint,
    );
    // One long convertible door, with lowered glass and no B/C pillars.
    line(
      [
        [side * 0.84, 0.982, -0.58],
        [side * 0.85, 0.485, -0.51],
        [side * 0.854, 0.459, 0.61],
        [side * 0.878, 0.958, 0.78],
      ],
      0.006,
      recess,
    );
    box(trim, [0.062, 0.092, 1.51], [side * 0.841, 0.344, 0.05]);
    line(
      [
        [side * 0.866, 0.403, -0.51],
        [side * 0.864, 0.392, 0.3],
        [side * 0.895, 0.445, 0.75],
      ],
      0.007,
      darkMetal,
    );
    box(recess, [0.02, 0.047, 0.18], [side * 0.858, 0.923, 0.5]);
    box(paint, [0.029, 0.026, 0.151], [side * 0.874, 0.93, 0.495]);
    box(trim, [0.033, 0.103, 0.83], [side * 0.725, 0.895, 0.02]);
    box(leather, [0.045, 0.06, 0.52], [side * 0.7, 0.909, 0.11]);
    box(metal, [0.012, 0.02, 0.102], [side * 0.681, 0.958, -0.06]);
    box(darkMetal, [0.028, 0.012, 0.083], [side * 0.673, 0.943, 0.16]);
    // Frameless mirrors retain the selected paint on both caps.
    line(
      [
        [side * 0.755, 1.009, -0.61],
        [side * 0.878, 1.031, -0.535],
      ],
      0.026,
      trim,
    );
    const mirror = blob(
      paint,
      [0.112, 0.065, 0.13],
      [side * 0.948, 1.046, -0.518],
    );
    mirror.rotation.y = -side * 0.16;
    blob(metal, [0.088, 0.044, 0.012], [side * 0.948, 1.048, -0.387]);
    line(
      [
        [side * 0.879, 1.046, -0.615],
        [side * 1.002, 1.047, -0.594],
      ],
      0.007,
      whiteLamp,
    );
    for (const axle of [-1.27, 1.3]) {
      const arch: Point[] = [];
      for (let i = 0; i <= 20; i++) {
        const t = (Math.PI * i) / 20,
          z = axle - Math.cos(t) * 0.454;
        arch.push([
          side * sectionAt(z)[1] * 0.996,
          0.405 + Math.sin(t) * 0.454,
          z,
        ]);
      }
      line(arch, 0.012, paint);
    }
  }
  // Fuel flap on the left rear shoulder; no extra door seam on the rear quarter.
  const fuel = ring(0.084, 0.004, recess, [-0.919, 0.964, 1.49], body, 24);
  fuel.rotation.y = Math.PI / 2;

  const upperGrille: Point[] = [
    [-0.626, 0.757, -2.14],
    [0.626, 0.757, -2.14],
    [0.478, 0.488, -2.156],
    [-0.478, 0.488, -2.156],
  ];
  surface('mustang-honeycomb-recess', upperGrille, recess, [0, 0, -1]);
  line([...upperGrille, upperGrille[0]], 0.011, darkMetal);
  // Open hexagonal cells, merged into one batch instead of one draw per cell.
  for (let row = 0; row < 4; row++)
    for (let col = -9; col <= 9; col++) {
      const x = col * 0.057 + (row % 2) * 0.0285,
        y = 0.528 + row * 0.058;
      if (Math.abs(x) > 0.5 + (y - 0.528) * 0.4) continue;
      const cell = kit.mesh(
        new THREE.RingGeometry(0.027, 0.032, 6),
        darkMetal,
        body,
      );
      cell.rotation.set(0, Math.PI, Math.PI / 6);
      cell.position.set(x, y, -2.17);
      cell.castShadow = false;
    }
  // Distinct running-horse silhouette with separated legs, mane and tail.
  const ponyShape = new THREE.Shape();
  const ponyOutline = [
    [-0.19, 0.02],
    [-0.14, 0.045],
    [-0.12, 0.067],
    [-0.05, 0.06],
    [0.02, 0.073],
    [0.071, 0.128],
    [0.082, 0.177],
    [0.113, 0.157],
    [0.157, 0.149],
    [0.187, 0.104],
    [0.139, 0.093],
    [0.112, 0.114],
    [0.083, 0.058],
    [0.095, 0.012],
    [0.155, -0.034],
    [0.138, -0.06],
    [0.074, -0.02],
    [0.042, 0.018],
    [-0.015, 0.006],
    [-0.075, -0.065],
    [-0.124, -0.091],
    [-0.139, -0.069],
    [-0.098, -0.038],
    [-0.077, 0.011],
    [-0.139, 0.003],
    [-0.173, -0.024],
    [-0.21, 0.018],
  ];
  ponyOutline.forEach(([x, y], i) =>
    i ? ponyShape.lineTo(x, y) : ponyShape.moveTo(x, y),
  );
  ponyShape.closePath();
  for (const rear of [false, true]) {
    const emblem = kit.mesh(
      new THREE.ExtrudeGeometry(ponyShape, {
        depth: 0.009,
        bevelEnabled: false,
      }),
      metal,
      body,
    );
    emblem.name = rear ? 'mustang-rear-pony' : 'mustang-front-pony';
    emblem.scale.setScalar(rear ? 0.48 : 0.69);
    emblem.rotation.y = rear ? 0 : Math.PI;
    emblem.position.set(0, rear ? 0.738 : 0.603, rear ? 2.084 : -2.18);
  }
  surface(
    'mustang-lower-grille',
    [
      [-0.47, 0.444, -2.148],
      [0.47, 0.444, -2.148],
      [0.405, 0.35, -2.164],
      [-0.405, 0.35, -2.164],
    ],
    recess,
    [0, 0, -1],
  );
  for (let i = -7; i <= 7; i++)
    box(darkMetal, [0.009, 0.065, 0.01], [i * 0.054, 0.395, -2.176]);
  for (const side of [-1, 1]) {
    // Angular housings plus projector lens and three slanting DRL strips.
    const lampPoints: Point[] = [
      [side * 0.493, 0.787, -2.023],
      [side * 0.822, 0.794, -1.976],
      [side * 0.839, 0.925, -1.692],
      [side * 0.562, 0.917, -1.827],
    ];
    surface('mustang-swept-headlight', lampPoints, recess, [0, 0.65, -1]);
    line([lampPoints[0], lampPoints[1], lampPoints[2]], 0.009, metal);
    for (let i = 0; i < 3; i++) {
      const x = side * (0.55 + i * 0.052),
        z = -1.979 + i * 0.019;
      line(
        [
          [x, 0.807, z],
          [x + side * 0.021, 0.874, z + 0.09],
        ],
        0.011,
        whiteLamp,
      );
    }
    const lens = blob(
      whiteLamp,
      [0.058, 0.039, 0.028],
      [side * 0.756, 0.842, -1.935],
    );
    lens.rotation.x = -0.45;
    box(
      recess,
      [0.236, 0.151, 0.074],
      [side * 0.663, 0.485, -2.078],
      body,
      0.023,
    );
    line(
      [
        [side * 0.57, 0.503, -2.127],
        [side * 0.737, 0.515, -2.101],
      ],
      0.014,
      whiteLamp,
    );
    box(amber, [0.101, 0.024, 0.016], [side * 0.774, 0.676, -2.024]);
    box(amber, [0.012, 0.033, 0.085], [side * 0.859, 0.623, -1.806]);
  }

  // Only the windshield: no roof, rear glass, roof rail or rear pillars.
  surface(
    'mustang-windscreen',
    [
      [-0.731, 1.017, -0.692],
      [0.731, 1.017, -0.692],
      [0.619, 1.513, -0.255],
      [-0.619, 1.513, -0.255],
    ],
    glass,
    [0, 0.65, -1],
  );
  for (const side of [-1, 1]) {
    line(
      [
        [side * 0.747, 1.007, -0.702],
        [side * 0.692, 1.259, -0.493],
        [side * 0.626, 1.526, -0.248],
      ],
      0.028,
      paint,
    );
    line(
      [
        [side * 0.719, 1.027, -0.675],
        [side * 0.673, 1.264, -0.47],
        [side * 0.603, 1.506, -0.24],
      ],
      0.009,
      trim,
    );
    line(
      [
        [side * 0.752, 1.014, -0.668],
        [side * 0.76, 1.014, 0.4],
        [side * 0.801, 1.032, 1.22],
      ],
      0.008,
      metal,
    );
    line(
      [
        [side * 0.774, 1.01, -0.58],
        [side * 0.78, 1.008, 0.53],
      ],
      0.009,
      recess,
    );
    // Window slot and small front quarter pane; all large side glass is lowered.
    surface(
      'mustang-quarter-pane',
      [
        [side * 0.728, 1.022, -0.657],
        [side * 0.697, 1.169, -0.527],
        [side * 0.732, 1.023, -0.491],
      ],
      glass,
      [side, 0.2, -0.2],
    );
  }
  line(
    [
      [-0.624, 1.524, -0.25],
      [0, 1.545, -0.245],
      [0.624, 1.524, -0.25],
    ],
    0.026,
    paint,
  );
  line(
    [
      [-0.596, 1.503, -0.228],
      [0, 1.521, -0.226],
      [0.596, 1.503, -0.228],
    ],
    0.011,
    trim,
  );
  box(trim, [0.085, 0.022, 0.025], [0, 1.455, -0.277]);
  box(trim, [0.205, 0.061, 0.035], [0, 1.432, -0.27], body, 0.015);
  box(metal, [0.177, 0.045, 0.008], [0, 1.432, -0.249]);
  for (const side of [-1, 1]) {
    line(
      [
        [side * 0.07, 1.034, -0.67],
        [side * 0.33, 1.041, -0.648],
        [side * 0.62, 1.032, -0.69],
      ],
      0.009,
      trim,
    );
    box(
      leather,
      [0.4, 0.038, 0.126],
      [side * 0.343, 1.486, -0.214],
      body,
      0.012,
    );
  }
  // Short folded-roof well sits entirely behind the four seats, below shoulder level.
  box(recess, [1.38, 0.053, 0.245], [0, 0.989, 1.49], body, 0.027);
  for (let i = 0; i < 4; i++)
    line(
      [
        [-0.624, 0.999, 1.415 + i * 0.041],
        [0, 1.005, 1.402 + i * 0.041],
        [0.624, 0.999, 1.415 + i * 0.041],
      ],
      0.012,
      leather,
    );
  line(
    [
      [-0.741, 1.014, 1.359],
      [-0.64, 1.034, 1.647],
      [0, 1.016, 1.697],
      [0.64, 1.034, 1.647],
      [0.741, 1.014, 1.359],
    ],
    0.016,
    paint,
  );
  line(
    [
      [-0.73, 0.964, 1.764],
      [0, 0.975, 1.769],
      [0.73, 0.964, 1.764],
    ],
    0.005,
    recess,
  );
  box(paint, [1.57, 0.043, 0.115], [0, 0.929, 1.979], body, 0.015);
  box(redLamp, [0.33, 0.018, 0.012], [0, 0.936, 2.045]);

  // Four seats and door cards make the open cabin work from overhead and rear views.
  box(leather, [1.33, 0.035, 1.81], [0, 0.537, 0.411]);
  box(trim, [0.184, 0.193, 1.2], [0, 0.638, 0.2], body, 0.025);
  box(darkMetal, [0.155, 0.025, 0.37], [0, 0.748, -0.015], body, 0.012);
  const seats: { x: number; z: number; headY: number; backZ: number }[] = [
    { x: -0.344, z: 0.18, headY: 1.284, backZ: 0.57 },
    { x: 0.344, z: 0.18, headY: 1.284, backZ: 0.57 },
    { x: -0.334, z: 1.017, headY: 1.303, backZ: 1.38 },
    { x: 0.334, z: 1.017, headY: 1.303, backZ: 1.38 },
  ];
  for (const [i, seat] of seats.entries()) {
    const rear = i > 1,
      width = rear ? 0.492 : 0.51;
    box(
      leather,
      [width, 0.11, rear ? 0.42 : 0.49],
      [seat.x, 0.668, seat.z - 0.045],
      body,
      0.037,
    );
    box(
      seatCenter,
      [width - 0.115, 0.014, rear ? 0.32 : 0.37],
      [seat.x, 0.729, seat.z - 0.053],
    );
    for (const side of [-1, 1]) {
      blob(
        leather,
        [0.052, 0.075, rear ? 0.17 : 0.211],
        [seat.x + side * (width * 0.41), 0.728, seat.z - 0.028],
      );
      line(
        [
          [seat.x + side * (width * 0.34), 0.742, seat.z - 0.22],
          [seat.x + side * (width * 0.34), 0.751, seat.z + 0.09],
        ],
        0.003,
        stitching,
      );
    }
    const back = box(
      leather,
      [width, 0.412, 0.101],
      [seat.x, 0.908, seat.backZ],
      body,
      0.035,
    );
    back.rotation.x = -0.1;
    box(
      seatCenter,
      [width - 0.14, 0.32, 0.022],
      [seat.x, 0.909, seat.backZ - 0.062],
      body,
      0.015,
    );
    for (const side of [-1, 1]) {
      blob(
        leather,
        [0.053, 0.182, 0.067],
        [seat.x + side * (width * 0.405), 0.939, seat.backZ - 0.018],
      );
      line(
        [
          [seat.x + side * 0.154, 0.791, seat.backZ - 0.082],
          [seat.x + side * 0.154, 1.035, seat.backZ - 0.048],
        ],
        0.003,
        stitching,
      );
      box(
        metal,
        [0.016, 0.114, 0.016],
        [seat.x + side * 0.053, 1.133, seat.backZ],
      );
    }
    const headrest = box(
      leather,
      [0.238, 0.166, 0.098],
      [seat.x, 1.215, seat.backZ + 0.008],
      body,
      0.031,
    );
    headrest.name = `mustang-seat-${i}-headrest`;
    box(
      trim,
      [0.052, 0.04, 0.063],
      [seat.x - Math.sign(seat.x) * 0.247, 0.745, seat.z + 0.07],
    );
    box(
      kit.material('#932b32', 0.78),
      [0.031, 0.015, 0.038],
      [seat.x - Math.sign(seat.x) * 0.247, 0.768, seat.z + 0.07],
    );
  }
  // Double-cowl dashboard, three round centre vents, gauges and short console.
  box(leather, [1.357, 0.146, 0.231], [0, 0.959, -0.513], body, 0.039);
  for (const x of [-0.347, 0.347])
    blob(trim, [0.286, 0.083, 0.13], [x, 1.038, -0.497]);
  box(darkMetal, [1.153, 0.064, 0.039], [0, 0.957, -0.38], body, 0.018);
  for (const x of [-0.117, 0, 0.117]) {
    ring(0.037, 0.006, metal, [x, 1.02, -0.36]);
    box(recess, [0.055, 0.036, 0.012], [x, 1.02, -0.353]);
    for (let n = -1; n <= 1; n++)
      box(darkMetal, [0.05, 0.004, 0.008], [x, 1.02 + n * 0.01, -0.343]);
  }
  for (const x of [-0.415, -0.282]) {
    ring(0.056, 0.007, metal, [x, 1.027, -0.351]);
    const gauge = kit.mesh(new THREE.CircleGeometry(0.048, 24), display, body);
    gauge.position.set(x, 1.027, -0.353);
    line(
      [
        [x, 1.027, -0.339],
        [x + 0.022, 1.053, -0.339],
      ],
      0.004,
      whiteLamp,
    );
  }
  box(trim, [0.229, 0.16, 0.039], [0, 0.871, -0.373], body, 0.012);
  box(display, [0.19, 0.096, 0.012], [0, 0.898, -0.346]);
  for (let i = -1; i <= 1; i++)
    ring(0.015, 0.006, metal, [i * 0.068, 0.81, -0.344], body, 12);
  box(leather, [0.11, 0.032, 0.15], [0, 0.785, -0.003], body, 0.009);
  line(
    [
      [0, 0.79, -0.006],
      [0, 0.868, -0.036],
    ],
    0.014,
    metal,
  );
  blob(trim, [0.036, 0.025, 0.028], [0, 0.874, -0.037]);
  for (const z of [0.149, 0.279]) {
    const cup = ring(0.04, 0.007, metal, [0, 0.747, z]);
    cup.rotation.x = Math.PI / 2;
  }
  box(leather, [0.149, 0.077, 0.226], [0, 0.758, 0.481], body, 0.022);
  const steeringWheel = new THREE.Group();
  steeringWheel.name = 'mustang-steering-wheel';
  steeringWheel.position.set(-0.344, 1.005, -0.241);
  steeringWheel.rotation.x = 0.23;
  body.add(steeringWheel);
  ring(0.137, 0.019, leather, [0, 0, 0], steeringWheel);
  box(darkMetal, [0.204, 0.025, 0.025], [0, 0, 0], steeringWheel);
  box(metal, [0.026, 0.095, 0.019], [0, -0.049, 0], steeringWheel);
  blob(trim, [0.047, 0.037, 0.023], [0, 0, 0.008], steeringWheel);
  box(metal, [0.038, 0.008, 0.008], [0, 0.007, 0.033], steeringWheel);

  // Keep actual createRig heads and their UV/photo materials: city speech takes
  // these anchors in Nikita / Yaroslav / Roma order; race receives one driver.
  const ids = options.driverId
    ? [options.driverId]
    : ['nikita', 'yaroslav', 'roma'];
  const passengers = ids.map((id, i) => {
    const person = people.find((p) => p.id === id) ?? people[0],
      seat = seats[i];
    const rig = createRig(kit, person, body);
    body.attach(rig.head);
    rig.root.removeFromParent();
    rig.head.name = `passenger-${person.id}`;
    rig.head.position.set(seat.x, seat.headY, seat.z);
    rig.head.scale.setScalar(1.2);
    rig.head.rotation.set(0.075, Math.PI, 0);
    rig.head.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.material instanceof THREE.MeshStandardMaterial &&
        object.material.map
      ) {
        object.material.color.set('#ffffff');
        object.material.emissive.set('#ffffff');
        object.material.emissiveMap = object.material.map;
        object.material.emissiveIntensity = 0.18;
      }
    });
    const clothing = kit.material(person.color, 0.9),
      skin = kit.material(person.skin, 0.92);
    blob(clothing, [0.197, 0.232, 0.137], [seat.x, 0.992, seat.z + 0.009]);
    blob(skin, [0.058, 0.08, 0.057], [seat.x, 1.116, seat.z - 0.006]);
    for (const side of [-1, 1]) {
      const hand: Point =
        i === 0
          ? [seat.x + side * 0.124, 1.005, -0.22]
          : [seat.x + side * 0.127, 0.866, seat.z - 0.155];
      line(
        [
          [seat.x + side * 0.173, 1.052, seat.z],
          [seat.x + side * 0.197, 0.939, seat.z - 0.114],
          hand,
        ],
        0.043,
        clothing,
      );
      blob(skin, [0.038, 0.035, 0.042], hand);
      // Bent legs remain below the dash and front-seat backs.
      line(
        [
          [seat.x + side * 0.09, 0.768, seat.z - 0.013],
          [seat.x + side * 0.112, 0.733, seat.z - 0.237],
          [seat.x + side * 0.112, 0.573, seat.z - 0.338],
        ],
        0.056,
        clothing,
      );
      box(
        trim,
        [0.102, 0.055, 0.148],
        [seat.x + side * 0.112, 0.565, seat.z - 0.374],
        body,
        0.02,
      );
    }
    // Broad flat three-point belt runs over the torso, below the face.
    const outer = Math.sign(seat.x);
    line(
      [
        [seat.x + outer * 0.183, 0.975, seat.z + 0.028],
        [seat.x + outer * 0.097, 0.963, seat.z - 0.125],
        [seat.x - outer * 0.134, 0.825, seat.z - 0.119],
      ],
      0.017,
      trim,
    );
    line(
      [
        [seat.x - 0.174, 0.792, seat.z - 0.125],
        [seat.x, 0.797, seat.z - 0.149],
        [seat.x + 0.174, 0.792, seat.z - 0.125],
      ],
      0.015,
      trim,
    );
    mergeStaticDetail(kit, rig.head);
    return rig.head;
  });

  // Recessed black tail panel, six individual LED blades and twin round exhausts.
  box(recess, [1.529, 0.23, 0.029], [0, 0.749, 2.066], body, 0.022);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x = side * (0.423 + i * 0.131);
      const pocket = box(
        trim,
        [0.108, 0.197, 0.035],
        [x, 0.747, 2.085],
        body,
        0.011,
      );
      pocket.rotation.z = -side * 0.07;
      const blade = box(
        redLamp,
        [0.055, 0.172, 0.024],
        [x, 0.753, 2.11],
        body,
        0.008,
      );
      blade.rotation.z = -side * 0.07;
      const inner = box(
        redLamp,
        [0.014, 0.154, 0.009],
        [x - side * 0.031, 0.752, 2.119],
      );
      inner.rotation.z = -side * 0.07;
    }
    box(redLamp, [0.169, 0.024, 0.015], [side * 0.645, 0.457, 2.089]);
    const outer = ring(0.07, 0.013, metal, [side * 0.637, 0.365, 2.115]);
    outer.name = 'mustang-exhaust-tip';
    const inner = kit.mesh(new THREE.CircleGeometry(0.058, 24), recess, body);
    inner.position.set(side * 0.637, 0.365, 2.106);
  }
  box(trim, [0.476, 0.141, 0.052], [0, 0.537, 2.076], body, 0.014);
  box(metal, [0.365, 0.079, 0.013], [0, 0.548, 2.109]);
  for (const x of [-0.32, -0.16, 0, 0.16, 0.32])
    box(trim, [0.023, 0.105, 0.201], [x, 0.345, 2.01]);

  const wheels: { steering: THREE.Group; roll: THREE.Group; front: boolean }[] =
    [];
  for (const z of [-1.27, 1.3])
    for (const side of [-1, 1]) {
      const front = z < 0,
        wheel = new THREE.Group(),
        roll = new THREE.Group();
      wheel.name = `mustang-wheel-${front ? 'front' : 'rear'}-${side < 0 ? 'left' : 'right'}`;
      wheel.position.set(side * 0.875, 0.405, z);
      root.add(wheel);
      wheel.add(roll);
      const tire = kit.mesh(
        new THREE.CylinderGeometry(0.405, 0.405, 0.245, 32),
        kit.material('#10151b', 0.94),
        roll,
      );
      tire.rotation.z = Math.PI / 2;
      const barrel = kit.mesh(
        new THREE.CylinderGeometry(0.297, 0.297, 0.251, 32),
        recess,
        roll,
      );
      barrel.rotation.z = Math.PI / 2;
      const face = side * 0.15;
      const rotor = kit.mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.017, 28),
        metal,
        roll,
      );
      rotor.rotation.z = Math.PI / 2;
      rotor.position.x = side * 0.131;
      const bead = ring(0.367, 0.007, trim, [side * 0.126, 0, 0], roll, 32);
      bead.rotation.y = Math.PI / 2;
      const rim = ring(0.285, 0.012, metal, [face, 0, 0], roll, 32);
      rim.rotation.y = Math.PI / 2;
      for (let n = 0; n < 5; n++)
        for (const split of [-1, 1]) {
          const a = (n * Math.PI * 2) / 5 + split * 0.103;
          const spoke = box(
            darkMetal,
            [0.026, 0.027, 0.229],
            [face, Math.sin(a) * 0.161, Math.cos(a) * 0.161],
            roll,
            0.004,
          );
          spoke.rotation.x = -a;
          const edge = box(
            metal,
            [0.009, 0.007, 0.207],
            [face + side * 0.015, Math.sin(a) * 0.16, Math.cos(a) * 0.16],
            roll,
          );
          edge.rotation.x = -a;
        }
      const hub = kit.mesh(
        new THREE.CylinderGeometry(0.054, 0.054, 0.034, 20),
        darkMetal,
        roll,
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.x = face;
      for (let n = 0; n < 5; n++) {
        const a = (n * Math.PI * 2) / 5;
        const bolt = kit.mesh(
          new THREE.CylinderGeometry(0.008, 0.008, 0.01, 6),
          metal,
          roll,
        );
        bolt.rotation.z = Math.PI / 2;
        bolt.position.set(
          face + side * 0.024,
          Math.sin(a) * 0.038,
          Math.cos(a) * 0.038,
        );
      }
      for (let n = 0; n < 14; n++) {
        const a = (n * Math.PI * 2) / 14;
        const hole = kit.mesh(new THREE.CircleGeometry(0.007, 5), recess, roll);
        hole.rotation.y = (side * Math.PI) / 2;
        hole.position.set(
          side * 0.142,
          Math.sin(a) * 0.176,
          Math.cos(a) * 0.176,
        );
        hole.castShadow = false;
      }
      const caliper = box(
        kit.material('#88352b', 0.42, 0.33),
        [0.05, 0.159, 0.061],
        [side * 0.15, 0.048, -0.172],
        wheel,
        0.012,
      );
      caliper.name = 'mustang-fixed-brake-caliper';
      mergeStaticDetail(kit, roll);
      wheels.push({ steering: wheel, roll, front });
    }
  mergeStaticDetail(kit, steeringWheel);
  mergeStaticDetail(kit, body);
  let rollAngle = 0,
    lastSpeed = 0;
  return {
    root,
    body,
    wheels,
    passengers,
    update(s: CityState, dt: number, cabinView = true) {
      const step = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
      root.position.set(s.x, 0.025, s.z);
      root.rotation.y = -s.heading;
      glass.opacity = cabinView ? 0.055 : 0.16;
      const forward = s.vx * Math.sin(s.heading) - s.vz * Math.cos(s.heading);
      const lateral = s.vx * Math.cos(s.heading) + s.vz * Math.sin(s.heading);
      rollAngle = (rollAngle - (forward * step) / 0.405) % (Math.PI * 2);
      for (const wheel of wheels) {
        wheel.steering.rotation.y = wheel.front ? -s.steering * 0.45 : 0;
        wheel.roll.rotation.x = rollAngle;
      }
      const smooth = 1 - Math.exp(-step * 8);
      body.rotation.z = THREE.MathUtils.lerp(
        body.rotation.z,
        THREE.MathUtils.clamp(-lateral * 0.018, -0.1, 0.1),
        smooth,
      );
      body.rotation.x = THREE.MathUtils.lerp(
        body.rotation.x,
        THREE.MathUtils.clamp((forward - lastSpeed) * 0.024, -0.035, 0.035),
        smooth,
      );
      body.position.y =
        s.speed > 0.2
          ? Math.sin(s.elapsed * 16) * Math.min(0.013, s.speed * 0.002)
          : 0;
      passengers.forEach(
        (head, i) =>
          (head.rotation.z =
            Math.sin(s.elapsed * 2 + i) * 0.035 +
            (s.drifting
              ? THREE.MathUtils.clamp(lateral * 0.014, -0.075, 0.075)
              : 0)),
      );
      steeringWheel.rotation.z = -s.steering * 0.55;
      if (step > 0) lastSpeed = forward;
      redLamp.emissiveIntensity = (s.throttle ?? 0) < -0.05 ? 2.1 : 0.95;
    },
  };
}
