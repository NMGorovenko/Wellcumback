import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CITY_BOBROVY_LOG,
  type CityPoint,
} from '../../../lib/game/city/layout.ts';
import { cityGroundHeight } from '../../../lib/game/city/surface.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { drapedSurface } from './relief.ts';
import { facadeText } from './facade-text.ts';

// Topology and silhouettes follow the official summer map and exterior photos.
// Dimensions and distances are deliberately compressed, not survey measurements.
const OASIS = { x: -838, z: 1268 };
const MIRAGE = { x: -742, z: 1276 };
const LIFTS = [
  { from: { x: -902, z: 1282 }, to: { x: -942, z: 1590 } },
  { from: { x: -785, z: 1282 }, to: { x: -805, z: 1550 } },
] as const;
const SILVER = '#bec8c9';
const STONE = '#b2a38b';
const GLASS = '#497587';

function groundedGroup(parent: THREE.Group, name: string, p: CityPoint) {
  const group = new THREE.Group();
  group.name = `bobrovy-log:${name}`;
  group.position.set(p.x, cityGroundHeight(p.x, p.z), p.z);
  parent.add(group);
  return group;
}

/** A solid elevation profile, extruded back from the visitor-facing facade. */
function profile(
  kit: RenderKit,
  group: THREE.Group,
  points: readonly [number, number][],
  front: number,
  depth: number,
  color: string,
) {
  const shape = new THREE.Shape(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
  );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, front);
  return kit.mesh(geometry, kit.material(color), group);
}

function ellipse(
  kit: RenderKit,
  group: THREE.Group,
  rx: number,
  rz: number,
  height: number,
  color: string,
  x: number,
  y: number,
  z: number,
) {
  const mesh = kit.mesh(
    new THREE.CylinderGeometry(1, 1, height, 32),
    kit.material(color),
    group,
  );
  mesh.position.set(x, y, z);
  mesh.scale.set(rx, 1, rz);
  return mesh;
}

function createOasis(kit: RenderKit, area: THREE.Group) {
  const lodge = groundedGroup(area, 'oasis', OASIS);
  // The two low rounded wings frame the taller, raking glass entrance bay.
  ellipse(kit, lodge, 15.5, 11, 8.3, STONE, -20, 4.15, 3).name =
    'bobrovy-log:oasis-left-wing';
  ellipse(kit, lodge, 15.65, 11.15, 3.6, GLASS, -20, 6.2, 3);
  ellipse(kit, lodge, 16, 11.6, 0.5, SILVER, -20, 8.65, 3);
  ellipse(kit, lodge, 16, 12.7, 10.8, STONE, 19.4, 5.4, 1.1).name =
    'bobrovy-log:oasis-round-wing';
  ellipse(kit, lodge, 16.1, 12.8, 1.45, GLASS, 19.4, 6.3, 1.1);
  ellipse(kit, lodge, 16.25, 12.95, 3.2, SILVER, 19.4, 9.6, 1.1);
  ellipse(kit, lodge, 16.55, 13.25, 0.4, '#e0e1d9', 19.4, 11.35, 1.1);
  // Stone fins and a glazed bridge make the approach opening legible at car height.
  kit.box(2.1, 10.4, 22, STONE, -12.6, 5.2, 1.1, lodge, 0);
  kit.box(18, 4.1, 13, SILVER, -6.8, 6.05, 0.8, lodge, 0);
  kit.box(17.8, 1.3, 0.12, GLASS, -6.8, 6.45, -5.76, lodge, 0);
  const entry = kit.box(10.7, 3.6, 0.3, '#284b56', 0.5, 1.8, -7.2, lodge, 0);
  entry.name = 'bobrovy-log:oasis-recessed-entry';
  const wedge = profile(
    kit,
    lodge,
    [
      [-6.8, 3.6],
      [6.4, 3.6],
      [7.8, 11.7],
      [-5.1, 15.8],
    ],
    -11.5,
    13,
    SILVER,
  );
  wedge.name = 'bobrovy-log:oasis-glass-wedge';
  profile(
    kit,
    lodge,
    [
      [-6.4, 4.2],
      [5.8, 4.2],
      [7.2, 11.35],
      [-4.8, 15.15],
    ],
    -11.59,
    0.06,
    GLASS,
  );
  profile(
    kit,
    lodge,
    [
      [-8.4, 0],
      [-6.8, 0],
      [-5.1, 15.8],
      [-6.8, 16],
    ],
    -12.1,
    18,
    STONE,
  );
  profile(
    kit,
    lodge,
    [
      [6.4, 0],
      [8, 0],
      [9.4, 12.05],
      [7.8, 11.7],
    ],
    -12.1,
    18,
    STONE,
  );
  for (let y = 5; y <= 14; y += 1.5) {
    const right = y <= 11.35 ? 6.7 : 7.2 - ((y - 11.35) / 3.8) * 12;
    if (right > -5)
      kit.box(
        right + 5,
        0.075,
        0.1,
        SILVER,
        (right - 5) / 2,
        y,
        -11.7,
        lodge,
        0,
      );
  }
  for (const x of [-3.6, 0, 3.6]) {
    const h = 14.1 - (x + 3.6) * 0.315 - 4.2;
    kit.box(0.08, h, 0.1, SILVER, x, 4.2 + h / 2, -11.7, lodge, 0);
  }
  kit.box(13.5, 0.45, 5.8, '#818f91', 0, 3.65, -11.1, lodge, 0);
  // A restrained facade inscription supplements the shape; there is no billboard.
  const sign = new THREE.Group();
  sign.rotation.y = Math.PI;
  lodge.add(sign);
  facadeText(kit, sign, 'ОАЗИС', '#eef0e7', 7, 0, 3.95, 14.05);
  return lodge;
}

function createMirage(kit: RenderKit, area: THREE.Group) {
  const pool = groundedGroup(area, 'mirage', MIRAGE);
  ellipse(kit, pool, 17.8, 17.8, 0.2, '#bdc5be', 0, 0.11, 0);
  ellipse(kit, pool, 12.4, 12.4, 0.2, '#e1e6d9', 0, 0.25, 0);
  ellipse(kit, pool, 11.9, 11.9, 0.08, '#63b6cf', 0, 0.39, 0).name =
    'bobrovy-log:mirage-pool';
  // C-shaped service ring leaves the forecourt side open to the circular pool.
  for (let i = 0; i < 18; i++) {
    const angle = (-0.72 + (i / 17) * 1.44) * Math.PI;
    const segment = new THREE.Group();
    segment.position.set(Math.sin(angle) * 15.2, 0, Math.cos(angle) * 15.2);
    segment.rotation.y = angle;
    pool.add(segment);
    kit.box(4.1, 3.6, 3.5, SILVER, 0, 1.9, 0, segment, 0);
    kit.box(3.6, 2.1, 0.15, GLASS, 0, 2.4, -1.81, segment, 0);
    kit.box(4.5, 0.35, 4.3, '#e2e5df', 0, 3.95, 0, segment, 0);
  }
  for (const x of [-12.5, -6.2, 6.2, 12.5]) {
    const z = -Math.sqrt(15.2 * 15.2 - x * x);
    kit.box(0.09, 2.7, 0.09, SILVER, x, 1.55, z, pool, 0);
    const parasol = kit.mesh(
      new THREE.ConeGeometry(1.8, 0.6, 8),
      kit.material('#e8e9dc'),
      pool,
    );
    parasol.position.set(x, 3, z);
  }
  return pool;
}

function route(points: readonly [number, number][]) {
  return new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  );
}

function ribbon(
  curve: THREE.CatmullRomCurve3,
  fromWidth: number,
  toWidth: number,
  samples = 40,
) {
  const points = curve.getPoints(samples);
  const edges = points.map((p, i) => {
    const tangent = curve.getTangent(i / samples);
    const width = (fromWidth + ((toWidth - fromWidth) * i) / samples) / 2;
    return [
      { x: p.x - tangent.z * width, z: p.z + tangent.x * width },
      { x: p.x + tangent.z * width, z: p.z - tangent.x * width },
    ];
  });
  return {
    points,
    polygons: edges
      .slice(1)
      .map((edge, i) => [edges[i][0], edge[0], edge[1], edges[i][1]]),
  };
}

function createLift(
  kit: RenderKit,
  area: THREE.Group,
  line: (typeof LIFTS)[number],
  index: number,
) {
  const direction = new THREE.Vector3(
    line.to.x - line.from.x,
    0,
    line.to.z - line.from.z,
  ).normalize();
  const across = new THREE.Vector3(direction.z, 0, -direction.x);
  const heading = Math.atan2(direction.x, direction.z);
  const towers = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    const x = THREE.MathUtils.lerp(line.from.x, line.to.x, t);
    const z = THREE.MathUtils.lerp(line.from.z, line.to.z, t);
    return new THREE.Vector3(x, cityGroundHeight(x, z) + 10.2, z);
  });
  const position = (t: number, side: number) => {
    const segment = Math.min(7, Math.floor(t * 8));
    const fraction = t * 8 - segment;
    const p = towers[segment].clone().lerp(towers[segment + 1], fraction);
    p.y -= Math.sin(fraction * Math.PI) * 0.35;
    return p.addScaledVector(across, side * 2.1);
  };
  towers.forEach((p, i) => {
    const tower = new THREE.Group();
    tower.name = `bobrovy-log:lift-${index + 1}:tower-${i}`;
    tower.position.copy(p);
    tower.rotation.y = heading;
    area.add(tower);
    kit.box(0.65, 10.2, 0.65, '#778b8b', 0, -5.1, 0, tower, 0);
    kit.box(5.6, 0.45, 0.6, '#426675', 0, 0, 0, tower, 0);
    for (const x of [-2.1, 2.1])
      kit.box(0.3, 0.5, 2, '#435254', x, -0.2, 0, tower, 0);
  });
  for (const side of [-1, 1])
    for (let i = 0; i < 48; i++)
      kit.rod(
        position(i / 48, side),
        position((i + 1) / 48, side),
        0.05,
        '#344b50',
        area,
      );
  for (const t of [0, 1]) {
    const p = t === 0 ? line.from : line.to;
    const station = groundedGroup(
      area,
      `lift-${index + 1}:${t === 0 ? 'lower' : 'upper'}-station`,
      p,
    );
    station.rotation.y = heading;
    kit.box(9, 0.24, 16, '#aeb7b1', 0, 0.15, 0, station, 0);
    kit.box(1.3, 8, 1.3, '#9aa9a7', 0, 4, 0, station, 0);
    kit.box(6, 2.2, 13, '#d7ddd8', 0, 9.1, 0, station, 0);
    kit.box(7.5, 0.55, 15, '#497d8a', 0, 10.4, 0, station, 0);
    for (const z of [-5.1, 5.1])
      ellipse(kit, station, 2.6, 2.6, 0.4, '#485b5d', 0, 8, z);
  }
  return { position, heading };
}

function createRodelbahn(kit: RenderKit, area: THREE.Group) {
  const curve = route([
    [-716, 1298],
    [-695, 1330],
    [-742, 1354],
    [-697, 1383],
    [-748, 1410],
    [-722, 1436],
    [-768, 1460],
    [-757, 1490],
  ]);
  const strip = ribbon(curve, 3.4, 3.4, 64);
  const track = drapedSurface(
    kit,
    area,
    strip.polygons,
    '#8c9793',
    cityGroundHeight,
    1.5,
    5,
  );
  track.name = 'bobrovy-log:rodelbahn';
  // A few visible trestles keep the silver serpentine readable against the grass.
  for (let i = 0; i <= 20; i++) {
    const p = curve.getPoint(i / 20);
    const ground = cityGroundHeight(p.x, p.z);
    kit.box(2.7, 0.2, 0.35, '#6f817d', p.x, ground + 1.35, p.z, area, 0);
    for (const side of [-1, 1])
      kit.box(
        0.12,
        1.35,
        0.12,
        '#6f817d',
        p.x + side,
        ground + 0.7,
        p.z,
        area,
        0,
      );
  }
  return strip.points;
}

const forecourt = [
  { x: -916, z: 1241 },
  { x: CITY_BOBROVY_LOG.base.x, z: 1237 },
  { x: -719, z: 1242 },
  { x: -719, z: 1295 },
  { x: -782, z: 1296 },
  { x: -890, z: 1293 },
  { x: -916, z: 1280 },
];
const pistes = [
  {
    curve: route([
      [-897, 1292],
      [-944, 1387],
      [-1022, 1487],
      [-988, 1585],
    ]),
    width: 31,
  },
  {
    curve: route([
      [-897, 1292],
      [-894, 1411],
      [-939, 1500],
      [-942, 1590],
    ]),
    width: 29,
  },
  {
    curve: route([
      [-893, 1365],
      [-866, 1447],
      [-891, 1525],
      [-882, 1590],
    ]),
    width: 21,
  },
  {
    curve: route([
      [-789, 1292],
      [-805, 1405],
      [-851, 1482],
      [-805, 1550],
    ]),
    width: 30,
  },
  {
    curve: route([
      [-789, 1292],
      [-747, 1398],
      [-778, 1480],
      [-805, 1550],
    ]),
    width: 29,
  },
].map((p) => ({ ...p, ...ribbon(p.curve, p.width * 1.6, p.width * 0.6) }));

/** Exact convex surface footprints also cut the coarser grass terrain. Merely
 * sampling the same analytic height on a different grid lets grass triangles
 * cross the paving and pistes between vertices. Keep this shared with rendering. */
export const BOBROVY_TERRAIN_FOOTPRINTS = [
  forecourt,
  ...pistes.flatMap((p) => p.polygons),
].map((polygon) => {
  const signedArea = polygon.reduce((sum, p, i) => {
    const next = polygon[(i + 1) % polygon.length];
    return sum + p.x * next.z - next.x * p.z;
  }, 0);
  return signedArea > 0 ? polygon : [...polygon].reverse();
});

/** Compact summer composition: riverside arrival, Oasis, Mirage, two lift fans.
 * Reference provenance is recorded in docs/bobrovy-log-reference.md. */
export function createBobrovyLog(kit: RenderKit, root: THREE.Group) {
  const area = new THREE.Group();
  area.name = 'bobrovy-log';
  root.add(area);
  const plaza = drapedSurface(
    kit,
    area,
    [forecourt],
    '#b5b2a0',
    cityGroundHeight,
    0.08,
    6,
  );
  plaza.name = 'bobrovy-log:forecourt';

  const piste = drapedSurface(
    kit,
    area,
    pistes.flatMap((p) => p.polygons),
    '#a7ad77',
    cityGroundHeight,
    0.12,
    5,
  );
  piste.name = 'bobrovy-log:piste';
  createOasis(kit, area);
  createMirage(kit, area);
  const lifts = LIFTS.map((line, index) => createLift(kit, area, line, index));
  const rodel = createRodelbahn(kit, area);

  const chairParts = [
    new THREE.BoxGeometry(2.7, 0.22, 0.85),
    new THREE.BoxGeometry(2.7, 0.9, 0.18).translate(0, 0.5, 0.4),
    new THREE.BoxGeometry(0.12, 2, 0.12).translate(-1.28, 1, 0.25),
    new THREE.BoxGeometry(0.12, 2, 0.12).translate(1.28, 1, 0.25),
    new THREE.BoxGeometry(2.7, 0.12, 0.12).translate(0, 2, 0.25),
    new THREE.BoxGeometry(0.12, 0.7, 0.12).translate(0, 2.4, 0.25),
  ];
  const chairGeometry = mergeGeometries(chairParts)!;
  chairParts.forEach((p) => p.dispose());
  kit.geometries.add(chairGeometry);
  const chairs = new THREE.InstancedMesh(
    chairGeometry,
    kit.material('#64878b'),
    32,
  );
  chairs.name = 'bobrovy-log:chairs';
  chairs.frustumCulled = false;
  area.add(chairs);
  const treeGeometry = new THREE.ConeGeometry(1, 1, 7);
  kit.geometries.add(treeGeometry);
  const forest = new THREE.InstancedMesh(
    treeGeometry,
    kit.material('#3f634e'),
    340,
  );
  forest.name = 'bobrovy-log:forest';
  const dummy = new THREE.Object3D();
  let count = 0;
  for (let i = 0; i < 1100 && count < 340; i++) {
    const x = -1110 + ((i * 137.63) % 485),
      z = 1310 + ((i * 83.39) % 330);
    if (
      pistes.some((p) =>
        p.points.some(
          (point, j) =>
            Math.hypot(point.x - x, point.z - z) <
            (p.width * (1.6 - j / 40)) / 2 + 5,
        ),
      )
    )
      continue;
    if (rodel.some((p) => Math.hypot(p.x - x, p.z - z) < 8)) continue;
    if (
      LIFTS.some((l) => {
        const t = THREE.MathUtils.clamp(
          (z - l.from.z) / (l.to.z - l.from.z),
          0,
          1,
        );
        return Math.abs(x - THREE.MathUtils.lerp(l.from.x, l.to.x, t)) < 7;
      })
    )
      continue;
    const h = 7 + (i % 7);
    dummy.position.set(x, cityGroundHeight(x, z) + h / 2, z);
    dummy.scale.set(3 + (i % 3), h, 3 + (i % 3));
    dummy.updateMatrix();
    forest.setMatrixAt(count++, dummy.matrix);
  }
  forest.count = count;
  forest.computeBoundingSphere();
  area.add(forest);
  function update(time: number) {
    // A first RAF timestamp can precede the clock sampled during scene setup.
    // JS remainder preserves that negative sign and would select tower -1.
    // Keep invalid snapshots at the last valid pose; construction calls update(0).
    if (!Number.isFinite(time)) return;
    const cycle = THREE.MathUtils.euclideanModulo(time, 160) / 160;
    for (let j = 0; j < lifts.length; j++)
      for (let i = 0; i < 16; i++) {
        const phase = (i / 16 + cycle) % 1;
        const side = phase < 0.5 ? 1 : -1;
        const t = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
        dummy.position.copy(lifts[j].position(t, side));
        dummy.position.y -= 2.75;
        dummy.scale.setScalar(1);
        dummy.rotation.y = lifts[j].heading + (side > 0 ? Math.PI : 0);
        dummy.updateMatrix();
        chairs.setMatrixAt(j * 16 + i, dummy.matrix);
      }
    chairs.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { root: area, update };
}
