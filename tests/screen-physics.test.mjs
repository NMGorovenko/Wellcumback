import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshGame,
  tick,
  moveToSide,
  floorPointIsClear,
  WORKER_RADIUS,
  workPosition,
} from '../lib/game/screen/engine.ts';
function step(s, seconds) {
  for (let n = 0; n < seconds * 60; n++) {
    const before = s.workers.map((w) => ({ x: w.x, z: w.z }));
    tick(s, 1 / 60, new Set());
    for (let p = 0; p < Math.max(2, s.players); p++) {
      const w = s.workers[p];
      assert.ok(
        floorPointIsClear(w),
        `Furniture/cloth clipping: ${p} at ${w.x},${w.z}`,
      );
      assert.ok(
        Math.hypot(w.x - before[p].x, w.z - before[p].z) <= 3.65 / 60 + 0.001,
        'Motion must never teleport',
      );
      for (let q = p + 1; q < Math.max(2, s.players); q++)
        assert.ok(
          Math.hypot(w.x - s.workers[q].x, w.z - s.workers[q].z) >=
            WORKER_RADIUS * 2 - 0.001,
          `Overlap ${p}/${q}`,
        );
    }
  }
}
function assertSettled(s) {
  s.workers.slice(0, s.players).forEach((w, p) => {
    assert.equal(w.side, w.targetSide, `Worker ${p} never reached side`);
    assert.ok(
      Math.hypot(w.x - workPosition(s, p).x, w.z - workPosition(s, p).z) < 0.08,
      `Worker ${p} failed to settle`,
    );
  });
}
void test('three workers converge on separate left-side work slots without overlap or furniture clipping', () => {
  const s = freshGame(3);
  s.phase = 'rods';
  for (let p = 0; p < 3; p++) moveToSide(s, p, 3);
  step(s, 35);
  assertSettled(s);
});
void test('opposing workers exchange sides without deadlock or teleportation', () => {
  const s = freshGame(2);
  s.phase = 'rods';
  moveToSide(s, 0, 0);
  moveToSide(s, 1, 2);
  step(s, 30);
  assertSettled(s);
});
void test('three workers can repeatedly change direction and all share each work edge', () => {
  const s = freshGame(3);
  s.phase = 'rods';
  for (const goals of [
    [0, 2, 3],
    [1, 1, 1],
    [3, 0, 2],
    [0, 0, 0],
    [2, 3, 1],
    [2, 2, 2],
  ]) {
    goals.forEach((side, p) => moveToSide(s, p, side));
    step(s, 40);
    assertSettled(s);
  }
});
void test('empty navigation grid does not allow passage through loose fabric', () => {
  const s = freshGame(1);
  s.phase = 'rods';
  moveToSide(s, 0, 0);
  step(s, 12);
  assert.equal(s.workers[0].side, 0);
});
