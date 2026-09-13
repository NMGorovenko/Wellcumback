import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshClean,
  cleanTick,
  stations,
  cleanFloorProgress,
} from '../lib/game/clean/engine.ts';
import { createCleanEpisode } from '../lib/game/clean/episodes.ts';
import { cleanPrompts } from '../lib/game/clean/prompts.ts';
const run = (s, seconds, keys = []) => {
  for (let t = 0; t < seconds - 1e-8; t += 0.025)
    cleanTick(s, Math.min(0.025, seconds - t), new Set(keys));
};
const at = (s, actor, point) => {
  s.x[actor] = point.x;
  s.y[actor] = point.y;
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
  void test(`${chapter}: guests observe and cannot move, help or act for the soldier`, () => {
    const s = createCleanEpisode(3, chapter),
      baseline = structuredClone(s);
    assert.equal(s.actorCount, 1);
    run(s, 0.5, ['ArrowRight', 'Enter', 'KeyJ', 'KeyO']);
    run(baseline, 0.5);
    assert.deepEqual(s, baseline);
    assert.deepEqual(cleanPrompts(s, 1), []);
    assert.deepEqual(cleanPrompts(s, 2), []);
    s.paused = true;
    const before = structuredClone(s);
    run(s, 2, ['KeyE', 'ArrowRight']);
    assert.deepEqual(s, before);
  });
}

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
  at(supported, 0, { x: stations[3].x - 55, y: stations[3].y });
  const unattended = structuredClone(supported);
  run(supported, 1, ['KeyE']);
  run(unattended, 1);
  assert.ok(supported.spin > unattended.spin);
  assert.equal(supported.leaks, 0);
  assert.equal(unattended.leaks, 0);
});
