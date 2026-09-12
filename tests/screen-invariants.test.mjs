import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshGame,
  tick,
  act,
  setPaused,
  moveToSide,
  floorPointIsClear,
} from '../lib/game/screen/engine.ts';
const step = (s, seconds, keys = []) => {
  for (let n = 0; n < Math.round(seconds * 60); n++)
    tick(s, 1 / 60, new Set(keys));
};
void test('fixed-step simulation produces same state with 30 Hz or 60 Hz rendering', () => {
  const a = freshGame(),
    b = freshGame();
  for (let n = 0; n < 600; n++) tick(a, 1 / 60, new Set(['KeyA']));
  for (let n = 0; n < 300; n++) tick(b, 1 / 30, new Set(['KeyA']));
  assert.equal(a.elapsed, b.elapsed);
  assert.equal(a.frameFit, b.frameFit);
  assert.equal(a.frameTwist, b.frameTwist);
});
void test('pause cancels a charged throw and freezes the entire simulation', () => {
  const s = freshGame();
  s.phase = 'tension';
  step(s, 0.3, ['KeyQ']);
  assert.equal(s.tool.status, 'charging');
  setPaused(s, true);
  const snapshot = JSON.stringify(s);
  step(s, 2, ['KeyQ']);
  act(s);
  assert.equal(JSON.stringify(s), snapshot);
  setPaused(s, false);
  step(s, 0.1);
  assert.equal(s.tool.status, 'held');
  assert.equal(s.tool.flight, 0);
});
void test('shared keyboard E plus explicit act generates one action edge', () => {
  const s = freshGame();
  s.frameFit = 0;
  s.frameTwist = 0;
  act(s);
  step(s, 0.05, ['KeyE']);
  assert.equal(s.frameStage, 'lock');
  assert.equal(s.corners, 0);
  step(s, 1, ['KeyE']);
  assert.equal(s.corners, 0);
});
void test('bad throw lands on recoverable perimeter side; action retrieves unique tool', () => {
  const s = freshGame(2);
  s.phase = 'tension';
  step(s, 4);
  step(s, 0.14, ['KeyQ']);
  step(s, 2);
  assert.equal(s.tool.status, 'ground');
  assert.equal(s.tool.misses, 1);
  assert.equal(s.tool.groundSide, 0);
  step(s, 0.05, ['Enter']);
  assert.equal(s.tool.status, 'held');
  assert.equal(s.tool.owner, 1);
});
void test('accurate throw still requires receiver action, it cannot catch remotely', () => {
  const s = freshGame(2);
  s.phase = 'tension';
  step(s, 4);
  step(s, 0.85, ['KeyQ']);
  step(s, 2);
  assert.equal(s.tool.goodThrow, true);
  assert.equal(s.tool.status, 'ground');
  assert.equal(s.tool.catches, 0);
});
void test('walking changes world positions continuously and stays outside floor frame', () => {
  const s = freshGame();
  s.phase = 'rods';
  moveToSide(s, 0, 0);
  const initial = { x: s.workers[0].x, z: s.workers[0].z };
  step(s, 3);
  assert.ok(
    Math.hypot(s.workers[0].x - initial.x, s.workers[0].z - initial.z) > 0,
  );
  assert.ok(floorPointIsClear(s.workers[0]));
  step(s, 12);
  assert.equal(s.workers[0].side, 0);
  assert.ok(Math.abs(s.workers[0].z + 3.58) < 0.08);
});
void test('jam does not clear while pushing; releasing recovers without resetting other sleeves', () => {
  const s = freshGame();
  s.phase = 'rods';
  s.rodAlignment[2] = -1;
  s.rods[1] = 1;
  step(s, 2, ['KeyE']);
  assert.ok(s.rodJam[2] > 0);
  assert.equal(s.penalties, 1);
  step(s, 1.1);
  assert.equal(s.rodJam[2], 0);
  assert.equal(s.rods[1], 1);
});
void test('extra hook by same worker requires passing the unique screwdriver', () => {
  const s = freshGame(2);
  s.phase = 'tension';
  step(s, 4);
  step(s, 1.2, ['KeyE']);
  step(s, 0.5);
  assert.equal(s.clips[2], 1);
  assert.equal(s.tool.needsPass, true);
  const score = s.score;
  step(s, 1.2, ['KeyE']);
  step(s, 0.5);
  assert.equal(s.clips[2], 1);
  assert.equal(s.score, score);
});
void test('two chair loss of balance preserves finished hole and resets current work', () => {
  const s = freshGame(2);
  s.phase = 'drill';
  s.drillMode = 'drill';
  s.drillGear = 'ready';
  s.climb = 1;
  s.holes = [5.85];
  s.balance = 0.99;
  s.drill = 0.7;
  step(s, 0.1, ['KeyD', 'Enter']);
  assert.equal(s.falls, 1);
  assert.equal(s.drill, 0);
  assert.deepEqual(s.holes, [5.85]);
  assert.equal(s.drillMode, 'fallen');
  assert.equal(s.workers[1].animation, 'fall');
  step(s, 1.4);
  assert.equal(s.drillMode, 'position');
  assert.equal(s.climb, 0);
  assert.ok(s.cooldown > 0);
});
void test('overheating cannot finish a hole by holding action forever', () => {
  const s = freshGame();
  s.phase = 'drill';
  s.drillMode = 'drill';
  s.drillGear = 'ready';
  s.climb = 1;
  step(s, 4.1, ['KeyE']);
  assert.ok(s.drillOverheats > 0);
  assert.equal(s.holes.length, 0);
  assert.ok(s.drill < 0.8);
});

void test('chair height is selectable with the same vertical controls as a controller stick', () => {
  const s = freshGame(1);
  s.phase = 'drill';
  s.cooldown = 0;
  tick(s, 1 / 60, new Set(['KeyS']));
  assert.equal(s.chairs, 1);
  assert.equal(s.aim, 5.1);
  tick(s, 1 / 60, new Set(['KeyW']));
  assert.equal(s.chairs, 2);
  assert.equal(s.aim, 5.9);
});
