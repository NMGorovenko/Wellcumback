import assert from 'node:assert/strict';
import test from 'node:test';
import {
  freshMoving,
  movingAction,
  movingTick,
  movingIntent,
} from '../lib/game/moving/engine.ts';
import { movingStations } from '../lib/game/moving/layout.ts';
import { movingIncident } from '../lib/game/moving/incidents.ts';
import {
  movingLoadFeel,
  movingGripSettle,
} from '../lib/game/moving/load-feel.ts';

const step = (s, seconds, keys = []) => {
  for (let n = 0; n < Math.round(seconds / 0.025); n++)
    movingTick(s, 0.025, new Set(keys));
};
function atLaptop(count = 0) {
  const s = freshMoving(2);
  movingAction(s);
  Object.assign(s.actors[0], {
    x: movingStations.laptop.x,
    y: movingStations.laptop.y,
  });
  s.alert.count = count;
  s.alert.nextAt = 0;
  step(s, 0.025);
  assert.equal(s.actors[0].activity, 'laptop');
  return s;
}

void test('laptop wrong buttons and mashing never advance or erase the diagnostic', () => {
  const s = atLaptop();
  step(s, 1, ['ShiftLeft']);
  assert.equal(s.alert.progress, 0);
  assert.equal(s.alert.inputMismatch, true);
  assert.match(movingIntent(s, 0).label, /Сейчас: посмотреть/);
  assert.equal(movingIntent(s, 0).control, 'action');
  step(s, 0.75, ['KeyE']);
  const saved = s.alert.progress;
  assert.ok(saved > 0);
  step(s, 2, ['KeyE', 'ShiftLeft']);
  assert.equal(
    s.alert.progress,
    saved,
    'wrong input is recoverable with no work loss',
  );
  step(s, 1.3, ['KeyE']);
  assert.equal(s.alert.operation, 1);
  assert.equal(s.alert.awaitingRelease, true);
  const inspected = s.alert.progress;
  step(s, 4, ['KeyE']);
  assert.equal(
    s.alert.progress,
    inspected,
    'one held button cannot finish both operations',
  );
  assert.equal(movingIntent(s, 0).release, true);
  step(s, 0.025);
  assert.equal(movingIntent(s, 0).control, 'secondary');
  step(s, 3, ['ShiftLeft']);
  assert.equal(s.alert.active, false);
  assert.equal(s.alert.operation, 2);
  assert.equal(s.alert.progress, 1);
  assert.equal(s.actors[0].activity, 'free');
  assert.equal(s.actors[0].heldItem, null);
  assert.ok(s.alert.nextAt - s.elapsed > 84);
});

void test('three incident kinds rotate by count and each requires its own advertised two controls', () => {
  const titles = [],
    comics = [];
  for (const [count, first, second] of [
    [0, 'KeyE', 'ShiftLeft'],
    [1, 'ShiftLeft', 'KeyE'],
    [2, 'KeyE', 'ShiftLeft'],
  ]) {
    const s = atLaptop(count);
    titles.push(movingIncident(s.alert.count).title);
    comics.push(s.dialogueId);
    step(s, 2.1, [first]);
    assert.equal(s.alert.operation, 1);
    step(s, 0.025);
    step(s, 3, [second]);
    assert.equal(s.alert.active, false);
    assert.equal(s.toilet.active, false);
    assert.ok(s.dutyGraceUntil - s.elapsed > 23);
  }
  assert.equal(new Set(titles).size, 3);
  assert.equal(new Set(comics).size, 3);
  assert.equal(movingIncident(4).id, movingIncident(1).id);
  const intro = freshMoving(2);
  assert.equal(intro.alert.active, false);
  assert.doesNotMatch(intro.message, /сбой|соединение|очередь/i);
});

void test('a packing hold carried into the mandatory walk must be released at the computer', () => {
  const s = freshMoving(2);
  movingAction(s);
  s.alert.nextAt = 0;
  step(s, 22, ['KeyE']);
  assert.equal(s.actors[0].activity, 'laptop');
  assert.equal(s.alert.progress, 0);
  assert.equal(s.alert.awaitingRelease, true);
  step(s, 0.025);
  step(s, 0.5, ['KeyE']);
  assert.ok(s.alert.progress > 0);
  const saved = structuredClone(s);
  s.paused = true;
  step(s, 4, ['ShiftLeft']);
  assert.deepEqual(s, { ...saved, paused: true });
});

void test('load feel responds to item weight, fatigue and a real second handle, while settlement is bounded', () => {
  const s = freshMoving(2),
    actor = s.actors[0],
    bag = s.bags[0];
  actor.vx = 1;
  s.elapsed = 0.2;
  actor.heldItem = 1; // 2 kg of wires.
  const light = movingLoadFeel(s, 0);
  actor.heldItem = 0; // 6 kg of books.
  const books = movingLoadFeel(s, 0);
  assert.ok(books.lean > light.lean);
  actor.heldItem = null;
  actor.bagId = bag.id;
  bag.weight = 18;
  bag.carriers = [0];
  const heavy = movingLoadFeel(s, 0);
  actor.stamina = 5;
  const tired = movingLoadFeel(s, 0);
  assert.ok(tired.lean > heavy.lean);
  assert.ok(tired.carryHeight < heavy.carryHeight);
  bag.carriers = [0, 1];
  const shared = movingLoadFeel(s, 0);
  assert.equal(shared.load, 9);
  assert.ok(shared.strain < tired.strain);
  assert.ok(shared.lean < 0.1 && Math.abs(shared.sway) < 0.03);
  const serialized = JSON.stringify(s);
  movingLoadFeel(s, 0);
  assert.equal(
    JSON.stringify(s),
    serialized,
    'visual weight cannot move physics state',
  );
  assert.equal(movingGripSettle(-1), 0);
  assert.equal(movingGripSettle(0), 0);
  assert.ok(movingGripSettle(0.16) > 0 && movingGripSettle(0.16) < 1);
  assert.equal(movingGripSettle(0.32), 1);
  assert.equal(movingGripSettle(10), 1);
});

void test('packing offers actual remaining space and resting reports when the crew can continue', () => {
  const s = freshMoving(2);
  Object.assign(s.actors[0], { x: 220, y: 405, heldItem: 0 });
  Object.assign(s.items[0], { status: 'held', carrier: 0 });
  s.bags[0].weight = 10;
  assert.match(movingIntent(s, 0).label, /6 кг.*2 кг места/);
  s.bags[0].weight = 14;
  assert.match(movingIntent(s, 0).label, /6 кг.*свободно 4 кг/);
  Object.assign(s.actors[0], { heldItem: null, activity: 'rest', stamina: 15 });
  assert.match(movingIntent(s, 0).label, /восстанавливаются/);
  s.actors[0].stamina = 90;
  assert.match(movingIntent(s, 0).label, /вернулись/);
});
