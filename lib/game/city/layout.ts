/** Compressed, north-up game geography: west/east and river banks match the
 * named districts. These metres are gameplay space, never geographic coordinates. */
export const CITY_BOUNDS = { minX: -116, maxX: 116, minZ: -80, maxZ: 80 };
export const CITY_SCENERY_BOUNDS = {
  minX: -130,
  maxX: 130,
  minZ: -108,
  maxZ: 108,
  maxY: 20,
};
export const CITY_SPAWN = { x: -92, z: -4, heading: 0 };
export const RIVER_HALF_WIDTH = 9.5;
export const RIVER_SLOPE = 0.28;
export const riverZ = (x: number) => -RIVER_SLOPE * x;
/** Positive is the right/southeastern bank, negative the left/northwestern bank. */
export const riverDistance = (x: number, z: number) =>
  (z + RIVER_SLOPE * x) / Math.hypot(1, RIVER_SLOPE);
export type CityPoint = { x: number; z: number };
export type CityRect = CityPoint & { w: number; d: number };
export const BRIDGES = [
  {
    id: 'nikolaevsky',
    title: 'НИКОЛАЕВСКИЙ МОСТ',
    x: -48,
    z: riverZ(-48),
    w: 14,
    d: 34,
  },
  {
    id: 'kommunalny',
    title: 'КОММУНАЛЬНЫЙ МОСТ',
    x: 38,
    z: riverZ(38),
    w: 14,
    d: 34,
  },
] as const;
export const ROUNDABOUT = { x: 38, z: 47, innerRadius: 10, outerRadius: 26 };
export const cityBarriers: CityRect[] = BRIDGES.flatMap((bridge) =>
  [-1, 1].map((side) => ({
    x: bridge.x + side * (bridge.w / 2 + 0.16),
    z: bridge.z,
    w: 0.32,
    d: 29,
  })),
);
export const cityRoads: {
  id: string;
  from: CityPoint;
  to: CityPoint;
  width: number;
}[] = [
  ...[-1, 1].map((side) => ({
    id: side < 0 ? 'left-quay' : 'right-quay',
    from: { x: -110, z: riverZ(-110) + side * 21 },
    to: { x: 110, z: riverZ(110) + side * 21 },
    width: 13,
  })),
  ...[-54, 54].map((z) => ({
    id: z < 0 ? 'left-districts' : 'right-districts',
    from: { x: -110, z },
    to: { x: 110, z },
    width: 14,
  })),
  ...[-48, 38].map((x) => ({
    id: `bridge-approach-${x}`,
    from: { x, z: -70 },
    to: { x, z: 72 },
    width: 14,
  })),
  ...[-92, -16, 94].flatMap((x) =>
    [-1, 1].map((side) => ({
      id: `district-${x}-${side}`,
      from: { x, z: side * 70 },
      to: { x, z: riverZ(x) + side * 21 },
      width: 12,
    })),
  ),
];
export function distanceToRoad(
  x: number,
  z: number,
  road: (typeof cityRoads)[number],
) {
  const dx = road.to.x - road.from.x,
    dz = road.to.z - road.from.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((x - road.from.x) * dx + (z - road.from.z) * dz) / (dx * dx + dz * dz),
    ),
  );
  return Math.hypot(x - road.from.x - t * dx, z - road.from.z - t * dz);
}
export type CityMission = 'screen' | 'clean' | 'moving';
export const cityStops: (CityPoint & {
  id: string;
  title: string;
  subtitle: string;
  mission?: CityMission;
  color: string;
})[] = [
  {
    id: 'nikita',
    x: -92,
    z: riverZ(-92) - 21,
    title: 'У Никиты · Студгородок',
    subtitle: 'Борисова, 30 · левый берег',
    mission: 'screen',
    color: '#d9e89b',
  },
  {
    id: 'yarik',
    x: 94,
    z: 8,
    title: 'Старая квартира Ярика',
    subtitle: 'Апрельская, 8 · правый берег',
    mission: 'moving',
    color: '#ffd55e',
  },
  {
    id: 'roma',
    x: -66,
    z: -54,
    title: 'Главный ЖД вокзал · байки Ромы',
    subtitle: 'Деповская · рядом с военкоматом',
    mission: 'clean',
    color: '#9bc8e8',
  },
  {
    id: 'new-home',
    x: 88,
    z: 54,
    title: 'Новый дом Ярика',
    subtitle: 'Сюда везём все сумки',
    color: '#efa990',
  },
];
export type CityBuilding = CityRect & {
  h: number;
  color: string;
  kind?: 'station' | 'university' | 'theatre' | 'city-clock';
};
export const cityBuildings: CityBuilding[] = [
  { x: -70, z: -69, w: 24, d: 10, h: 4.6, color: '#d6d8b4', kind: 'station' },
  {
    x: -106,
    z: -16,
    w: 12,
    d: 18,
    h: 4.2,
    color: '#ccb79a',
    kind: 'university',
  },
];
const palette = [
  '#c3b192',
  '#aebec1',
  '#d7c4a2',
  '#b4b8a5',
  '#c6a496',
  '#9eafb9',
];
function roadOverlapsBuilding(x: number, z: number, w: number, d: number) {
  return cityRoads.some((road) => {
    const dx = road.to.x - road.from.x,
      dz = road.to.z - road.from.z;
    const length = Math.hypot(dx, dz),
      tx = dx / length,
      tz = dz / length;
    const along = (x - road.from.x) * tx + (z - road.from.z) * tz;
    const across = Math.abs((x - road.from.x) * -tz + (z - road.from.z) * tx);
    const alongExtent = (Math.abs(tx) * w) / 2 + (Math.abs(tz) * d) / 2;
    const acrossExtent = (Math.abs(tz) * w) / 2 + (Math.abs(tx) * d) / 2;
    return (
      along > -alongExtent &&
      along < length + alongExtent &&
      across < road.width / 2 + acrossExtent + 1.5
    );
  });
}
for (let row = 0; row < 10; row++)
  for (let column = 0; column < 19; column++) {
    const x = -106 + column * 12,
      z = -72 + row * 16;
    const w = 8 + (column % 3) * 2,
      d = 8 + (row % 2) * 2;
    const riverExtent =
      (RIVER_SLOPE * w + d) / (2 * Math.hypot(1, RIVER_SLOPE));
    if (
      Math.abs(riverDistance(x, z)) < RIVER_HALF_WIDTH + riverExtent + 3 ||
      roadOverlapsBuilding(x, z, w, d) ||
      Math.hypot(x - ROUNDABOUT.x, z - ROUNDABOUT.z) <
        ROUNDABOUT.outerRadius + Math.hypot(w, d) / 2 + 1.5 ||
      cityBuildings.some(
        (building) =>
          Math.abs(x - building.x) < (w + building.w) / 2 + 2 &&
          Math.abs(z - building.z) < (d + building.d) / 2 + 2,
      )
    )
      continue;
    cityBuildings.push({
      x,
      z,
      w,
      d,
      h: 4.2 + ((row * 3 + column) % 5) * 0.8,
      color: palette[(row + column) % palette.length],
      kind:
        z === -40 && x === 14
          ? 'theatre'
          : z === -40 && x === 2
            ? 'city-clock'
            : undefined,
    });
  }
