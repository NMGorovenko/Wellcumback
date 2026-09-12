import test from 'node:test';
import assert from 'node:assert/strict';
import { freshClean, cleanTick, canStand } from '../lib/game/clean/engine.ts';

function cleanupWithFootprint(start, target) {
  const s = freshClean(1);
  Object.assign(s, {
    phase: 'clean',
    actorCount: 1,
    timer: 160,
    x: [start.x, 715, 755],
    y: [start.y, 505, 505],
    spin: 1,
    valve: 1,
    machineClean: 1,
    pantsLoaded: true,
    spots: [
      {
        id: 1,
        ...target,
        weight: 0.1,
        size: 6,
        progress: 0,
        kind: 'footprint',
        foam: false,
        rotation: 0,
        createdAt: 0,
      },
    ],
  });
  return s;
}

void test('solo cleanup waits for Roma; inactive friends cannot move, mop or score', () => {
  const s = cleanupWithFootprint({ x: 880, y: 500 }, { x: 875, y: 510 });
  s.x[1] = 875;
  s.y[1] = 510;
  const before = { x: [...s.x], y: [...s.y], dirt: [...s.dirt] };
  for (let i = 0; i < 160; i++)
    cleanTick(s, 0.025, new Set(['Enter', 'ArrowLeft', 'KeyO', 'KeyL']));
  assert.deepEqual(s.x, before.x);
  assert.deepEqual(s.y, before.y);
  assert.deepEqual(s.dirt, before.dirt);
  assert.equal(s.spots[0].progress, 0);
  assert.equal(s.phase, 'clean');
  assert.equal(s.score, 0);
  cleanTick(s, 0.2, new Set(['KeyE']));
  assert.equal(s.spots[0].progress, 1);
  assert.equal(s.phase, 'result');
  assert.equal(s.teamwork, 0);
});

void test('Roma can finish fractional-position footprints from every direction with ordinary held controls', () => {
  for (let i = 0; i < 24; i++) {
    const angle = (i * Math.PI) / 12,
      dx = Math.cos(angle),
      dy = Math.sin(angle);
    const target = { x: 600 - dx * 47.15, y: 450 - dy * 47.15 };
    const s = cleanupWithFootprint(
      { x: 600 + dx * 12.85, y: 450 + dy * 12.85 },
      target,
    );
    for (
      let step = 0;
      step < 100 && Math.hypot(s.x[0] - target.x, s.y[0] - target.y) > 52;
      step++
    ) {
      const keys = new Set();
      if (Math.abs(target.x - s.x[0]) > 1)
        keys.add(target.x > s.x[0] ? 'KeyD' : 'KeyA');
      if (Math.abs(target.y - s.y[0]) > 1)
        keys.add(target.y > s.y[0] ? 'KeyS' : 'KeyW');
      const before = [s.x[0], s.y[0]];
      cleanTick(s, 1 / 60, keys);
      assert.ok(
        Math.hypot(s.x[0] - before[0], s.y[0] - before[1]) <= 166 / 60 + 1e-7,
      );
      assert.ok(canStand(s.x[0], s.y[0]));
    }
    cleanTick(s, 0.2, new Set(['KeyE']));
    assert.equal(s.spots[0].progress, 1, `fractional trace in direction ${i}`);
    assert.equal(s.phase, 'result');
  }
});
