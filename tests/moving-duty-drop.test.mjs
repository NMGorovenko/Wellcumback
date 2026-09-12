import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshMoving,
  movingAction,
  movingTick,
  movingCarryPoint,
  movingPlanRoute,
} from '../lib/game/moving/engine.ts';
import {
  movingCanStand,
  forceDrop,
  releaseBag,
  movingDropKeepsAccess,
  BAG_RADIUS,
} from '../lib/game/moving/physics.ts';
import { movingStations } from '../lib/game/moving/layout.ts';
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function carrying(x = 435, y = 289, facing = Math.PI) {
  const s = freshMoving(2);
  movingAction(s);
  s.chapter = 'carrying';
  s.alert.nextAt = Infinity;
  s.toilet.nextAt = Infinity;
  const actor = s.actors[0],
    bag = s.bags[0];
  Object.assign(actor, { x, y, facing, bagId: 0 });
  Object.assign(bag, {
    ...movingCarryPoint([actor]),
    status: 'carried',
    carriers: [0],
    weight: 6,
    zip: 1,
  });
  return s;
}
function valid(s) {
  const a = s.actors[0],
    b = s.bags[0];
  return (
    movingCanStand(s, a, BAG_RADIUS, 0) &&
    movingCanStand(s, b, BAG_RADIUS, 0) &&
    s.actors.slice(1).every((p) => dist(p, a) >= 32 && dist(p, b) >= 43)
  );
}
void test('the alert cannot put luggage on the laptop station and strand its owner', () => {
  const s = carrying();
  assert.ok(valid(s));
  s.alert.nextAt = 0;
  movingTick(s, 0.025, new Set());
  assert.equal(s.bags[0].status, 'closed');
  assert.notDeepEqual({ x: s.bags[0].x, y: s.bags[0].y }, { x: 435, y: 240 });
  assert.ok(movingCanStand(s, movingStations.laptop));
  for (let n = 0; n < 600; n++) movingTick(s, 0.025, new Set(['KeyE']));
  assert.equal(s.alert.active, false);
  assert.equal(s.alert.progress, 1);
  assert.equal(
    s.actors[0].heldItem,
    null,
    'the fixed input boundary does not auto-pick cables',
  );
});
void test('ordinary secondary drops preserve future laptop and toilet access too', () => {
  const s = carrying();
  movingTick(s, 0.025, new Set(['ShiftLeft']));
  assert.equal(s.actors[0].bagId, null);
  assert.equal(s.bags[0].status, 'closed');
  for (const target of [movingStations.laptop, movingStations.toilet]) {
    assert.ok(movingCanStand(s, target));
    assert.ok(movingPlanRoute(s, s.actors[0], target, 6).length);
  }
  s.alert.nextAt = 0;
  for (let n = 0; n < 600; n++) movingTick(s, 0.025, new Set(['KeyE']));
  assert.equal(s.alert.active, false);
});
void test('sampled valid carrying positions all retain a route to the laptop after a forced drop', () => {
  let samples = 0;
  for (let x = 350; x <= 448; x += 14)
    for (let y = 150; y <= 342; y += 16)
      for (let n = 0; n < 8; n++) {
        const s = carrying(x, y, (n * Math.PI) / 4);
        if (!valid(s)) continue;
        if (
          !movingPlanRoute(
            { ...s, actors: s.actors.map((a) => ({ ...a, bagId: null })) },
            { ...s.actors[0], bagId: null },
            movingStations.laptop,
            6,
          ).length &&
          dist(s.actors[0], movingStations.laptop) > 6
        )
          continue;
        samples++;
        assert.ok(forceDrop(s, s.actors[0]), `no safe landing ${x},${y},${n}`);
        assert.ok(movingCanStand(s, movingStations.laptop));
        assert.ok(
          dist(s.actors[0], movingStations.laptop) <= 6 ||
            movingPlanRoute(s, s.actors[0], movingStations.laptop, 6).length,
          `laptop route sealed ${x},${y},${n} by ${JSON.stringify(s.bags[0])}`,
        );
      }
  assert.ok(samples > 100);
  console.log('valid near-desk drop samples', samples);
});
void test('both release functions reject a bag landing directly on every rest or duty station', () => {
  const s = carrying();
  for (const station of [
    movingStations.laptop,
    movingStations.toilet,
    ...movingStations.sofa,
  ])
    assert.equal(movingDropKeepsAccess(s, s.bags[0], station), false);
  // The same guard is used by a human release, without granting the bag a remote move.
  const before = { ...s.actors[0] };
  releaseBag(s, s.actors[0]);
  assert.equal(s.actors[0].x, before.x);
  assert.equal(s.actors[0].y, before.y);
  assert.equal(s.bags[0].weight, 6);
});
