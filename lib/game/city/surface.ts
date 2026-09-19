import {
  CITY_PARKING,
  cityBuildings,
  cityRoads,
  distanceToRoad,
  inCityWater,
  onCityIsland,
  riverZ,
  type CityPoint,
  type CityRoad,
} from './layout.ts';

export type CitySurfacePose = {
  elevation: number;
  pitch: number;
  roll: number;
  surfaceId: string;
};
export const CITY_DECK_THICKNESS = 0.8;
export const cityRoadLayer = (road: CityRoad): 'ground' | 'lower' | 'raised' =>
  road.layer ?? (road.bridge ? 'raised' : 'ground');
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (v: number) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
const length = (a: CityPoint, b: CityPoint) => Math.hypot(b.x - a.x, b.z - a.z);
function projection(p: CityPoint, a: CityPoint, b: CityPoint) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz));
  return { x: a.x + dx * t, z: a.z + dz * t, t };
}
/** Art-directed relative heights, not surveyed elevations. Western terraces
 * stand above the old centre; the right bank rises behind the waterfront. */
function landHeight(x: number, z: number) {
  if (z < riverZ(x))
    return (
      6 +
      58 * Math.exp(-(((x + 1150) / 650) ** 2) - ((z - 450) / 850) ** 2) +
      5 * Math.exp(-(((x - 700) / 850) ** 2) - ((z + 1150) / 850) ** 2)
    );
  return (
    7 +
    28 * Math.exp(-(((x - 700) / 900) ** 2) - ((z - 900) / 500) ** 2) +
    12 * Math.exp(-(((x + 900) / 800) ** 2) - ((z - 1100) / 550) ** 2)
  );
}
const bridgeGroups = [
  ...new Set(cityRoads.flatMap((r) => (r.bridge ? [r.bridge] : []))),
].map((id) => {
  const roads = cityRoads.filter((r) => r.bridge === id),
    points = [roads[0].from, ...roads.map((r) => r.to)];
  const distances = [0];
  for (let i = 1; i < points.length; i++)
    distances.push(distances[i - 1] + length(points[i - 1], points[i]));
  return { id, roads, points, distances, total: distances.at(-1)! };
});
const bridgeCells = new Map<string, typeof bridgeGroups>();
for (const group of bridgeGroups)
  if (group.id !== 'nikolaevsky')
    for (const r of group.roads) {
      for (
        let ix = Math.floor(
          (Math.min(r.from.x, r.to.x) - r.width / 2 - 100) / 100,
        );
        ix <=
        Math.floor((Math.max(r.from.x, r.to.x) + r.width / 2 + 100) / 100);
        ix++
      )
        for (
          let iz = Math.floor(
            (Math.min(r.from.z, r.to.z) - r.width / 2 - 100) / 100,
          );
          iz <=
          Math.floor((Math.max(r.from.z, r.to.z) + r.width / 2 + 100) / 100);
          iz++
        ) {
          const key = `${ix}:${iz}`,
            list = bridgeCells.get(key) ?? [];
          if (!list.includes(group)) list.push(group);
          bridgeCells.set(key, list);
        }
    }
const nearbyBridges = (x: number, z: number) =>
  bridgeCells.get(`${Math.floor(x / 100)}:${Math.floor(z / 100)}`) ?? [];
function bridgeHeight(id: string, x: number, z: number): number {
  const group = bridgeGroups.find((g) => g.id === id)!;
  let best = Infinity;
  const spanSamples: { distance: number; along: number }[] = [];
  group.roads.forEach((r, i) => {
    const p = projection({ x, z }, r.from, r.to),
      d = length(p, { x, z });
    spanSamples.push({
      distance: d,
      along: group.distances[i] + p.t * length(r.from, r.to),
    });
    if (d < best) {
      best = d;
    }
  });
  const start = group.points[0],
    end = group.points.at(-1)!;
  let a = onCityIsland(start.x, start.z) ? 5 : landHeight(start.x, start.z);
  const b = onCityIsland(end.x, end.z) ? 5 : landHeight(end.x, end.z);
  if (id === 'tatyshev-ramp') a = bridgeHeight('oktyabrsky', start.x, start.z);
  const profile = (along: number) => {
    const t = clamp(along / group.total);
    const deck = a + (b - a) * t + Math.sin(Math.PI * t) * 2;
    if (id === 'nikolaevsky' && group.total - along < 80) {
      const distance = Math.max(0, group.total - along);
      const u = clamp((distance - 6) / 74);
      // First six metres share the approach street's complete cross-section.
      // A Hermite transition then catches the deck with a bounded slope and
      // the same derivative at the far end of the eighty-metre landing.
      const eased = 80 * u * u * (2.075 - 1.075 * u);
      const ground = cityGroundHeight(x, z);
      return ground + (deck - ground) * (distance > 0 ? eased / distance : 0);
    }
    return deck;
  };
  // Blend longitudinal profiles at every bend, including the island turns.
  // A hard nearest segment changes abruptly across its transverse bisector.
  let elevation = 0,
    totalWeight = 0;
  for (const sample of spanSamples) {
    const weight = Math.exp(
      -(sample.distance * sample.distance - best * best) / 64,
    );
    elevation += profile(sample.along) * weight;
    totalWeight += weight;
  }
  return elevation / totalWeight;
}
function naturalHeight(x: number, z: number) {
  if (inCityWater(x, z)) return -3;
  let h = onCityIsland(x, z) ? 5 : landHeight(x, z);
  // Low bridges blend into their islands and shore approaches. Nikолаевский
  // deliberately stays a separate deck over both waterfront roads.
  for (const group of nearbyBridges(x, z)) {
    const d = Math.min(
      ...group.roads.map((r) =>
        Math.max(0, distanceToRoad(x, z, r) - r.width / 2 - 2),
      ),
    );
    if (d < 100)
      h = Math.max(
        h,
        h + (bridgeHeight(group.id, x, z) - h) * (1 - smooth(d / 100)),
      );
  }
  return h;
}
const lowerRoads = cityRoads.filter((r) => r.layer === 'lower');
function trenchDepth(x: number, z: number) {
  const gap = Math.min(
    ...lowerRoads.map((r) =>
      Math.max(0, distanceToRoad(x, z, r) - r.width / 2),
    ),
  );
  return 10 * (1 - smooth(Math.abs(x + 720) / 300)) * (1 - smooth(gap / 140));
}
function unflattenedGround(x: number, z: number) {
  const h = naturalHeight(x, z);
  return inCityWater(x, z) ? h : h - trenchDepth(x, z);
}
// Cached parcel centres keep building foundations level without doing hundreds
// of analytic height evaluations for each road wheel or terrain-grid vertex.
const parcels = [
  ...cityBuildings.map((b) => ({ ...b, blend: 12 })),
  ...CITY_PARKING.map((p) => ({ ...p, blend: 30 })),
].map((p) => ({ ...p, height: unflattenedGround(p.x, p.z) }));
const parcelCells = new Map<string, typeof parcels>();
for (const p of parcels)
  for (
    let x = Math.floor((p.x - p.w / 2 - p.blend) / 100);
    x <= Math.floor((p.x + p.w / 2 + p.blend) / 100);
    x++
  )
    for (
      let z = Math.floor((p.z - p.d / 2 - p.blend) / 100);
      z <= Math.floor((p.z + p.d / 2 + p.blend) / 100);
      z++
    ) {
      const key = `${x}:${z}`,
        list = parcelCells.get(key) ?? [];
      list.push(p);
      parcelCells.set(key, list);
    }
export function cityGroundHeight(x: number, z: number) {
  let h = unflattenedGround(x, z);
  const roadGap = Math.min(
    ...nearbyRoads(x, z).map((r) => distanceToRoad(x, z, r) - r.width / 2),
  );
  for (const p of parcelCells.get(
    `${Math.floor(x / 100)}:${Math.floor(z / 100)}`,
  ) ?? []) {
    const gap = Math.max(
      0,
      Math.abs(x - p.x) - p.w / 2,
      Math.abs(z - p.z) - p.d / 2,
    );
    const blend =
      p.blend === 12 ? Math.min(p.blend, Math.max(0.1, roadGap - 4)) : p.blend;
    if (gap < blend) h += (p.height - h) * (1 - smooth(gap / blend));
  }
  // A level foundation beside an island exit must never lift earth through
  // the bridge deck. Land and deck must meet at the same physical height;
  // visual asphalt offset belongs to the renderer, not the physics surface.
  for (const group of nearbyBridges(x, z)) {
    const gap = Math.min(
      ...group.roads.map((r) =>
        Math.max(0, distanceToRoad(x, z, r) - r.width / 2 - 2),
      ),
    );
    if (gap < 20) {
      const ceiling = bridgeHeight(group.id, x, z);
      if (h > ceiling) h += (ceiling - h) * (1 - smooth(gap / 20));
    }
  }
  return h;
}
const nikoApproach = cityRoads.filter((r) =>
  r.id.startsWith('nikolaevsky-left:'),
);
const approachStart = nikoApproach[0].from,
  approachEnd = nikoApproach.at(-1)!.to;
const approachLength = nikoApproach.reduce(
  (s, r) => s + length(r.from, r.to),
  0,
);
function nikolaevskyHeight(x: number, z: number) {
  let offset = 0,
    approachGap = Infinity;
  const samples = nikoApproach.map((r) => {
    const point = projection({ x, z }, r.from, r.to),
      gap = length(point, { x, z });
    const along = offset + point.t * length(r.from, r.to);
    offset += length(r.from, r.to);
    approachGap = Math.min(approachGap, gap);
    return { along, gap };
  });
  let at = 0,
    total = 0;
  for (const p of samples) {
    const weight = Math.exp(-(p.gap * p.gap - approachGap * approachGap) / 64);
    at += p.along * weight;
    total += weight;
  }
  at /= total;
  const a = cityGroundHeight(approachStart.x, approachStart.z);
  const b = bridgeHeight('nikolaevsky', approachEnd.x, approachEnd.z);
  const approach =
    a +
    (b - a) * smooth(at / approachLength) +
    (cityGroundHeight(x, z) - a) * (1 - smooth(at / 12));
  const span = bridgeGroups.find((g) => g.id === 'nikolaevsky')!;
  const bridgeGap = Math.min(...span.roads.map((r) => distanceToRoad(x, z, r)));
  // A rounded turn's two overlapping deck polygons must describe one surface.
  // Blend the adjoining profiles across their shared corner rather than let
  // renderer/physics choose different heights from equally nearby segments.
  const min = Math.min(approachGap * approachGap, bridgeGap * bridgeGap);
  const wa = Math.exp(-(approachGap * approachGap - min) / 64),
    wb = Math.exp(-(bridgeGap * bridgeGap - min) / 64);
  return (approach * wa + bridgeHeight('nikolaevsky', x, z) * wb) / (wa + wb);
}
export function cityRoadHeight(road: CityRoad, x: number, z: number): number {
  if (road.bridge === 'nikolaevsky' || road.id.startsWith('nikolaevsky-left:'))
    return nikolaevskyHeight(x, z);
  if (road.bridge) return bridgeHeight(road.bridge, x, z);
  return cityGroundHeight(x, z);
}
const roadCells = new Map<string, CityRoad[]>();
for (const r of cityRoads)
  for (
    let x = Math.floor((Math.min(r.from.x, r.to.x) - r.width) / 100);
    x <= Math.floor((Math.max(r.from.x, r.to.x) + r.width) / 100);
    x++
  )
    for (
      let z = Math.floor((Math.min(r.from.z, r.to.z) - r.width) / 100);
      z <= Math.floor((Math.max(r.from.z, r.to.z) + r.width) / 100);
      z++
    ) {
      const key = `${x}:${z}`,
        list = roadCells.get(key) ?? [];
      list.push(r);
      roadCells.set(key, list);
    }
function nearbyRoads(x: number, z: number) {
  return roadCells.get(`${Math.floor(x / 100)}:${Math.floor(z / 100)}`) ?? [];
}
/** Top elevation of the elevated Nikолаевский approach above a lower surface. */
export function cityOverpassClearance(x: number, z: number): number | null {
  let deck: number | null = null;
  for (const r of nearbyRoads(x, z))
    if (
      (r.bridge === 'nikolaevsky' || r.id.startsWith('nikolaevsky-left:')) &&
      distanceToRoad(x, z, r) <= r.width / 2 + 1
    ) {
      const y = cityRoadHeight(r, x, z);
      if (y - cityGroundHeight(x, z) > 3) deck = Math.max(deck ?? -Infinity, y);
    }
  return deck;
}
function selectSurface(
  x: number,
  z: number,
  heading: number,
  previousHeight?: number,
  previousSurfaceId?: string,
) {
  const candidates: {
    road?: CityRoad;
    elevation: number;
    surfaceId: string;
    gap: number;
    endPenalty: number;
  }[] = nearbyRoads(x, z)
    .filter((r) => distanceToRoad(x, z, r) <= r.width / 2 + 0.35)
    .map((r) => {
      const dx = r.to.x - r.from.x,
        dz = r.to.z - r.from.z,
        l = Math.hypot(dx, dz);
      const along = ((x - r.from.x) * dx + (z - r.from.z) * dz) / l;
      return {
        road: r,
        elevation: cityRoadHeight(r, x, z),
        surfaceId: `road:${r.id}`,
        gap: distanceToRoad(x, z, r),
        endPenalty: Math.max(0, -along, along - l) * 2,
      };
    });
  const water = inCityWater(x, z);
  if (!candidates.length || !water)
    candidates.push({
      road: undefined,
      elevation: cityGroundHeight(x, z),
      surfaceId: 'ground',
      gap: candidates.length ? 12 : 0,
      endPenalty: 0,
    });
  // A real road keeps its continuity preference. Bare ground must not keep
  // that bonus underneath a rising deck: otherwise every off-centre entry
  // follows the earth under the bridge even where their heights meet exactly.
  candidates.sort((a, b) => {
    const cost = (v: typeof a) =>
      previousHeight === undefined
        ? v.gap +
          (v.road
            ? Math.abs(
                Math.sin(
                  Math.atan2(
                    v.road.to.x - v.road.from.x,
                    v.road.from.z - v.road.to.z,
                  ) - heading,
                ),
              ) * 0.1
            : 0)
        : Math.abs(v.elevation - previousHeight) +
          v.gap * 0.015 +
          (v.road
            ? Math.abs(
                Math.sin(
                  Math.atan2(
                    v.road.to.x - v.road.from.x,
                    v.road.from.z - v.road.to.z,
                  ) - heading,
                ),
              ) * 0.3
            : 0) -
          (v.road && v.surfaceId === previousSurfaceId ? 0.15 : 0);
    return cost(a) + a.endPenalty - cost(b) - b.endPenalty;
  });
  return candidates[0];
}
export function citySurfacePose(
  x: number,
  z: number,
  heading: number,
  previousHeight?: number,
  previousSurfaceId?: string,
): CitySurfacePose {
  const selected = selectSurface(
      x,
      z,
      heading,
      previousHeight,
      previousSurfaceId,
    ),
    dx = Math.sin(heading) * 1.2,
    dz = -Math.cos(heading) * 1.2;
  const sample = (x: number, z: number) =>
    selected.road
      ? cityRoadHeight(selected.road, x, z)
      : cityGroundHeight(x, z);
  return {
    elevation: selected.elevation,
    pitch: Math.atan2(sample(x + dx, z + dz) - sample(x - dx, z - dz), 2.4),
    roll: 0,
    surfaceId: selected.surfaceId,
  };
}
/** Streets crossing in plan only form a junction when their decks meet. */
export function cityRoadsConnect(
  a: CityRoad,
  b: CityRoad,
  x: number,
  z: number,
) {
  return Math.abs(cityRoadHeight(a, x, z) - cityRoadHeight(b, x, z)) < 1.2;
}
