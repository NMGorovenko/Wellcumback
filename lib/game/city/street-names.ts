import {
  CITY_NAMED_STREETS,
  cityRoads,
  distanceToRoad,
  type CityPoint,
} from './layout.ts';
import { cityRoadHeight } from './surface.ts';

const namedRoads = CITY_NAMED_STREETS.flatMap((street) =>
  street.roadIds.flatMap((id) => {
    const road = cityRoads.find((r) => r.id === id);
    return road ? [{ road, name: street.name }] : [];
  }),
);

/** A bridge and the quay beneath it need different names at the same x/z. */
export function currentCityStreet(p: CityPoint & { elevation?: number }) {
  let best = 28,
    name = '';
  for (const entry of namedRoads) {
    const gap = Math.max(
      0,
      distanceToRoad(p.x, p.z, entry.road) - entry.road.width / 2,
    );
    if (gap >= best) continue;
    if (
      p.elevation !== undefined &&
      Math.abs(cityRoadHeight(entry.road, p.x, p.z) - p.elevation) > 3
    )
      continue;
    best = gap;
    name = entry.name;
  }
  return name;
}
