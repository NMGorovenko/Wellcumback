import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshClean,
  cleanTick,
  cleanBindings,
  stations,
  cleanFloorProgress,
  planRoute,
} from '../lib/game/clean/engine.ts';
import { createCleanEpisode } from '../lib/game/clean/episodes.ts';
import { cleanSupportTask } from '../lib/game/clean/support.ts';
import { cleanPrompts } from '../lib/game/clean/prompts.ts';
const run = (s, seconds, keys = []) => {
  for (let t = 0; t < seconds - 1e-8; t += 0.025)
    cleanTick(s, Math.min(0.025, seconds - t), new Set(keys));
};
const at = (s, actor, point) => {
  s.x[actor] = point.x;
  s.y[actor] = point.y;
};
const prep = (s, actor, id, point, seconds) => {
  at(s, actor, point);
  assert.equal(cleanSupportTask(s, actor).id, id);
  run(s, seconds, [cleanBindings[actor][4]]);
  assert.equal(s.support.progress[id], 1);
};

for (const chapter of [
  'duty',
  'find',
  'accident',
  'toilet',
  'shower',
  'laundry',
  'spin',
  'response',
]) {
  void test(`${chapter}: Nikita and Yarik have independent movement before Roma's cleanup`, () => {
    const s = createCleanEpisode(3, chapter),
      before = [...s.x],
      hero = [s.x[0], s.y[0]];
    assert.equal(s.actorCount, 3);
    run(s, 0.15, ['ArrowRight', 'KeyJ']);
    assert.ok(s.x[1] > before[1]);
    assert.ok(s.x[2] < before[2]);
    assert.deepEqual([s.x[0], s.y[0]], hero);
    assert.ok(cleanPrompts(s, 1).length);
    assert.ok(cleanPrompts(s, 2).length);
  });
}

void test('preparation is finite, physical and optional; one friend carries the clean kit', () => {
  const s = freshClean(3);
  s.phase = 'toilet';
  s.soiled = true;
  prep(s, 1, 'privacy', { x: stations[1].x, y: 915 }, 1.4);
  prep(s, 2, 'kitPickup', stations[6], 1.2);
  assert.equal(s.support.kitOwner, 2);
  assert.equal(
    s.relief,
    0,
    'friends never perform the anonymous soldier action',
  );
  assert.equal(cleanSupportTask(s, 2).id, 'kit');
  assert.notEqual(cleanSupportTask(s, 1).id, 'kitPickup');
  prep(s, 2, 'kit', { x: stations[2].x, y: 925 }, 1);
  prep(s, 1, 'laundry', { x: stations[3].x - 55, y: stations[3].y }, 1.9);
  prep(s, 2, 'bucket', stations[5], 1.7);
  assert.equal(s.support.completed, 5);
  const before = structuredClone(s.support);
  run(s, 4, ['Enter', 'KeyO']);
  assert.deepEqual(s.support, before, 'completed jobs cannot be farmed');
  assert.equal(s.score, 0, 'preparation helps play; it does not mint score');
  assert.equal(s.relief, 0);
});

void test('simultaneous kit pickup has one owner and cannot double-charge progress', () => {
  const s = freshClean(3);
  s.phase = 'toilet';
  at(s, 1, stations[6]);
  at(s, 2, stations[6]);
  run(s, 0.1, ['Enter', 'KeyO']);
  assert.equal(s.support.kitOwner, 1);
  assert.ok(Math.abs(s.support.progress.kitPickup - 0.1 / 1.1) < 1e-8);
  assert.notEqual(cleanSupportTask(s, 2)?.id, 'kitPickup');
});

void test('helped fixtures progress faster while an unhelped solo chapter stays playable', () => {
  for (const [phase, station, field, benefit] of [
    ['toilet', 1, 'relief', 'privacy'],
    ['shower', 2, 'shower', 'kit'],
    ['laundry', 3, 'laundryProgress', 'laundry'],
  ]) {
    const ordinary = freshClean();
    ordinary.phase = phase;
    at(ordinary, 0, { x: stations[station].x - 55, y: stations[station].y });
    const helped = structuredClone(ordinary);
    helped.support.progress[benefit] = 1;
    run(ordinary, 1, ['KeyE']);
    run(helped, 1, ['KeyE']);
    assert.ok(ordinary[field] > 0);
    assert.ok(helped[field] > ordinary[field]);
    assert.equal(ordinary.support.completed, 0);
    assert.equal(ordinary.actorCount, 1);
  }
  const ordinary = freshClean();
  ordinary.phase = 'clean';
  ordinary.dirt[0] = 0.98;
  at(ordinary, 0, stations[5]);
  const helped = structuredClone(ordinary);
  helped.support.progress.bucket = 1;
  run(ordinary, 1.2, ['KeyE']);
  run(helped, 1.2, ['KeyE']);
  assert.equal(helped.dirt[0], 0);
  assert.ok(ordinary.dirt[0] > 0);
});

void test('pre-cleanup support closes the real valve and two friends suppress washer balance', () => {
  const s = freshClean(3);
  Object.assign(s, {
    phase: 'spin',
    pantsLoaded: true,
    machine: 1,
    spin: 1 / 34,
    balance: 0.8,
  });
  at(s, 1, stations[4]);
  run(s, 2.1, ['Enter']);
  assert.equal(s.valve, 1);
  assert.equal(s.leaks, 0);
  const supported = freshClean(3);
  Object.assign(supported, {
    phase: 'spin',
    pantsLoaded: true,
    machine: 1,
    spin: 1 / 34,
    balance: 0.8,
  });
  at(supported, 1, { x: stations[3].x - 55, y: stations[3].y });
  at(supported, 2, { x: stations[3].x + 55, y: stations[3].y });
  const loose = structuredClone(supported);
  run(supported, 0.5, ['Enter', 'KeyO']);
  run(loose, 0.5);
  assert.ok(supported.balance < loose.balance - 0.3);
  assert.equal(supported.activity[1], 'brace');
  assert.equal(supported.activity[2], 'brace');
});

void test('support badges and actual fixture work share their exact reach boundary', () => {
  for (const distance of [64.9, 65, 65.1]) {
    const s = freshClean(2);
    s.phase = 'toilet';
    Object.assign(s.support.progress, { privacy: 1, laundry: 1, bucket: 1 });
    at(s, 1, { x: stations[6].x - distance, y: stations[6].y });
    assert.equal(
      cleanPrompts(s, 1)[0].control,
      distance < 65 ? 'action' : 'move',
    );
    run(s, 0.1, ['Enter']);
    assert.equal(s.support.progress.kitPickup > 0, distance < 65);
  }
});

void test('every preparation target has a legal physical route; pause freezes ongoing help', () => {
  const s = freshClean(3);
  s.phase = 'toilet';
  for (let actor = 1; actor < 3; actor++) {
    for (const target of [
      stations[6],
      stations[5],
      stations[3],
      { x: 250, y: 915 },
      { x: 610, y: 925 },
    ]) {
      const from = { x: s.x[actor], y: s.y[actor] };
      assert.ok(
        Math.hypot(from.x - target.x, from.y - target.y) < 65 ||
          planRoute(from, target, 60).length,
      );
    }
  }
  s.paused = true;
  const before = JSON.stringify(s);
  run(s, 2, ['Enter', 'KeyO', 'ArrowRight']);
  assert.equal(JSON.stringify(s), before);
});

void test('cleanup score ignores extra self-created traces and idle teamwork time', () => {
  const ready = (count, teamwork) => {
    const s = freshClean();
    Object.assign(s, {
      phase: 'clean',
      timer: 90,
      machineClean: 1,
      spin: 1,
      valve: 1,
      teamwork,
    });
    s.spots = Array.from({ length: count }, (_, id) => ({
      id,
      x: 100,
      y: 600,
      weight: 1,
      progress: 1,
      kind: 'footprint',
      size: 8,
      foam: false,
      rotation: 0,
      createdAt: 0,
    }));
    return s;
  };
  const compact = ready(3, 0),
    farmed = ready(200, 600);
  run(compact, 0.025);
  run(farmed, 0.025);
  assert.equal(compact.phase, 'result');
  assert.equal(farmed.phase, 'result');
  assert.equal(compact.score, farmed.score);
  assert.equal(compact.score, Math.round(89.975 * 5 + 800 + 350));
  run(farmed, 1, ['KeyE']);
  assert.equal(compact.score, farmed.score);
});

void test('clean floor feedback reflects removed weight continuously, and practice stays scoreless', () => {
  const s = freshClean();
  s.phase = 'clean';
  s.practice = true;
  s.spin = 1;
  s.valve = 1;
  s.machineClean = 1;
  s.spots = [
    {
      id: 1,
      x: s.x[0],
      y: s.y[0],
      weight: 1,
      progress: 0,
      kind: 'trail',
      size: 8,
      foam: false,
      rotation: 0,
      createdAt: 0,
    },
  ];
  run(s, 0.5, ['KeyE']);
  assert.ok(cleanFloorProgress(s) > 0 && cleanFloorProgress(s) < 1);
  assert.equal(s.score, 0);
  run(s, 2, ['KeyE']);
  assert.equal(s.phase, 'result');
  assert.equal(s.score, 0);
});

void test('rhythm rewards stop after twelve useful beats instead of paying for waiting', () => {
  const s = freshClean();
  s.phase = 'find';
  s.rhythm.active = true;
  for (let hits = 0; hits < 24; hits++) {
    s.rhythm.clock = s.rhythm.period;
    run(s, 0.025, [s.rhythm.expected]);
    run(s, 0.025);
    assert.equal(s.rhythm.hits, hits + 1);
    assert.equal(s.score, Math.min(hits + 1, 12) * 8);
  }
});

void test('steady bracing remains useful after water is closed by shortening the spin', () => {
  const supported = freshClean(2);
  Object.assign(supported, {
    phase: 'spin',
    pantsLoaded: true,
    valve: 1,
    machine: 1,
    spin: 1 / 34,
    balance: 0.2,
  });
  at(supported, 1, { x: stations[3].x - 55, y: stations[3].y });
  const unattended = structuredClone(supported);
  run(supported, 1, ['Enter']);
  run(unattended, 1);
  assert.ok(supported.spin > unattended.spin);
  assert.equal(supported.leaks, 0);
  assert.equal(unattended.leaks, 0);
});
