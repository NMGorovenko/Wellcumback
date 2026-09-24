import {
  cityRoadHeight,
  cityRoadsConnect,
  cityGroundHeight,
  cityKubaturaTerraceDistance,
} from './surface.ts';
import {
  CITY_BOUNDS,
  CITY_PARKING,
  cityRoads,
  type CityPoint,
  type CityRoad,
} from './layout.ts';

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

type Node = CityPoint & { elevation: number; edges: Map<number, number> };
const nodes: Node[] = [];
const ids = new Map<string, number[]>();
function node(p: CityPoint, road: CityRoad) {
  const elevation = cityRoadHeight(road, p.x, p.z);
  const key = `${p.x.toFixed(2)}:${p.z.toFixed(2)}`;
  const at = ids.get(key) ?? [];
  const existing = at.find(
    (id) => Math.abs(nodes[id].elevation - elevation) < 1.2,
  );
  if (existing !== undefined) return existing;
  const id = nodes.length;
  nodes.push({ ...p, elevation, edges: new Map() });
  ids.set(key, [...at, id]);
  return id;
}
const splits = cityRoads.map((r) => [node(r.from, r), node(r.to, r)]);
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
        const point = { x: a.from.x + ax * t, z: a.from.z + az * t };
        if (!cityRoadsConnect(a, b, point.x, point.z)) continue;
        const id = node(point, a);
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
        if (
          distance(point, closest) < 0.15 &&
          cityRoadsConnect(road, other, point.x, point.z)
        ) {
          const id = node(point, road);
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
type NavigationPoint = CityPoint & { elevation?: number; surfaceId?: string };
function nearestRoad(p: NavigationPoint) {
  const height = p.elevation ?? cityGroundHeight(p.x, p.z);
  const cost = (road: CityRoad, at: CityPoint) =>
    distance(p, at) + Math.abs(cityRoadHeight(road, at.x, at.z) - height) * 4;
  let best = 0,
    point = project(p, cityRoads[0].from, cityRoads[0].to),
    gap = cost(cityRoads[0], point);
  cityRoads.forEach((r, i) => {
    const at = project(p, r.from, r.to),
      d = cost(r, at);
    if (d < gap) {
      best = i;
      point = at;
      gap = d;
    }
  });
  return { road: best, point };
}
type RouteField = { costs: number[]; next: number[] };
const destinationFields = new Map<string, RouteField>();
// Match the interaction radius; reaching a stop must clear the navigation line.
export const CITY_NAVIGATION_ARRIVAL_RADIUS = 2.8;
function fieldToDestination(to: ReturnType<typeof nearestRoad>): RouteField {
  const key = `${to.road}:${to.point.x.toFixed(3)}:${to.point.z.toFixed(3)}`;
  const cached = destinationFields.get(key);
  if (cached) return cached;
  const costs = nodes.map(() => Infinity),
    previous = nodes.map(() => -1),
    visited = new Set<number>();
  for (const id of splits[to.road]) costs[id] = distance(to.point, nodes[id]);
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
  const field = { costs, next: previous };
  // Destinations are usually the fixed city stops. Bound the cache for callers
  // supplying arbitrary points; the city graph itself is immutable.
  if (destinationFields.size >= 24)
    destinationFields.delete(destinationFields.keys().next().value!);
  destinationFields.set(key, field);
  return field;
}
export function cityNavigationRoute(
  start: NavigationPoint,
  target: NavigationPoint,
): CityPoint[] {
  if (
    distance(start, target) < CITY_NAVIGATION_ARRIVAL_RADIUS &&
    Math.abs(
      (start.elevation ?? cityGroundHeight(start.x, start.z)) -
        (target.elevation ?? cityGroundHeight(target.x, target.z)),
    ) < 1.5
  )
    return [start];
  if (
    CITY_PARKING.some((lot) =>
      [start, target].every(
        (p) =>
          Math.abs(p.x - lot.x) <= lot.w / 2 &&
          Math.abs(p.z - lot.z) <= lot.d / 2 &&
          (lot.id !== 'kubatura' || cityKubaturaTerraceDistance(p.x, p.z) < -1),
      ),
    )
  )
    return [start, target];
  const from = nearestRoad(start),
    to = nearestRoad(target);
  if (from.road === to.road)
    return [start, from.point, to.point, target].filter(
      (p, i, all) => !i || distance(p, all[i - 1]) > 0.1,
    );
  // Cache the expensive reverse shortest-path field by destination, not a
  // rounded car position. The exact car position can now move every frame
  // without snapping GPS to an unrelated nearby street or rebuilding Dijkstra.
  const { costs, next } = fieldToDestination(to);
  const begin = splits[from.road].reduce((a, b) =>
    costs[a] + distance(from.point, nodes[a]) <
    costs[b] + distance(from.point, nodes[b])
      ? a
      : b,
  );
  if (!Number.isFinite(costs[begin])) return [];
  const route: CityPoint[] = [];
  for (let id = begin; id >= 0; id = next[id])
    route.push({ x: nodes[id].x, z: nodes[id].z });
  return [start, from.point, ...route, to.point, target].filter(
    (p, i, all) => !i || distance(p, all[i - 1]) > 0.1,
  );
}
export const cityRouteLength = (points: readonly CityPoint[]) =>
  points.slice(1).reduce((sum, p, i) => sum + distance(p, points[i]), 0);
