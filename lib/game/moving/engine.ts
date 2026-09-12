import { PLAYER_BINDINGS } from '../input/bindings.ts';
import {
  bagAnchors,
  entry,
  itemAnchors,
  movingStations,
  spawn,
} from './layout.ts';
import { movingAssistantInput } from './assistant.ts';
import { hasMovingDuty, movingDutyInput, movingWorkRate } from './duties.ts';
import { movingIntent } from './intent.ts';
import { movingHint, say } from './messages.ts';
import { clearMovingRoute } from './navigation.ts';
import {
  bagById,
  carrySetup,
  clamp,
  distance,
  itemById,
  nearest,
  putDownItem,
  releaseBag,
  REACH,
  walkGroup,
  movingCarryPoint,
} from './physics.ts';
import type {
  MovingActor,
  MovingBag,
  MovingInput,
  MovingState,
  Point,
} from './types.ts';
export type {
  MovingActor,
  MovingBag,
  MovingItem,
  MovingState,
  MovingIntent,
  MovingActivity,
  MovingTaskTarget,
  Point,
} from './types.ts';
export {
  movingCanStand,
  movingCarryPoint,
  movingPositionClear,
  ACTOR_RADIUS,
  BAG_RADIUS,
  SOLO_CARRY_OFFSET,
  REACH,
} from './physics.ts';
export { movingPlanRoute } from './navigation.ts';
export { movingIntent } from './intent.ts';
export { MOVING_DIALOGUE } from './dialogue.ts';
export const movingCrew = [
  { name: 'Ярик', preset: 'yaroslav' },
  { name: 'Настя', preset: 'anastasia' },
] as const;
export const MOVING_DAY_SECONDS = 480;
export const PACK_SECONDS = 1.6;
export const ZIP_SECONDS = 2;
const emptyBag = (id: number, p: Point): MovingBag => ({
  ...p,
  id,
  weight: 0,
  capacity: 18,
  zip: 0,
  status: 'open',
  carriers: [],
});
export function freshMoving(players = 1): MovingState {
  const count = clamp(Math.floor(Number.isFinite(players) ? players : 1), 1, 2);
  return {
    players: count,
    actorCount: count,
    phase: 'brief',
    chapter: 'packing',
    paused: false,
    elapsed: 0,
    dayRemaining: MOVING_DAY_SECONDS,
    score: 0,
    actors: Array.from({ length: 2 }, (_, id) => ({
      id,
      x: spawn.x + (id - 0.5) * spawn.spacing,
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
      activity: 'free',
      activityProgress: 0,
      taskTarget: null,
      packingBag: null,
      route: [],
      routeKey: '',
      routeBlocked: 0,
    })),
    items: itemAnchors.map((item, id) => ({
      ...item,
      id,
      status: 'floor',
      carrier: null,
      bagId: null,
    })),
    bags: bagAnchors.map((p, id) => emptyBag(id, p)),
    message: 'Как оно вообще здесь помещалось?',
    messageUntil: 0,
    messageSeq: 0,
    speaker: 'Ярик',
    dialogueId: null,
    teamwork: 0,
    bumps: 0,
    delivered: 0,
    alert: { active: false, count: 0, progress: 0, nextAt: 42 },
    toilet: { active: false, count: 0, progress: 0, nextAt: 105 },
    dutyGraceUntil: 0,
    previousAction: [false, false],
    previousSecondary: [false, false],
  };
}
export function movingAction(s: MovingState) {
  if (s.phase !== 'brief' || s.paused) return;
  s.phase = 'moving';
  say(s, 'start');
}
function stopWork(actor: MovingActor) {
  actor.packingBag = null;
  actor.zipping = null;
  if (actor.activity === 'packing') {
    actor.activity = 'free';
    actor.activityProgress = 0;
    actor.taskTarget = null;
  }
}
function act(s: MovingState, actor: MovingActor) {
  const intent = movingIntent(s, actor.id);
  if (intent.kind === 'item') {
    const item = itemById(s, intent.target)!;
    if (item.status !== 'floor') return;
    item.status = 'held';
    item.carrier = actor.id;
    actor.heldItem = item.id;
    clearMovingRoute(actor);
  } else if (intent.kind === 'pack') {
    actor.packingBag = intent.target;
    actor.activity = 'packing';
    actor.activityProgress = 0;
    const bag = bagById(s, intent.target)!;
    actor.taskTarget = { kind: 'bag', id: bag.id, x: bag.x, y: bag.y };
    actor.facing = Math.atan2(bag.x - actor.x, bag.y - actor.y);
  } else if (intent.kind === 'blocked')
    movingHint(s, 'Возьми другую сумку: в эту вещь не помещается.');
  else if (intent.kind === 'zip') actor.zipping = intent.target;
  else if (intent.kind === 'reopen') {
    const bag = bagById(s, intent.target)!;
    if (bag.status !== 'closed') return;
    bag.status = 'open';
    bag.zip = 0;
    movingHint(s, 'Открыли сумку. Здесь ещё есть место.');
  } else if (intent.kind === 'rest') {
    if (actor.activity === 'rest') {
      actor.activity = 'free';
      actor.activityProgress = 0;
      actor.taskTarget = null;
    } else {
      const station = movingStations.sofa[actor.id];
      actor.activity = 'rest';
      actor.facing = station.facing;
      actor.activityProgress = actor.stamina / 100;
      actor.taskTarget = {
        kind: 'sofa',
        id: actor.id,
        x: station.x,
        y: station.y,
      };
      say(s, actor.id === 0 ? 'yarikRest' : 'nastyaRest');
    }
    clearMovingRoute(actor);
  } else if (intent.kind === 'carry' || intent.kind === 'join') {
    if (s.chapter !== 'carrying') return;
    const bag = bagById(s, intent.target)!,
      setup = carrySetup(s, actor, bag);
    if (!setup.clear) return;
    actor.facing = setup.facing;
    actor.bagId = bag.id;
    bag.carriers.push(actor.id);
    bag.status = 'carried';
    clearMovingRoute(actor);
    if (bag.carriers.length === 2) say(s, 'together');
  }
}
function secondary(s: MovingState, actor: MovingActor) {
  stopWork(actor);
  if (actor.activity === 'rest') {
    actor.activity = 'free';
    actor.activityProgress = 0;
    actor.taskTarget = null;
  }
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
      movingHint(s, 'Открыли сумку. Здесь ещё есть место.');
    }
  }
  clearMovingRoute(actor);
}
function progressWork(
  s: MovingState,
  actor: MovingActor,
  input: MovingInput,
  dt: number,
) {
  if (actor.activity === 'packing') {
    const bag = bagById(s, actor.packingBag),
      item = itemById(s, actor.heldItem);
    if (
      !bag ||
      !item ||
      bag.status !== 'open' ||
      distance(actor, bag) > REACH ||
      !input.action ||
      bag.weight + item.weight > bag.capacity
    ) {
      stopWork(actor);
      return;
    }
    actor.working = true;
    actor.activityProgress = Math.min(
      1,
      actor.activityProgress +
        (dt * movingWorkRate(actor.stamina)) / PACK_SECONDS,
    );
    if (actor.activityProgress >= 1) {
      bag.weight += item.weight;
      bag.zip = 0;
      item.status = 'packed';
      item.bagId = bag.id;
      item.carrier = null;
      actor.heldItem = null;
      s.score += 30;
      stopWork(actor);
      movingHint(
        s,
        `${item.label} внутри. Сумка ${bag.id + 1}: ${bag.weight}/${bag.capacity} кг.`,
        movingCrew[actor.id].name,
      );
    }
  } else if (actor.zipping !== null) {
    const bag = bagById(s, actor.zipping);
    if (
      !bag ||
      bag.status !== 'open' ||
      distance(actor, bag) > REACH ||
      !input.action
    ) {
      actor.zipping = null;
      return;
    }
    actor.working = true;
    actor.facing = Math.atan2(bag.x - actor.x, bag.y - actor.y);
    bag.zip = Math.min(
      1,
      bag.zip + (dt * movingWorkRate(actor.stamina)) / ZIP_SECONDS,
    );
    if (bag.zip >= 1) {
      bag.status = 'closed';
      actor.zipping = null;
      movingHint(s, 'Молния закрыта. Отпусти кнопку.');
    }
  }
}
function inputFor(index: number, keys: ReadonlySet<string>): MovingInput {
  const b = PLAYER_BINDINGS[index],
    x = Number(keys.has(b.right)) - Number(keys.has(b.left)),
    y = Number(keys.has(b.down)) - Number(keys.has(b.up)),
    length = Math.hypot(x, y) || 1;
  return {
    x: x / length,
    y: y / length,
    action: keys.has(b.action) || (index === 0 && keys.has('Space')),
    alternate: keys.has(b.secondary),
  };
}
function fatigue(
  actor: MovingActor,
  load: number,
  bag: boolean,
  walked: number,
  dt: number,
) {
  let rate = 0.28;
  if (actor.activity === 'rest') rate = 3.6;
  else if (actor.working)
    rate = -(actor.activity === 'laptop'
      ? 2.1
      : actor.activity === 'packing'
        ? 2.6
        : 1.9);
  else if (walked > 0.001)
    rate = -(load * (bag ? 0.2 : 0.14) + (bag ? 0.7 : 0.42));
  else if (bag) rate = -0.2; // Holding luggage is not a rest station.
  if (rate < 0 && actor.id === 1) rate *= 1.35;
  actor.stamina = clamp(actor.stamina + rate * dt, 0, 100);
  if (actor.activity === 'rest') actor.activityProgress = actor.stamina / 100;
}
export function movingTick(s: MovingState, delta: number, keys: Set<string>) {
  if (s.paused || s.phase !== 'moving' || !Number.isFinite(delta)) return;
  const dt = clamp(delta, 0, 0.05);
  if (!dt) return;
  s.elapsed += dt;
  s.dayRemaining = MOVING_DAY_SECONDS - s.elapsed;
  for (const actor of s.actors) {
    actor.working = false;
    actor.vx = 0;
    actor.vy = 0;
  }
  const input = s.actors.map((_, i) => inputFor(i, keys));
  const human = input[0];
  const forced = movingDutyInput(s, dt, human);
  if (forced) input[0] = forced;
  if (s.players === 1) input[1] = movingAssistantInput(s, dt);
  for (const actor of s.actors) {
    const control = input[actor.id],
      duty = actor.id === 0 && (forced !== null || hasMovingDuty(s));
    if (!duty) {
      if (actor.activity === 'rest' && (control.x || control.y)) {
        actor.activity = 'free';
        actor.activityProgress = 0;
        actor.taskTarget = null;
      }
      if (control.alternate && !s.previousSecondary[actor.id])
        secondary(s, actor);
      else if (control.action && !s.previousAction[actor.id]) act(s, actor);
      if (!control.action) stopWork(actor);
      progressWork(s, actor, control, dt);
    }
    // A forced route suppresses actions, not the physical button state. The
    // laptop hold must be released before it can become a new pickup press.
    const physical = actor.id === 0 ? human : control;
    s.previousAction[actor.id] = physical.action;
    s.previousSecondary[actor.id] = physical.alternate;
  }
  const moved = new Set<number>();
  for (const actor of s.actors) {
    if (moved.has(actor.id)) continue;
    const bag = bagById(s, actor.bagId),
      members = bag ? bag.carriers.map((id) => s.actors[id]) : [actor];
    members.forEach((a) => moved.add(a.id));
    let x = 0,
      y = 0;
    for (const member of members)
      if (
        member.zipping === null &&
        !['packing', 'rest', 'laptop', 'toilet'].includes(member.activity)
      ) {
        x += input[member.id].x / members.length;
        y += input[member.id].y / members.length;
      }
    const stamina = Math.min(...members.map((a) => a.stamina)),
      load = bag
        ? bag.weight / members.length
        : (itemById(s, actor.heldItem)?.weight ?? 0);
    const speed =
      118 *
      (bag
        ? Math.max(0.38, 1 - load * 0.045)
        : actor.heldItem !== null
          ? 0.88
          : 1) *
      (0.36 + 0.64 * Math.min(1, stamina / 30));
    const walked = walkGroup(s, members, x * speed * dt, y * speed * dt, bag);
    for (const member of members) {
      if (Math.hypot(x, y) > 0.1)
        member.routeBlocked =
          walked < speed * dt * 0.08 ? member.routeBlocked + dt : 0;
      fatigue(member, load, !!bag, walked, dt);
    }
    if (bag) {
      const point = movingCarryPoint(members);
      bag.x = point.x;
      bag.y = point.y;
      if (members.length > 1 && walked > 0.001) s.teamwork += dt;
      if (
        s.chapter === 'carrying' &&
        bag.weight > 0 &&
        distance(bag, entry) < entry.radius
      ) {
        bag.status = 'delivered';
        bag.carriers = [];
        members.forEach((a) => {
          a.bagId = null;
          clearMovingRoute(a);
        });
        s.score += bag.weight * 12;
        s.delivered++;
        if (s.delivered === 1) say(s, 'firstBag');
        else movingHint(s, `У двери: ${s.delivered} сумок.`);
      }
    }
  }
  for (const item of s.items)
    if (item.carrier !== null) {
      item.x = s.actors[item.carrier].x;
      item.y = s.actors[item.carrier].y;
    }
  if (
    s.chapter === 'packing' &&
    s.items.every((item) => item.status === 'packed')
  ) {
    s.chapter = 'carrying';
    say(s, 'packed');
    for (const actor of s.actors) clearMovingRoute(actor);
  }
  if (
    s.chapter === 'carrying' &&
    s.items.every((item) => item.status === 'packed') &&
    s.bags.every((bag) => bag.weight === 0 || bag.status === 'delivered') &&
    !hasMovingDuty(s)
  ) {
    s.phase = 'result';
    s.score +=
      Math.max(0, Math.round(300 - s.elapsed * 0.35)) +
      Math.min(150, Math.round(s.teamwork * 2));
    say(s, 'finish');
  }
}
