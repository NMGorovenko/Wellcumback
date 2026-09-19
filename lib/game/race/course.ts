import {
  nordschleifeArcadePoints,
  NORDSCHLEIFE_GAME_HALF_WIDTH,
} from './nordschleife-arcade.ts';
export type TrackId = 'krasnoyarsk' | 'nordschleife';
export type TrackPoint = { x: number; z: number; y: number; name?: string };
export type Gate = TrackPoint & {
  dx: number;
  dz: number;
  halfWidth: number;
  distance: number;
};
export type TrackSample = TrackPoint & {
  dx: number;
  dz: number;
  distance: number;
  lateral: number;
};
export type Course = {
  id: TrackId;
  name: string;
  points: TrackPoint[];
  gates: Gate[];
  length: number;
  halfWidth: number;
  distances: number[];
  sample: (distance: number) => TrackSample;
  closest: (x: number, z: number) => TrackSample;
};
const modulo = (v: number, length: number) => ((v % length) + length) % length;
export const NORDSCHLEIFE_VERGE = 1.2;
export const raceBoundaryHalfWidth = (
  course: Pick<Course, 'id' | 'halfWidth'>,
) => course.halfWidth + (course.id === 'nordschleife' ? NORDSCHLEIFE_VERGE : 0);
/** Metric, closed polyline. No spline overshoot across hairpins or road barriers. */
export function makeCourse(
  id: TrackId,
  name: string,
  source: TrackPoint[],
  halfWidth: number,
  gateDistances?: number[],
): Course {
  const points = source.map((p) => ({ ...p }));
  if (
    Math.hypot(points[0].x - points.at(-1)!.x, points[0].z - points.at(-1)!.z) >
    0.001
  )
    points.push({ ...points[0] });
  const distances = [0];
  const grid = new Map<string, number[]>();
  const cell = 40;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1];
    distances.push(distances[i] + Math.hypot(b.x - a.x, b.z - a.z, b.y - a.y));
    for (
      let x = Math.floor(Math.min(a.x, b.x) / cell) - 1;
      x <= Math.floor(Math.max(a.x, b.x) / cell) + 1;
      x++
    )
      for (
        let z = Math.floor(Math.min(a.z, b.z) / cell) - 1;
        z <= Math.floor(Math.max(a.z, b.z) / cell) + 1;
        z++
      ) {
        const key = `${x},${z}`;
        const ids = grid.get(key) ?? [];
        ids.push(i);
        grid.set(key, ids);
      }
  }
  const length = distances.at(-1)!;
  const at = (i: number, t: number, lateral = 0): TrackSample => {
    const a = points[i],
      b = points[i + 1],
      planar = Math.hypot(b.x - a.x, b.z - a.z);
    return {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      y: a.y + (b.y - a.y) * t,
      dx: (b.x - a.x) / planar,
      dz: (b.z - a.z) / planar,
      distance: distances[i] + (distances[i + 1] - distances[i]) * t,
      lateral,
      name: a.name,
    };
  };
  const sample = (distance: number) => {
    const d = modulo(distance, length);
    let lo = 0,
      hi = points.length - 2;
    while (lo < hi) {
      const m = Math.ceil((lo + hi) / 2);
      if (distances[m] <= d) lo = m;
      else hi = m - 1;
    }
    return at(lo, (d - distances[lo]) / (distances[lo + 1] - distances[lo]));
  };
  const closest = (x: number, z: number): TrackSample => {
    const candidates =
      grid.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ??
      points.slice(1).map((_, i) => i);
    let best = Infinity,
      result = sample(0);
    for (const i of candidates) {
      const a = points[i],
        b = points[i + 1],
        dx = b.x - a.x,
        dz = b.z - a.z;
      const t = Math.max(
        0,
        Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)),
      );
      const px = a.x + dx * t,
        pz = a.z + dz * t,
        d = Math.hypot(x - px, z - pz);
      if (d < best) {
        best = d;
        result = at(i, t, d);
      }
    }
    return result;
  };
  const checkpoints =
    gateDistances ??
    Array.from(
      { length: Math.ceil(length / 250) },
      (_, i) => (i * length) / Math.ceil(length / 250),
    );
  return {
    id,
    name,
    points,
    length,
    halfWidth,
    distances,
    sample,
    closest,
    gates: checkpoints.map((d) => ({
      ...sample(d),
      halfWidth: raceBoundaryHalfWidth({ id, halfWidth }),
      distance: d,
    })),
  };
}
// Keep three laps below the ten-minute limit without enlarging the free-roam
// route. The start/finish lies on Mira's straight, clear of the starting grid.
// Return along Lenina to its actual intersection with Gorkogo, staying on road.
export const krasnoyarskCourse = makeCourse(
  'krasnoyarsk',
  'Красноярск',
  [
    { x: 0, z: -60 - (40 * 380) / 710, y: 0, name: 'Мира' },
    { x: 330, z: -100, y: 0, name: 'Вейнбаума' },
    { x: 330, z: -150, y: 0, name: 'Стрелка' },
    { x: 800, z: -250, y: 0, name: 'Стрелка' },
    { x: 920, z: -400, y: 0, name: 'Ленина' },
    { x: 600, z: -360, y: 0, name: 'Ленина' },
    { x: 0, z: -260, y: 0, name: 'Ленина' },
    { x: -380, z: -230 - (30 * 720) / 1100, y: 0, name: 'Горького' },
    { x: -380, z: -60, y: 0, name: 'Мира' },
  ],
  6,
);
export function crossedGate(
  from: { x: number; z: number },
  to: { x: number; z: number },
  gate: Gate,
) {
  const before = (from.x - gate.x) * gate.dx + (from.z - gate.z) * gate.dz;
  const after = (to.x - gate.x) * gate.dx + (to.z - gate.z) * gate.dz;
  if (before >= 0 || after < 0 || after - before < 1e-8) return false;
  const t = -before / (after - before),
    x = from.x + (to.x - from.x) * t - gate.x,
    z = from.z + (to.z - from.z) * t - gate.z;
  return Math.abs(x * -gate.dz + z * gate.dx) <= gate.halfWidth;
}

/** Compressed Nordschleife: retain topology/elevation character, shorten party races.
 * Around Karussell the two branches are spread apart so full-size cars fit. */
export const NORDSCHLEIFE_SCALE = 0.18;
export const nordschleifeCourse = makeCourse(
  'nordschleife',
  'Nordschleife',
  nordschleifeArcadePoints.map(([x, z, y, name]) => ({ x, z, y, name })),
  NORDSCHLEIFE_GAME_HALF_WIDTH,
);
export const raceCourse = (id: TrackId) =>
  id === 'nordschleife' ? nordschleifeCourse : krasnoyarskCourse;
