import { cityRoadsConnect } from './surface.ts';
import {
  cityRoads,
  ROUNDABOUT,
  distanceToRoad,
  type CityPoint,
  type CityRoad,
} from './layout.ts';

export type CityCrossing = CityPoint & {
  roadId: string;
  width: number;
  depth: number;
  tx: number;
  tz: number;
  junctionId: string;
  direction: number;
  signal: 'caution' | null;
};

const frame = (road: CityRoad) => {
  const length = Math.hypot(road.to.x - road.from.x, road.to.z - road.from.z);
  return {
    road,
    length,
    tx: (road.to.x - road.from.x) / length,
    tz: (road.to.z - road.from.z) / length,
  };
};
type Arm = ReturnType<typeof frame> & { direction: number; along: number };
export type RoadJunction = CityPoint & { id: string; arms: Arm[] };

/** Find actual three/four-way junctions, including intersections in the middle
 * of a polyline segment. Two joined segments alone are just a bend. */
export function buildRoadJunctions(roads: readonly CityRoad[]): RoadJunction[] {
  const eligible = roads
    .filter((r) => !r.bridge && !/quay|loop|ring/.test(r.id))
    .map(frame);
  const points: (CityPoint & { reference: CityRoad })[] = [];
  for (let i = 0; i < eligible.length; i++) {
    const a = eligible[i];
    for (const b of eligible.slice(i + 1)) {
      const cross = a.tx * b.tz - a.tz * b.tx;
      if (Math.abs(cross) < 0.3) continue;
      const dx = b.road.from.x - a.road.from.x,
        dz = b.road.from.z - a.road.from.z;
      const alongA = (dx * b.tz - dz * b.tx) / cross;
      const alongB = (dx * a.tz - dz * a.tx) / cross;
      if (
        alongA < -3 ||
        alongA > a.length + 3 ||
        alongB < -3 ||
        alongB > b.length + 3
      )
        continue;
      const point = {
        x: a.road.from.x + a.tx * alongA,
        z: a.road.from.z + a.tz * alongA,
      };
      if (!cityRoadsConnect(a.road, b.road, point.x, point.z)) continue;
      if (!points.some((p) => Math.hypot(p.x - point.x, p.z - point.z) < 5))
        points.push({ ...point, reference: a.road });
    }
  }
  return points.flatMap((point) => {
    const arms: Arm[] = [];
    for (const f of [...eligible].sort((a, b) => b.road.width - a.road.width)) {
      if (
        distanceToRoad(point.x, point.z, f.road) > 3.1 ||
        !cityRoadsConnect(point.reference, f.road, point.x, point.z)
      )
        continue;
      const along =
        (point.x - f.road.from.x) * f.tx + (point.z - f.road.from.z) * f.tz;
      for (const direction of [-1, 1]) {
        if ((direction < 0 ? along : f.length - along) < 9) continue;
        if (
          arms.some(
            (arm) =>
              direction * arm.direction * (f.tx * arm.tx + f.tz * arm.tz) >
              0.94,
          )
        )
          continue;
        arms.push({ ...f, along, direction });
      }
    }
    return arms.length >= 3
      ? [{ ...point, id: `${point.x.toFixed(2)}:${point.z.toFixed(2)}`, arms }]
      : [];
  });
}

/** Crossings sit on approaches, beyond the full intersection footprint. Small
 * residential lanes remain unmarked; signals belong only to arterial nodes. */
export function buildCityCrossings(
  roads: readonly CityRoad[],
  roundabout?: CityPoint & { outerRadius: number },
): CityCrossing[] {
  const crossings: CityCrossing[] = [];
  for (const junction of buildRoadJunctions(roads)) {
    const major = junction.arms[0];
    if (major.road.width < 14) continue;
    const signalized =
      major.road.width >= 16 &&
      junction.arms.some(
        (a) =>
          a.road.width >= 14 &&
          Math.abs(a.tx * major.tx + a.tz * major.tz) < 0.7,
      );
    for (const arm of junction.arms) {
      const { road, length, tx, tz, direction } = arm;
      // The clearance check also handles skew intersections and nearby parallel
      // lanes, rather than assuming that every corner is a right angle.
      for (
        let offset =
          Math.max(...junction.arms.map((a) => a.road.width)) / 2 + 4;
        offset <= 36;
        offset += 2
      ) {
        const along = arm.along + direction * offset;
        if (along < 3 || along > length - 3) break;
        const c: CityCrossing = {
          x: road.from.x + tx * along,
          z: road.from.z + tz * along,
          roadId: road.id,
          width: road.width,
          depth: 3,
          tx,
          tz,
          junctionId: junction.id,
          direction,
          // There is no traffic-phase simulation. A flashing amber head
          // warns about the junction without promising a green light later.
          signal: signalized ? 'caution' : null,
        };
        const corners = [-1, 1].flatMap((side) =>
          [-1, 1].map((end) => ({
            x: c.x + end * tx * 1.5 - side * tz * (c.width / 2 + 1.7),
            z: c.z + end * tz * 1.5 + side * tx * (c.width / 2 + 1.7),
          })),
        );
        if (
          roundabout &&
          Math.hypot(c.x - roundabout.x, c.z - roundabout.z) <
            roundabout.outerRadius + Math.hypot(c.width / 2 + 2, 2)
        )
          continue;
        if (
          roads.some(
            (other) =>
              other.id !== road.id &&
              cityRoadsConnect(road, other, c.x, c.z) &&
              corners.some(
                (p) => distanceToRoad(p.x, p.z, other) < other.width / 2 + 0.4,
              ),
          )
        )
          continue;
        if (
          crossings.some(
            (existing) => Math.hypot(existing.x - c.x, existing.z - c.z) < 10,
          )
        )
          break;
        crossings.push(c);
        break;
      }
    }
  }
  return crossings;
}

export const cityCrossings = buildCityCrossings(cityRoads, ROUNDABOUT);

export function crossingContains(
  c: CityCrossing,
  x: number,
  z: number,
  padding = 0,
) {
  const dx = x - c.x,
    dz = z - c.z;
  return (
    Math.abs(dx * c.tx + dz * c.tz) <= c.depth / 2 + padding &&
    Math.abs(-dx * c.tz + dz * c.tx) <= c.width / 2 + padding
  );
}

export function roadDashClear(
  roadId: string,
  x: number,
  z: number,
  halfLength = 1.15,
) {
  const own = cityRoads.find((road) => road.id === roadId);
  return (
    !cityCrossings.some((c) => crossingContains(c, x, z, halfLength)) &&
    cityRoads.every((r) => {
      if (r.id === roadId) return true;
      const dx = r.to.x - r.from.x,
        dz = r.to.z - r.from.z;
      const length = Math.hypot(dx, dz);
      const along = ((x - r.from.x) * dx + (z - r.from.z) * dz) / length;
      const across =
        Math.abs(-(x - r.from.x) * dz + (z - r.from.z) * dx) / length;
      const outside =
        along < -halfLength ||
        along > length + halfLength ||
        across > r.width / 2 + halfLength;
      // Most roads are kilometres away. Evaluate their height only when a
      // footprint actually overlaps this dash; raised decks still stay distinct.
      return outside || (!!own && !cityRoadsConnect(own, r, x, z));
    })
  );
}
