import { dropRoutesOpen } from './drop-routes.ts';
import {
  MAP_UNITS_PER_METRE,
  bounds,
  obstacles,
  movingStations,
} from './layout.ts';
import { movingHint } from './messages.ts';
import type { MovingState, MovingActor, MovingBag, Point } from './types.ts';
export const REACH = 66;
export const ACTOR_RADIUS = 16;
export const BAG_RADIUS = 27;
export const SOLO_CARRY_OFFSET = 0.48 * MAP_UNITS_PER_METRE;
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
export const bagById = (s: MovingState, id: number | null) =>
  s.bags.find((bag) => bag.id === id);
export const itemById = (s: MovingState, id: number | null) =>
  s.items.find((item) => item.id === id);
export function movingCanStand(
  s: MovingState,
  p: Point,
  radius = ACTOR_RADIUS,
  ignoreBag: number | null = null,
) {
  if (
    p.x < bounds.minX + radius ||
    p.x > bounds.maxX - radius ||
    p.y < bounds.minY + radius ||
    p.y > bounds.maxY - radius
  )
    return false;
  if (
    obstacles.some(
      (o) =>
        Math.hypot(
          p.x - clamp(p.x, o.x, o.x + o.w),
          p.y - clamp(p.y, o.y, o.y + o.h),
        ) < radius,
    )
  )
    return false;
  return !s.bags.some(
    (bag) =>
      bag.id !== ignoreBag &&
      bag.status !== 'delivered' &&
      bag.status !== 'carried' &&
      distance(p, bag) < radius + BAG_RADIUS,
  );
}
/** The bag held in front of one person occupies the same point in physics
 * and rendering. With two carriers it hangs between their actual positions. */
export function movingCarryPoint(
  members: readonly (Point & { facing: number })[],
): Point {
  if (members.length === 1) {
    const actor = members[0];
    return {
      x: actor.x + Math.sin(actor.facing) * SOLO_CARRY_OFFSET,
      y: actor.y + Math.cos(actor.facing) * SOLO_CARRY_OFFSET,
    };
  }
  return {
    x: members.reduce((sum, actor) => sum + actor.x, 0) / members.length,
    y: members.reduce((sum, actor) => sum + actor.y, 0) / members.length,
  };
}
export function carrySetup(s: MovingState, actor: MovingActor, bag: MovingBag) {
  const facing = Math.atan2(bag.x - actor.x, bag.y - actor.y);
  const proposed = { ...actor, facing };
  const members = [...bag.carriers.map((id) => s.actors[id]), proposed];
  const center = movingCarryPoint(members);
  const clear =
    movingCanStand(s, actor, BAG_RADIUS, bag.id) &&
    movingCanStand(s, center, BAG_RADIUS, bag.id) &&
    s.actors.every(
      (other) =>
        members.some((member) => member.id === other.id) ||
        distance(center, other) >= ACTOR_RADIUS + BAG_RADIUS,
    );
  return { facing, clear };
}
export function nearest<T extends Point>(p: Point, values: T[]): T | undefined {
  return values
    .filter((v) => distance(p, v) <= REACH)
    .sort((a, b) => distance(p, a) - distance(p, b))[0];
}
export function putDownItem(s: MovingState, actor: MovingActor) {
  const item = itemById(s, actor.heldItem);
  if (!item) return;
  item.status = 'floor';
  item.carrier = null;
  item.x = actor.x;
  item.y = actor.y;
  actor.heldItem = null;
}
/** Keep station landings clear and preserve a walkable route after a static
 * drop, including ordinary secondary-action drops before a future work alert. */
export function movingDropKeepsAccess(
  s: MovingState,
  bag: MovingBag,
  point: Point,
) {
  const stations = [
    movingStations.laptop,
    movingStations.toilet,
    ...movingStations.sofa,
  ];
  if (
    stations.some(
      (station) => distance(point, station) < ACTOR_RADIUS + BAG_RADIUS + 8,
    )
  )
    return false;
  const proposed: MovingState = {
    ...s,
    bags: s.bags.map((other) =>
      other.id === bag.id
        ? { ...other, ...point, status: 'closed', carriers: [] }
        : other,
    ),
  };
  return dropRoutesOpen(s.actors[0], [...s.actors.slice(1), ...stations], (p) =>
    movingCanStand(proposed, p),
  );
}
export function releaseBag(s: MovingState, actor: MovingActor) {
  const bag = bagById(s, actor.bagId);
  if (!bag) return;
  if (bag.carriers.length === 1) {
    const point = Array.from({ length: 8 }, (_, i) => {
      const angle = actor.facing + (i * Math.PI) / 4;
      return {
        x: actor.x + Math.sin(angle) * 49,
        y: actor.y + Math.cos(angle) * 49,
      };
    }).find(
      (p) =>
        movingCanStand(s, p, BAG_RADIUS, bag.id) &&
        s.actors.every((a) => distance(a, p) >= ACTOR_RADIUS + BAG_RADIUS) &&
        movingDropKeepsAccess(s, bag, p),
    );
    if (!point) {
      movingHint(s, 'Здесь тесно. Чуть отойди и опусти сумку.');
      return;
    }
    bag.x = point.x;
    bag.y = point.y;
    bag.status = 'closed';
  }
  const remaining = bag.carriers.filter((id) => id !== actor.id);
  if (remaining.length) {
    const point = movingCarryPoint(remaining.map((id) => s.actors[id]));
    if (
      !movingCanStand(s, point, BAG_RADIUS, bag.id) ||
      s.actors.some(
        (other) =>
          !remaining.includes(other.id) &&
          distance(other, point) < ACTOR_RADIUS + BAG_RADIUS,
      )
    ) {
      movingHint(s, 'Чуть отойдите вместе — сумке нужно место у второй ручки.');
      return;
    }
    bag.x = point.x;
    bag.y = point.y;
  }
  bag.carriers = remaining;
  actor.bagId = null;
}
export function walkGroup(
  s: MovingState,
  members: MovingActor[],
  dx: number,
  dy: number,
  bag?: MovingBag,
) {
  const ids = new Set(members.map((a) => a.id));
  const valid = (x: number, y: number) => {
    const center = movingCarryPoint(
      members.map((actor) => ({
        x: actor.x + x,
        y: actor.y + y,
        facing: x || y ? Math.atan2(x, y) : actor.facing,
      })),
    );
    if (
      bag &&
      (!movingCanStand(s, center, BAG_RADIUS, bag.id) ||
        s.actors.some(
          (other) =>
            !ids.has(other.id) &&
            distance(center, other) < BAG_RADIUS + ACTOR_RADIUS,
        ))
    )
      return false;
    return members.every((actor) => {
      const p = { x: actor.x + x, y: actor.y + y };
      return (
        movingCanStand(s, p, bag ? BAG_RADIUS : ACTOR_RADIUS, bag?.id) &&
        s.actors.every(
          (other) =>
            ids.has(other.id) || distance(p, other) >= ACTOR_RADIUS * 2,
        )
      );
    });
  };
  const x = valid(dx, 0) ? dx : 0,
    y = valid(x, dy) ? dy : 0;
  for (const actor of members) {
    actor.x += x;
    actor.y += y;
    actor.vx = x;
    actor.vy = y;
    if (x || y) actor.facing = Math.atan2(x, y);
    if (
      ((Math.abs(dx) > 0.001 && !x) || (Math.abs(dy) > 0.001 && !y)) &&
      s.elapsed >= actor.bumpUntil
    ) {
      actor.bumpUntil = s.elapsed + 1.5;
      s.bumps++;
    }
  }
  return Math.hypot(x, y);
}

/** A mandatory interruption frees the worker without deleting inventory. If the
 * remaining handle cannot safely support the bag, both people set it down. */
export function forceDrop(s: MovingState, actor: MovingActor): boolean {
  putDownItem(s, actor);
  const bag = bagById(s, actor.bagId);
  if (!bag) return true;
  const remaining = bag.carriers.filter((id) => id !== actor.id);
  if (remaining.length) {
    const point = movingCarryPoint(remaining.map((id) => s.actors[id]));
    if (
      movingCanStand(s, point, BAG_RADIUS, bag.id) &&
      s.actors.every(
        (a) =>
          remaining.includes(a.id) ||
          distance(a, point) >= ACTOR_RADIUS + BAG_RADIUS,
      )
    ) {
      bag.x = point.x;
      bag.y = point.y;
      bag.carriers = remaining;
      actor.bagId = null;
      return true;
    }
  }
  for (const radius of [49, 65, 82, 104, 128]) {
    for (let i = 0; i < 16; i++) {
      const angle = actor.facing + (i * Math.PI) / 8;
      const p = {
        x: actor.x + Math.sin(angle) * radius,
        y: actor.y + Math.cos(angle) * radius,
      };
      if (
        !movingCanStand(s, p, BAG_RADIUS, bag.id) ||
        s.actors.some((a) => distance(a, p) < ACTOR_RADIUS + BAG_RADIUS + 1) ||
        !movingDropKeepsAccess(s, bag, p)
      )
        continue;
      for (const id of bag.carriers) s.actors[id].bagId = null;
      bag.x = p.x;
      bag.y = p.y;
      bag.carriers = [];
      bag.status = 'closed';
      return true;
    }
  }
  return false;
}

/** Shared by path planning and tests; bags occupy the same forward footprint as
 * rendered luggage, including the instant before turning a corner. */
export function movingPositionClear(
  s: MovingState,
  actor: MovingActor,
  p: Point,
  facing: number,
  margin = 0,
) {
  const bag = bagById(s, actor.bagId),
    radius = bag ? BAG_RADIUS : ACTOR_RADIUS;
  if (!movingCanStand(s, p, radius + margin, actor.bagId)) return false;
  const otherActors = s.actors.filter(
    (a) => a.id !== actor.id && (!bag || !bag.carriers.includes(a.id)),
  );
  if (otherActors.some((a) => distance(a, p) < ACTOR_RADIUS * 2 + margin))
    return false;
  if (bag) {
    const point = movingCarryPoint([{ ...p, facing }]);
    if (
      !movingCanStand(s, point, BAG_RADIUS + margin, bag.id) ||
      otherActors.some(
        (a) => distance(a, point) < ACTOR_RADIUS + BAG_RADIUS + margin,
      )
    )
      return false;
  }
  return true;
}
