import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshMoving,
  movingAction,
  movingTick,
  movingIntent,
  movingCanStand,
  movingCarryPoint,
  movingPlanRoute,
  ACTOR_RADIUS,
  BAG_RADIUS,
  MOVING_DAY_SECONDS,
  movingCrew,
} from '../lib/game/moving/engine.ts';
import {
  movingStations,
  itemAnchors,
  obstacles,
  entry,
} from '../lib/game/moving/layout.ts';
import { PLAYER_BINDINGS } from '../lib/game/input/bindings.ts';
import { movingHint, say } from '../lib/game/moving/messages.ts';
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const run = (s, seconds, keys = []) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.025)
    movingTick(
      s,
      Math.min(0.025, seconds - t),
      new Set(typeof keys === 'function' ? keys(s) : keys),
    );
};
const laptopControls = (s) => {
  const intent = movingIntent(s, 0);
  if (intent.kind !== 'laptop' || intent.release) return [];
  return [PLAYER_BINDINGS[0][intent.control ?? 'action']];
};
const finishLaptop = (s) => {
  for (let n = 0; n < 1200 && s.alert.active; n++)
    movingTick(s, 0.025, new Set(laptopControls(s)));
  assert.equal(
    s.alert.active,
    false,
    'real advertised operations complete the incident',
  );
};
const start = (players = 2) => {
  const s = freshMoving(players);
  movingAction(s);
  return s;
};

void test('idle Nastya leaves a finished couch break instead of repeatedly sitting back down', () => {
  const s = start(1);
  s.chapter = 'carrying';
  s.items.forEach((item) => {
    item.status = 'packed';
  });
  s.bags.forEach((bag) => {
    bag.status = 'delivered';
  });
  s.alert.active = true; // Yarik still has work; Nastya is waiting for him.
  s.actors[0].activity = 'laptop';
  Object.assign(s.actors[1], movingStations.sofa[1], {
    activity: 'rest',
    stamina: 88,
  });
  const seq = s.messageSeq;
  run(s, 20);
  assert.equal(s.actors[1].activity, 'free');
  assert.ok(
    dist(s.actors[1], movingStations.sofa[1]) > 80,
    'she walked clear of the sofa',
  );
  assert.ok(s.messageSeq - seq < 5, 'no repeated rest dialogue');
});
const pulse = (s, key) => {
  run(s, 0.025, [key]);
  run(s, 0.025);
};

void test('finishing the laptop repair action requires release before a nearby item pickup', () => {
  const s = start(2);
  s.alert.nextAt = 0;
  s.alert.count = 1; // Connection incident ends with the ordinary action key.
  run(s, 20);
  assert.equal(s.actors[0].activity, 'laptop');
  finishLaptop(s);
  run(s, 0.3, ['KeyE']);
  assert.equal(s.alert.active, false);
  assert.equal(
    s.actors[0].heldItem,
    null,
    'held E did not become a second press',
  );
  pulse(s, 'KeyE'); // Still held from the previous tick; only the release is new.
  pulse(s, 'KeyE');
  assert.notEqual(
    s.actors[0].heldItem,
    null,
    'a new press can pick up the nearby item',
  );
});
const intentAt = (s, index, p) =>
  movingIntent(
    {
      ...s,
      actors: s.actors.map((a, i) => (i === index ? { ...a, ...p } : a)),
    },
    index,
  );

/** Independent test driver plans a route but only sends real canonical keys.
 * No positions, inventories, fatigue, deadlines or work progress are modified. */
class Driver {
  route = [];
  key = '';
  blocked = 0;
  last = null;
  input(s, index) {
    const actor = s.actors[index],
      bindings = PLAYER_BINDINGS[index],
      keys = [];
    const action = () => (s.previousAction[index] ? [] : [bindings.action]);
    if (actor.activity === 'laptop') return laptopControls(s);
    if (['alert-walk', 'toilet-walk', 'toilet'].includes(actor.activity))
      return [];
    if (actor.activity === 'rest') return actor.stamina >= 84 ? action() : [];
    if (actor.activity === 'packing' || actor.zipping !== null)
      return [bindings.action];
    let target,
      kind,
      id,
      reach = 59,
      goal;
    if (actor.bagId !== null) {
      target = entry;
      kind = 'entry';
      reach = 90;
      goal = (p) =>
        dist(
          movingCarryPoint([{ ...p, facing: p.facing ?? actor.facing }]),
          entry,
        ) <
        entry.radius - 5;
    } else if (actor.heldItem !== null) {
      const item = s.items[actor.heldItem];
      target = s.bags
        .filter(
          (b) =>
            ['open', 'closed'].includes(b.status) &&
            b.weight + item.weight <= b.capacity,
        )
        .sort((a, b) => dist(actor, a) - dist(actor, b))[0];
      if (!target) return [];
      kind = target.status === 'closed' ? 'reopen' : 'pack';
      id = target.id;
    } else if (actor.stamina < 26) {
      target = movingStations.sofa[index];
      kind = 'rest';
      id = index;
      reach = 24;
    } else if (s.chapter === 'packing') {
      target = s.items
        .filter((i) => i.status === 'floor')
        .sort((a, b) => dist(actor, a) - dist(actor, b))[0];
      kind = 'item';
      id = target?.id;
    } else {
      target = s.bags
        .filter((b) => b.weight > 0 && ['open', 'closed'].includes(b.status))
        .sort((a, b) => dist(actor, a) - dist(actor, b))[0];
      kind = target?.status === 'open' ? 'zip' : 'carry';
      id = target?.id;
      reach = 58;
    }
    if (!target) {
      target = { x: 280 + index * 70, y: 350 };
      kind = 'park';
      reach = 24;
    }
    goal ??= (p) => {
      const intent = intentAt(s, index, p);
      return kind === 'park' || (intent.kind === kind && intent.target === id);
    };
    if (dist(actor, target) <= reach && goal(actor)) {
      this.route = [];
      this.key = '';
      return kind === 'park' || kind === 'entry' ? [] : action();
    }
    const key = `${kind},${id},${Math.round(target.x)},${Math.round(target.y)},${actor.bagId}`;
    if (this.last && dist(actor, this.last) < 0.03) this.blocked++;
    else this.blocked = 0;
    this.last = { x: actor.x, y: actor.y };
    if (this.key !== key || this.blocked > 12 || !this.route.length) {
      this.route = movingPlanRoute(s, actor, target, reach, goal);
      this.key = key;
      this.blocked = 0;
    }
    while (this.route.length && dist(actor, this.route[0]) < 3)
      this.route.shift();
    const point = this.route[0];
    if (!point) return [];
    const dx = point.x - actor.x,
      dy = point.y - actor.y;
    if (Math.abs(dx) > 2) keys.push(dx > 0 ? bindings.right : bindings.left);
    if (Math.abs(dy) > 2) keys.push(dy > 0 ? bindings.down : bindings.up);
    return keys;
  }
}
function invariant(s, previous) {
  assert.equal(s.actors.length, Math.max(2, s.players));
  assert.ok(
    s.actors.every((a, i) =>
      s.actors.slice(i + 1).every((b) => dist(a, b) >= ACTOR_RADIUS * 2 - 1e-6),
    ),
    'characters do not overlap',
  );
  for (const actor of s.actors) {
    assert.ok(
      movingCanStand(s, actor, ACTOR_RADIUS, actor.bagId),
      `actor ${actor.id} outside furniture and floor bags`,
    );
    assert.ok(actor.stamina >= 0 && actor.stamina <= 100);
    if (previous)
      assert.ok(
        dist(actor, previous[actor.id]) <= 118 * 0.025 + 0.001,
        'no teleport on forced duty',
      );
  }
  for (const bag of s.bags) {
    assert.ok(bag.weight >= 0 && bag.weight <= bag.capacity);
    assert.equal(
      bag.weight,
      s.items
        .filter((i) => i.bagId === bag.id)
        .reduce((n, i) => n + i.weight, 0),
    );
    if (bag.status === 'carried') {
      assert.deepEqual(
        { x: bag.x, y: bag.y },
        movingCarryPoint(bag.carriers.map((id) => s.actors[id])),
      );
      assert.ok(
        movingCanStand(s, bag, BAG_RADIUS, bag.id),
        'luggage clears the furniture',
      );
    }
  }
  for (const item of s.items) {
    if (item.status === 'held')
      assert.equal(s.actors[item.carrier].heldItem, item.id);
    if (item.status === 'packed') assert.equal(item.carrier, null);
  }
}
for (const players of [1, 2, 3])
  void test(`${players} humans complete both chapters by walking and pressing controls, including recurring duties`, () => {
    const s = start(players),
      drivers = Array.from(
        { length: Math.max(2, players) },
        () => new Driver(),
      );
    let seenPacking = false,
      seenRest = false,
      seenLaptop = false,
      seenToilet = false;
    for (let frame = 0; frame < 48000 && s.phase !== 'result'; frame++) {
      const before = s.actors.map((a) => ({ x: a.x, y: a.y }));
      const keys = new Set(
        drivers.flatMap((driver, id) =>
          id < players ? driver.input(s, id) : [],
        ),
      );
      movingTick(s, 0.025, keys);
      if (players === 3 && frame % 100 === 0)
        Object.assign(s, JSON.parse(JSON.stringify(s)));
      invariant(s, before);
      seenPacking ||= s.actors.some(
        (a) =>
          a.activity === 'packing' &&
          a.activityProgress > 0 &&
          a.heldItem !== null,
      );
      seenRest ||= s.actors.some((a) => a.activity === 'rest');
      seenLaptop ||= s.actors[0].activity === 'laptop';
      seenToilet ||= s.actors[0].activity === 'toilet';
      if (s.chapter === 'packing')
        assert.equal(s.delivered, 0, 'first pack every item');
    }
    assert.equal(
      s.phase,
      'result',
      JSON.stringify({
        time: s.elapsed,
        actors: s.actors,
        intents: s.actors.map((a) => movingIntent(s, a.id)),
        bags: s.bags,
      }),
    );
    assert.equal(s.items.filter((i) => i.status === 'packed').length, 22);
    assert.ok(s.bags.every((b) => b.weight === 0 || b.status === 'delivered'));
    assert.ok(seenPacking && seenRest && seenLaptop);
    assert.ok(s.alert.count >= 1);
    // Three coordinated people can finish before the first toilet interruption.
    // Otherwise the driver must actually complete it, not skip its animation.
    assert.ok(
      (seenToilet && s.toilet.count >= 1) ||
        s.elapsed < freshMoving(players).toilet.nextAt,
    );
    if (players === 1)
      assert.ok(s.actors[1].stamina < 100, 'the solo assistant did real work');
    assert.ok(s.score >= 22 * 30 + 82 * 12);
    const finished = structuredClone(s);
    run(s, 10, ['KeyE', 'Enter', 'KeyS']);
    assert.deepEqual(s, finished, 'result cannot farm score or timers');
  });
void test('moving preserves the solo couple and adds Nikita as the third human helper', () => {
  assert.deepEqual(
    movingCrew.map((p) => p.name),
    ['Ярик', 'Настя', 'Никита'],
  );
  for (const players of [0, 1, 2, 3, 99, NaN]) {
    const s = freshMoving(players);
    assert.equal(s.actors.length, Math.max(2, s.players));
    assert.equal(s.actorCount, s.players);
    assert.ok(s.players >= 1 && s.players <= 3);
  }
  const s = start(3);
  run(s, 0.1, ['KeyO', 'KeyU']);
  assert.ok(s.actors.every((a) => a.heldItem === null));
});
void test('packing and zipper need a hold, cannot duplicate an item, and preserve it when interrupted', () => {
  const s = start();
  s.items.slice(1, -1).forEach((item) => {
    item.status = 'packed';
  });
  Object.assign(s.actors[0], { x: 220, y: 405, heldItem: 0 });
  Object.assign(s.items[0], { status: 'held', carrier: 0 });
  run(s, 0.8, ['KeyE']);
  assert.equal(s.items[0].status, 'held');
  assert.ok(s.actors[0].activityProgress > 0.4);
  assert.equal(s.bags[0].weight, 0);
  run(s, 0.05);
  assert.equal(s.actors[0].activity, 'free');
  assert.equal(s.items[0].status, 'held');
  run(s, 1.7, ['KeyE']);
  assert.equal(s.items[0].status, 'packed');
  assert.equal(s.bags[0].weight, 6);
  assert.equal(s.score, 30);
  run(s, 3, ['KeyE']);
  assert.equal(s.bags[0].status, 'open', 'held pack cannot also zip');
  assert.equal(s.score, 30);
  run(s, 0.05);
  run(s, 1, ['KeyE']);
  assert.ok(s.bags[0].zip > 0.4 && s.bags[0].zip < 0.6);
  s.paused = true;
  const snapshot = structuredClone(s);
  run(s, 10, ['KeyE']);
  assert.deepEqual(s, snapshot);
  s.paused = false;
  run(s, 1.2, ['KeyE']);
  assert.equal(s.bags[0].status, 'closed');
  run(s, 0.05);
  pulse(s, 'KeyE');
  assert.equal(
    s.bags[0].status,
    'open',
    'closed bags reopen in packing chapter',
  );
  assert.equal(s.actors[0].bagId, null);
});
void test('capacity cannot be bypassed by concurrent holds, and six bags allow every even-weight distribution', () => {
  const s = start();
  const bag = s.bags[0];
  bag.weight = 16;
  Object.assign(s.actors[0], { x: 220, y: 405, heldItem: 0 });
  Object.assign(s.items[0], { status: 'held', carrier: 0 });
  run(s, 3, ['KeyE']);
  assert.equal(bag.weight, 16);
  assert.equal(s.items[0].status, 'held');
  assert.equal(
    itemAnchors.reduce((n, item) => n + item.weight, 0),
    82,
  );
  // Every item is at most 6 and all weights are even. If all six remaining
  // capacities were <6, at least 84kg would already be packed, exceeding 82kg.
  for (let seed = 0; seed < 100; seed++) {
    const weights = itemAnchors.map((i) => i.weight),
      loads = Array(6).fill(0);
    for (let i = 0; i < weights.length; i++) {
      const weight = weights[(i * 7 + seed) % weights.length];
      const options = loads
        .map((load, id) => ({ load, id }))
        .filter((v) => v.load + weight <= 18);
      assert.ok(options.length);
      const choice = options[(seed + i) % options.length];
      loads[choice.id] += weight;
    }
  }
});
void test('fatigue is gradual, Nastya tires faster, idle recovery is slow and couch reels restore energy', () => {
  const s = start();
  s.actors.forEach((a, id) =>
    Object.assign(a, { x: 280 + id * 100, y: 680, stamina: 60 }),
  );
  run(s, 1, ['KeyW', 'ArrowUp']);
  assert.ok(s.actors[0].stamina > s.actors[1].stamina);
  assert.ok(s.actors[0].stamina < 60);
  const before = s.actors.map((a) => a.stamina);
  run(s, 2);
  s.actors.forEach((a, id) => assert.ok(a.stamina - before[id] <= 0.81));
  s.actors.forEach((a, id) =>
    Object.assign(a, {
      x: movingStations.sofa[id].x,
      y: movingStations.sofa[id].y,
      stamina: 10,
    }),
  );
  run(s, 0.025, ['KeyE', 'Enter']);
  assert.ok(s.actors.every((a) => a.activity === 'rest'));
  run(s, 5);
  assert.ok(s.actors.every((a) => a.stamina > 27 && a.stamina < 30));
  run(s, 0.05, ['KeyD', 'ArrowRight']);
  assert.ok(s.actors.every((a) => a.activity === 'free'));
  const tired = s.actors[0];
  tired.stamina = 0;
  const y = tired.y;
  run(s, 0.5, ['KeyS']);
  assert.ok(tired.y > y, 'exhaustion never removes movement');
});
void test('alert drops the held item, walks normally to laptop, requires both operations and costs stamina', () => {
  const s = start();
  Object.assign(s.actors[0], { heldItem: 12 });
  Object.assign(s.items[12], { status: 'held', carrier: 0 });
  s.alert.nextAt = 0;
  let previous = { ...s.actors[0] };
  for (let f = 0; f < 1000 && s.actors[0].activity !== 'laptop'; f++) {
    movingTick(s, 0.025, new Set(['KeyS']));
    assert.ok(dist(previous, s.actors[0]) < 3);
    assert.ok(movingCanStand(s, s.actors[0]));
    previous = { ...s.actors[0] };
  }
  assert.equal(s.items[12].status, 'floor');
  assert.equal(s.actors[0].heldItem, null);
  assert.equal(s.actors[0].activity, 'laptop');
  run(s, 5, ['KeyD']);
  assert.equal(
    s.alert.progress,
    0,
    'cannot ignore mandatory alert by walking away',
  );
  const energy = s.actors[0].stamina;
  finishLaptop(s);
  assert.equal(s.alert.active, false);
  assert.ok(s.actors[0].stamina < energy);
  assert.ok(s.alert.nextAt - s.elapsed > 80);
});
void test('toilet is a routed timed break; duties do not overlap and day countdown can go negative', () => {
  const s = start();
  s.alert.nextAt = Infinity;
  s.toilet.nextAt = 0;
  for (let f = 0; f < 1200 && s.actors[0].activity !== 'toilet'; f++)
    movingTick(s, 0.025, new Set());
  assert.equal(s.actors[0].activity, 'toilet');
  run(s, 7);
  assert.equal(s.toilet.active, true);
  run(s, 1.1);
  assert.equal(s.toilet.active, false);
  s.elapsed = MOVING_DAY_SECONDS - 0.5;
  s.alert.nextAt = Infinity;
  s.toilet.nextAt = Infinity;
  run(s, 1);
  assert.ok(s.dayRemaining < 0);
  assert.equal(s.phase, 'moving');
  s.paused = true;
  const saved = structuredClone(s);
  run(s, 100, ['KeyE']);
  assert.deepEqual(s, saved);
});
void test('active comic captions survive ordinary packing hints, while a new alert may interrupt', () => {
  const s = start();
  const sequence = s.messageSeq;
  say(s, 'start');
  movingHint(s, 'Вес: 6 кг');
  assert.equal(s.dialogueId, 'start');
  assert.equal(s.messageSeq, sequence + 1);
  say(s, 'alert');
  assert.equal(s.dialogueId, 'alert');
  s.elapsed = s.messageUntil + 0.1;
  movingHint(s, 'Вес: 6 кг');
  assert.equal(s.dialogueId, null);
  assert.equal(s.message, 'Вес: 6 кг');
});
void test('furniture layout keeps all station approach points and item pickups inside the room', () => {
  const s = freshMoving();
  assert.equal(obstacles.filter((o) => o.kind === 'toilet').length, 1);
  for (const station of [
    ...movingStations.sofa,
    movingStations.laptop,
    movingStations.toilet,
  ])
    assert.ok(movingCanStand(s, station), JSON.stringify(station));
  assert.equal(s.bags.length, 6);
  assert.ok(s.bags.reduce((n, b) => n + b.capacity, 0) > 82);
});

void test('solo Nastya keeps packing during a mandatory laptop hold and the next alert is scheduled fairly', () => {
  const s = start(1);
  s.alert.nextAt = 0;
  run(s, 35);
  assert.equal(s.actors[0].activity, 'laptop');
  assert.equal(s.alert.progress, 0);
  assert.ok(
    s.items.filter((i) => i.status === 'packed').length > 3,
    'assistant did not freeze with Yarik',
  );
  run(s, 8, laptopControls);
  assert.equal(s.alert.active, false);
  const next = s.alert.nextAt;
  s.toilet.nextAt = Infinity;
  run(s, Math.max(0, next - s.elapsed) - 0.1);
  assert.equal(s.alert.active, false);
  run(s, 0.2);
  assert.equal(s.alert.active, true);
  assert.equal(s.alert.count, 2);
  assert.equal(s.toilet.active, false);
});
void test('two simultaneous packing holds cannot reserve the same final capacity twice', () => {
  const s = start(),
    bag = s.bags[0];
  bag.weight = 16;
  Object.assign(s.actors[0], { x: 220, y: 405, heldItem: 1 });
  Object.assign(s.items[1], { status: 'held', carrier: 0 });
  Object.assign(s.actors[1], { x: 220, y: 515, heldItem: 3 });
  Object.assign(s.items[3], { status: 'held', carrier: 1 });
  run(s, 2, ['KeyE', 'Enter']);
  assert.equal(bag.weight, 18);
  assert.equal(
    s.items
      .filter((i) => i.id === 1 || i.id === 3)
      .filter((i) => i.status === 'packed').length,
    1,
  );
  assert.equal(s.score, 30);
  assert.equal(s.actors.filter((a) => a.heldItem !== null).length, 1);
});
void test('an alert sets carried luggage down safely before the mandatory route', () => {
  const s = start();
  s.chapter = 'carrying';
  const actor = s.actors[0],
    bag = s.bags[0];
  Object.assign(actor, { x: 300, y: 300, facing: 0, bagId: 0 });
  Object.assign(s.actors[1], { x: 390, y: 450 });
  Object.assign(bag, {
    ...movingCarryPoint([actor]),
    weight: 6,
    zip: 1,
    status: 'carried',
    carriers: [0],
  });
  s.alert.nextAt = 0;
  const before = { x: actor.x, y: actor.y };
  run(s, 0.025);
  assert.equal(actor.bagId, null);
  assert.equal(bag.status, 'closed');
  assert.equal(bag.weight, 6);
  assert.deepEqual(bag.carriers, []);
  assert.ok(movingCanStand(s, bag, BAG_RADIUS, bag.id));
  assert.ok(s.actors.every((a) => dist(a, bag) >= ACTOR_RADIUS + BAG_RADIUS));
  assert.ok(dist(actor, before) < 3);
});
void test('zero stamina still completes mandatory laptop work and docks within arm reach', () => {
  const s = start();
  s.alert.nextAt = 0;
  s.actors[0].stamina = 0;
  for (let f = 0; f < 3000 && s.actors[0].activity !== 'laptop'; f++)
    movingTick(s, 0.025, new Set());
  assert.equal(s.actors[0].activity, 'laptop');
  assert.ok(dist(s.actors[0], movingStations.laptop) <= 6);
  s.actors[0].stamina = 0;
  run(s, 8, laptopControls);
  assert.equal(s.alert.active, false);
  assert.ok(
    s.actors[0].stamina < 0.4,
    'only brief idle recovery follows the completed work',
  );
});
