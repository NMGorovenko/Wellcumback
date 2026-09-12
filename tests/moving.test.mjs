import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshMoving,
  movingAction,
  movingTick,
  movingIntent,
  movingCanStand,
  ACTOR_RADIUS,
  BAG_RADIUS,
  movingCarryPoint,
} from '../lib/game/moving/engine.ts';
import {
  entry,
  bounds,
  obstacles,
  itemAnchors,
  movingOverview,
} from '../lib/game/moving/layout.ts';
import { PLAYER_BINDINGS } from '../lib/game/input/gamepads.ts';
import * as THREE from 'three';

const run = (s, seconds, keys = []) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.025)
    movingTick(s, Math.min(0.025, seconds - t), new Set(keys));
};
const pulse = (s, key) => {
  run(s, 0.025, [key]);
  run(s, 0.025);
};
const start = (players = 1) => {
  const s = freshMoving(players);
  movingAction(s);
  return s;
};
const intentAt = (s, i, p) =>
  movingIntent(
    { ...s, actors: s.actors.map((a, j) => (i === j ? { ...a, ...p } : a)) },
    i,
  );
// Test controller finds a route, then drives real keys. It never teleports actors
// or changes inventory, clock, phases, score, or zip progress during a playthrough.
function approach(s, actorId, goal, done = () => false) {
  const actor = s.actors[actorId],
    radius = actor.bagId === null ? ACTOR_RADIUS : BAG_RADIUS;
  const free = (p) => {
    const bagPoint =
      actor.bagId === null
        ? null
        : movingCarryPoint([{ ...p, facing: p.facing ?? actor.facing }]);
    return (
      movingCanStand(s, p, radius + 4, actor.bagId) &&
      (!bagPoint || movingCanStand(s, bagPoint, BAG_RADIUS + 4, actor.bagId)) &&
      s.actors.every(
        (other) =>
          other.id === actorId ||
          (Math.hypot(p.x - other.x, p.y - other.y) >=
            radius + ACTOR_RADIUS + 4 &&
            (!bagPoint ||
              Math.hypot(bagPoint.x - other.x, bagPoint.y - other.y) >=
                BAG_RADIUS + ACTOR_RADIUS + 4)),
      )
    );
  };
  const step = 16,
    origin = { x: actor.x, y: actor.y };
  const nodes = [{ ...origin, facing: actor.facing, gx: 0, gy: 0, parent: -1 }],
    seen = new Set(['0,0']);
  let target = -1;
  for (let cursor = 0; cursor < nodes.length; cursor++) {
    const node = nodes[cursor];
    if (goal(node)) {
      target = cursor;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const gx = node.gx + dx,
        gy = node.gy + dy,
        key = `${gx},${gy},${actor.bagId === null ? '' : `${dx},${dy}`}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const facing = Math.atan2(dx, dy),
        p = { x: origin.x + gx * step, y: origin.y + gy * step, facing };
      if (
        !free({ ...node, facing }) ||
        !free(p) ||
        !free({ x: (node.x + p.x) / 2, y: (node.y + p.y) / 2, facing })
      )
        continue;
      nodes.push({ ...p, gx, gy, parent: cursor });
    }
  }
  assert.notEqual(
    target,
    -1,
    `reachable target from ${actor.x},${actor.y}, bag=${actor.bagId}`,
  );
  const path = [];
  for (let n = target; n > 0; n = nodes[n].parent) path.unshift(nodes[n]);
  const b = PLAYER_BINDINGS[actorId];
  for (const point of path) {
    const horizontal = Math.abs(Math.sin(point.facing)) > 0.5,
      axis = horizontal ? 'x' : 'y';
    for (let frame = 0; Math.abs(actor[axis] - point[axis]) > 0.2; frame++) {
      if (done()) return;
      assert.ok(
        frame < 600,
        `walk progresses at ${actor.x},${actor.y} toward ${point.x},${point.y}`,
      );
      const key = horizontal
        ? actor.x < point.x
          ? b.right
          : b.left
        : actor.y < point.y
          ? b.down
          : b.up;
      // The final small timestep prevents a controller overshoot from issuing an
      // unintended diagonal turn. Every step still goes through ordinary keys.
      run(s, Math.min(0.025, Math.abs(actor[axis] - point[axis]) / 118), [key]);
      assert.ok(
        movingCanStand(s, actor, radius, actor.bagId),
        'body remains off furniture',
      );
      if (actor.bagId !== null)
        assert.ok(
          movingCanStand(s, movingCarryPoint([actor]), BAG_RADIUS, actor.bagId),
          'visible luggage remains off furniture',
        );
    }
  }
}
function reachIntent(s, kind, id, actor = 0) {
  approach(s, actor, (p) => {
    const intent = intentAt(s, actor, p);
    const target = kind === 'item' ? s.items[id] : s.bags[id];
    return (
      Math.hypot(p.x - target.x, p.y - target.y) < 60 &&
      intent.kind === kind &&
      intent.target === id &&
      (kind !== 'carry' ||
        (movingCanStand(s, p, BAG_RADIUS, id) &&
          movingCanStand(
            s,
            movingCarryPoint([
              { ...p, facing: Math.atan2(target.x - p.x, target.y - p.y) },
            ]),
            BAG_RADIUS,
            id,
          )))
    );
  });
  assert.equal(movingIntent(s, actor).kind, kind);
}
function pack(s, itemId, bagId, actor = 0) {
  reachIntent(s, 'item', itemId, actor);
  pulse(s, PLAYER_BINDINGS[actor].action);
  assert.equal(s.actors[actor].heldItem, itemId);
  reachIntent(s, 'pack', bagId, actor);
  pulse(s, PLAYER_BINDINGS[actor].action);
  assert.equal(s.items[itemId].status, 'packed');
}
function deliver(s, bagId, actor = 0) {
  reachIntent(s, 'zip', bagId, actor);
  run(s, 1.4, [PLAYER_BINDINGS[actor].action]);
  run(s, 0.05);
  assert.equal(s.bags[bagId].status, 'closed');
  reachIntent(s, 'carry', bagId, actor);
  pulse(s, PLAYER_BINDINGS[actor].action);
  assert.equal(s.actors[actor].bagId, bagId);
  approach(
    s,
    actor,
    (p) => Math.hypot(p.x - entry.x, p.y - entry.y) < entry.radius - 8,
    () => s.bags[bagId].status === 'delivered',
  );
  assert.equal(s.bags[bagId].status, 'delivered');
  if (s.players > 1 && s.phase === 'moving') {
    // Human teammates clear the doorway after unloading so the next carrier can pass.
    const parking = { x: 150 + actor * 45, y: 800 };
    approach(
      s,
      actor,
      (p) => Math.hypot(p.x - parking.x, p.y - parking.y) < 12,
    );
  }
}

for (const players of [1, 2, 3])
  void test(`${players} players complete packing, zipping, carrying and delivery using ordinary keys`, () => {
    const s = start(players);
    for (const [bag, items] of [
      [0, [0, 1, 2]],
      [1, [3, 4, 6]],
      [2, [5, 7]],
    ]) {
      for (const item of items) pack(s, item, bag, bag % players);
      deliver(s, bag, bag % players);
    }
    assert.equal(s.phase, 'result');
    assert.equal(s.delivered, 3);
    assert.equal(s.items.length, itemAnchors.length);
    assert.ok(s.score >= itemAnchors.length * 30 + 36 * 12);
    const before = { score: s.score, elapsed: s.elapsed };
    run(s, 10, ['KeyE', 'KeyS']);
    assert.deepEqual(
      { score: s.score, elapsed: s.elapsed },
      before,
      'finished game cannot farm score or time',
    );
  });
void test('weight limit cannot be bypassed and held action does not duplicate an item', () => {
  const s = start();
  s.actors[0].x = 200;
  s.actors[0].y = 410;
  s.bags[0].weight = 8;
  s.items[0].status = 'held';
  s.items[0].carrier = 0;
  s.actors[0].heldItem = 0;
  assert.equal(movingIntent(s, 0).kind, 'blocked');
  run(s, 2, ['KeyE']);
  assert.equal(s.bags[0].weight, 8);
  assert.equal(s.items[0].status, 'held');
  assert.equal(s.score, 0);
  s.bags[0].weight = 6;
  run(s, 0.05);
  run(s, 2, ['KeyE']);
  assert.equal(s.bags[0].weight, 12);
  assert.equal(s.items[0].status, 'packed');
  assert.equal(s.score, 30);
  assert.equal(
    s.bags[0].status,
    'open',
    'a held pack button cannot automatically zip and lift',
  );
});
void test('zip needs a hold, pauses safely, reopens, and never delivers an open or empty bag', () => {
  const s = start();
  s.actors[0].x = 220;
  s.actors[0].y = 405;
  s.bags[0].weight = 6;
  pulse(s, 'KeyE');
  assert.ok(s.bags[0].zip < 0.1);
  assert.equal(s.bags[0].status, 'open');
  s.paused = true;
  const zip = s.bags[0].zip;
  run(s, 3, ['KeyE']);
  assert.equal(s.bags[0].zip, zip);
  s.paused = false;
  run(s, 1.4, ['KeyE']);
  run(s, 0.05);
  assert.equal(s.bags[0].status, 'closed');
  pulse(s, 'ShiftLeft');
  assert.equal(s.bags[0].status, 'open');
  assert.equal(s.bags[0].zip, 0);
  Object.assign(s.actors[0], entry);
  Object.assign(s.bags[0], entry);
  run(s, 1, ['KeyE']);
  assert.equal(s.delivered, 0);
});
void test('heavy two-person carry moves faster and consumes less stamina per player', () => {
  const setup = (players) => {
    const s = start(players);
    const bag = s.bags[0];
    Object.assign(bag, {
      x: 300,
      y: 250,
      weight: 12,
      status: 'closed',
      zip: 1,
    });
    Object.assign(s.actors[0], { x: 300, y: 200 });
    if (players > 1) Object.assign(s.actors[1], { x: 300, y: 299 });
    pulse(s, 'KeyE');
    if (players > 1) pulse(s, 'Enter');
    assert.equal(bag.carriers.length, players);
    return s;
  };
  const solo = setup(1),
    pair = setup(2),
    soloStart = solo.actors[0].y,
    pairStart = pair.actors[0].y;
  run(solo, 0.6, ['KeyS']);
  run(pair, 0.6, ['KeyS', 'ArrowDown']);
  assert.ok(
    pair.actors[0].y - pairStart > (solo.actors[0].y - soloStart) * 1.5,
  );
  assert.ok(pair.actors[0].stamina > solo.actors[0].stamina);
  assert.ok(pair.teamwork > 0.5);
  const tired = solo.actors[0].stamina;
  run(solo, 1);
  assert.ok(solo.actors[0].stamina > tired);
  pulse(pair, 'ShiftRight');
  assert.deepEqual(pair.bags[0].carriers, [0]);
  assert.equal(pair.actors[1].bagId, null);
});
void test('each player owns their own inventory and the third player uses O/U', () => {
  const s = start(3);
  s.actors.forEach((a, i) =>
    Object.assign(a, { x: s.items[i].x, y: s.items[i].y + 38 }),
  );
  pulse(s, 'KeyO');
  assert.equal(s.actors[2].heldItem, 2);
  assert.equal(s.actors[0].heldItem, null);
  assert.equal(s.actors[1].heldItem, null);
  pulse(s, 'KeyU');
  assert.equal(s.actors[2].heldItem, null);
  assert.equal(s.items[2].status, 'floor');
  assert.equal(s.items[2].carrier, null);
  assert.equal(s.score, 0);
});
void test('delivering a partly filled bag leaves a fresh bag available for remaining items', () => {
  const s = start();
  s.bags.forEach((bag) => {
    bag.weight = 2;
    bag.status = 'closed';
    bag.zip = 1;
  });
  Object.assign(s.actors[0], { x: entry.x, y: entry.y, bagId: 0 });
  s.bags[0].status = 'carried';
  s.bags[0].carriers = [0];
  run(s, 0.025);
  assert.equal(s.bags[0].status, 'delivered');
  assert.ok(s.bags.some((bag) => bag.status === 'open' && bag.weight === 0));
  assert.equal(s.phase, 'moving');
  assert.equal(s.score, 24, 'delivery awards weight once, not empty bags');
  run(s, 1);
  assert.equal(s.score, 24);
});
void test('furniture, bounds and other people block walking; stopping restores exhausted players', () => {
  const s = start(3);
  Object.assign(s.actors[0], { x: 270, y: 900 });
  run(s, 3, ['KeyA']);
  assert.ok(
    s.actors[0].x >=
      obstacles.find((o) => o.kind === 'kitchen').x + 190 + ACTOR_RADIUS,
  );
  s.actors[0].stamina = 0;
  run(s, 2);
  assert.ok(s.actors[0].stamina >= 45);
  const before = s.actors.map((a) => ({ x: a.x, y: a.y }));
  s.paused = true;
  run(s, 1, ['KeyS', 'ArrowDown', 'KeyK']);
  assert.deepEqual(
    s.actors.map((a) => ({ x: a.x, y: a.y })),
    before,
  );
});
void test('overview contains every floor corner and standing head in landscape and portrait', () => {
  for (const aspect of [16 / 9, 4 / 3, 9 / 16]) {
    const framing = movingOverview(aspect),
      camera = new THREE.PerspectiveCamera(43, aspect, 0.08, framing.far);
    camera.position.copy(framing.position);
    camera.lookAt(framing.look.x, framing.look.y, framing.look.z);
    camera.updateMatrixWorld();
    for (const x of [bounds.minX, bounds.maxX])
      for (const y of [bounds.minY, bounds.maxY])
        for (const h of [0, 2.2]) {
          const projected = new THREE.Vector3(
            (x - 300) / 70,
            h,
            (y - 540) / 70,
          ).project(camera);
          assert.ok(
            Math.abs(projected.x) < 0.95 &&
              Math.abs(projected.y) < 0.95 &&
              Math.abs(projected.z) < 1,
            `visible at ${aspect}: ${x},${y},${h}`,
          );
        }
  }
});
