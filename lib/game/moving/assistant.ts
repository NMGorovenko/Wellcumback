import { entry, movingStations } from './layout.ts';
import { movingIntent } from './intent.ts';
import { movingNavigate } from './navigation.ts';
import {
  bagById,
  distance,
  itemById,
  movingCarryPoint,
  REACH,
} from './physics.ts';
import type { MovingActor, MovingInput, MovingState, Point } from './types.ts';
const idle = (): MovingInput => ({
  x: 0,
  y: 0,
  action: false,
  alternate: false,
});
function intentAt(s: MovingState, actor: MovingActor, p: Point) {
  return movingIntent(
    {
      ...s,
      actors: s.actors.map((a) => (a.id === actor.id ? { ...a, ...p } : a)),
    },
    actor.id,
  );
}
function approach(
  s: MovingState,
  actor: MovingActor,
  target: Point,
  kind: string,
  id: number | null,
  dt: number,
  reach = REACH - 5,
): MovingInput {
  const goal = (p: Point) => {
    const intent = intentAt(s, actor, p);
    return intent.kind === kind && intent.target === id;
  };
  if (distance(actor, target) <= reach && goal(actor))
    return { ...idle(), action: !s.previousAction[actor.id] };
  return { ...idle(), ...movingNavigate(s, actor, target, dt, reach, goal) };
}
/** Solo Nastya uses normal walk/hold/release inputs. She has no direct inventory,
 * position or stamina mutations and follows the same collision and work rules. */
export function movingAssistantInput(s: MovingState, dt: number): MovingInput {
  const actor = s.actors[1];
  if (actor.activity === 'rest')
    return { ...idle(), action: actor.stamina >= 88 && !s.previousAction[1] };
  if (actor.packingBag !== null || actor.zipping !== null)
    return { ...idle(), action: true };
  if (actor.bagId !== null)
    return {
      ...idle(),
      ...movingNavigate(
        s,
        actor,
        entry,
        dt,
        90,
        (p) =>
          distance(
            movingCarryPoint([
              { ...p, facing: 'facing' in p ? Number(p.facing) : actor.facing },
            ]),
            entry,
          ) <
          entry.radius - 4,
      ),
    };
  if (actor.heldItem !== null) {
    const item = itemById(s, actor.heldItem)!;
    const candidates = s.bags.filter(
      (b) =>
        (b.status === 'open' || b.status === 'closed') &&
        b.weight +
          item.weight +
          s.actors
            .filter((a) => a.id !== 1 && a.packingBag === b.id)
            .reduce(
              (sum, a) => sum + (itemById(s, a.heldItem)?.weight ?? 0),
              0,
            ) <=
          b.capacity,
    );
    const bag = candidates.sort(
      (a, b) => distance(a, actor) - distance(b, actor),
    )[0];
    return bag
      ? approach(
          s,
          actor,
          bag,
          bag.status === 'closed' ? 'reopen' : 'pack',
          bag.id,
          dt,
        )
      : idle();
  }
  if (actor.stamina < 27)
    return approach(s, actor, movingStations.sofa[1], 'rest', 1, dt, 24);
  if (s.chapter === 'packing') {
    const item = s.items
      .filter((item) => item.status === 'floor')
      .sort((a, b) => distance(a, actor) - distance(b, actor))[0];
    if (item) return approach(s, actor, item, 'item', item.id, dt);
  } else {
    const bag = s.bags
      .filter(
        (b) => b.weight > 0 && (b.status === 'open' || b.status === 'closed'),
      )
      .sort((a, b) => distance(a, actor) - distance(b, actor))[0];
    if (bag)
      return approach(
        s,
        actor,
        bag,
        bag.status === 'open' ? 'zip' : 'carry',
        bag.id,
        dt,
        58,
      );
  }
  // Waiting away from work stations leaves the doorway and Yarik's desk clear.
  // Separate the threshold for starting a break from the threshold for leaving
  // it. Walking off the sofa costs energy and must not immediately restart it.
  if (actor.stamina < 60)
    return approach(s, actor, movingStations.sofa[1], 'rest', 1, dt, 24);
  const partnerBag = bagById(s, s.actors[0].bagId);
  const parking = partnerBag ? { x: 330, y: 420 } : { x: 335, y: 360 };
  return { ...idle(), ...movingNavigate(s, actor, parking, dt, 24) };
}
