import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshMoving,
  movingAction,
  movingTick,
  movingIntent,
  ACTOR_RADIUS,
  movingCanStand,
  movingCarryPoint,
  BAG_RADIUS,
  SOLO_CARRY_OFFSET,
} from '../lib/game/moving/engine.ts';
import { obstacles } from '../lib/game/moving/layout.ts';
function carrying(players = 1) {
  const s = freshMoving(players);
  movingAction(s);
  const actor = s.actors[0],
    bag = s.bags[0];
  Object.assign(actor, { x: 380, y: 900, facing: Math.PI / 2, bagId: 0 });
  Object.assign(bag, {
    ...movingCarryPoint([actor]),
    status: 'carried',
    carriers: [0],
    weight: 6,
    zip: 1,
  });
  return s;
}
void test('a carried bag stays in the hands and stops before the entry wardrobe, including a blocked turn', () => {
  const s = carrying(),
    actor = s.actors[0],
    bag = s.bags[0],
    wardrobe = obstacles.find((o) => o.kind === 'wardrobe');
  for (let frame = 0; frame < 300; frame++) {
    movingTick(s, 1 / 60, new Set(['KeyD']));
    assert.deepEqual({ x: bag.x, y: bag.y }, movingCarryPoint([actor]));
    assert.ok(
      Math.abs(
        Math.hypot(bag.x - actor.x, bag.y - actor.y) - SOLO_CARRY_OFFSET,
      ) < 1e-7,
    );
    assert.ok(movingCanStand(s, bag, BAG_RADIUS, bag.id));
    assert.ok(
      bag.x + BAG_RADIUS <= wardrobe.x + 1e-7,
      'the visible luggage footprint cannot enter the wardrobe',
    );
  }
  assert.ok(actor.x < 410, 'body stops early enough for the bag held in front');
  const before = { x: actor.x, y: actor.y };
  movingTick(s, 0.05, new Set(['KeyW']));
  assert.ok(movingCanStand(s, bag, BAG_RADIUS, bag.id));
  assert.ok(actor.y < before.y, 'turning along the wardrobe remains possible');
});
void test('releasing one handle cannot shift the remaining carrier bag into a wall or another person', () => {
  const s = carrying(2),
    bag = s.bags[0];
  Object.assign(s.actors[1], { x: 430, y: 900, facing: Math.PI / 2, bagId: 0 });
  bag.carriers = [0, 1];
  Object.assign(bag, movingCarryPoint(s.actors));
  movingTick(s, 0.025, new Set(['ShiftLeft']));
  assert.deepEqual(bag.carriers, [0, 1]);
  assert.ok(movingCanStand(s, bag, BAG_RADIUS, bag.id));
  movingTick(s, 0.05, new Set(['KeyA', 'ArrowLeft']));
  movingTick(s, 0.025, new Set(['ShiftRight']));
  assert.deepEqual(bag.carriers, [0]);
  assert.equal(s.actors[1].bagId, null);
  assert.deepEqual({ x: bag.x, y: bag.y }, movingCarryPoint([s.actors[0]]));
  assert.ok(movingCanStand(s, bag, BAG_RADIUS, bag.id));
});
void test('pickup faces the real handle before calculating the same point used by the scene', () => {
  const s = freshMoving();
  movingAction(s);
  const bag = s.bags[0],
    actor = s.actors[0];
  Object.assign(actor, { x: 220, y: 405, facing: Math.PI });
  Object.assign(bag, { status: 'closed', weight: 6, zip: 1 });
  movingTick(s, 0.025, new Set(['KeyE']));
  assert.equal(actor.bagId, 0);
  assert.equal(actor.facing, 0);
  assert.deepEqual({ x: bag.x, y: bag.y }, movingCarryPoint([actor]));
  assert.ok(bag.y > actor.y);
  assert.ok(movingCanStand(s, bag, BAG_RADIUS, bag.id));
});

void test('pickup cue asks for movement beside the sofa until the real carrying footprint fits', () => {
  const s = freshMoving();
  movingAction(s);
  const actor = s.actors[0],
    bag = s.bags[0];
  Object.assign(actor, { x: 155, y: 460 });
  Object.assign(bag, { status: 'closed', weight: 6, zip: 1 });
  assert.ok(movingCanStand(s, actor, ACTOR_RADIUS, bag.id));
  assert.equal(movingCanStand(s, actor, BAG_RADIUS, bag.id), false);
  const blocked = movingIntent(s, 0);
  assert.equal(
    blocked.kind,
    'search',
    'search uses the movement control badge',
  );
  assert.equal(blocked.target, bag.id);
  assert.match(blocked.label, /со свободной стороны/);
  movingTick(s, 0.025, new Set(['KeyE']));
  assert.equal(actor.bagId, null);
  assert.equal(bag.status, 'closed');
  for (let frame = 0; frame < 5; frame++)
    movingTick(s, 0.025, new Set(['KeyD']));
  assert.equal(movingIntent(s, 0).kind, 'carry');
  movingTick(s, 0.025, new Set(['KeyE']));
  assert.equal(
    actor.bagId,
    bag.id,
    'offered pickup succeeds with the same clearance check',
  );
  assert.ok(movingCanStand(s, bag, BAG_RADIUS, bag.id));
});

void test('second-handle cue checks the joining carrier footprint by the sofa', () => {
  const s = freshMoving(2);
  movingAction(s);
  const [first, second] = s.actors,
    bag = s.bags[0];
  Object.assign(first, { x: 215, y: 405, facing: 0, bagId: bag.id });
  Object.assign(bag, {
    ...movingCarryPoint([first]),
    status: 'carried',
    carriers: [0],
    weight: 6,
    zip: 1,
  });
  Object.assign(second, { x: 155, y: 432 });
  assert.ok(movingCanStand(s, second, ACTOR_RADIUS, bag.id));
  assert.equal(movingIntent(s, 1).kind, 'search');
  movingTick(s, 0.025, new Set(['Enter']));
  assert.equal(second.bagId, null);
  for (let frame = 0; frame < 5; frame++)
    movingTick(s, 0.025, new Set(['ArrowRight']));
  assert.equal(movingIntent(s, 1).kind, 'join');
  movingTick(s, 0.025, new Set(['Enter']));
  assert.deepEqual(bag.carriers, [0, 1]);
  assert.equal(second.bagId, bag.id);
});
