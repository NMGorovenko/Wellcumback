import * as THREE from 'three';
import {
  KACHA_BANK_WIDTH,
  KACHA_HALF_WIDTH,
  KACHA_BANK_END_ALONG,
  KACHA_RENDER_STEP,
  KACHA_POINTS,
  kachaOffsetPoints,
  kachaRoadCrossings,
  kachaBankRails,
  kachaBridgeRails,
  sampleKachaAlong,
  type KachaPoint,
  type KachaRoad,
} from '../../../lib/game/city/kacha.ts';
import type { RenderKit } from '../world/render-kit.ts';

type Point3 = { x: number; y: number; z: number };
type KachaOptions = {
  roads: readonly KachaRoad[];
  roadHeight: (road: KachaRoad, x: number, z: number) => number;
  waterMaterial?: THREE.Material;
};

/** One shared corridor for water, low channel walls and promenades. The caller
 * cuts KACHA_TERRAIN_HOLES out of the terrain; these vertices use world y.
 * Road surfaces remain owned by the normal road renderer and retain their IDs. */
export function createKachaRiver(
  kit: RenderKit,
  root: THREE.Group,
  options: KachaOptions,
) {
  const g = new THREE.Group();
  g.name = 'kacha:river-and-embankments';
  root.add(g);
  const structural = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
  });
  kit.materials.add(structural);
  const water = options.waterMaterial ?? kit.material('#79a9b3', 0.3, 0.05);
  const chunks = new Map<
    string,
    { positions: number[]; colors: number[]; water: boolean }
  >();
  const palette = new Map<string, THREE.Color>();
  function quad(
    a: Point3,
    b: Point3,
    c: Point3,
    d: Point3,
    color: string,
    isWater = false,
  ) {
    const key = `${isWater}:${Math.floor((a.x + b.x + c.x + d.x) / 4 / 640)}:${Math.floor((a.z + b.z + c.z + d.z) / 4 / 640)}`;
    const chunk = chunks.get(key) ?? {
      positions: [],
      colors: [],
      water: isWater,
    };
    const shade = palette.get(color) ?? new THREE.Color(color);
    palette.set(color, shade);
    for (const p of [a, b, c, a, c, d]) {
      chunk.positions.push(p.x, p.y, p.z);
      chunk.colors.push(shade.r, shade.g, shade.b);
    }
    chunks.set(key, chunk);
  }
  function beam(
    a: Point3,
    b: Point3,
    width: number,
    height: number,
    color: string,
  ) {
    const dx = b.x - a.x,
      dz = b.z - a.z,
      length = Math.hypot(dx, dz);
    if (length < 0.001) return;
    const nx = ((-dz / length) * width) / 2,
      nz = ((dx / length) * width) / 2;
    const p = [a, b].flatMap((end) =>
      [-1, 1].flatMap((side) =>
        [-1, 1].map((up) => ({
          x: end.x + nx * side,
          y: end.y + (up * height) / 2,
          z: end.z + nz * side,
        })),
      ),
    );
    for (const [i, j, k, l] of [
      [0, 4, 6, 2],
      [1, 3, 7, 5],
      [0, 1, 5, 4],
      [2, 6, 7, 3],
      [0, 2, 3, 1],
      [4, 5, 7, 6],
    ])
      quad(p[i], p[j], p[k], p[l], color);
  }
  // Linear interpolation of mitered offset vertices keeps adjacent chunks exact.
  const inner = [-1, 1].map((side) =>
    kachaOffsetPoints(side * KACHA_HALF_WIDTH),
  );
  const outer = [-1, 1].map((side) =>
    kachaOffsetPoints(side * (KACHA_HALF_WIDTH + KACHA_BANK_WIDTH)),
  );
  let travelled = 0;
  for (let segment = 1; segment < KACHA_POINTS.length; segment++) {
    const from = KACHA_POINTS[segment - 1],
      to = KACHA_POINTS[segment];
    const distance = Math.hypot(to.x - from.x, to.z - from.z),
      count = Math.ceil(distance / KACHA_RENDER_STEP);
    const at = (points: KachaPoint[], t: number, y: number): Point3 => ({
      x:
        points[segment - 1].x + (points[segment].x - points[segment - 1].x) * t,
      y,
      z:
        points[segment - 1].z + (points[segment].z - points[segment - 1].z) * t,
    });
    for (let i = 0; i < count; i++) {
      const t0 = i / count,
        t1 = (i + 1) / count;
      const a = sampleKachaAlong(travelled + distance * t0),
        b = sampleKachaAlong(travelled + distance * t1);
      quad(
        at(inner[0], t0, a.waterHeight),
        at(inner[1], t0, a.waterHeight),
        at(inner[1], t1, b.waterHeight),
        at(inner[0], t1, b.waterHeight),
        '#ffffff',
        true,
      );
      // Open mouth: no stone banks projecting into the Yenisei / Tatyshev channel.
      if (b.along > KACHA_BANK_END_ALONG + 1e-6) continue;
      for (let side = 0; side < 2; side++) {
        const ia = at(inner[side], t0, a.bankHeight),
          ib = at(inner[side], t1, b.bankHeight);
        const oa = at(outer[side], t0, a.bankHeight),
          ob = at(outer[side], t1, b.bankHeight);
        const middle = { x: (ia.x + ib.x) / 2, y: 0, z: (ia.z + ib.z) / 2 };
        const urban = middle.x > -780;
        const stone = urban ? '#aab0a6' : '#78836e';
        // Vertical sides retain the channel under the short road bridges.
        const lowA = { ...ia, y: a.bedHeight },
          lowB = { ...ib, y: b.bedHeight };
        if (side === 0) quad(lowA, lowB, ib, ia, stone);
        else quad(lowB, lowA, ia, ib, stone);
        if (side === 0) quad(ia, ib, ob, oa, urban ? '#b9b8ac' : '#82966d');
        else quad(oa, ob, ib, ia, urban ? '#b9b8ac' : '#82966d');
      }
    }
    travelled += distance;
  }

  for (const rail of kachaBankRails(options.roads)) {
    const a = { ...rail.from, y: rail.fromHeight },
      b = { ...rail.to, y: rail.toHeight };
    beam(
      { ...a, y: a.y + 0.86 },
      { ...b, y: b.y + 0.86 },
      0.075,
      0.07,
      '#40545a',
    );
    beam(
      { ...a, y: a.y + 0.42 },
      { ...b, y: b.y + 0.42 },
      0.055,
      0.055,
      '#40545a',
    );
    for (const t of [0, 0.5]) {
      const p = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t + 0.44,
        z: a.z + (b.z - a.z) * t,
      };
      beam(
        { ...p, x: p.x - 0.045 },
        { ...p, x: p.x + 0.045 },
        0.09,
        0.9,
        '#40545a',
      );
    }
  }

  const crossings = kachaRoadCrossings(options.roads);
  g.userData.crossings = crossings.map((crossing) => crossing.road.id);
  for (const crossing of crossings) {
    if (crossing.along > KACHA_BANK_END_ALONG) continue;
    const { road, nx, nz, halfLength } = crossing;
    const tx = nz,
      tz = -nx;
    const point = (along: number, lateral: number, height: number) => {
      const x = crossing.x + tx * along + nx * lateral,
        z = crossing.z + tz * along + nz * lateral;
      return { x, y: options.roadHeight(road, x, z) + height, z };
    };
    // Underside only: the existing asphalt remains the sole visible road surface.
    const start = point(-halfLength, 0, -0.27),
      end = point(halfLength, 0, -0.27);
    beam(start, end, road.width, 0.34, '#aab0a6');
  }
  for (const rail of kachaBridgeRails(options.roads)) {
    const a = {
        ...rail.from,
        y: options.roadHeight(rail.road, rail.from.x, rail.from.z),
      },
      b = {
        ...rail.to,
        y: options.roadHeight(rail.road, rail.to.x, rail.to.z),
      };
    beam(
      { ...a, y: a.y + 0.95 },
      { ...b, y: b.y + 0.95 },
      0.1,
      0.09,
      '#40545a',
    );
    for (const endpoint of [a, b]) {
      const p = { ...endpoint, y: endpoint.y + 0.47 };
      beam(
        { ...p, x: p.x - 0.06 },
        { ...p, x: p.x + 0.06 },
        0.12,
        0.94,
        '#40545a',
      );
    }
  }
  for (const [key, chunk] of chunks) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(chunk.positions, 3),
    );
    if (!chunk.water)
      geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(chunk.colors, 3),
      );
    geometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        new Float32Array((chunk.positions.length / 3) * 2),
        2,
      ),
    );
    geometry.computeVertexNormals();
    const mesh = kit.mesh(geometry, chunk.water ? water : structural, g);
    mesh.name = chunk.water ? 'kacha:water' : 'kacha:embankment';
    mesh.userData.kachaChunk = key;
    mesh.castShadow = !chunk.water;
  }
  return g;
}
