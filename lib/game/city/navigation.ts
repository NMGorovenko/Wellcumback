import { CITY_BOUNDS, cityRoads, type CityPoint } from './layout.ts';

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const distance = (a: CityPoint, b: CityPoint) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export type CityMapView = CityPoint & { width: number };
export const CITY_MAP_WIDTH = CITY_BOUNDS.maxX - CITY_BOUNDS.minX + 400;
export const fullCityMapView = (aspect = 1): CityMapView => ({
  x: (CITY_BOUNDS.minX + CITY_BOUNDS.maxX) / 2,
  z: (CITY_BOUNDS.minZ + CITY_BOUNDS.maxZ) / 2,
  width: Math.max(
    CITY_MAP_WIDTH,
    (CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ + 400) * aspect,
  ),
});
export function clampCityMapView(view: CityMapView): CityMapView {
  return {
    x: clamp(view.x, CITY_BOUNDS.minX, CITY_BOUNDS.maxX),
    z: clamp(view.z, CITY_BOUNDS.minZ, CITY_BOUNDS.maxZ),
    width: clamp(view.width, 400, CITY_MAP_WIDTH * 5),
  };
}
/** Zoom keeps the world location beneath the cursor fixed. */
export function zoomCityMap(
  view: CityMapView,
  factor: number,
  anchor: CityPoint = view,
) {
  const width = clamp(view.width * factor, 400, CITY_MAP_WIDTH * 5);
  const ratio = width / view.width;
  return clampCityMapView({
    width,
    x: anchor.x + (view.x - anchor.x) * ratio,
    z: anchor.z + (view.z - anchor.z) * ratio,
  });
}
export function minimapTarget(
  car: CityPoint,
  target: CityPoint,
  width = 660,
  height = 450,
) {
  const dx = target.x - car.x,
    dz = target.z - car.z;
  const amount = Math.min(
    1,
    (width / 2 - 28) / Math.max(1, Math.abs(dx)),
    (height / 2 - 28) / Math.max(1, Math.abs(dz)),
  );
  return {
    x: car.x + dx * amount,
    z: car.z + dz * amount,
    offscreen: amount < 1,
    angle: (Math.atan2(dx, -dz) * 180) / Math.PI,
  };
}

type Node = CityPoint & { edges: Map<number, number> };
const nodes: Node[] = [];
const ids = new Map<string, number>();
function node(p: CityPoint) {
  const key = `${p.x.toFixed(2)}:${p.z.toFixed(2)}`;
  const existing = ids.get(key);
  if (existing !== undefined) return existing;
  const id = nodes.length;
  nodes.push({ ...p, edges: new Map() });
  ids.set(key, id);
  return id;
}
const splits = cityRoads.map((r) => [node(r.from), node(r.to)]);
function project(p: CityPoint, a: CityPoint, b: CityPoint) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = clamp(
    ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz),
    0,
    1,
  );
  return { x: a.x + dx * t, z: a.z + dz * t };
}
// Split road crossings and T junctions, so navigation follows the driveable graph.
for (let i = 0; i < cityRoads.length; i++)
  for (let j = i + 1; j < cityRoads.length; j++) {
    const a = cityRoads[i],
      b = cityRoads[j];
    const ax = a.to.x - a.from.x,
      az = a.to.z - a.from.z;
    const bx = b.to.x - b.from.x,
      bz = b.to.z - b.from.z;
    const determinant = ax * bz - az * bx;
    if (Math.abs(determinant) > 1e-6) {
      const dx = b.from.x - a.from.x,
        dz = b.from.z - a.from.z;
      const t = (dx * bz - dz * bx) / determinant;
      const u = (dx * az - dz * ax) / determinant;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        const id = node({ x: a.from.x + ax * t, z: a.from.z + az * t });
        splits[i].push(id);
        splits[j].push(id);
      }
    }
    for (const [road, other, first, second] of [
      [a, b, i, j],
      [b, a, j, i],
    ] as const) {
      for (const point of [road.from, road.to]) {
        const closest = project(point, other.from, other.to);
        if (distance(point, closest) < 0.15) {
          const id = node(point);
          splits[first].push(id);
          splits[second].push(id);
        }
      }
    }
  }
for (const [i, list] of splits.entries()) {
  const sorted = [...new Set(list)].sort(
    (a, b) =>
      distance(nodes[a], cityRoads[i].from) -
      distance(nodes[b], cityRoads[i].from),
  );
  splits[i] = sorted;
  sorted.slice(1).forEach((id, j) => {
    const previous = sorted[j],
      length = distance(nodes[id], nodes[previous]);
    nodes[id].edges.set(previous, length);
    nodes[previous].edges.set(id, length);
  });
}
function nearestRoad(p: CityPoint) {
  let best = 0,
    point = project(p, cityRoads[0].from, cityRoads[0].to),
    gap = distance(p, point);
  cityRoads.forEach((r, i) => {
    const at = project(p, r.from, r.to),
      d = distance(p, at);
    if (d < gap) {
      best = i;
      point = at;
      gap = d;
    }
  });
  return { road: best, point };
}
export function cityNavigationRoute(
  start: CityPoint,
  target: CityPoint,
): CityPoint[] {
  const from = nearestRoad(start),
    to = nearestRoad(target);
  if (from.road === to.road) return [start, from.point, to.point, target];
  const costs = nodes.map(() => Infinity),
    previous = nodes.map(() => -1),
    visited = new Set<number>();
  for (const id of splits[from.road])
    costs[id] = distance(from.point, nodes[id]);
  while (visited.size < nodes.length) {
    let next = -1;
    for (let i = 0; i < nodes.length; i++)
      if (!visited.has(i) && (next < 0 || costs[i] < costs[next])) next = i;
    if (next < 0 || !Number.isFinite(costs[next])) break;
    visited.add(next);
    for (const [id, length] of nodes[next].edges)
      if (costs[next] + length < costs[id]) {
        costs[id] = costs[next] + length;
        previous[id] = next;
      }
  }
  const end = splits[to.road].reduce((a, b) =>
    costs[a] + distance(nodes[a], to.point) <
    costs[b] + distance(nodes[b], to.point)
      ? a
      : b,
  );
  if (!Number.isFinite(costs[end])) return [];
  const route: CityPoint[] = [];
  for (let id = end; id >= 0; id = previous[id])
    route.push({ x: nodes[id].x, z: nodes[id].z });
  return [start, from.point, ...route.reverse(), to.point, target].filter(
    (p, i, all) => !i || distance(p, all[i - 1]) > 0.1,
  );
}
export const cityRouteLength = (points: readonly CityPoint[]) =>
  points.slice(1).reduce((sum, p, i) => sum + distance(p, points[i]), 0);
