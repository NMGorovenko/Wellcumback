import { cityRoads, ROUNDABOUT, type CityPoint } from './layout.ts';

export type CityCrossing = CityPoint & {
  roadId: string;
  width: number;
  depth: number;
  tx: number;
  tz: number;
};

// Crosswalks on local incoming lanes, away from bridge mouths.
const locations: (CityPoint & { roadId: string })[] = cityRoads
  .filter((r) => !r.bridge && !r.id.includes('quay') && !r.id.includes('loop'))
  .flatMap((r) => {
    const dx = r.to.x - r.from.x,
      dz = r.to.z - r.from.z,
      l = Math.hypot(dx, dz);
    return l < 40
      ? []
      : [
          {
            x: r.from.x + (dx / l) * 17,
            z: r.from.z + (dz / l) * 17,
            roadId: r.id,
          },
        ];
  });

/** Crossing the incoming road after the junction, with both ends at its curbs.
 * Omit approaches that end before the crossing or join the roundabout itself. */
export const cityCrossings: CityCrossing[] = locations.flatMap((p) => {
  const road = cityRoads.find((r) => r.id === p.roadId)!;
  const dx = road.to.x - road.from.x,
    dz = road.to.z - road.from.z;
  const length = Math.hypot(dx, dz),
    tx = dx / length,
    tz = dz / length;
  const along = (p.x - road.from.x) * tx + (p.z - road.from.z) * tz;
  if (
    along < 2 ||
    along > length - 2 ||
    Math.hypot(p.x - ROUNDABOUT.x, p.z - ROUNDABOUT.z) <
      ROUNDABOUT.outerRadius + Math.hypot(road.width / 2, 1.5) + 1
  )
    return [];
  return [{ ...p, tx, tz, width: road.width, depth: 3 }];
});

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
      return (
        along < -halfLength ||
        along > length + halfLength ||
        across > r.width / 2 + halfLength
      );
    })
  );
}
