import { PLAYER_BINDINGS } from '../input/gamepads.ts';
import {
  MAP_UNITS_PER_METRE,
  bagAnchors,
  bounds,
  entry,
  itemAnchors,
  obstacles,
  spawn,
} from './layout.ts';

export const movingCrew = [
  { name: 'Ярик', preset: 'yaroslav' },
  { name: 'Никита', preset: 'nikita' },
  { name: 'Рома', preset: 'roma' },
] as const;
export const REACH = 66;
export const ACTOR_RADIUS = 16;
export const BAG_RADIUS = 27;
export const SOLO_CARRY_OFFSET = 0.48 * MAP_UNITS_PER_METRE;
export type Point = { x: number; y: number };
export type MovingActor = Point & {
  id: number;
  vx: number;
  vy: number;
  facing: number;
  stamina: number;
  heldItem: number | null;
  bagId: number | null;
  zipping: number | null;
  working: boolean;
  bumpUntil: number;
};
export type MovingItem = Point & {
  id: number;
  label: string;
  weight: number;
  kind: string;
  status: 'floor' | 'held' | 'packed';
  carrier: number | null;
  bagId: number | null;
};
export type MovingBag = Point & {
  id: number;
  weight: number;
  capacity: number;
  zip: number;
  status: 'open' | 'closed' | 'carried' | 'delivered';
  carriers: number[];
};
export type MovingState = {
  players: number;
  phase: 'brief' | 'moving' | 'result';
  paused: boolean;
  elapsed: number;
  score: number;
  actors: MovingActor[];
  items: MovingItem[];
  bags: MovingBag[];
  message: string;
  messageUntil: number;
  teamwork: number;
  bumps: number;
  delivered: number;
  previousAction: boolean[];
  previousSecondary: boolean[];
};
export type MovingIntent = {
  kind:
    | 'item'
    | 'pack'
    | 'zip'
    | 'carry'
    | 'join'
    | 'travel'
    | 'blocked'
    | 'search';
  target: number | null;
  label: string;
  hold?: boolean;
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const bagById = (s: MovingState, id: number | null) =>
  s.bags.find((bag) => bag.id === id);
const itemById = (s: MovingState, id: number | null) =>
  s.items.find((item) => item.id === id);
const say = (s: MovingState, message: string) => {
  s.message = message;
  s.messageUntil = s.elapsed + 5;
};
const emptyBag = (id: number, p: Point): MovingBag => ({
  ...p,
  id,
  weight: 0,
  capacity: 12,
  zip: 0,
  status: 'open',
  carriers: [],
});

export function freshMoving(players = 1): MovingState {
  const count = clamp(Math.floor(Number.isFinite(players) ? players : 1), 1, 3);
  return {
    players: count,
    phase: 'brief',
    paused: false,
    elapsed: 0,
    score: 0,
    actors: Array.from({ length: count }, (_, id) => ({
      id,
      x: spawn.x + (id - (count - 1) / 2) * spawn.spacing,
      y: spawn.y,
      vx: 0,
      vy: 0,
      facing: Math.PI,
      stamina: 100,
      heldItem: null,
      bagId: null,
      zipping: null,
      working: false,
      bumpUntil: 0,
    })),
    items: itemAnchors.map((item, id) => ({
      ...item,
      id,
      status: 'floor',
      carrier: null,
      bagId: null,
    })),
    bags: bagAnchors.map((point, id) => emptyBag(id, point)),
    message: 'Как оно вообще здесь помещалось?',
    messageUntil: 6,
    teamwork: 0,
    bumps: 0,
    delivered: 0,
    previousAction: [false, false, false],
    previousSecondary: [false, false, false],
  };
}
export function movingAction(s: MovingState) {
  if (s.phase !== 'brief' || s.paused) return;
  s.phase = 'moving';
  say(s, 'Собираем вещи в жёлтые сумки. Вход — у кухни. Ярик считает коробки.');
}

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
const carrySpacePrompt = 'Подойди к ручке со свободной стороны.';
function carrySetup(s: MovingState, actor: MovingActor, bag: MovingBag) {
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
function nearest<T extends Point>(p: Point, values: T[]): T | undefined {
  return values
    .filter((v) => distance(p, v) <= REACH)
    .sort((a, b) => distance(p, a) - distance(p, b))[0];
}
export function movingIntent(s: MovingState, index: number): MovingIntent {
  const actor = s.actors[index];
  if (!actor) return { kind: 'search', target: null, label: 'Подойди к вещам' };
  if (actor.bagId !== null)
    return {
      kind: 'travel',
      target: actor.bagId,
      label: 'К двери · стой, чтобы отдохнуть',
    };
  if (actor.heldItem !== null) {
    const item = itemById(s, actor.heldItem)!;
    const bag = nearest(
      actor,
      s.bags.filter((b) => b.status === 'open'),
    );
    if (!bag)
      return { kind: 'search', target: null, label: 'К открытой жёлтой сумке' };
    return {
      kind: bag.weight + item.weight <= bag.capacity ? 'pack' : 'blocked',
      target: bag.id,
      label:
        bag.weight + item.weight <= bag.capacity
          ? `Уложить: ${bag.weight + item.weight}/${bag.capacity} кг`
          : `Не влезает · ${bag.weight}/${bag.capacity} кг`,
    };
  }
  if (actor.zipping !== null)
    return {
      kind: 'zip',
      target: actor.zipping,
      label: 'Застегнуть молнию',
      hold: true,
    };
  const choices = [
    ...s.items
      .filter((v) => v.status === 'floor')
      .map((v) => ({
        ...v,
        intent: {
          kind: 'item' as const,
          target: v.id,
          label: `${v.label} · ${v.weight} кг`,
        },
      })),
    ...s.bags
      .filter(
        (v) =>
          v.weight > 0 && v.status !== 'delivered' && v.carriers.length < 2,
      )
      .map((v) => ({
        ...v,
        intent: {
          kind:
            v.status === 'open'
              ? ('zip' as const)
              : v.status === 'carried'
                ? ('join' as const)
                : ('carry' as const),
          target: v.id,
          label:
            v.status === 'open'
              ? `Молния · ${v.weight}/${v.capacity} кг`
              : v.status === 'carried'
                ? 'Взять вторую ручку'
                : `Поднять сумку · ${v.weight} кг`,
          hold: v.status === 'open',
        },
      })),
  ];
  const intent = nearest(actor, choices)?.intent;
  if (
    intent &&
    (intent.kind === 'carry' || intent.kind === 'join') &&
    !carrySetup(s, actor, bagById(s, intent.target)!).clear
  )
    return { kind: 'search', target: intent.target, label: carrySpacePrompt };
  return (
    intent ?? {
      kind: 'search',
      target: null,
      label: 'Подойди к вещи или сумке',
    }
  );
}
function putDownItem(s: MovingState, actor: MovingActor) {
  const item = itemById(s, actor.heldItem);
  if (!item) return;
  item.status = 'floor';
  item.carrier = null;
  item.x = actor.x;
  item.y = actor.y;
  actor.heldItem = null;
}
function releaseBag(s: MovingState, actor: MovingActor) {
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
        s.actors.every((a) => distance(a, p) >= ACTOR_RADIUS + BAG_RADIUS),
    );
    if (!point) {
      say(s, 'Здесь тесно. Чуть отойди и опусти сумку.');
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
      say(s, 'Чуть отойдите вместе — сумке нужно место у второй ручки.');
      return;
    }
    bag.x = point.x;
    bag.y = point.y;
  }
  bag.carriers = remaining;
  actor.bagId = null;
}
function act(s: MovingState, actor: MovingActor) {
  const intent = movingIntent(s, actor.id);
  if (intent.kind === 'item') {
    const item = itemById(s, intent.target)!;
    item.status = 'held';
    item.carrier = actor.id;
    actor.heldItem = item.id;
  } else if (intent.kind === 'pack') {
    const bag = bagById(s, intent.target)!,
      item = itemById(s, actor.heldItem)!;
    bag.weight += item.weight;
    bag.zip = 0;
    item.status = 'packed';
    item.bagId = bag.id;
    item.carrier = null;
    actor.heldItem = null;
    s.score += 30;
    actor.working = true;
    say(
      s,
      `${item.label} внутри. Сумка ${bag.id + 1}: ${bag.weight}/${bag.capacity} кг.`,
    );
  } else if (intent.kind === 'blocked')
    say(s, 'Молния не аргумент. Возьми другую сумку — здесь уже тяжело.');
  else if (intent.kind === 'zip') actor.zipping = intent.target;
  else if (intent.kind === 'carry' || intent.kind === 'join') {
    const bag = bagById(s, intent.target)!;
    const { facing, clear } = carrySetup(s, actor, bag);
    if (!clear) {
      say(s, carrySpacePrompt);
      return;
    }
    actor.facing = facing;
    actor.bagId = bag.id;
    bag.carriers.push(actor.id);
    bag.status = 'carried';
    if (bag.carriers.length === 2)
      say(s, 'Раз, два… Вместе легче. Идите в одну сторону.');
  }
}
function secondary(s: MovingState, actor: MovingActor) {
  actor.zipping = null;
  if (actor.heldItem !== null) putDownItem(s, actor);
  else if (actor.bagId !== null) releaseBag(s, actor);
  else {
    const bag = nearest(
      actor,
      s.bags.filter((b) => b.status === 'closed'),
    );
    if (bag) {
      bag.status = 'open';
      bag.zip = 0;
      say(s, 'Открыли снова. Место ещё найдётся.');
    }
  }
}
function spareBag(s: MovingState) {
  if (
    !s.items.some((item) => item.status !== 'packed') ||
    s.bags.some((bag) => bag.status === 'open' && bag.weight === 0) ||
    s.bags.filter((bag) => bag.status !== 'delivered').length >=
      bagAnchors.length
  )
    return;
  const anchor = bagAnchors.find(
    (p) =>
      movingCanStand(s, p, BAG_RADIUS) &&
      s.actors.every((a) => distance(p, a) > BAG_RADIUS + ACTOR_RADIUS),
  );
  if (anchor) s.bags.push(emptyBag(s.bags.length, anchor));
}
function walkGroup(
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

export function movingTick(s: MovingState, delta: number, keys: Set<string>) {
  if (s.paused || s.phase !== 'moving' || !Number.isFinite(delta)) return;
  const dt = clamp(delta, 0, 0.05);
  if (!dt) return;
  s.elapsed += dt;
  const input = s.actors.map((actor, i) => {
    const b = PLAYER_BINDINGS[i],
      action = keys.has(b.action) || (i === 0 && keys.has('Space')),
      alternate = keys.has(b.secondary);
    actor.working = false;
    actor.vx = 0;
    actor.vy = 0;
    if (alternate && !s.previousSecondary[i]) secondary(s, actor);
    if (action && !s.previousAction[i] && !alternate) act(s, actor);
    s.previousAction[i] = action;
    s.previousSecondary[i] = alternate;
    if (!action) actor.zipping = null;
    const x = Number(keys.has(b.right)) - Number(keys.has(b.left)),
      y = Number(keys.has(b.down)) - Number(keys.has(b.up)),
      length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length, action };
  });
  for (const actor of s.actors) {
    const bag = bagById(s, actor.zipping);
    if (
      !bag ||
      bag.status !== 'open' ||
      distance(actor, bag) > REACH ||
      !input[actor.id].action
    ) {
      actor.zipping = null;
      continue;
    }
    actor.working = true;
    bag.zip = Math.min(1, bag.zip + dt / 1.3);
    if (bag.zip >= 1) {
      bag.status = 'closed';
      actor.zipping = null;
      say(s, 'Молния сошлась. Отпусти кнопку, затем подними сумку.');
    }
  }
  const moved = new Set<number>();
  for (const actor of s.actors) {
    if (moved.has(actor.id)) continue;
    const bag = bagById(s, actor.bagId),
      members = bag ? bag.carriers.map((id) => s.actors[id]) : [actor];
    members.forEach((a) => moved.add(a.id));
    let x = 0,
      y = 0;
    for (const a of members)
      if (a.zipping === null) {
        x += input[a.id].x / members.length;
        y += input[a.id].y / members.length;
      }
    const stamina = Math.min(...members.map((a) => a.stamina));
    const load = bag
      ? bag.weight / members.length
      : (itemById(s, actor.heldItem)?.weight ?? 0);
    const speed =
      118 *
      (bag
        ? Math.max(0.38, 1 - load * 0.055)
        : actor.heldItem !== null
          ? 0.88
          : 1) *
      (0.3 + 0.7 * Math.min(1, stamina / 30));
    const walked = walkGroup(s, members, x * speed * dt, y * speed * dt, bag);
    for (const a of members)
      a.stamina = clamp(
        a.stamina +
          dt *
            (walked > 0.001
              ? -load * 0.72 - (bag ? 1.2 : 0.3)
              : a.working
                ? 5
                : bag
                  ? 15
                  : 24),
        0,
        100,
      );
    if (bag) {
      const carriedPoint = movingCarryPoint(members);
      bag.x = carriedPoint.x;
      bag.y = carriedPoint.y;
      if (members.length > 1 && walked > 0.001) s.teamwork += dt;
      if (distance(bag, entry) < entry.radius) {
        bag.status = 'delivered';
        bag.carriers = [];
        members.forEach((a) => {
          a.bagId = null;
        });
        s.score += bag.weight * 12;
        s.delivered++;
        say(
          s,
          s.delivered === 1
            ? 'Это ещё не всё.'
            : 'Ещё одна сумка. Последняя. Предпоследняя.',
        );
      }
    }
  }
  for (const item of s.items)
    if (item.carrier !== null) {
      item.x = s.actors[item.carrier].x;
      item.y = s.actors[item.carrier].y;
    }
  spareBag(s);
  if (
    s.items.every((item) => item.status === 'packed') &&
    s.bags.every((bag) => bag.weight === 0 || bag.status === 'delivered')
  ) {
    s.phase = 'result';
    s.score +=
      Math.max(0, Math.round(300 - s.elapsed * 0.7)) +
      Math.min(150, Math.round(s.teamwork * 2));
    say(s, 'Первая ходка готова. Квартира внезапно оказалась с полом.');
  } else if (s.elapsed > s.messageUntil) {
    s.message = s.actors.some((a) => a.stamina < 30)
      ? 'Ноги помнят вес. Остановись на пару секунд — силы вернутся.'
      : 'Вещь → открытая сумка → держи молнию → к двери. Тяжёлую сумку удобнее вдвоём.';
  }
}
