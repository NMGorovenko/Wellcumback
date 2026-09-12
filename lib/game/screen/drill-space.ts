import { PHYSICAL_LAYOUT, type GameState } from './engine.ts';
import { drillStaging } from './staging.ts';

export type DrillPoint = { x: number; z: number };
export const DRILL_SHELF = {
  x: 3.55,
  z: -3,
  y: 0.9,
  width: 0.95,
  depth: 0.42,
  approach: { x: 3.48, z: -2.28 },
  drill: { x: 3.34, y: 1.05, z: -2.88 },
  vacuum: { x: 3.7, y: 1.05, z: -2.88 },
} as const;
export const ASSISTANT_RADIUS = 0.255;
export const ASSISTANT_SPEED = 1.65;
export const drillDistance = (a: DrillPoint, b: DrillPoint) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export function bracePoint(s: Pick<GameState, 'chairX'>): DrillPoint {
  return { x: s.chairX * 0.49 - 0.67, z: -2.3 };
}
export function nearChairs(s: GameState) {
  return drillDistance(s.drillAssistant, bracePoint(s)) < 0.34;
}
function rectangles(s: GameState) {
  const stage = drillStaging(s),
    stool = stage.stools[0];
  return [
    ...PHYSICAL_LAYOUT.furniture.slice(0, -2),
    { minX: -2.44, maxX: 2.44, minZ: -1.95, maxZ: 0.83 },
    {
      minX: DRILL_SHELF.x - 0.475,
      maxX: DRILL_SHELF.x + 0.475,
      minZ: -3.21,
      maxZ: -2.79,
    },
    {
      minX: stool.x - 0.245,
      maxX: stool.x + 0.245,
      minZ: stool.z - 0.265,
      maxZ: stool.z + 0.265,
    },
  ];
}
/** Shared collision query for human walking, AI paths, and persistent landings.
 * The two green stools leave their parked locations for this chapter. */
export function drillPointIsClear(
  s: GameState,
  p: DrillPoint,
  radius = ASSISTANT_RADIUS,
  bodies = true,
) {
  const b = PHYSICAL_LAYOUT.bounds;
  if (
    p.x - radius < b.minX ||
    p.x + radius > b.maxX ||
    p.z - radius < b.minZ ||
    p.z + radius > b.maxZ
  )
    return false;
  if (
    rectangles(s).some(
      (r) =>
        p.x > r.minX - radius &&
        p.x < r.maxX + radius &&
        p.z > r.minZ - radius &&
        p.z < r.maxZ + radius,
    )
  )
    return false;
  const stage = drillStaging(s);
  if (
    bodies &&
    stage.workers[1].y < 1.15 &&
    drillDistance(p, stage.workers[1]) < radius + ASSISTANT_RADIUS
  )
    return false;
  if (
    bodies &&
    s.players === 3 &&
    drillDistance(p, stage.workers[2]) < radius + ASSISTANT_RADIUS
  )
    return false;
  return true;
}
export function drillSegmentClear(
  s: GameState,
  a: DrillPoint,
  b: DrillPoint,
  bodies = true,
) {
  const count = Math.max(1, Math.ceil(drillDistance(a, b) / 0.045));
  for (let i = 1; i <= count; i++)
    if (
      !drillPointIsClear(
        s,
        {
          x: a.x + ((b.x - a.x) * i) / count,
          z: a.z + ((b.z - a.z) * i) / count,
        },
        ASSISTANT_RADIUS,
        bodies,
      )
    )
      return false;
  return true;
}
/** Cardinal A* followed by swept-segment smoothing. A body cannot cut a corner
 * through the cloth, kitchen, sofa, live chair, or another participant. */
export function drillPath(
  s: GameState,
  from: DrillPoint,
  to: DrillPoint,
): DrillPoint[] {
  if (!drillPointIsClear(s, to)) return [];
  if (drillSegmentClear(s, from, to)) return [{ ...to }];
  const step = 0.14,
    minX = -5.07,
    minZ = -2.95,
    cols = 76,
    rows = 44;
  const point = (i: number) => ({
    x: minX + (i % cols) * step,
    z: minZ + Math.floor(i / cols) * step,
  });
  const index = (p: DrillPoint) =>
    Math.max(0, Math.min(rows - 1, Math.round((p.z - minZ) / step))) * cols +
    Math.max(0, Math.min(cols - 1, Math.round((p.x - minX) / step)));
  const startBase = index(from),
    endBase = index(to);
  const nearest = (base: number, p: DrillPoint) => {
    const options: number[] = [];
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = (base % cols) + dx,
          y = Math.floor(base / cols) + dy;
        if (x >= 0 && x < cols && y >= 0 && y < rows)
          options.push(y * cols + x);
      }
    return options
      .sort((a, b) => drillDistance(p, point(a)) - drillDistance(p, point(b)))
      .find(
        (i) =>
          drillPointIsClear(s, point(i)) && drillSegmentClear(s, p, point(i)),
      );
  };
  const start = nearest(startBase, from),
    end = nearest(endBase, to);
  if (start === undefined || end === undefined) return [];
  const open = new Set([start]),
    previous = new Map<number, number>(),
    cost = new Map([[start, 0]]),
    clear = new Map<number, boolean>();
  const heuristic = (i: number) =>
    Math.abs((i % cols) - (end % cols)) +
    Math.abs(Math.floor(i / cols) - Math.floor(end / cols));
  let found = false;
  while (open.size) {
    let current = -1,
      best = Infinity;
    for (const i of open) {
      const score = (cost.get(i) ?? Infinity) + heuristic(i);
      if (score < best) {
        best = score;
        current = i;
      }
    }
    if (current === end) {
      found = true;
      break;
    }
    open.delete(current);
    for (const n of [
      current - cols,
      current + cols,
      current - 1,
      current + 1,
    ]) {
      if (
        n < 0 ||
        n >= cols * rows ||
        Math.abs((n % cols) - (current % cols)) +
          Math.abs(Math.floor(n / cols) - Math.floor(current / cols)) !==
          1
      )
        continue;
      if (!clear.has(n)) clear.set(n, drillPointIsClear(s, point(n)));
      if (!clear.get(n)) continue;
      const next = (cost.get(current) ?? 0) + 1;
      if (next >= (cost.get(n) ?? Infinity)) continue;
      cost.set(n, next);
      previous.set(n, current);
      open.add(n);
    }
  }
  if (!found) return [];
  const raw: DrillPoint[] = [{ ...to }];
  let i = end;
  while (i !== start) {
    raw.unshift(point(i));
    const prev = previous.get(i);
    if (prev === undefined) return [];
    i = prev;
  }
  raw.unshift(point(start));
  const result: DrillPoint[] = [];
  let origin = from;
  for (let n = 0; n < raw.length;) {
    let far = n;
    while (far + 1 < raw.length && drillSegmentClear(s, origin, raw[far + 1]))
      far++;
    result.push(raw[far]);
    origin = raw[far];
    n = far + 1;
  }
  return result;
}
export function moveAssistant(
  s: GameState,
  dx: number,
  dz: number,
  dt: number,
) {
  const a = s.drillAssistant,
    length = Math.hypot(dx, dz);
  if (!length) return;
  const scale = Math.min(1, length),
    distance = ASSISTANT_SPEED * dt * scale;
  const next = {
    x: a.x + (dx / length) * distance,
    z: a.z + (dz / length) * distance,
  };
  if (drillSegmentClear(s, a, next)) {
    a.x = next.x;
    a.z = next.z;
  } else if (drillSegmentClear(s, a, { x: next.x, z: a.z })) a.x = next.x;
  else if (drillSegmentClear(s, a, { x: a.x, z: next.z })) a.z = next.z;
  else return;
  a.rotation = Math.atan2(dx, dz);
  a.activity = 'walk';
  s.workers[0].animation = 'walk';
}
export function followAssistantPath(
  s: GameState,
  target: DrillPoint,
  dt: number,
) {
  const a = s.drillAssistant;
  if (!a.target || drillDistance(a.target, target) > 0.05 || !a.route.length) {
    a.target = { ...target };
    a.route = drillPath(s, a, target);
  }
  const next = a.route[0];
  if (!next) return;
  const distance = drillDistance(a, next);
  if (distance < 0.025) {
    a.route.shift();
    return;
  }
  const old = { x: a.x, z: a.z };
  moveAssistant(
    s,
    (next.x - a.x) / distance,
    (next.z - a.z) / distance,
    Math.min(dt, distance / ASSISTANT_SPEED),
  );
  if (drillDistance(old, a) < 0.0001) a.route = [];
}
