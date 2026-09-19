/** Real relative geography projected into a 40%-scale driving world.
 * Landmarks retain their relative banks and neighbourhoods; local lanes and
 * island driving permissions are deliberately simplified for this arcade game. */
export type CityPoint = { x: number; z: number };
export type CityRect = CityPoint & { w: number; d: number; angle?: number };
export const CITY_METRE_SCALE = 0.4;
export function cityGeo(lat: number, lon: number): CityPoint {
  return {
    x: (lon - 92.86) * 62250 * CITY_METRE_SCALE,
    z: -(lat - 56.01) * 111320 * CITY_METRE_SCALE,
  };
}
export const CITY_BOUNDS = { minX: -5000, maxX: 3500, minZ: -2900, maxZ: 2300 };
export const CITY_SCENERY_BOUNDS = {
  minX: -5100,
  maxX: 3600,
  minZ: -3020,
  maxZ: 2470,
  maxY: 115,
};
export const RIVER_HALF_WIDTH = 180;
export const RIVER_SLOPE = 0.28;
export const RIVER_SECTIONS = [
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
function riverSample(x: number) {
  let i = 0;
  while (i < RIVER_SECTIONS.length - 2 && x > RIVER_SECTIONS[i + 1].x) i++;
  const a = RIVER_SECTIONS[i],
    b = RIVER_SECTIONS[i + 1],
    t = Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
  return {
    z: a.z + (b.z - a.z) * t,
    half: a.half + (b.half - a.half) * t,
    slope: (b.z - a.z) / (b.x - a.x),
  };
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
export const CITY_ISLANDS = [
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
};
const road = (
  id: string,
  points: CityPoint[],
  width: number,
  bridge?: string,
): CityRoad[] =>
  points
    .slice(1)
    .map((to, i) => ({ id: `${id}:${i}`, from: points[i], to, width, bridge }));
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
  cityGeo(56.03635, 92.93285),
  { x: 1980, z: -890 },
  { x: 2180, z: -650 },
  cityGeo(56.0162, 92.9556),
];
export const BRIDGES = [
  { id: 'nikolaevsky', title: 'НИКОЛАЕВСКИЙ МОСТ', points: niko },
  { id: 'kommunalny', title: 'КОММУНАЛЬНЫЙ МОСТ', points: kommun },
  { id: 'oktyabrsky', title: 'ОКТЯБРЬСКИЙ МОСТ', points: october },
].map((b) => ({
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
export const ROUNDABOUT = { x: 690, z: 950, innerRadius: 26, outerRadius: 48 };
const leftQuay = RIVER_SECTIONS.map((p) => ({ x: p.x, z: p.z - p.half - 42 }));
const rightQuay = RIVER_SECTIONS.flatMap((p) =>
  p.x === 700
    ? [
        { x: 630, z: 1007 },
        { x: 750, z: 1007 },
        { x: 770, z: 900 },
      ]
    : [{ x: p.x, z: p.z + p.half + 42 }],
);
export const CITY_ROUTES = {
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
export const cityRoads: CityRoad[] = [
  ...road('left-quay', leftQuay, 18),
  ...road('right-quay', rightQuay, 18),
  ...road('svobodny-mira-9maya', CITY_ROUTES.studPlaneta, 20),
  ...road('akadem-udachny', CITY_ROUTES.western, 17),
  ...BRIDGES.flatMap((b) => road(`bridge-${b.id}`, b.points, b.w, b.id)),
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
  ...road(
    'predmostnaya-ring',
    Array.from({ length: 33 }, (_, i) => ({
      x: 690 + 37 * Math.sin((i * Math.PI) / 16),
      z: 950 + 37 * Math.cos((i * Math.PI) / 16),
    })),
    16,
  ),
  ...road(
    'predmostnaya-north',
    [
      { x: 690, z: 900 },
      { x: 690, z: 913 },
    ],
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
  ...road(
    'otdyha-loop',
    [
      { x: 395, z: 535 },
      { x: 170, z: 565 },
      { x: 80, z: 620 },
      { x: 220, z: 715 },
      { x: 565, z: 730 },
      { x: 650, z: 640 },
      { x: 560, z: 585 },
      { x: 395, z: 535 },
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
export const cityBarriers: CityRect[] = cityRoads
  .filter(
    (r) => r.bridge && !['vinogradovsky', 'tatyshev-ramp'].includes(r.bridge),
  )
  .flatMap((r) => {
    const dx = r.to.x - r.from.x,
      dz = r.to.z - r.from.z,
      l = Math.hypot(dx, dz),
      pieces: CityRect[] = [];
    for (let t = 9; t < l - 9; t += 12)
      for (const side of [-1, 1]) {
        const x =
            r.from.x + (dx * t) / l - ((side * dz) / l) * (r.width / 2 + 0.4),
          z = r.from.z + (dz * t) / l + ((side * dx) / l) * (r.width / 2 + 0.4);
        if (
          cityRoads.some(
            (other) =>
              other !== r && distanceToRoad(x, z, other) < other.width / 2 + 8,
          )
        )
          continue;
        pieces.push({ x, z, w: 0.6, d: 11.5, angle: Math.atan2(dx, dz) });
      }
    return pieces;
  });

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
];
export const CITY_SPAWN = { x: -1538, z: 770, heading: Math.atan2(30, 50) };
export const CITY_DISTRICTS = [
  { name: 'ОКТЯБРЬСКИЙ', x: -1900, z: 0 },
  { name: 'ЖЕЛЕЗНОДОРОЖНЫЙ', x: -1100, z: -200 },
  { name: 'ЦЕНТРАЛЬНЫЙ', x: 150, z: -400 },
  { name: 'СОВЕТСКИЙ', x: 1700, z: -2000 },
  { name: 'СВЕРДЛОВСКИЙ', x: -300, z: 1600 },
  { name: 'КИРОВСКИЙ', x: 1550, z: 900 },
  { name: 'ЛЕНИНСКИЙ', x: 2950, z: 100 },
];
export type CityBuilding = CityRect & {
  h: number;
  color: string;
  kind?:
    | 'station'
    | 'university'
    | 'theatre'
    | 'city-clock'
    | 'borisova'
    | 'ikit'
    | 'planeta'
    | 'udachny'
    | 'arena'
    | 'komsomoll'
    | 'museum'
    | 'pushkin'
    | 'kubatura'
    | 'pho'
    | 'frank'
    | 'fresco';
  style?: 'heritage' | 'panel' | 'tower' | 'cottage';
  lowDetail?: boolean;
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
  landmark('borisova', 55.992306, 92.795672, 16, 22, 18, '#d8d8cd'),
  landmark('ikit', 55.994336, 92.797027, 26, 13, 6, '#d6cfb4'),
  landmark('university', 56.004, 92.772, 35, 21, 7, '#ccb79a'),
  landmark('planeta', 56.050913, 92.904369, 65, 28, 9, '#bd9573'),
  landmark('komsomoll', 56.019849, 92.900873, 60, 20, 12, '#d8d9cf'),
  landmark('kubatura', 56.037233, 92.934533, 52, 25, 10, '#d8d9cf'),
  landmark('pushkin', 56.011344, 92.865642, 25, 15, 7, '#c8bdad'),
  landmark('theatre', 56.008645, 92.868542, 30, 16, 6, '#d4d2b7'),
  landmark('museum', 56.00735, 92.872592, 23, 10, 6, '#ba815b'),
  landmark('frank', 56.011079, 92.856719, 22, 14, 7.8, '#c6a496'),
  landmark('pho', 56.013714, 92.852395, 19, 12, 5.8, '#d7c4a2'),
  landmark('fresco', 56.012043, 92.874562, 19, 14, 6.6, '#ad806b'),
  { kind: 'station', x: -1250, z: 215, w: 48, d: 23, h: 10, color: '#d6d8b4' },
  { kind: 'city-clock', x: 245, z: 90, w: 8, d: 8, h: 14, color: '#cbb98d' },
  { kind: 'arena', x: 330, z: 645, w: 65, d: 38, h: 12, color: '#aebec1' },
  {
    kind: 'udachny',
    ...cityGeo(55.979489, 92.698624),
    w: 12,
    d: 8,
    h: 3.3,
    color: '#c3b192',
  },
];
export const CITY_PARKING = [
  { id: 'komsomoll', x: 1020, z: -487, w: 130, d: 52 },
  { id: 'kubatura', x: 1930, z: -1240, w: 82, d: 70 },
  { id: 'planeta', x: 1150, z: -1758, w: 165, d: 58 },
];
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
const palette = [
  '#c3b192',
  '#aebec1',
  '#d7c4a2',
  '#b4b8a5',
  '#c6a496',
  '#9eafb9',
];
// Populate street corridors, not an evenly spaced grid across empty land.
for (const [ri, r] of cityRoads.entries()) {
  if (
    r.bridge ||
    r.id.startsWith('predmostnaya-ring') ||
    r.id.startsWith('tatyshev') ||
    r.id.startsWith('otdyha')
  )
    continue;
  const dx = r.to.x - r.from.x,
    dz = r.to.z - r.from.z,
    l = Math.hypot(dx, dz),
    nx = -dz / l,
    nz = dx / l;
  for (let t = 40; t < l - 35; t += 48)
    for (const side of [-1, 1]) {
      const i = Math.floor(t / 48) + ri * 7,
        x = r.from.x + (dx * t) / l + nx * side * (r.width / 2 + 24),
        z = r.from.z + (dz * t) / l + nz * side * (r.width / 2 + 24);
      const style: NonNullable<CityBuilding['style']> =
        x < -3200
          ? 'cottage'
          : x < -2100
            ? i % 5 === 0
              ? 'tower'
              : 'panel'
            : x > -400 && x < 850 && z > -300 && z < 180
              ? 'heritage'
              : z < -850
                ? 'tower'
                : 'panel';
      const w =
        style === 'panel'
          ? 26 + (i % 3) * 8
          : style === 'heritage'
            ? 22 + (i % 3) * 3
            : style === 'tower'
              ? 18
              : 12;
      const d =
        style === 'panel'
          ? 12
          : style === 'heritage'
            ? 14
            : style === 'tower'
              ? 19
              : 10;
      if (
        !cityParcelClear(x, z, w, d) ||
        cityBuildings.some(
          (b) =>
            Math.abs(x - b.x) < (w + b.w) / 2 + 5 &&
            Math.abs(z - b.z) < (d + b.d) / 2 + 5,
        )
      )
        continue;
      cityBuildings.push({
        x,
        z,
        w,
        d,
        h:
          style === 'tower'
            ? 22 + (i % 5) * 4
            : style === 'panel'
              ? 8 + (i % 3) * 4
              : style === 'heritage'
                ? 5.5 + (i % 2) * 2
                : 3.5 + (i % 2),
        color: palette[i % palette.length],
        style,
        lowDetail: true,
      });
    }
}
