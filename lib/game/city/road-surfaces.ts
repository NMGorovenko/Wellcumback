import type { CityPoint, CityRoad } from './layout.ts';

export type RoadPolygon = CityPoint[];
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type Patch = { points: RoadPolygon; bounds: Bounds };
const EPSILON = 1e-7;

function bounds(points: RoadPolygon): Bounds {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxZ: Math.max(...points.map((p) => p.z)),
  };
}
function overlaps(a: Bounds, b: Bounds) {
  return (
    a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ
  );
}
function patch(points: RoadPolygon): Patch {
  return { points, bounds: bounds(points) };
}
export function roadPolygonArea(points: RoadPolygon) {
  return (
    Math.abs(
      points.reduce((sum, p, i) => {
        const q = points[(i + 1) % points.length];
        return sum + p.x * q.z - q.x * p.z;
      }, 0),
    ) / 2
  );
}

/** Every result remains convex, so it can be triangulated with a cheap fan. */
function split(points: RoadPolygon, a: CityPoint, b: CityPoint) {
  const inside: RoadPolygon = [],
    outside: RoadPolygon = [];
  const side = (p: CityPoint) =>
    (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  let previous = points[points.length - 1],
    previousSide = side(previous);
  for (const point of points) {
    const currentSide = side(point);
    if (
      (previousSide > EPSILON && currentSide < -EPSILON) ||
      (previousSide < -EPSILON && currentSide > EPSILON)
    ) {
      const t = previousSide / (previousSide - currentSide);
      const intersection = {
        x: previous.x + (point.x - previous.x) * t,
        z: previous.z + (point.z - previous.z) * t,
      };
      inside.push(intersection);
      outside.push(intersection);
    }
    if (currentSide >= -EPSILON) inside.push(point);
    if (currentSide <= EPSILON) outside.push(point);
    previous = point;
    previousSide = currentSide;
  }
  return [inside, outside].map((polygon) =>
    polygon.length >= 3 && roadPolygonArea(polygon) > EPSILON ? polygon : [],
  );
}
function subtract(subject: Patch, clip: Patch): Patch[] {
  if (!overlaps(subject.bounds, clip.bounds)) return [subject];
  let remaining = subject.points;
  const pieces: Patch[] = [];
  for (let i = 0; i < clip.points.length && remaining.length; i++) {
    const [inside, outside] = split(
      remaining,
      clip.points[i],
      clip.points[(i + 1) % clip.points.length],
    );
    if (outside.length) pieces.push(patch(outside));
    remaining = inside;
  }
  return pieces;
}
function subtractAll(subject: Patch, clips: Patch[]) {
  let pieces = [subject];
  for (const clip of clips) {
    if (!overlaps(subject.bounds, clip.bounds)) continue;
    pieces = pieces.flatMap((piece) => subtract(piece, clip));
    if (!pieces.length) break;
  }
  return pieces;
}

/** Rounded caps agree with distanceToRoad and close both bends and T-junctions. */
function roadOutline(road: CityRoad, extra: number): RoadPolygon {
  const angle = Math.atan2(road.to.z - road.from.z, road.to.x - road.from.x);
  const radius = road.width / 2 + extra;
  return [road.to, road.from].flatMap((point, end) =>
    Array.from({ length: 13 }, (_, i) => {
      const a = angle - Math.PI / 2 + end * Math.PI + (i * Math.PI) / 12;
      return {
        x: point.x + Math.cos(a) * radius,
        z: point.z + Math.sin(a) * radius,
      };
    }),
  );
}

/** Convex footprints for terrain holes. Keep the roundabout disk continuous:
 * its centre island and road ring are both drawn separately from the terrain. */
export function roadSurfaceOutlines(
  roads: readonly CityRoad[],
  roundabout?: CityPoint & { outerRadius: number },
  extra = 0,
): RoadPolygon[] {
  const result = roads
    .filter((road) => !roundabout || !road.id.startsWith('predmostnaya-ring:'))
    .map((road) => roadOutline(road, extra));
  if (roundabout)
    result.push(
      Array.from({ length: 80 }, (_, i) => {
        const angle = (i * Math.PI * 2) / 80;
        return {
          x: roundabout.x + Math.cos(angle) * (roundabout.outerRadius + extra),
          z: roundabout.z + Math.sin(angle) * (roundabout.outerRadius + extra),
        };
      }),
    );
  return result;
}

/** Build once, then carve individual convex terrain cells. Local candidate
 * bins avoid testing every city road for every 8m terrain triangle. */
export function createRoadPolygonSubtractor(
  clips: readonly (readonly CityPoint[])[],
  cell = 64,
) {
  const patches = clips.map((points) => patch([...points]));
  const bins = new Map<string, number[]>();
  function visit(b: Bounds, callback: (key: string) => void) {
    for (let x = Math.floor(b.minX / cell); x <= Math.floor(b.maxX / cell); x++)
      for (
        let z = Math.floor(b.minZ / cell);
        z <= Math.floor(b.maxZ / cell);
        z++
      )
        callback(`${x}:${z}`);
  }
  patches.forEach((p, index) =>
    visit(p.bounds, (key) => {
      const entries = bins.get(key) ?? [];
      entries.push(index);
      bins.set(key, entries);
    }),
  );
  return (points: readonly CityPoint[]): RoadPolygon[] => {
    const subject = patch([...points]);
    const candidates = new Set<number>();
    visit(subject.bounds, (key) => {
      for (const index of bins.get(key) ?? []) {
        if (overlaps(subject.bounds, patches[index].bounds))
          candidates.add(index);
      }
    });
    if (!candidates.size) return [subject.points];
    return subtractAll(
      subject,
      [...candidates].sort((a, b) => a - b).map((i) => patches[i]),
    ).map((p) => p.points);
  };
}

export function subtractRoadPolygons(
  subjects: readonly (readonly CityPoint[])[],
  clips: readonly (readonly CityPoint[])[],
): RoadPolygon[] {
  const subtract = createRoadPolygonSubtractor(clips);
  return subjects.flatMap(subtract);
}

/** A non-overlapping union prevents z-fighting. The curb is the outer union
 * minus ALL asphalt, so it never runs across a turn, junction or ring entrance. */
export function buildRoadSurfaces(
  roads: readonly CityRoad[],
  roundabout?: CityPoint & { outerRadius: number },
) {
  const outlines = (extra: number) =>
    roadSurfaceOutlines(roads, roundabout, extra).map(patch);
  const asphalt = outlines(0),
    outer = outlines(0.65);
  const unite = (polygons: Patch[]) =>
    polygons.flatMap((polygon, i) =>
      subtractAll(polygon, polygons.slice(0, i)),
    );
  return {
    asphalt: unite(asphalt).map((p) => p.points),
    curbs: unite(outer)
      .flatMap((p) => subtractAll(p, asphalt))
      .map((p) => p.points),
  };
}
