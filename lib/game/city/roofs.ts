import generated from './roofs.generated.json' with { type: 'json' };
const catalogue = generated.buildings;

/** Offline samples of the authored building meshes. No renderer is needed by the host. */
export type CityRoofSurface = {
  buildingIndex: number;
  surfaceId: string;
  elevation: number;
  slopeX: number;
  slopeZ: number;
};
type BaseAt = (x: number, z: number) => number;
type Building = (typeof catalogue)[number];
type Triangle = {
  building: Building;
  values: number[];
  denominator: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};
const CELL = 12;
const topCells = new Map<string, Triangle[]>();
const undersideCells = new Map<string, Triangle[]>();
const buildings = new Map(catalogue.map((b) => [b.i, b]));
function indexTriangles(
  building: Building,
  values: number[],
  cells: Map<string, Triangle[]>,
) {
  for (let i = 0; i < values.length; i += 9) {
    const v = values.slice(i, i + 9);
    const denominator =
      (v[5] - v[8]) * (v[0] - v[6]) + (v[6] - v[3]) * (v[2] - v[8]);
    if (Math.abs(denominator) < 1e-8) continue;
    const minX = building.x + Math.min(v[0], v[3], v[6]);
    const maxX = building.x + Math.max(v[0], v[3], v[6]);
    const minZ = building.z + Math.min(v[2], v[5], v[8]);
    const maxZ = building.z + Math.max(v[2], v[5], v[8]);
    const triangle = {
      building,
      values: v,
      denominator,
      minX,
      maxX,
      minZ,
      maxZ,
    };
    for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++)
      for (let z = Math.floor(minZ / CELL); z <= Math.floor(maxZ / CELL); z++) {
        const key = `${x}:${z}`,
          cell = cells.get(key) ?? [];
        cell.push(triangle);
        cells.set(key, cell);
      }
  }
}
for (const building of catalogue) {
  indexTriangles(building, building.t, topCells);
  indexTriangles(building, building.u, undersideCells);
}
function nearby(cells: Map<string, Triangle[]>, x: number, z: number) {
  return cells.get(`${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`) ?? [];
}
function triangleHeight(triangle: Triangle, x: number, z: number) {
  const { building, values: v, denominator } = triangle;
  const lx = x - building.x,
    lz = z - building.z;
  const a =
    ((v[5] - v[8]) * (lx - v[6]) + (v[6] - v[3]) * (lz - v[8])) / denominator;
  const b =
    ((v[8] - v[2]) * (lx - v[6]) + (v[0] - v[6]) * (lz - v[8])) / denominator;
  if (a < -1e-7 || b < -1e-7 || a + b > 1 + 1e-7) return null;
  return a * v[1] + b * v[4] + (1 - a - b) * v[7];
}
function surface(
  triangle: Triangle,
  height: number,
  baseAt: BaseAt,
): CityRoofSurface {
  const { building, values: v, denominator } = triangle;
  return {
    buildingIndex: building.i,
    surfaceId: `roof:${building.i}`,
    elevation: height + baseAt(building.x, building.z),
    slopeX:
      ((v[5] - v[8]) * (v[1] - v[7]) + (v[8] - v[2]) * (v[4] - v[7])) /
      denominator,
    slopeZ:
      ((v[6] - v[3]) * (v[1] - v[7]) + (v[0] - v[6]) * (v[4] - v[7])) /
      denominator,
  };
}
/** Only the upper envelope is support: an internal floor cannot bypass a tower wall. */
export function cityRoofSurfaces(
  x: number,
  z: number,
  baseAt: BaseAt,
): CityRoofSurface[] {
  const tops = new Map<number, { triangle: Triangle; height: number }>();
  for (const triangle of nearby(topCells, x, z)) {
    const height = triangleHeight(triangle, x, z);
    if (
      height === null ||
      (tops.get(triangle.building.i)?.height ?? -Infinity) >= height
    )
      continue;
    tops.set(triangle.building.i, { triangle, height });
  }
  return Array.from(tops.values(), ({ triangle, height }) =>
    surface(triangle, height, baseAt),
  );
}
export function cityRoofForBuilding(
  index: number,
  x: number,
  z: number,
  baseAt: BaseAt,
): CityRoofSurface | null {
  let selected: Triangle | null = null,
    height = -Infinity;
  for (const triangle of nearby(topCells, x, z)) {
    if (triangle.building.i !== index) continue;
    const y = triangleHeight(triangle, x, z);
    if (y !== null && y > height) {
      selected = triangle;
      height = y;
    }
  }
  return selected ? surface(selected, height, baseAt) : null;
}
export function validCityRoofSurfaceId(value: string) {
  return (
    /^roof:(0|[1-9][0-9]*)$/.test(value) &&
    buildings.has(Number(value.slice(5)))
  );
}
export function cityRoofHeight(
  surfaceId: string,
  x: number,
  z: number,
  baseAt: BaseAt,
): number | null {
  if (!validCityRoofSurfaceId(surfaceId)) return null;
  return (
    cityRoofForBuilding(Number(surfaceId.slice(5)), x, z, baseAt)?.elevation ??
    null
  );
}
/** Sweep the full car footprint against real downward faces. A thin canopy
 * catches a rising bonnet even when the centre has not reached its edge. */
export function cityRoofCeilingHit(
  x: number,
  z: number,
  oldY: number,
  nextY: number,
  baseAt: BaseAt,
  heading = 0,
  pitch = 0,
  roll = 0,
): number | null {
  if (nextY <= oldY) return null;
  const c = Math.cos(heading),
    s = Math.sin(heading);
  const forward = Math.tan(pitch),
    side = Math.tan(roll) / Math.cos(pitch);
  const slopeX = forward * s + side * c,
    slopeZ = -forward * c + side * s;
  let hit: number | null = null;
  const bases = new Map<number, number>();
  for (const triangle of footprintTriangles(undersideCells, x, z, heading)) {
    const b = triangle.building;
    let base = bases.get(b.i);
    if (base === undefined) {
      base = baseAt(b.x, b.z);
      bases.set(b.i, base);
    }
    const polygon = clippedFootprint(
      triangle,
      x,
      z,
      heading,
      base - 1.45,
      slopeX,
      slopeZ,
    );
    if (!polygon.length) continue;
    const low = Math.min(...polygon.map((p) => p[2])),
      high = Math.max(...polygon.map((p) => p[2]));
    if (oldY <= high && nextY >= low) hit = Math.min(hit ?? Infinity, low);
  }
  return hit;
}
/** A canopy is a slab, not a building filled all the way down to the forecourt. */
export function cityRoofSlabBlocked(
  index: number,
  x: number,
  z: number,
  elevation: number,
  baseAt: BaseAt,
) {
  const top = cityRoofForBuilding(index, x, z, baseAt);
  if (!top || elevation >= top.elevation - 0.06) return false;
  let underside = -Infinity;
  for (const triangle of nearby(undersideCells, x, z)) {
    if (triangle.building.i !== index) continue;
    const height = triangleHeight(triangle, x, z);
    if (height === null) continue;
    const y = height + baseAt(triangle.building.x, triangle.building.z);
    if (y < top.elevation) underside = Math.max(underside, y);
  }
  return underside > -Infinity && elevation + 1.45 > underside;
}

/** Match the YXZ renderer rotation, including steep roofs at the network limit. */
export function cityRoofTilt(roof: CityRoofSurface, heading: number) {
  const s = Math.sin(heading),
    c = Math.cos(heading);
  const forward = roof.slopeX * s - roof.slopeZ * c;
  const sideways = roof.slopeX * c + roof.slopeZ * s;
  const limit = (v: number) => Math.max(-Math.PI / 3, Math.min(Math.PI / 3, v));
  const pitch = limit(Math.atan(forward));
  const roll = limit(Math.atan(sideways * Math.cos(pitch)));
  const supportForward = Math.tan(pitch),
    supportSide = Math.tan(roll) / Math.cos(pitch);
  return {
    pitch,
    roll,
    slopeX: supportForward * s + supportSide * c,
    slopeZ: -supportForward * c + supportSide * s,
  };
}

// Shared conservative bounds cover the 4.728 m AMG and Mustang bumpers.
const HALF_WIDTH = 1.05,
  HALF_LENGTH = 2.4;
type Point = [number, number, number];
function footprintTriangles(
  cells: Map<string, Triangle[]>,
  x: number,
  z: number,
  heading: number,
) {
  const c = Math.cos(heading),
    s = Math.sin(heading);
  const radiusX = Math.abs(c) * HALF_WIDTH + Math.abs(s) * HALF_LENGTH;
  const radiusZ = Math.abs(s) * HALF_WIDTH + Math.abs(c) * HALF_LENGTH;
  const triangles = new Set<Triangle>();
  for (
    let cx = Math.floor((x - radiusX) / CELL);
    cx <= Math.floor((x + radiusX) / CELL);
    cx++
  )
    for (
      let cz = Math.floor((z - radiusZ) / CELL);
      cz <= Math.floor((z + radiusZ) / CELL);
      cz++
    )
      for (const t of cells.get(`${cx}:${cz}`) ?? [])
        if (
          t.maxX >= x - radiusX &&
          t.minX <= x + radiusX &&
          t.maxZ >= z - radiusZ &&
          t.minZ <= z + radiusZ
        )
          triangles.add(t);
  return triangles;
}
/** Clip to the tyre-plane footprint; all extrema of a planar triangle occur at
 * these vertices, including a narrow ridge between the wheel sample points. */
function clippedFootprint(
  triangle: Triangle,
  x: number,
  z: number,
  heading: number,
  base: number,
  slopeX: number,
  slopeZ: number,
) {
  const { building, values } = triangle,
    c = Math.cos(heading),
    s = Math.sin(heading);
  let polygon: Point[] = [];
  for (let i = 0; i < 9; i += 3) {
    const dx = building.x + values[i] - x,
      dz = building.z + values[i + 2] - z;
    polygon.push([
      dx * c + dz * s,
      dx * s - dz * c,
      base + values[i + 1] - slopeX * dx - slopeZ * dz,
    ]);
  }
  for (const [axis, sign, limit] of [
    [0, 1, HALF_WIDTH],
    [0, -1, HALF_WIDTH],
    [1, 1, HALF_LENGTH],
    [1, -1, HALF_LENGTH],
  ]) {
    const clipped: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const da = sign * a[axis] - limit,
        db = sign * b[axis] - limit;
      if (da <= 0) clipped.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        clipped.push([
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        ]);
      }
    }
    polygon = clipped;
    if (!polygon.length) break;
  }
  return polygon;
}
/** Lift the chassis plane enough to clear every roof triangle under its footprint.
 * A planar slope adds nothing; ridges and rooflights cannot pierce the bonnet. */
export function cityRoofSupportElevation(
  roof: CityRoofSurface,
  x: number,
  z: number,
  heading: number,
  baseAt: BaseAt,
) {
  const tilt = cityRoofTilt(roof, heading),
    building = buildings.get(roof.buildingIndex)!;
  const base = baseAt(building.x, building.z);
  let elevation = roof.elevation;
  for (const triangle of footprintTriangles(topCells, x, z, heading)) {
    if (triangle.building.i !== roof.buildingIndex) continue;
    for (const point of clippedFootprint(
      triangle,
      x,
      z,
      heading,
      base,
      tilt.slopeX,
      tilt.slopeZ,
    ))
      elevation = Math.max(elevation, point[2]);
  }
  return elevation;
}
/** Static complexity bounds used by the geometry regression, not a frame counter. */
export const cityRoofQueryStats = Object.freeze({
  cells: topCells.size,
  maximumTopCandidates: Math.max(
    ...Array.from(topCells.values(), (cell) => cell.length),
  ),
  maximumUndersideCandidates: Math.max(
    ...Array.from(undersideCells.values(), (cell) => cell.length),
  ),
});
