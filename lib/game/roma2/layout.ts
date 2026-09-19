export type ToiletPoint = { x: number; z: number };
export const stallX = (index: number) => (index - 1) * 3.1;
export const TOILET_EXIT = { x: 0, z: 9.45 };
export const TOILET_RAGS = { x: 3.6, z: 8.35 };
export const TOILET_SCREEN = { x: 2.1, z: 6.45, w: 0.16, d: 2.6 };
export const TOILET_RADIUS = 0.25;
export const SIGHT_RANGE = 5.7;
export const SIGHT_HALF_ANGLE = Math.PI / 5;
export const TOILET_WALLS = [
  ...[-4.65, -1.55, 1.55, 4.65].map((x) => ({ x, z: -1.55, w: 0.1, d: 3.7 })),
  TOILET_SCREEN,
  { x: -4.7, z: 4.8, w: 0.65, d: 3.2 },
];
export const insideToiletStall = (p: ToiletPoint) =>
  p.z < -0.45 && [0, 1, 2].some((i) => Math.abs(p.x - stallX(i)) < 1.23);
export const atOwnStall = (p: ToiletPoint, index: number) =>
  Math.hypot(p.x - stallX(index), p.z + 1.3) < 0.68;
export const atToiletRags = (p: ToiletPoint) =>
  Math.hypot(p.x - TOILET_RAGS.x, p.z - TOILET_RAGS.z) < 0.85;
export function toiletCanStand(x: number, z: number) {
  return (
    x >= -4.35 &&
    x <= 4.35 &&
    z >= -2.5 &&
    z <= 9.7 &&
    TOILET_WALLS.every(
      (b) =>
        Math.abs(x - b.x) >= b.w / 2 + TOILET_RADIUS ||
        Math.abs(z - b.z) >= b.d / 2 + TOILET_RADIUS,
    )
  );
}
/** Slab intersection is shared by perception and the visible vision fan. */
export function toiletSightDistance(
  origin: ToiletPoint,
  heading: number,
  range = SIGHT_RANGE,
) {
  const dx = Math.sin(heading),
    dz = Math.cos(heading);
  let nearest = range;
  for (const wall of TOILET_WALLS) {
    let enter = 0,
      leave = range;
    for (const [at, direction, low, high] of [
      [origin.x, dx, wall.x - wall.w / 2, wall.x + wall.w / 2],
      [origin.z, dz, wall.z - wall.d / 2, wall.z + wall.d / 2],
    ]) {
      if (Math.abs(direction) < 1e-8) {
        if (at < low || at > high) {
          enter = Infinity;
          break;
        }
      } else {
        const a = (low - at) / direction,
          b = (high - at) / direction;
        enter = Math.max(enter, Math.min(a, b));
        leave = Math.min(leave, Math.max(a, b));
      }
    }
    if (enter <= leave && leave >= 0)
      nearest = Math.min(nearest, Math.max(0, enter));
  }
  // A door closes behind a player stepping into a stall. Players open it by walking out.
  if (dz < -1e-8) {
    const distance = (-0.35 - origin.z) / dz,
      x = origin.x + dx * distance;
    if (distance >= 0 && distance < nearest && Math.abs(x) < 4.7)
      nearest = distance;
  }
  return nearest;
}
