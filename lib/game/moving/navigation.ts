import { distance, movingPositionClear } from './physics.ts';
import type { MovingActor, MovingState, Point } from './types.ts';

type RouteNode = Point & {
  parent: number;
  cost: number;
  facing: number;
  gx: number;
  gy: number;
};
/** Cardinal A* also validates the held bag before each turn. Dynamic people and
 * floor bags participate in the same clearance checks as ordinary movement. */
export function movingPlanRoute(
  s: MovingState,
  actor: MovingActor,
  target: Point,
  reach = 24,
  goal?: (point: Point) => boolean,
): Point[] {
  const arrived = (p: Point) =>
    distance(p, target) <= reach && (!goal || goal(p));
  if (arrived(actor)) return [];
  const step = 18,
    nodes: RouteNode[] = [
      {
        x: actor.x,
        y: actor.y,
        parent: -1,
        cost: 0,
        facing: actor.facing,
        gx: 0,
        gy: 0,
      },
    ];
  const open = [0],
    best = new Map<string, number>();
  best.set('0,0', 0);
  let found = -1;
  for (let visits = 0; open.length && visits < 6500; visits++) {
    let pick = 0,
      minimum = Infinity;
    for (let i = 0; i < open.length; i++) {
      const n = nodes[open[i]],
        f = n.cost + Math.max(0, distance(n, target) - reach);
      if (f < minimum) {
        minimum = f;
        pick = i;
      }
    }
    const current = open.splice(pick, 1)[0],
      node = nodes[current];
    if (arrived(node)) {
      found = current;
      break;
    }
    // A station can lie between grid nodes. Validate the last short segment and
    // walk to the exact point rather than snapping a body onto a desk chair.
    if (!goal && reach < step / 2 && distance(node, target) < step * 1.5) {
      const facing = Math.atan2(target.x - node.x, target.y - node.y),
        segments = Math.ceil(distance(node, target) / 5);
      let clear = true;
      for (let part = 0; part <= segments; part++)
        if (
          !movingPositionClear(
            s,
            actor,
            {
              x: node.x + ((target.x - node.x) * part) / segments,
              y: node.y + ((target.y - node.y) * part) / segments,
            },
            facing,
          )
        ) {
          clear = false;
          break;
        }
      if (clear) {
        nodes.push({
          ...target,
          parent: current,
          cost: node.cost + distance(node, target),
          facing,
          gx: 0,
          gy: 0,
        });
        found = nodes.length - 1;
        break;
      }
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const gx = node.gx + dx,
        gy = node.gy + dy,
        facing = Math.atan2(dx, dy),
        key = `${gx},${gy}${actor.bagId === null ? '' : `,${dx},${dy}`}`;
      const cost = node.cost + step;
      if ((best.get(key) ?? Infinity) <= cost) continue;
      const p = { x: actor.x + gx * step, y: actor.y + gy * step };
      if (
        !movingPositionClear(s, actor, node, facing, 0) ||
        !movingPositionClear(s, actor, p, facing, 2) ||
        !movingPositionClear(
          s,
          actor,
          { x: (node.x + p.x) / 2, y: (node.y + p.y) / 2 },
          facing,
          2,
        )
      )
        continue;
      best.set(key, cost);
      nodes.push({ ...p, parent: current, cost, facing, gx, gy });
      open.push(nodes.length - 1);
    }
  }
  if (found < 0) return [];
  const route: Point[] = [];
  for (let cursor = found; cursor > 0; cursor = nodes[cursor].parent)
    route.unshift({ x: nodes[cursor].x, y: nodes[cursor].y });
  return route;
}
export function clearMovingRoute(actor: MovingActor) {
  actor.route = [];
  actor.routeKey = '';
  actor.routeBlocked = 0;
}
export function movingNavigate(
  s: MovingState,
  actor: MovingActor,
  target: Point,
  dt: number,
  reach = 24,
  goal?: (p: Point) => boolean,
) {
  const key = `${Math.round(target.x)},${Math.round(target.y)},${reach},${actor.bagId}`;
  if (distance(actor, target) <= reach && (!goal || goal(actor))) {
    clearMovingRoute(actor);
    return { x: 0, y: 0 };
  }
  if (actor.routeKey !== key || actor.routeBlocked > 0.28) {
    actor.route = movingPlanRoute(s, actor, target, reach, goal);
    actor.routeKey = key;
    actor.routeBlocked = 0;
  }
  // A blocked route may become available when the other person moves. Retry at
  // bounded intervals rather than performing a full search every render frame.
  if (!actor.route.length) {
    actor.routeBlocked += dt;
    return { x: 0, y: 0 };
  }
  while (actor.route.length && distance(actor, actor.route[0]) < 2)
    actor.route.shift();
  if (!actor.route.length) {
    actor.routeKey = '';
    return { x: 0, y: 0 };
  }
  const next = actor.route[0],
    dx = next.x - actor.x,
    dy = next.y - actor.y,
    length = Math.hypot(dx, dy);
  const scale = Math.min(1, length / (118 * dt));
  return { x: (dx / length) * scale, y: (dy / length) * scale };
}
