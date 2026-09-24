import { cityRoads, type CityRoad } from './layout.ts';
import {
  kachaBankRails,
  kachaBridgeRails,
  kachaRoadCrossings,
} from './kacha.ts';

/** Keep original street IDs and junctions: these are short spans within streets. */
export const CITY_KACHA_CROSSINGS = kachaRoadCrossings(cityRoads);
const byRoad = new Map<string, typeof CITY_KACHA_CROSSINGS>();
for (const span of CITY_KACHA_CROSSINGS) {
  const spans = byRoad.get(span.road.id) ?? [];
  spans.push(span);
  byRoad.set(span.road.id, spans);
}
export function onKachaStreetDeck(road: CityRoad, x: number, z: number) {
  return (byRoad.get(road.id) ?? []).some((p) => {
    const along = (x - p.x) * p.nz - (z - p.z) * p.nx;
    const lateral = (x - p.x) * p.nx + (z - p.z) * p.nz;
    return (
      Math.abs(along) <= p.halfLength + 2 && Math.abs(lateral) <= road.width / 2
    );
  });
}

type Guard = {
  from: { x: number; z: number };
  to: { x: number; z: number };
  fromHeight?: number;
  toHeight?: number;
  road?: CityRoad;
};
const roadById = new Map(cityRoads.map((road) => [road.id, road]));
const guards: Guard[] = [
  ...kachaBankRails(cityRoads),
  ...kachaBridgeRails(cityRoads).map((rail) => ({
    ...rail,
    road: roadById.get(rail.road.id)!,
  })),
];
const GUARD_CELL = 32;
const guardGrid = new Map<string, Guard[]>();
for (const guard of guards) {
  for (
    let gx = Math.floor(Math.min(guard.from.x, guard.to.x) / GUARD_CELL);
    gx <= Math.floor(Math.max(guard.from.x, guard.to.x) / GUARD_CELL);
    gx++
  ) {
    for (
      let gz = Math.floor(Math.min(guard.from.z, guard.to.z) / GUARD_CELL);
      gz <= Math.floor(Math.max(guard.from.z, guard.to.z) / GUARD_CELL);
      gz++
    ) {
      const key = `${gx}:${gz}`,
        list = guardGrid.get(key) ?? [];
      list.push(guard);
      guardGrid.set(key, list);
    }
  }
}

/** These permanent guards share the renderer's exact intervals and remain
 * separate from destructible city barriers. Elevation distinguishes bank and
 * bridge levels; roadHeight is injected to avoid a surface/layout import cycle. */
export function cityKachaRailBlocked(
  x: number,
  z: number,
  elevation: number | undefined,
  radius: number,
  roadHeight: (road: CityRoad, x: number, z: number) => number,
) {
  const reach = Math.max(0, radius) + 0.06;
  for (
    let gx = Math.floor((x - reach) / GUARD_CELL);
    gx <= Math.floor((x + reach) / GUARD_CELL);
    gx++
  ) {
    for (
      let gz = Math.floor((z - reach) / GUARD_CELL);
      gz <= Math.floor((z + reach) / GUARD_CELL);
      gz++
    ) {
      for (const guard of guardGrid.get(`${gx}:${gz}`) ?? []) {
        const dx = guard.to.x - guard.from.x,
          dz = guard.to.z - guard.from.z;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((x - guard.from.x) * dx + (z - guard.from.z) * dz) /
              (dx * dx + dz * dz || 1),
          ),
        );
        const px = guard.from.x + dx * t,
          pz = guard.from.z + dz * t;
        if ((x - px) ** 2 + (z - pz) ** 2 > reach ** 2) continue;
        const height = guard.road
          ? roadHeight(guard.road, px, pz)
          : guard.fromHeight! + (guard.toHeight! - guard.fromHeight!) * t;
        if (
          elevation !== undefined &&
          (elevation < height - 1.3 || elevation > height + 1.1)
        )
          continue;
        return true;
      }
    }
  }
  return false;
}
