import test from 'node:test';
import assert from 'node:assert/strict';
import { freshGame, tick, act } from '../lib/game/screen/engine.ts';
import {
  freshClean,
  cleanTick,
  cleanAction,
} from '../lib/game/clean/engine.ts';
const empty = new Set();
function run(s, seconds, keys = [], fn = tick) {
  for (let t = 0; t < seconds; t += 0.02) fn(s, 0.02, new Set(keys));
}

test('frame ignores repeats during cooldown and progresses only in target', () => {
  const s = freshGame();
  s.cursor = 0;
  act(s);
  assert.equal(s.corners, 0);
  assert.equal(s.penalties, 1);
  s.cooldown = 0;
  s.cursor = 0.5;
  act(s);
  act(s);
  assert.equal(s.corners, 1);
});
test('whole screen story is completable without skipping any phase', () => {
  const s = freshGame(1);
  for (let i = 0; i < 4; i++) {
    s.cooldown = 0;
    s.cursor = 0.5;
    act(s);
  }
  assert.equal(s.phase, 'rods');
  for (let i = 0; i < 4; i++) {
    s.side = i;
    run(s, 1.6, ['KeyE']);
  }
  assert.equal(s.phase, 'tension');
  for (let j = 0; j < 4; j++)
    for (const i of [0, 2, 1, 3]) {
      s.side = i;
      s.cooldown = 0;
      act(s);
    }
  assert.equal(s.phase, 'drill');
  run(s, 9, ['KeyE']);
  assert.equal(s.phase, 'lift');
  assert.equal(s.holes.length, 2);
  // Lift controls have enough travel to reach the actual recorded holes.
  for (let n = 0; n < 1000 && s.phase === 'lift'; n++) {
    const keys = ['KeyE'];
    if (s.liftLeft < s.holes[0] - 0.05) keys.push('KeyW');
    if (s.liftLeft > s.holes[0] + 0.05) keys.push('KeyS');
    if (s.liftX < -0.05) keys.push('KeyD');
    if (s.liftX > 0.05) keys.push('KeyA');
    tick(s, 0.02, new Set(keys));
  }
  assert.equal(s.phase, 'level');
  for (let n = 0; n < 300 && Math.abs(s.angle) >= 0.015; n++)
    tick(s, 0.02, new Set([s.angle > 0 ? 'ArrowLeft' : 'ArrowRight']));
  act(s);
  assert.equal(s.phase, 'result');
  assert.ok(s.score > 2000);
  const score = s.score;
  run(s, 2, ['KeyE']);
  act(s);
  assert.equal(s.score, score);
});
test('tension rejects uneven clips and allows recovery', () => {
  const s = freshGame();
  s.phase = 'tension';
  act(s);
  s.cooldown = 0;
  act(s);
  assert.deepEqual(s.clips, [1, 0, 0, 0]);
  assert.equal(s.penalties, 1);
  s.side = 2;
  s.cooldown = 0;
  act(s);
  assert.deepEqual(s.clips, [1, 0, 1, 0]);
});
test('unbalanced two-chair stack falls and resets drilling progress', () => {
  const s = freshGame(2);
  s.phase = 'drill';
  s.chairs = 2;
  s.balance = 0.99;
  s.drill = 0.7;
  tick(s, 0.1, new Set(['KeyD']));
  assert.equal(s.falls, 1);
  assert.equal(s.drill, 0);
  assert.equal(s.balance, 0);
  assert.ok(s.cooldown > 0);
});
test('drilling height survives into alignment challenge', () => {
  const s = freshGame();
  s.phase = 'drill';
  s.aim = 4.8;
  s.drill = 0.999;
  tick(s, 0.02, new Set(['KeyE']));
  assert.equal(s.holes[0], 4.8);
  s.cooldown = 0;
  s.aim = 5.25;
  s.drill = 0.999;
  tick(s, 0.02, new Set(['KeyE']));
  assert.equal(s.holes[1], 5.25);
  assert.equal(s.phase, 'lift');
});
test('third player actively damps a shaky stack', () => {
  const a = freshGame(3),
    b = freshGame(3);
  for (const s of [a, b]) {
    s.phase = 'drill';
    s.balance = 0.5;
  }
  tick(a, 0.05, new Set(['KeyJ']));
  tick(b, 0.05, empty);
  assert.ok(a.balance < b.balance);
});
test('pause freezes both simulations and ignores actions', () => {
  const a = freshGame();
  a.paused = true;
  a.cursor = 0.5;
  tick(a, 1, new Set(['KeyE']));
  act(a);
  assert.equal(a.elapsed, 0);
  assert.equal(a.corners, 0);
  const b = freshClean();
  b.paused = true;
  cleanAction(b);
  cleanTick(b, 1, empty);
  assert.equal(b.phase, 'brief');
  assert.equal(b.elapsed, 0);
});
test('clean story requires station proximity and advances to cooperative cleanup', () => {
  const s = freshClean(3);
  cleanAction(s);
  assert.equal(s.phase, 'find');
  cleanAction(s);
  assert.equal(s.phase, 'find');
  s.x[0] = 790;
  s.y[0] = 270;
  cleanAction(s);
  assert.equal(s.phase, 'wash');
  s.cooldown = 0;
  s.x[0] = 145;
  s.y[0] = 405;
  cleanAction(s);
  assert.equal(s.station, 2);
  s.cooldown = 0;
  s.x[0] = 805;
  cleanAction(s);
  assert.equal(s.phase, 'clean');
  for (const spot of s.spots) {
    s.x[0] = spot.x;
    s.y[0] = spot.y;
    run(s, 2.7, ['KeyE'], cleanTick);
  }
  assert.equal(s.phase, 'result');
  assert.ok(s.score > 1500);
});
test('urgency timeout progresses the joke instead of softlocking', () => {
  const s = freshClean();
  cleanAction(s);
  run(s, 36, [], cleanTick);
  assert.equal(s.phase, 'wash');
  assert.equal(s.station, 1);
  assert.ok(s.timer >= 0);
});
test('cleanup overtime can still complete and multiplayer uses separate inputs', () => {
  const s = freshClean(3);
  s.phase = 'clean';
  s.timer = 0.1;
  s.x[1] = s.spots[0].x;
  s.y[1] = s.spots[0].y;
  run(s, 3, ['Enter'], cleanTick);
  assert.equal(s.spots[0].progress, 1);
  assert.equal(s.timer, 0);
  assert.equal(s.phase, 'clean');
  s.x[2] = s.spots[1].x;
  s.y[2] = s.spots[1].y;
  run(s, 3, ['KeyO'], cleanTick);
  assert.equal(s.spots[1].progress, 1);
});
