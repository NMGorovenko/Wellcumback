import type { Point } from './types.ts';
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
/** A dropped bag becomes a permanent obstacle. Check that it does not isolate
 * a worker or a required station. People are temporary obstacles and intentionally
 * omitted by the caller; floor bags and furniture use the normal body clearance. */
export function dropRoutesOpen(
  start: Point,
  goals: readonly Point[],
  clear: (p: Point) => boolean,
) {
  if (!clear(start) || goals.some((goal) => !clear(goal))) return false;
  const remaining = new Set(goals.map((_, i) => i));
  const segmentClear = (from: Point, to: Point) => {
    const steps = Math.max(1, Math.ceil(distance(from, to) / 6));
    for (let i = 1; i <= steps; i++)
      if (
        !clear({
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
        })
      )
        return false;
    return true;
  };
  const step = 12,
    queue = [{ x: 0, y: 0 }],
    seen = new Set(['0,0']);
  for (let head = 0; head < queue.length && head < 6500; head++) {
    const node = queue[head],
      p = { x: start.x + node.x * step, y: start.y + node.y * step };
    for (const i of remaining)
      if (distance(p, goals[i]) <= step * 2 && segmentClear(p, goals[i]))
        remaining.delete(i);
    if (!remaining.size) return true;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: node.x + dx, y: node.y + dy },
        key = `${next.x},${next.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const world = { x: start.x + next.x * step, y: start.y + next.y * step };
      if (clear(world) && segmentClear(p, world)) queue.push(next);
    }
  }
  return false;
}
