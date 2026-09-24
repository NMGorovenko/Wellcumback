import {
  inKachaWater,
  inKachaCorridor,
  KACHA_HALF_WIDTH,
  KACHA_BANK_WIDTH,
  nearKacha,
  sampleKacha,
} from './kacha.ts';
import { createRoadGrading } from './road-grading.ts';
import { cityNaturalLandHeight } from './terrain.ts';
import {
  CITY_PARKING,
  cityBuildings,
  cityRoads,
  distanceToRoad,
  inCityWater,
  onCityIsland,
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
const landHeight = cityNaturalLandHeight;
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
  if (id === 'nikolaevsky') {
    const entry = cityRoads.find((r) => r.id === 'nikolaevsky-left:0')!.from;
    a = landHeight(entry.x, entry.z);
  }
  const b = onCityIsland(end.x, end.z) ? 5 : landHeight(end.x, end.z);
  if (id === 'tatyshev-ramp') a = bridgeHeight('oktyabrsky', start.x, start.z);
  const profile = (along: number) => {
    const t = clamp(along / group.total);
    const deck = a + (b - a) * t + Math.sin(Math.PI * t) * 2;
    if (id === 'nikolaevsky' && group.total - along < 80) {
      const distance = Math.max(0, group.total - along);
      // First six metres share the approach street's complete cross-section.
      if (distance <= 6) return cityGroundHeight(x, z);
      const last = group.roads.at(-1)!;
      const span = length(last.from, last.to);
      const dx = (last.to.x - last.from.x) / span;
      const dz = (last.to.z - last.from.z) / span;
      const landingX = x + dx * (distance - 6);
      const landingZ = z + dz * (distance - 6);
      const landing = cityGroundHeight(landingX, landingZ);
      const landingSlope =
        (cityGroundHeight(landingX - dx, landingZ - dz) -
          cityGroundHeight(landingX + dx, landingZ + dz)) /
        2;
      const deckT = (group.total - 80) / group.total;
      const farDeck = a + (b - a) * deckT + Math.sin(Math.PI * deckT) * 2;
      const deckSlope =
        -(b - a + 2 * Math.PI * Math.cos(Math.PI * deckT)) / group.total;
      // Interpolate fixed landing and deck tangents. Sampling the ground at
      // every point would imprint unrelated road grading seams on the deck.
      const u = (distance - 6) / 74;
      const u2 = u * u;
      const u3 = u2 * u;
      return (
        (2 * u3 - 3 * u2 + 1) * landing +
        (u3 - 2 * u2 + u) * 74 * landingSlope +
        (-2 * u3 + 3 * u2) * farDeck +
        (u3 - u2) * 74 * deckSlope
      );
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
  if (inKachaWater(x, z)) return sampleKacha(x, z).bedHeight;
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
  if (x < -560) return 0; // The western cliff already has a natural low shelf.
  const gap = Math.min(
    ...lowerRoads.map((r) =>
      Math.max(0, distanceToRoad(x, z, r) - r.width / 2),
    ),
  );
  return 10 * (1 - smooth(Math.abs(x + 720) / 300)) * (1 - smooth(gap / 140));
}
function unflattenedGround(x: number, z: number) {
  const h = naturalHeight(x, z);
  return inCityWater(x, z) ? h : Math.max(0.5, h - trenchDepth(x, z));
}
function kachaRoadMinimum(x: number, z: number) {
  if (!nearKacha(x, z, 125)) return undefined;
  const river = sampleKacha(x, z);
  // Keep the full bank clearance through the crossing, then taper the floor
  // into its approaches. An abrupt corridor cutoff creates a vertical step
  // when an outside lane crosses the boundary between graph samples.
  const floor =
    river.bankHeight +
    0.22 -
    Math.max(0, river.distance - KACHA_HALF_WIDTH - KACHA_BANK_WIDTH - 1) * 0.1;
  // Ordinary land is at least 0.5m, so this cutoff is below its surface.
  return floor > 0 ? floor : undefined;
}
const gradedGround = createRoadGrading(
  cityRoads,
  (x, z) =>
    inKachaCorridor(x, z, 1)
      ? sampleKacha(x, z).bankHeight + 0.22
      : unflattenedGround(x, z),
  kachaRoadMinimum,
);
const kubaturaBuilding = cityBuildings.find((b) => b.kind === 'kubatura')!;
const kubaturaParking = CITY_PARKING.find((p) => p.id === 'kubatura')!;
const kubaturaEntry = cityRoads.find((r) => r.id === 'kubatura-forecourt:0')!;
const kubaturaQuay = cityRoads.find((r) => r.id === 'left-quay:10')!;
const kubaturaBridgeApproach = cityRoads.find(
  (r) => r.id === 'oktyabrsky-left:0',
)!;
// The real parking terrace has a curved retaining edge above a lower drive.
// Cut the compressed lot inland of both the quay and bridge approach so no
// public lane is lifted by a rectangular parking slab. These are artistic metres.
const kubaturaRectangle = [
  {
    x: kubaturaParking.x - kubaturaParking.w / 2 - 2,
    z: kubaturaBuilding.z - kubaturaBuilding.d / 2 - 2,
  },
  {
    x: kubaturaParking.x + kubaturaParking.w / 2 + 2,
    z: kubaturaBuilding.z - kubaturaBuilding.d / 2 - 2,
  },
  {
    x: kubaturaParking.x + kubaturaParking.w / 2 + 2,
    z: kubaturaParking.z + kubaturaParking.d / 2 + 2,
  },
  {
    x: kubaturaParking.x - kubaturaParking.w / 2 - 2,
    z: kubaturaParking.z + kubaturaParking.d / 2 + 2,
  },
];
let clippedKubatura = kubaturaRectangle;
for (const road of [kubaturaQuay, kubaturaBridgeApproach]) {
  const dx = road.to.x - road.from.x,
    dz = road.to.z - road.from.z,
    size = Math.hypot(dx, dz);
  const side = (p: CityPoint) =>
    (dx * (p.z - road.from.z) - dz * (p.x - road.from.x)) / size +
    road.width / 2 +
    3.5;
  const points: CityPoint[] = [];
  for (let i = 0; i < clippedKubatura.length; i++) {
    const a = clippedKubatura[i],
      b = clippedKubatura[(i + 1) % clippedKubatura.length],
      sa = side(a),
      sb = side(b);
    if (sa <= 0) points.push(a);
    if (sa < 0 !== sb < 0) {
      const t = sa / (sa - sb);
      points.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  clippedKubatura = points;
}
const kubaturaOutline = clippedKubatura.flatMap((point, i, points) => {
  const previous = points[(i + points.length - 1) % points.length],
    next = points[(i + 1) % points.length],
    radius = Math.min(4, length(previous, point) / 4, length(point, next) / 4),
    a = {
      x: point.x + ((previous.x - point.x) * radius) / length(previous, point),
      z: point.z + ((previous.z - point.z) * radius) / length(previous, point),
    },
    b = {
      x: point.x + ((next.x - point.x) * radius) / length(next, point),
      z: point.z + ((next.z - point.z) * radius) / length(next, point),
    };
  return Array.from({ length: 5 }, (_, j) => {
    const t = j / 4,
      u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * point.x + t * t * b.x,
      z: u * u * a.z + 2 * u * t * point.z + t * t * b.z,
    };
  });
});
export const CITY_KUBATURA_TERRACE = {
  outline: kubaturaOutline,
  height: unflattenedGround(kubaturaParking.x, kubaturaParking.z) + 4.5,
  rise: 4.5,
  entry: kubaturaEntry,
  arrival: { x: kubaturaParking.x, z: kubaturaParking.z },
};
const kubaturaEdges = kubaturaOutline.map((a, i, points) => {
  const b = points[(i + 1) % points.length],
    l = length(a, b);
  return { x: a.x, z: a.z, nx: (b.z - a.z) / l, nz: -(b.x - a.x) / l };
});
/** Positive outside, negative inside the same convex outline used by rendering. */
export function cityKubaturaTerraceDistance(x: number, z: number) {
  let gap = -Infinity;
  for (const edge of kubaturaEdges)
    gap = Math.max(gap, (x - edge.x) * edge.nx + (z - edge.z) * edge.nz);
  return gap;
}
function kubaturaHeight(x: number, z: number, ground: number) {
  if (
    x < kubaturaEntry.from.x - 16 ||
    x > kubaturaParking.x + kubaturaParking.w / 2 + 8 ||
    z < kubaturaBuilding.z - kubaturaBuilding.d / 2 - 8 ||
    z > kubaturaEntry.from.z + 18
  )
    return ground;
  const gap = cityKubaturaTerraceDistance(x, z),
    weight = 1 - smooth(Math.max(0, gap) / 3);
  let h = ground + (CITY_KUBATURA_TERRACE.height - ground) * weight;
  const point = projection({ x, z }, kubaturaEntry.from, kubaturaEntry.to),
    entryGap = Math.hypot(x - point.x, z - point.z),
    entryLength = length(kubaturaEntry.from, kubaturaEntry.to);
  if (entryGap < kubaturaEntry.width / 2 + 6) {
    // A broad clear mouth shares the junction's height. The continuous ramp
    // reaches the level arrival area without an invisible step at the lot edge.
    const rise = smooth((point.t * entryLength - 12) / (entryLength - 12)),
      ramp = ground + (CITY_KUBATURA_TERRACE.height - ground) * rise;
    h += (ramp - h) * (1 - smooth((entryGap - kubaturaEntry.width / 2) / 6));
  }
  return h;
}
type KubaturaRetainingEdge = {
  p: CityPoint;
  q: CityPoint;
  nx: number;
  nz: number;
  topA: number;
  topB: number;
  lowA: number;
  lowB: number;
};
let kubaturaRetainingEdges: KubaturaRetainingEdge[] | undefined;
/** Shared solid geometry: only exposed front/right edges, with a generous
 * opening around the entry. Lazily sample after the city's height caches exist. */
export function cityKubaturaRetainingEdges() {
  if (kubaturaRetainingEdges) return kubaturaRetainingEdges;
  const edges: KubaturaRetainingEdge[] = [];
  const outline = CITY_KUBATURA_TERRACE.outline;
  const minZ = Math.min(...outline.map((p) => p.z));
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length],
      dx = b.x - a.x,
      dz = b.z - a.z,
      size = Math.hypot(dx, dz),
      nx = dz / size,
      nz = -dx / size;
    if ((a.z + b.z) / 2 < minZ + 4 || nx < -0.3) return;
    const steps = Math.max(1, Math.ceil(size / 3));
    for (let j = 0; j < steps; j++) {
      const p = { x: a.x + (dx * j) / steps, z: a.z + (dz * j) / steps },
        q = {
          x: a.x + (dx * (j + 1)) / steps,
          z: a.z + (dz * (j + 1)) / steps,
        },
        x = (p.x + q.x) / 2,
        z = (p.z + q.z) / 2;
      if (
        distanceToRoad(x, z, kubaturaEntry) < kubaturaEntry.width / 2 + 8 ||
        cityRoads.some((r) => distanceToRoad(x, z, r) < r.width / 2 + 2)
      )
        continue;
      const topA = cityGroundHeight(p.x, p.z),
        topB = cityGroundHeight(q.x, q.z),
        lowA = Math.max(
          topA - 6,
          cityGroundHeight(p.x + nx * 3.5, p.z + nz * 3.5),
        ),
        lowB = Math.max(
          topB - 6,
          cityGroundHeight(q.x + nx * 3.5, q.z + nz * 3.5),
        );
      if (Math.min(topA - lowA, topB - lowB) >= 0.6)
        edges.push({ p, q, nx, nz, topA, topB, lowA, lowB });
    }
  });
  return (kubaturaRetainingEdges = edges);
}
export function cityKubaturaWallBlocked(x: number, z: number, radius: number) {
  if (
    x < kubaturaParking.x - kubaturaParking.w / 2 - 8 ||
    x > kubaturaParking.x + kubaturaParking.w / 2 + 8 ||
    z < kubaturaBuilding.z - kubaturaBuilding.d / 2 - 8 ||
    z > kubaturaParking.z + kubaturaParking.d / 2 + 8
  )
    return false;
  return cityKubaturaRetainingEdges().some(({ p, q, nx, nz }) => {
    const dx = q.x - p.x,
      dz = q.z - p.z,
      size = Math.hypot(dx, dz),
      along = ((x - p.x) * dx + (z - p.z) * dz) / size,
      across = (x - p.x) * nx + (z - p.z) * nz;
    // Circular vehicle probes against the exact 3 m-wide sloped support,
    // including rounded corner contact rather than oversized bounding boxes.
    return (
      Math.hypot(
        Math.max(0, -along, along - size),
        Math.max(0, -across, across - 3),
      ) < radius
    );
  });
}
// Cached parcel centres keep building foundations level without doing hundreds
// of analytic height evaluations for each road wheel or terrain-grid vertex.
const parcels = [
  ...cityBuildings
    .filter((b) => b.kind !== 'kubatura')
    .map((b) => ({ ...b, blend: 12 })),
  ...CITY_PARKING.filter((p) => p.id !== 'kubatura').map((p) => ({
    ...p,
    blend: 30,
  })),
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
const approachOrigin = cityRoads.find(
  (r) => r.id === 'nikolaevsky-left:0',
)!.from;
const approachLevel = landHeight(approachOrigin.x, approachOrigin.z);
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
  const onParcel = (
    parcelCells.get(`${Math.floor(x / 100)}:${Math.floor(z / 100)}`) ?? []
  ).some(
    (p) =>
      p.blend === 12 &&
      Math.abs(x - p.x) <= p.w / 2 &&
      Math.abs(z - p.z) <= p.d / 2,
  );
  if (!onParcel && !inCityWater(x, z)) h = gradedGround(x, z, h);
  // Excavation beneath the upper avenue: its surveyed-style bluff profile
  // must not protrude through a separately levelled viaduct approach.
  // This only removes earth; it never lifts the lower underpass to the deck.
  const approachRoads = nearbyRoads(x, z).filter((r) =>
    r.id.startsWith('nikolaevsky-left:'),
  );
  for (const r of approachRoads) {
    const gap = Math.max(0, distanceToRoad(x, z, r) - r.width / 2 - 2);
    if (gap < 8) {
      const ceiling = approachLevel;
      if (h > ceiling) h += (ceiling - h) * (1 - smooth(gap / 8));
    }
  }
  return kubaturaHeight(x, z, h);
}
const nikoApproach = cityRoads.filter((r) =>
  r.id.startsWith('nikolaevsky-left:'),
);
const approachStart = nikoApproach[0].from,
  approachEnd = nikoApproach.at(-1)!.to;
const junctionStreet = cityRoads.find((r) => r.id === 'baykitskaya:2')!;
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
  const deck =
    (approach * wa + bridgeHeight('nikolaevsky', x, z) * wb) / (wa + wb);
  // The whole starting fork shares Baykitskaya's ground, not just its centre
  // vertex. Continue from the nearest street edge at a bounded grade;
  // the far deck and the actual underpass retain their separate elevations.
  const centre = projection({ x, z }, junctionStreet.from, junctionStreet.to);
  const gap = length(centre, { x, z });
  if (gap <= junctionStreet.width / 2 + 0.75) return cityGroundHeight(x, z);
  const inside = Math.min(
    1,
    (junctionStreet.width / 2 + 0.75) / Math.max(gap, 1e-9),
  );
  const edge = {
    x: centre.x + (x - centre.x) * inside,
    z: centre.z + (z - centre.z) * inside,
  };
  const edgeHeight = cityGroundHeight(edge.x, edge.z);
  const rise = Math.max(0, gap - junctionStreet.width / 2 - 0.75) * 0.14;
  return clamp(deck, edgeHeight - rise, edgeHeight + rise);
}
/** Ground streets keep their engineered road bed across the Kacha channel;
 * terrain itself retains the river bed below the small street bridges. */
export function cityGroundRoadHeight(x: number, z: number): number {
  const ground = cityGroundHeight(x, z);
  return inKachaWater(x, z) ? gradedGround(x, z, ground) : ground;
}
export function cityRoadHeight(road: CityRoad, x: number, z: number): number {
  if (road.bridge === 'nikolaevsky' || road.id.startsWith('nikolaevsky-left:'))
    return nikolaevskyHeight(x, z);
  if (road.bridge) return bridgeHeight(road.bridge, x, z);
  return cityGroundRoadHeight(x, z);
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
    // Rounded segment caps are real road surface. With a known elevation,
    // an endpoint preference must never outweigh several metres of vertical
    // separation and select the earth underneath an adjoining deck corner.
    const endCost = (v: typeof a) =>
      previousHeight === undefined
        ? v.endPenalty
        : Math.min(v.endPenalty, 0.25);
    return cost(a) + endCost(a) - cost(b) - endCost(b);
  });
  return candidates[0];
}
/** Height-only sampling avoids calculating wheel pitch for camera clearance. */
export function citySurfaceHeight(
  x: number,
  z: number,
  heading: number,
  previousHeight?: number,
  previousSurfaceId?: string,
) {
  return selectSurface(x, z, heading, previousHeight, previousSurfaceId)
    .elevation;
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
