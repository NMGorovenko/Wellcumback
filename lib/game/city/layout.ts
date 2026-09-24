/** Schematic Krasnoyarsk: relative geography comes from a 40% reference map,
 * then long land journeys and water crossings are compressed independently.
 * Buildings, cars, street widths and junctions keep their physical dimensions. */
export type CityPoint = { x: number; z: number };
export type CityRect = CityPoint & {
  w: number;
  d: number;
  angle?: number;
  roadId?: string;
};
export const CITY_METRE_SCALE = 0.4;
function referenceGeo(lat: number, lon: number): CityPoint {
  return {
    x: (lon - 92.86) * 62250 * CITY_METRE_SCALE,
    z: -(lat - 56.01) * 111320 * CITY_METRE_SCALE,
  };
}
export const CITY_BOUNDS = { minX: -2500, maxX: 1750, minZ: -1750, maxZ: 1650 };
export const CITY_SCENERY_BOUNDS = {
  minX: -2570,
  maxX: 1820,
  minZ: -1820,
  maxZ: 1720,
  maxY: 195,
};
export const RIVER_HALF_WIDTH = 180;
export const RIVER_SLOPE = 0.28;
const REFERENCE_RIVER_SECTIONS = [
  { x: -5000, z: 2000, half: 150 },
  { x: -4000, z: 1630, half: 160 },
  { x: -2600, z: 1260, half: 170 },
  { x: -1500, z: 1080, half: 200 },
  { x: -700, z: 880, half: 250 },
  { x: 0, z: 600, half: 300 },
  { x: 400, z: 555, half: 395 },
  { x: 700, z: 460, half: 430 },
  { x: 1000, z: 165, half: 335 },
  { x: 1400, z: -230, half: 380 },
  { x: 1900, z: -590, half: 540 },
  { x: 2100, z: -755, half: 495 },
  { x: 2800, z: -1215, half: 435 },
  { x: 3200, z: -1390, half: 450 },
  { x: 3500, z: -1520, half: 360 },
];
function sampleRiver(x: number, sections: typeof REFERENCE_RIVER_SECTIONS) {
  let i = 0;
  while (i < sections.length - 2 && x > sections[i + 1].x) i++;
  const a = sections[i],
    b = sections[i + 1],
    t = Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
  return {
    z: a.z + (b.z - a.z) * t,
    half: a.half + (b.half - a.half) * t,
    slope: (b.z - a.z) / (b.x - a.x),
  };
}
/** Convert an old reference-map anchor exactly once. Canonical exports below
 * already contain compact coordinates; never apply this to them again. */
export function compactCityPoint<T extends CityPoint>(p: T): T {
  const river = sampleRiver(p.x, REFERENCE_RIVER_SECTIONS);
  const away = p.z - river.z,
    distance = Math.abs(away);
  return {
    ...p,
    x: p.x * 0.5,
    z:
      river.z * 0.5 +
      Math.sign(away) *
        (Math.min(distance, river.half) * 0.2 +
          Math.max(0, distance - river.half) * 0.6),
  };
}
export const cityGeo = (lat: number, lon: number): CityPoint =>
  compactCityPoint(referenceGeo(lat, lon));
export const RIVER_SECTIONS = REFERENCE_RIVER_SECTIONS.map((p) => ({
  x: p.x * 0.5,
  z: p.z * 0.5,
  half: p.half * 0.2,
}));
const riverSample = (x: number) => sampleRiver(x, RIVER_SECTIONS);
// Splitting at each bank and bend keeps a formerly straight road exactly on the
// same shore after the piecewise projection instead of cutting across water.
export function compactCityPath<T extends CityPoint>(points: T[]): T[] {
  const result: T[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const cuts = [0, 1];
    if (Math.abs(dx) > 1e-8)
      for (const section of REFERENCE_RIVER_SECTIONS) {
        const t = (section.x - a.x) / dx;
        if (t > 0 && t < 1) cuts.push(t);
      }
    cuts.sort((a, b) => a - b);
    const bends = [...cuts];
    for (let j = 1; j < bends.length; j++) {
      const lo = bends[j - 1],
        hi = bends[j];
      const r0 = sampleRiver(a.x + dx * lo, REFERENCE_RIVER_SECTIONS),
        r1 = sampleRiver(a.x + dx * hi, REFERENCE_RIVER_SECTIONS);
      for (const bank of [-1, 1]) {
        const d0 = a.z + dz * lo - r0.z - bank * r0.half,
          d1 = a.z + dz * hi - r1.z - bank * r1.half;
        if (d0 * d1 < 0) cuts.push(lo + ((hi - lo) * d0) / (d0 - d1));
      }
    }
    cuts.sort((a, b) => a - b);
    for (const t of cuts) {
      const p = compactCityPoint({ ...a, x: a.x + dx * t, z: a.z + dz * t });
      if (
        !result.length ||
        Math.hypot(p.x - result.at(-1)!.x, p.z - result.at(-1)!.z) > 0.001
      )
        result.push(p);
    }
  }
  return result;
}
export const riverZ = (x: number) => riverSample(x).z;
export const riverBankZ = (x: number, side: number) =>
  riverSample(x).z + side * riverSample(x).half;
export const riverDistance = (x: number, z: number) =>
  (z - riverZ(x)) / Math.hypot(1, riverSample(x).slope);
export function pointInPolygon(
  x: number,
  z: number,
  points: readonly CityPoint[],
) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a.z > z !== b.z > z &&
      x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}
const referenceIslands = [
  {
    id: 'tatyshev',
    name: 'ТАТЫШЕВ',
    x: 1920,
    z: -480,
    w: 1700,
    d: 480,
    points: [
      { x: 1058, z: -82 },
      { x: 1227, z: -480 },
      { x: 1519, z: -655 },
      { x: 1842, z: -885 },
      { x: 1907, z: -1052 },
      { x: 2013, z: -1147 },
      { x: 2758, z: -1400 },
      { x: 3027, z: -1608 },
      { x: 3200, z: -1375 },
      { x: 3228, z: -1247 },
      { x: 2449, z: -838 },
      { x: 2165, z: -515 },
      { x: 1721, z: -152 },
      { x: 1393, z: -42 },
    ],
  },
  {
    id: 'otdyha',
    name: 'ОСТРОВ ОТДЫХА',
    x: 370,
    z: 650,
    w: 900,
    d: 330,
    points: [
      { x: -50, z: 580 },
      { x: 150, z: 475 },
      { x: 520, z: 440 },
      { x: 850, z: 650 },
      { x: 570, z: 820 },
      { x: 150, z: 790 },
    ],
  },
];
export const CITY_ISLANDS = referenceIslands.map((island) => {
  const points =
    island.id === 'otdyha'
      ? [
          { x: -25, z: 302 },
          { x: 30, z: 255 },
          { x: 90, z: 245 },
          { x: 190, z: 238 },
          { x: 260, z: 243.1 },
          { x: 350, z: 248.9 },
          { x: 425, z: 223.75 },
          { x: 350, z: 286.2 },
          { x: 285, z: 314.35 },
          { x: 200, z: 345 },
          { x: 80, z: 352 },
          { x: 0, z: 308 },
        ]
      : compactCityPath([...island.points, island.points[0]]).slice(0, -1);
  const xs = points.map((p) => p.x),
    zs = points.map((p) => p.z);
  return {
    ...island,
    ...compactCityPoint(island),
    points,
    w: Math.max(...xs) - Math.min(...xs),
    d: Math.max(...zs) - Math.min(...zs),
  };
});
export const onCityIsland = (x: number, z: number) =>
  CITY_ISLANDS.some((i) => pointInPolygon(x, z, i.points));
export const inCityWater = (x: number, z: number, padding = 0) =>
  z > riverBankZ(x, -1) - padding &&
  z < riverBankZ(x, 1) + padding &&
  !onCityIsland(x, z);
export type CityRoad = {
  id: string;
  from: CityPoint;
  to: CityPoint;
  width: number;
  bridge?: string;
  layer?: 'lower' | 'raised';
};
const projectedRoad = (
  id: string,
  points: CityPoint[],
  width: number,
  bridge?: string,
): CityRoad[] =>
  points
    .slice(1)
    .map((to, i) => ({ id: `${id}:${i}`, from: points[i], to, width, bridge }));
const road = (
  id: string,
  points: CityPoint[],
  width: number,
  bridge?: string,
) => projectedRoad(id, compactCityPath(points), width, bridge);
const niko = [
  { x: -1450, z: 760 },
  { x: -1290, z: 1040 },
  { x: -1100, z: 1400 },
];
const kommun = [
  { x: 360, z: 145 },
  { x: 395, z: 535 },
  { x: 560, z: 710 },
  { x: 690, z: 900 },
];
const october = [
  referenceGeo(56.03635, 92.93285),
  { x: 1980, z: -890 },
  { x: 2180, z: -650 },
  referenceGeo(56.0162, 92.9556),
];
const referenceBridges = [
  { id: 'nikolaevsky', title: 'НИКОЛАЕВСКИЙ МОСТ', points: niko },
  { id: 'kommunalny', title: 'КОММУНАЛЬНЫЙ МОСТ', points: kommun },
  { id: 'oktyabrsky', title: 'ОКТЯБРЬСКИЙ МОСТ', points: october },
];
const projectedBridges = referenceBridges.map((b) => ({
  ...b,
  points: compactCityPath(b.points),
}));
const octoberApproach = projectedBridges[2].points;
// Count the water span as bridge; its short dry ramps remain regular streets.
projectedBridges[2].points = octoberApproach.slice(1, -1);
for (const end of [0, projectedBridges[2].points.length - 1]) {
  const p = projectedBridges[2].points[end],
    outside = end === 0 ? octoberApproach[0] : octoberApproach.at(-1)!;
  const dx = outside.x - p.x,
    dz = outside.z - p.z,
    length = Math.hypot(dx, dz);
  projectedBridges[2].points[end] = {
    x: p.x + (dx / length) * 12,
    z: p.z + (dz / length) * 12,
  };
}
export const BRIDGES = projectedBridges.map((b) => ({
  ...b,
  x: b.points[1].x,
  z: b.points[1].z,
  w: 22,
  d: b.points
    .slice(1)
    .reduce(
      (s, p, i) => s + Math.hypot(p.x - b.points[i].x, p.z - b.points[i].z),
      0,
    ),
}));
export const ROUNDABOUT = {
  x: 345,
  z: riverBankZ(345, 1) + 80,
  innerRadius: 26,
  outerRadius: 48,
};
export const CITY_STUD_ROUNDABOUT = {
  x: -720,
  z: 335,
  innerRadius: 16,
  outerRadius: 30,
};
export const CITY_ROUNDABOUTS = [ROUNDABOUT, CITY_STUD_ROUNDABOUT] as const;
export const CITY_BOBROVY_LOG = {
  base: { x: -838, z: 1224 },
  summit: { x: -895, z: 1600 },
};
export const CITY_YENISEY_SIGN = {
  x: -865,
  z: 455,
  width: 64,
  height: 5.2,
  angle: 0.35,
};
const leftQuay = RIVER_SECTIONS.map((p) => ({ x: p.x, z: p.z - p.half - 42 }));
const rightQuay = RIVER_SECTIONS.flatMap((p) =>
  p.x === 350
    ? [
        { x: ROUNDABOUT.x - 70, z: ROUNDABOUT.z + 58 },
        { x: ROUNDABOUT.x + 70, z: ROUNDABOUT.z + 58 },
        { x: ROUNDABOUT.x + 88, z: ROUNDABOUT.z - 50 },
      ]
    : [{ x: p.x, z: p.z + p.half + 42 }],
);
const referenceRoutes = {
  studPlaneta: [
    { x: -1550, z: 790 },
    { x: -1520, z: 740 },
    { x: -1520, z: 280 },
    { x: -1250, z: 160 },
    { x: -780, z: 80 },
    { x: -380, z: -60 },
    { x: 330, z: -100 },
    { x: 920, z: -400 },
    { x: 1100, z: -900 },
    { x: 1100, z: -1760 },
  ],
  western: [
    { x: -1550, z: 790 },
    { x: -1550, z: 850 },
    { x: -1900, z: 870 },
    { x: -2380, z: 910 },
    { x: -3200, z: 1100 },
    { x: -3960, z: 1300 },
    { x: -4650, z: 1640 },
  ],
};
export const CITY_ROUTES = {
  studPlaneta: compactCityPath(referenceRoutes.studPlaneta),
  western: compactCityPath(referenceRoutes.western),
  // A continuous downhill alternative into the centre, through the lower
  // Nikolaevsky passage and along the left-bank embankment.
  studDubrovinsky: [
    compactCityPoint(referenceRoutes.studPlaneta[1]),
    compactCityPoint(referenceRoutes.studPlaneta[0]),
    {
      x: -775,
      z: leftQuay[2].z + ((leftQuay[3].z - leftQuay[2].z) * 525) / 550,
    },
    ...leftQuay.slice(3, 6),
  ],
};
export const cityRoads: CityRoad[] = [
  ...projectedRoad('left-quay', leftQuay, 18),
  ...projectedRoad('right-quay', rightQuay, 18),
  ...road('svobodny-mira-9maya', referenceRoutes.studPlaneta, 20),
  ...road('akadem-udachny', referenceRoutes.western, 17),
  ...projectedRoad(
    'studgorodok-ring',
    Array.from({ length: 33 }, (_, i) => ({
      x: CITY_STUD_ROUNDABOUT.x + 23 * Math.sin((i * Math.PI) / 16),
      z: CITY_STUD_ROUNDABOUT.z + 23 * Math.cos((i * Math.PI) / 16),
    })),
    14,
  ),
  ...projectedRoad(
    'kirenskogo-west',
    [
      { x: -760, z: 335 },
      { x: -743, z: 335 },
    ],
    14,
  ),
  ...projectedRoad(
    'kirenskogo-north',
    [
      { x: -720, z: 312 },
      { x: -760, z: 270 },
    ],
    14,
  ),
  ...projectedRoad(
    'baykitskaya',
    [
      { x: -697, z: 335 },
      { x: -650, z: 255 },
      { x: -550, z: 110 },
    ],
    12,
  ),
  ...projectedRoad(
    'kirenskogo-south',
    [
      { x: -720, z: 358 },
      { x: -735, z: 400 },
      compactCityPoint(referenceRoutes.studPlaneta[1]),
    ],
    14,
  ),
  ...projectedRoad(
    'doner-access',
    [
      { x: -735, z: 400 },
      { x: -677, z: 400 },
    ],
    10,
  ),
  ...BRIDGES.flatMap((b) =>
    projectedRoad(`bridge-${b.id}`, b.points, b.w, b.id),
  ),
  ...projectedRoad(
    'oktyabrsky-left',
    [octoberApproach[0], BRIDGES[2].points[0]],
    22,
  ),
  ...projectedRoad(
    'oktyabrsky-right',
    [BRIDGES[2].points.at(-1)!, octoberApproach.at(-1)!],
    22,
  ),
  ...road('nikolaevsky-left', [{ x: -1550, z: 790 }, niko[0]], 20),
  ...road(
    'nikolaevsky-right',
    [
      niko.at(-1)!,
      { x: -600, z: 1490 },
      { x: 690, z: 1490 },
      { x: 690, z: 987 },
    ],
    20,
  ),
  ...projectedRoad(
    'predmostnaya-ring',
    Array.from({ length: 33 }, (_, i) => ({
      x: ROUNDABOUT.x + 37 * Math.sin((i * Math.PI) / 16),
      z: ROUNDABOUT.z + 37 * Math.cos((i * Math.PI) / 16),
    })),
    16,
  ),
  ...projectedRoad(
    'predmostnaya-north',
    [BRIDGES[1].points.at(-1)!, { x: ROUNDABOUT.x, z: ROUNDABOUT.z - 37 }],
    18,
  ),
  ...road(
    'lenina',
    [
      { x: -1100, z: -230 },
      { x: 0, z: -260 },
      { x: 600, z: -360 },
      { x: 920, z: -400 },
    ],
    16,
  ),
  ...road(
    'karl-marx',
    [
      { x: -780, z: 80 },
      { x: -380, z: 120 },
      { x: 80, z: 140 },
      { x: 360, z: 145 },
    ],
    17,
  ),
  ...projectedRoad(
    'karl-marx-west',
    [
      { x: -550, z: 110 },
      { x: -470, z: 90 },
      { x: -390, z: 56 },
    ],
    17,
  ),
  ...projectedRoad(
    'ada-lebedeva',
    [
      { x: -600, z: -275 },
      { x: -350, z: -260 },
      { x: 0, z: -225 },
      { x: 200, z: -225 },
      { x: 460, z: -250 },
    ],
    12,
  ),
  ...projectedRoad(
    'gorkogo-north',
    [
      { x: -190, z: -244 },
      { x: -190, z: -113.65714285714284 },
    ],
    12,
  ),
  ...projectedRoad(
    'perensona-north',
    [
      { x: 90, z: -225 },
      { x: 90, z: -67.875 },
    ],
    12,
  ),
  ...projectedRoad(
    'ada-east-link',
    [
      { x: 460, z: -250 },
      { x: 460, z: -120.23333333333332 },
    ],
    12,
  ),
  ...road(
    'perensona',
    [
      { x: 180, z: -245 },
      { x: 180, z: -80 },
      { x: 180, z: 170 },
    ],
    14,
  ),
  ...road(
    'veynbauma',
    [
      { x: 360, z: 145 },
      { x: 370, z: 0 },
      { x: 330, z: -100 },
      { x: 330, z: -310 },
    ],
    18,
  ),
  ...road(
    'gorkogo',
    [
      { x: -380, z: -246 },
      { x: -380, z: -60 },
      { x: -380, z: 120 },
      { x: -380, z: 450 },
    ],
    14,
  ),
  ...road(
    'strelka',
    [
      { x: 330, z: -100 },
      { x: 330, z: -150 },
      { x: 800, z: -250 },
      { x: 920, z: -400 },
    ],
    17,
  ),
  ...road(
    'vinogradovsky',
    [
      { x: 800, z: -250 },
      { x: 1170, z: -225 },
      { x: 1410, z: -365 },
    ],
    14,
    'vinogradovsky',
  ),
  ...road(
    'tatyshev-loop',
    [
      { x: 1170, z: -225 },
      { x: 1450, z: -460 },
      { x: 2010, z: -650 },
      { x: 2450, z: -1070 },
      { x: 2990, z: -1390 },
      { x: 3040, z: -1320 },
      { x: 2460, z: -910 },
      { x: 2450, z: -880 },
      { x: 1900, z: -380 },
      { x: 1350, z: -180 },
      { x: 1170, z: -225 },
    ],
    13,
  ),
  ...road(
    'tatyshev-exit',
    [
      { x: 2100, z: -746 },
      { x: 2030, z: -610 },
      { x: 1900, z: -380 },
    ],
    14,
    'tatyshev-ramp',
  ),
  ...projectedRoad(
    'otdyha-loop',
    [
      compactCityPoint({ x: 395, z: 535 }),
      { x: 165, z: 255 },
      { x: 90, z: 259 },
      { x: 35, z: 300 },
      { x: 90, z: 338 },
      { x: 170, z: 333 },
      { x: 200, z: 316 },
      { x: 282.5, z: 296.825 },
      { x: 325, z: 270.75 },
      { x: 280, z: 268.3 },
      { x: 235, z: 264 },
      compactCityPoint({ x: 395, z: 535 }),
    ],
    14,
  ),
  ...road(
    'predmostnaya-east',
    [
      { x: 727, z: 950 },
      { x: 1400, z: 940 },
      { x: 2320, z: 1000 },
      { x: 3100, z: 860 },
    ],
    20,
  ),
  ...road(
    'krasrab',
    [
      { x: 716, z: 924 },
      { x: 1180, z: 520 },
      { x: 1850, z: 170 },
      october.at(-1)!,
      { x: 3100, z: -500 },
    ],
    21,
  ),
  ...road(
    'aprelskaya',
    [
      { x: 2320, z: 1000 },
      { x: 2320, z: 1510 },
      { x: 2850, z: 1620 },
    ],
    16,
  ),
  ...road(
    'belinskogo',
    [
      { x: 920, z: -400 },
      { x: 1020, z: -620 },
      { x: 1280, z: -850 },
      october[0],
    ],
    20,
  ),
  ...road(
    'aviatorov',
    [
      { x: 1100, z: -1760 },
      { x: 1640, z: -1730 },
      { x: 1814, z: -1173 },
    ],
    21,
  ),
  ...road(
    'zheleznyaka',
    [
      { x: 1280, z: -850 },
      october[0],
      { x: 1760, z: -1370 },
      { x: 2300, z: -1760 },
      { x: 3100, z: -2230 },
    ],
    20,
  ),
  ...road(
    'planeta-parking',
    [
      { x: 1100, z: -1760 },
      { x: 1260, z: -1760 },
      { x: 1260, z: -1850 },
    ],
    14,
  ),
  ...road(
    'sfu',
    [
      { x: -1900, z: 830 },
      { x: -2120, z: 350 },
      { x: -2050, z: -20 },
      { x: -1550, z: 280 },
    ],
    18,
  ),
];
// Attach each approach to the intact physical ring rather than shrinking it.
for (const [id, point] of [
  ['nikolaevsky-right', { x: ROUNDABOUT.x, z: ROUNDABOUT.z + 37 }],
  ['predmostnaya-east', { x: ROUNDABOUT.x + 37, z: ROUNDABOUT.z }],
  ['krasrab', { x: ROUNDABOUT.x + 26, z: ROUNDABOUT.z - 26 }],
] as const) {
  const parts = cityRoads.filter((r) => r.id.startsWith(id + ':'));
  if (id === 'nikolaevsky-right') parts.at(-1)!.to = point;
  else parts[0].from = point;
}
for (const r of cityRoads) {
  // The embankment is visibly narrower than the Svobodny/Mira arterial.
  if (/^left-quay:[2-8]$/.test(r.id)) r.width = 16;
  if (r.id === 'left-quay:2' || r.id === 'left-quay:3') r.layer = 'lower';
  if (r.id.startsWith('nikolaevsky-left:') || r.bridge === 'nikolaevsky')
    r.layer = 'raised';
}
// Compressed Sibirskaya approach follows the Bazaikha valley south of the river.
// A compact eastern petal of the north-bank Nikolaevsky interchange. It
// descends around the upper approach and joins Dubrovinskogo underneath it.
cityRoads.push(
  ...projectedRoad(
    'nikolaevsky-quay-loop',
    [
      { x: -760, z: 415.45454545454544 },
      { x: -743, z: 406 },
      { x: -714, z: 401 },
      { x: -690, z: 409 },
      { x: -676, z: 423 },
      { x: -673, z: 438 },
      { x: -685, z: 453 },
      { x: -699, z: 455 },
      { x: -710, z: 447 },
    ],
    11,
  ),
);
const bobrovyJunction = { x: -838, z: 635.44 };
cityRoads.push(
  ...projectedRoad(
    'sibirskaya',
    [
      bobrovyJunction,
      { x: -915, z: 770 },
      { x: -980, z: 925 },
      { x: -965, z: 1060 },
      { x: -905, z: 1160 },
      CITY_BOBROVY_LOG.base,
    ],
    14,
  ),
);
/** Semantic street labels use the actual road axes, never copied map anchors. */
export const CITY_NAMED_STREETS: readonly {
  name: string;
  roadIds: readonly string[];
}[] = [
  {
    name: 'Сибирская',
    roadIds: cityRoads
      .filter((r) => r.id.startsWith('sibirskaya:'))
      .map((r) => r.id),
  },
  {
    name: 'Академика Киренского',
    roadIds: cityRoads
      .filter((r) => r.id.startsWith('kirenskogo-'))
      .map((r) => r.id),
  },
  {
    name: 'Николаевский проспект',
    roadIds: cityRoads
      .filter(
        (r) =>
          r.id.startsWith('nikolaevsky-left:') || r.bridge === 'nikolaevsky',
      )
      .map((r) => r.id),
  },
  {
    name: 'Свердловская',
    roadIds: cityRoads
      .filter(
        (r) => r.id.startsWith('right-quay:') && Number(r.id.split(':')[1]) < 5,
      )
      .map((r) => r.id),
  },
  {
    name: 'Свободный',
    roadIds: cityRoads
      .filter((r) => /^svobodny-mira-9maya:[1-4]$/.test(r.id))
      .map((r) => r.id),
  },
  {
    name: 'Мира',
    roadIds: cityRoads
      .filter((r) => /^svobodny-mira-9maya:(5|6|7|8|9|10|11)$/.test(r.id))
      .map((r) => r.id),
  },
  {
    name: 'Карла Маркса',
    roadIds: cityRoads
      .filter((r) => r.id.startsWith('karl-marx'))
      .map((r) => r.id),
  },
  {
    name: 'Ленина',
    roadIds: cityRoads
      .filter((r) => r.id.startsWith('lenina:'))
      .map((r) => r.id),
  },
  {
    name: 'Ады Лебедевой',
    roadIds: cityRoads
      .filter((r) => r.id.startsWith('ada-lebedeva:'))
      .map((r) => r.id),
  },
  {
    name: 'Дубровинского',
    roadIds: cityRoads
      .filter((r) => /^left-quay:[2-8]$/.test(r.id))
      .map((r) => r.id),
  },
];
export function distanceToRoad(x: number, z: number, r: CityRoad) {
  const dx = r.to.x - r.from.x,
    dz = r.to.z - r.from.z,
    t = Math.max(
      0,
      Math.min(
        1,
        ((x - r.from.x) * dx + (z - r.from.z) * dz) / (dx * dx + dz * dz),
      ),
    );
  return Math.hypot(x - r.from.x - t * dx, z - r.from.z - t * dz);
}

export type CityMission = 'screen' | 'clean' | 'moving' | 'roma2';
export const cityStops: (CityPoint & {
  id: string;
  title: string;
  subtitle: string;
  mission?: CityMission;
  color: string;
})[] = [
  {
    id: 'nikita',
    x: -1550,
    z: 790,
    title: 'У Никиты · Студгородок',
    subtitle: 'Борисова, 30 · левый берег',
    mission: 'screen',
    color: '#d9e89b',
  },
  {
    id: 'yarik',
    x: 2320,
    z: 1510,
    title: 'Старая квартира Ярика',
    subtitle: 'Апрельская, 8 · правый берег',
    mission: 'moving',
    color: '#ffd55e',
  },
  {
    id: 'roma',
    x: -1250,
    z: 160,
    title: 'Главный ЖД вокзал · байки Ромы',
    subtitle: 'Деповская · рядом с военкоматом',
    mission: 'clean',
    color: '#9bc8e8',
  },
  {
    id: 'new-home',
    x: 2850,
    z: 1620,
    title: 'Новый дом Ярика',
    subtitle: 'Сюда везём все сумки',
    color: '#efa990',
  },
  {
    id: 'roma2',
    x: -1210,
    z: 153,
    title: 'Байки Ромы 2',
    subtitle: 'Ещё одна история у вокзала',
    mission: 'roma2',
    color: '#c2caa1',
  },
  {
    id: 'planeta',
    x: 1100,
    z: -1760,
    title: 'ТРЦ «Планета»',
    subtitle: 'Советский · 9 Мая',
    color: '#e2b7d8',
  },
  {
    id: 'komsomoll',
    x: 1020,
    z: -470,
    title: 'ТРЦ «Комсомолл»',
    subtitle: 'Белинского · парковка',
    color: '#eda894',
  },
  {
    id: 'kubatura',
    x: 1910,
    z: -1240,
    title: 'Кубатура',
    subtitle: 'Партизана Железняка · Октябрьский мост',
    color: '#efba82',
  },
  {
    id: 'udachny',
    x: -3960,
    z: 1300,
    title: 'Удачный',
    subtitle: 'За Академгородком · выше по Енисею',
    color: '#a1c9a4',
  },
  {
    id: 'akadem',
    x: -2380,
    z: 910,
    title: 'Академгородок',
    subtitle: 'Сосны над Енисеем',
    color: '#a1c9a4',
  },
  {
    id: 'predmostnaya',
    x: 738,
    z: 950,
    title: 'Предмостная площадь',
    subtitle: 'Правый берег · Коммунальный мост',
    color: '#e8dca7',
  },
  {
    id: 'tatyshev',
    x: 1900,
    z: -380,
    title: 'Татышев',
    subtitle: 'Островной круг',
    color: '#a1c9a4',
  },
  {
    id: 'otdyha',
    x: 220,
    z: 715,
    title: 'Остров Отдыха',
    subtitle: 'Съезд с Коммунального',
    color: '#a1c9a4',
  },
].map((p) => ({
  ...compactCityPoint(p),
  mission: p.mission as CityMission | undefined,
}));

cityStops.push({
  id: 'kvant',
  x: -70,
  z: -125,
  title: 'ТЦ «Квант»',
  subtitle: 'Красной Армии, 10 · центр',
  color: '#a3bed6',
});
cityStops.push({
  id: 'bobrovy-log',
  ...CITY_BOBROVY_LOG.base,
  title: 'Бобровый лог',
  subtitle: 'Сибирская, 92 · горнолыжные склоны',
  color: '#b5d0aa',
});
const predmostnayaStop = cityStops.find((s) => s.id === 'predmostnaya')!;
Object.assign(predmostnayaStop, { x: ROUNDABOUT.x + 48, z: ROUNDABOUT.z });
const islandStop = cityStops.find((s) => s.id === 'otdyha')!;
Object.assign(islandStop, { x: 90, z: 338 });
const spawn = compactCityPoint({ x: -1538, z: 770 });
const spawnTarget = compactCityPoint({ x: -1520, z: 740 });
export const CITY_SPAWN = {
  ...spawn,
  heading: Math.atan2(spawnTarget.x - spawn.x, spawn.z - spawnTarget.z),
};
export const CITY_DISTRICTS = [
  { name: 'ОКТЯБРЬСКИЙ', x: -1900, z: 0 },
  { name: 'ЖЕЛЕЗНОДОРОЖНЫЙ', x: -1100, z: -200 },
  { name: 'ЦЕНТРАЛЬНЫЙ', x: 150, z: -400 },
  { name: 'СОВЕТСКИЙ', x: 1700, z: -2000 },
  { name: 'СВЕРДЛОВСКИЙ', x: -300, z: 1600 },
  { name: 'КИРОВСКИЙ', x: 1550, z: 900 },
  { name: 'ЛЕНИНСКИЙ', x: 2950, z: 100 },
].map((p) => compactCityPoint(p));
export type CityBuilding = CityRect & {
  h: number;
  color: string;
  kind?:
    | 'station'
    | 'university'
    | 'theatre'
    | 'apollo'
    | 'theatre-fountain'
    | 'city-clock'
    | 'borisova'
    | 'orbita'
    | 'doner'
    | 'ikit'
    | 'planeta'
    | 'udachny'
    | 'arena'
    | 'komsomoll'
    | 'museum'
    | 'pushkin'
    | 'kubatura'
    | 'kvant'
    | 'bobrovy-log'
    | 'pho'
    | 'frank'
    | 'fresco';
  style?: 'heritage' | 'panel' | 'tower' | 'cottage';
  lowDetail?: boolean;
  floors?: number;
  district?: string;
  orientation?: 'north-south';
};
const landmark = (
  kind: NonNullable<CityBuilding['kind']>,
  lat: number,
  lon: number,
  w: number,
  d: number,
  h: number,
  color: string,
): CityBuilding => ({ ...cityGeo(lat, lon), w, d, h, color, kind });
export const cityBuildings: CityBuilding[] = [
  { kind: 'orbita', x: -840, z: 430, w: 22, d: 20, h: 56, color: '#d8d8cd' },
  { kind: 'orbita', x: -900, z: 420, w: 25, d: 18, h: 35, color: '#d8d8cd' },
  { kind: 'orbita', x: -920, z: 390, w: 18, d: 18, h: 42, color: '#d8d8cd' },
  { kind: 'doner', x: -677, z: 386, w: 14, d: 8, h: 4.2, color: '#544b3b' },
  {
    kind: 'bobrovy-log',
    x: CITY_BOBROVY_LOG.base.x + 32,
    z: CITY_BOBROVY_LOG.base.z + 41,
    w: 31,
    d: 29,
    h: 11,
    color: '#d7d5c5',
  },
  { kind: 'kvant', x: -70, z: -168, w: 54, d: 32, h: 22, color: '#6592aa' },
  landmark('borisova', 55.992306, 92.795672, 26, 28, 48, '#d8d8cd'),
  landmark('ikit', 55.994336, 92.797027, 48, 18, 13.5, '#d6cfb4'),
  landmark('university', 56.004, 92.772, 35, 21, 7, '#ccb79a'),
  landmark('planeta', 56.050913, 92.904369, 120, 65, 24, '#bd9573'),
  landmark('komsomoll', 56.019849, 92.900873, 90, 40, 23, '#d8d9cf'),
  landmark('kubatura', 56.037233, 92.934533, 70, 38, 18, '#d8d9cf'),
  landmark('pushkin', 56.011344, 92.865642, 25, 15, 7, '#c8bdad'),
  { kind: 'apollo', x: 113, z: 137, w: 2, d: 2, h: 8, color: '#7b817e' },
  {
    kind: 'theatre-fountain',
    x: 105,
    z: 144,
    w: 9.9,
    d: 9.9,
    h: 2.9,
    color: '#7b817e',
  },
  landmark('theatre', 56.008645, 92.868542, 30, 16, 6, '#d4d2b7'),
  landmark('museum', 56.00735, 92.872592, 23, 10, 6, '#ba815b'),
  landmark('frank', 56.011079, 92.856719, 22, 14, 7.8, '#c6a496'),
  landmark('pho', 56.013714, 92.852395, 19, 12, 5.8, '#d7c4a2'),
  landmark('fresco', 56.012043, 92.874562, 19, 14, 6.6, '#ad806b'),
  {
    kind: 'station',
    ...compactCityPoint({ x: -1250, z: 215 }),
    w: 48,
    d: 23,
    h: 10,
    color: '#d6d8b4',
  },
  {
    kind: 'city-clock',
    ...compactCityPoint({ x: 245, z: 90 }),
    w: 8,
    d: 8,
    h: 14,
    color: '#cbb98d',
  },
  {
    kind: 'arena',
    ...compactCityPoint({ x: 330, z: 645 }),
    w: 65,
    d: 38,
    h: 12,
    color: '#aebec1',
  },
  {
    kind: 'udachny',
    ...cityGeo(55.979489, 92.698624),
    w: 12,
    d: 8,
    h: 3.3,
    color: '#c3b192',
  },
];
// Landmarks keep full-sized parcels; move their forecourts as complete nodes
// instead of squeezing a building across the now shorter street network.
for (const [kind, x, z] of [
  ['ikit', -800, 390],
  ['museum', 150, 144],
  ['arena', 110, 300],
  ['planeta', 645, -1005],
  ['komsomoll', 600, -220],
  ['kubatura', 1005, -550],
] as const)
  Object.assign(
    cityBuildings.find((b) => b.kind === kind)!,
    { x, z },
  );
export const CITY_PARKING = [
  { id: 'bobrovy-log', x: -838, z: 1224, w: 68, d: 30 },
  { id: 'kvant', x: -70, z: -125, w: 70, d: 28 },
  { id: 'komsomoll', x: 600, z: -166, w: 130, d: 52 },
  { id: 'kubatura', x: 1010, z: -494, w: 90, d: 62 },
  { id: 'planeta', x: 645, z: -931, w: 165, d: 58 },
];
for (const parking of CITY_PARKING) {
  const stop = cityStops.find((s) => s.id === parking.id)!;
  if (parking.id !== 'planeta')
    Object.assign(stop, { x: parking.x, z: parking.z });
  if (parking.id === 'bobrovy-log') continue;
  const connection =
    parking.id === 'kvant'
      ? { x: -70, z: -103.30909090909091 }
      : parking.id === 'planeta'
        ? CITY_ROUTES.studPlaneta.at(-1)!
        : parking.id === 'komsomoll'
          ? compactCityPoint({ x: 1020, z: -620 })
          : compactCityPoint({ x: 1814, z: -1173 });
  // Each lot has a dry clear lane from a through street; parking details honour
  // this lane in their own collision/decoration exclusions.
  cityRoads.push(
    ...projectedRoad(
      `${parking.id}-forecourt`,
      [
        connection,
        ...(parking.id === 'komsomoll' ? [{ x: 530, z: -166 }] : []),
        { x: parking.x, z: parking.z },
      ],
      14,
    ),
  );
}
export function cityParcelClear(x: number, z: number, w: number, d: number) {
  return (
    !cityRoads.some((r) => {
      const dx = r.to.x - r.from.x,
        dz = r.to.z - r.from.z,
        l = Math.hypot(dx, dz),
        tx = dx / l,
        tz = dz / l,
        a = (x - r.from.x) * tx + (z - r.from.z) * tz,
        c = Math.abs((x - r.from.x) * -tz + (z - r.from.z) * tx);
      return (
        a > -(Math.abs(tx) * w + Math.abs(tz) * d) / 2 &&
        a < l + (Math.abs(tx) * w + Math.abs(tz) * d) / 2 &&
        c < r.width / 2 + (Math.abs(tz) * w + Math.abs(tx) * d) / 2 + 3
      );
    }) &&
    !CITY_PARKING.some(
      (p) =>
        Math.abs(x - p.x) < (w + p.w) / 2 + 4 &&
        Math.abs(z - p.z) < (d + p.d) / 2 + 4,
    ) &&
    ![
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [0, 0],
    ].some(([a, b]) => inCityWater(x + (a * w) / 2, z + (b * d) / 2, 8)) &&
    Math.hypot(x - ROUNDABOUT.x, z - ROUNDABOUT.z) >
      ROUNDABOUT.outerRadius + Math.hypot(w, d) / 2 + 5
  );
}
/** Schematic developed districts: dense blocks, then genuine green gaps between
 * them. These are art-directed neighbourhood envelopes, not cadastral parcels. */
const referenceNeighbourhoods = [
  {
    id: 'centre',
    x: -920,
    z: -520,
    columns: 11,
    rows: 4,
    cell: 100,
    style: 'heritage',
  },
  {
    id: 'stud',
    x: -1850,
    z: 300,
    columns: 4,
    rows: 4,
    cell: 110,
    style: 'panel',
  },
  {
    id: 'railway',
    x: -1350,
    z: -220,
    columns: 4,
    rows: 4,
    cell: 110,
    style: 'panel',
  },
  {
    id: 'akadem',
    x: -2730,
    z: 560,
    columns: 5,
    rows: 2,
    cell: 115,
    style: 'panel',
  },
  {
    id: 'udachny',
    x: -4270,
    z: 1010,
    columns: 7,
    rows: 3,
    cell: 100,
    style: 'cottage',
  },
  {
    id: 'vzletka',
    x: 700,
    z: -2280,
    columns: 8,
    rows: 8,
    cell: 140,
    style: 'tower',
  },
  {
    id: 'green-grove',
    x: 1850,
    z: -2290,
    columns: 7,
    rows: 4,
    cell: 130,
    style: 'panel',
  },
  {
    id: 'sverdlovsk',
    x: -830,
    z: 1550,
    columns: 9,
    rows: 3,
    cell: 130,
    style: 'panel',
  },
  {
    id: 'kirov',
    x: 1100,
    z: 530,
    columns: 8,
    rows: 3,
    cell: 110,
    style: 'panel',
  },
  {
    id: 'leninsky',
    x: 2330,
    z: -150,
    columns: 7,
    rows: 5,
    cell: 130,
    style: 'panel',
  },
  {
    id: 'aprelskaya',
    x: 2240,
    z: 1100,
    columns: 7,
    rows: 4,
    cell: 130,
    style: 'panel',
  },
] as const;
export const CITY_NEIGHBOURHOODS = referenceNeighbourhoods.map((zone) => {
  const centre = compactCityPoint({
    x: zone.x + (zone.columns * zone.cell) / 2,
    z: zone.z + (zone.rows * zone.cell) / 2,
  });
  const columns = Math.max(3, Math.round(zone.columns * 0.6)),
    rows = Math.max(2, Math.round(zone.rows * 0.65));
  return {
    ...zone,
    columns,
    rows,
    x: centre.x - (columns * zone.cell) / 2,
    z: centre.z - (rows * zone.cell) / 2,
  };
});
export const CITY_COURTYARDS: (CityRect & { district: string })[] = [];
const trunkRoads = [...cityRoads];
const nearRectangle = (x: number, z: number, p: CityRect, padding = 0) =>
  Math.abs(x - p.x) < p.w / 2 + padding &&
  Math.abs(z - p.z) < p.d / 2 + padding;
function clearNeighbourhoodStreet(
  from: CityPoint,
  to: CityPoint,
  width: number,
) {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  for (let at = 0; at <= length; at += Math.min(4, length || 1)) {
    const t = at / Math.max(1, length),
      x = from.x + (to.x - from.x) * t,
      z = from.z + (to.z - from.z) * t;
    if (
      inCityWater(x, z, width / 2 + 8) ||
      onCityIsland(x, z) ||
      cityBuildings.some((b) => nearRectangle(x, z, b, width / 2 + 4)) ||
      CITY_PARKING.some((p) => nearRectangle(x, z, p, width / 2 + 2)) ||
      CITY_ROUNDABOUTS.some(
        (ring) => Math.hypot(x - ring.x, z - ring.z) < ring.outerRadius + 8,
      )
    )
      return false;
  }
  return true;
}
// Cross streets turn each developed area into a district of walkable/drivable
// blocks. Segmenting at each junction lets a landmark keep its open forecourt.
for (const zone of CITY_NEIGHBOURHOODS) {
  const width =
    zone.style === 'cottage' ? 9 : zone.style === 'heritage' ? 12 : 13;
  const nodes: CityPoint[] = [];
  for (let col = 0; col <= zone.columns; col++)
    for (let row = 0; row <= zone.rows; row++)
      nodes.push({ x: zone.x + col * zone.cell, z: zone.z + row * zone.cell });
  const streetLine = (points: CityPoint[], id: string) => {
    let start: CityPoint | undefined,
      end: CityPoint | undefined,
      part = 0;
    const flush = () => {
      if (start && end) {
        const roadId = `district-${zone.id}:${id}:${part++}`;
        // Keep the local street grid out of the stacked Nikolaevsky junction.
        // Its real access is Svobodny, not a shortcut across the ramp and quay.
        if (roadId !== 'district-stud:east-west-3:1')
          cityRoads.push({
            id: roadId,
            from: start,
            to:
              roadId === 'district-stud:north-south-2:0'
                ? {
                    ...cityRoads.find((r) => r.id === 'svobodny-mira-9maya:0')!
                      .to,
                  }
                : end,
            width,
          });
      }
      start = end = undefined;
    };
    for (let i = 1; i < points.length; i++) {
      if (clearNeighbourhoodStreet(points[i - 1], points[i], width)) {
        start ??= points[i - 1];
        end = points[i];
      } else flush();
    }
    flush();
  };
  for (let col = 0; col <= zone.columns; col++)
    streetLine(
      Array.from({ length: zone.rows + 1 }, (_, row) => ({
        x: zone.x + col * zone.cell,
        z: zone.z + row * zone.cell,
      })),
      `north-south-${col}`,
    );
  for (let row = 0; row <= zone.rows; row++)
    streetLine(
      Array.from({ length: zone.columns + 1 }, (_, col) => ({
        x: zone.x + col * zone.cell,
        z: zone.z + row * zone.cell,
      })),
      `east-west-${row}`,
    );
  // Each district links back to the existing main network. No isolated decorative
  // road grids, and no accidental new shortcut over the river.
  const links = nodes
    .flatMap((from) =>
      trunkRoads
        .filter((r) => !r.bridge)
        .map((r) => {
          const dx = r.to.x - r.from.x,
            dz = r.to.z - r.from.z;
          const t = Math.max(
            0,
            Math.min(
              1,
              ((from.x - r.from.x) * dx + (from.z - r.from.z) * dz) /
                (dx * dx + dz * dz),
            ),
          );
          const to = { x: r.from.x + t * dx, z: r.from.z + t * dz };
          return { from, to, length: Math.hypot(from.x - to.x, from.z - to.z) };
        }),
    )
    .filter((l) => l.length > 2 && l.length < 350)
    .sort((a, b) => a.length - b.length);
  let joined = 0;
  for (const link of links) {
    if (zone.id === 'stud') break; // Three cross streets already join Svobodny.
    if (clearNeighbourhoodStreet(link.from, link.to, width)) {
      cityRoads.push({
        id: `district-${zone.id}-access:${joined}`,
        from: link.from,
        to: link.to,
        width,
      });
      if (++joined === 2) break;
    }
  }
}
const palette = [
  '#c3b192',
  '#aebec1',
  '#d7c4a2',
  '#b4b8a5',
  '#c6a496',
  '#9eafb9',
];
function addHouse(b: CityBuilding) {
  if (
    !cityParcelClear(b.x, b.z, b.w, b.d) ||
    cityBuildings.some(
      (p) =>
        nearRectangle(b.x, b.z, p, 0) ||
        (Math.abs(b.x - p.x) < (b.w + p.w) / 2 + 3 &&
          Math.abs(b.z - p.z) < (b.d + p.d) / 2 + 3),
    )
  )
    return false;
  cityBuildings.push(b);
  return true;
}
for (const [zi, zone] of CITY_NEIGHBOURHOODS.entries()) {
  for (let col = 0; col < zone.columns; col++)
    for (let row = 0; row < zone.rows; row++) {
      const x = zone.x + (col + 0.5) * zone.cell,
        z = zone.z + (row + 0.5) * zone.cell;
      const seed = zi * 157 + col * 17 + row * 31;
      const courtyard = {
        x,
        z,
        w: zone.cell * 0.31,
        d: zone.cell * 0.31,
        district: zone.id,
      };
      if (
        cityParcelClear(x, z, courtyard.w, courtyard.d) &&
        !cityBuildings.some((b) => nearRectangle(x, z, b, zone.cell * 0.19))
      )
        CITY_COURTYARDS.push(courtyard);
      // Narrow old-city frontage, long Soviet blocks, point towers and pitched
      // cottages produce different silhouettes before any facade colour is read.
      const heritage = zone.style === 'heritage',
        cottage = zone.style === 'cottage';
      const towers = zone.style === 'tower' && (col + row) % 3 !== 0;
      const style: NonNullable<CityBuilding['style']> = towers
        ? 'tower'
        : zone.style === 'tower'
          ? 'panel'
          : zone.style;
      const placements =
        heritage || cottage
          ? [-1, 1].flatMap((side) =>
              [-1, 0, 1].map((slot) => ({
                dx: slot * zone.cell * (heritage ? 0.265 : 0.25),
                dz: side * zone.cell * (heritage ? 0.29 : 0.34),
                vertical: false,
              })),
            )
          : [
              { dx: 0, dz: -zone.cell * 0.33, vertical: false },
              { dx: 0, dz: zone.cell * 0.33, vertical: false },
              { dx: -zone.cell * 0.34, dz: 0, vertical: true },
              { dx: zone.cell * 0.34, dz: 0, vertical: true },
            ];
      placements.forEach((p, i) => {
        const n = seed + i * 11;
        const floors = heritage
          ? 2 + (n % 4)
          : cottage
            ? 1 + (n % 3)
            : towers
              ? 14 + (n % 12)
              : zone.id === 'akadem' || zone.id === 'stud'
                ? [5, 5, 9][n % 3]
                : [5, 5, 9, 9][n % 4];
        const width = heritage
          ? 21 + (n % 4)
          : cottage
            ? 13 + (n % 4)
            : towers
              ? 23 + (n % 6)
              : zone.cell * 0.57;
        const depth = heritage ? 19 : cottage ? 11 : towers ? 24 : 13.5;
        addHouse({
          x: x + p.dx,
          z: z + p.dz,
          w: p.vertical ? depth : width,
          d: p.vertical ? width : depth,
          h: floors * (heritage ? 2.8 : cottage ? 2.6 : 2.7),
          floors,
          style,
          district: zone.id,
          orientation: p.vertical ? 'north-south' : undefined,
          color: palette[n % palette.length],
          lowDetail: true,
        });
      });
    }
}
// Small villages and older blocks punctuate the routes between districts.
// They are deliberately sparse: the dense urban fabric belongs inside quarters.
for (const [ri, r] of trunkRoads.entries()) {
  if (r.bridge || /tatyshev|otdyha|predmostnaya-ring/.test(r.id)) continue;
  const dx = r.to.x - r.from.x,
    dz = r.to.z - r.from.z,
    l = Math.hypot(dx, dz);
  for (let t = 85; t < l - 60; t += 210)
    for (const side of [-1, 1]) {
      const x = r.from.x + (dx * t) / l - (dz / l) * side * (r.width / 2 + 22);
      const z = r.from.z + (dz * t) / l + (dx / l) * side * (r.width / 2 + 22);
      if (
        CITY_NEIGHBOURHOODS.some(
          (a) =>
            x > a.x - 35 &&
            x < a.x + a.columns * a.cell + 35 &&
            z > a.z - 35 &&
            z < a.z + a.rows * a.cell + 35,
        )
      )
        continue;
      const n = ri + Math.floor(t / 210),
        style =
          x < -1550 ? 'cottage' : x < 425 && z < 180 ? 'heritage' : 'panel';
      const floors =
        style === 'cottage'
          ? 1 + (n % 2)
          : style === 'heritage'
            ? 2 + (n % 3)
            : 5;
      addHouse({
        x,
        z,
        w: style === 'panel' ? 42 : 20,
        d: style === 'panel' ? 13 : 12,
        h: floors * 2.7,
        floors,
        style,
        district: 'connecting-streets',
        color: palette[n % palette.length],
        lowDetail: true,
      });
    }
}
