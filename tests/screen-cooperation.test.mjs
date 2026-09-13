import assert from 'node:assert/strict';
import test from 'node:test';
import {
  freshGame,
  tick,
  springWindow,
  CONTROLS,
} from '../lib/game/screen/engine.ts';
import { screenPrompts } from '../lib/game/screen/prompts.ts';
import { createScreenEpisode } from '../lib/game/screen/episodes.ts';
import { equipDriller } from './screen-drill-controller.mjs';

const dt = 1 / 60;
function advance(s, seconds, keys = []) {
  for (let i = 0; i < Math.round(seconds / dt); i++)
    tick(s, dt, new Set(typeof keys === 'function' ? keys(s) : keys));
}
const axis = (error, positive, negative, tolerance = 0.03) =>
  error > tolerance ? positive : error < -tolerance ? negative : null;

void test('Yarik rotates the real corner and Roma aligns then locks it with their own controls', () => {
  const s = freshGame(3);
  advance(s, 0.5, ['ArrowUp']);
  assert.ok(Math.abs(s.frameTwist) < 0.03);
  assert.equal(s.workers[1].animation, 'hold');
  const originalFit = s.frameFit;
  advance(s, 1.35, ['KeyJ']);
  assert.ok(s.frameFit < originalFit - 0.35);
  assert.ok(Math.abs(s.frameFit) < 0.1);
  assert.equal(s.workers[2].animation, 'hold');
  advance(s, dt, ['KeyE']);
  assert.equal(s.frameStage, 'lock');
  for (let n = 0; n < 180; n++) {
    if (s.cooldown === 0 && Math.abs(s.cursor - 0.5) < 0.035) break;
    advance(s, dt);
  }
  advance(s, dt, ['KeyO']);
  assert.equal(s.corners, 1);
  assert.equal(s.events.findLast((e) => e.kind === 'snap').worker, 2);
  assert.equal(s.penalties, 0);
});

void test('all three workers can feed independent sleeves simultaneously', () => {
  const s = freshGame(3);
  s.phase = 'rods';
  advance(s, 2, (state) =>
    state.workers
      .flatMap((w, p) => [
        CONTROLS[p].action,
        axis(
          state.rodTarget[w.side] - state.rodAlignment[w.side],
          CONTROLS[p].right,
          CONTROLS[p].left,
        ),
      ])
      .filter(Boolean),
  );
  for (const side of [0, 1, 2]) assert.ok(s.rods[side] > 0.18);
  assert.ok(s.workers.every((w) => w.animation === 'feed'));
  assert.equal(s.penalties, 0);
});

void test('a ready receiver gets the shared tool and a physically present helper steadies the spring', () => {
  const s = freshGame(3);
  s.phase = 'tension';
  advance(s, 4);
  const narrow = springWindow(s);
  advance(s, dt, ['Enter']);
  assert.equal(s.springSupport, 1);
  assert.ok(springWindow(s)[0] < narrow[0]);
  assert.ok(springWindow(s)[1] > narrow[1]);
  assert.equal(s.workers[1].animation, 'hold');
  advance(s, dt, ['KeyQ', 'KeyO']);
  assert.equal(
    s.tool.target,
    2,
    'Roma signalled readiness; do not throw past him automatically',
  );
  assert.equal(s.tool.status, 'charging');
});

void test('uneven tension marks physical strain without narrating the surprise and pops the opposite hook with local recovery', () => {
  const s = freshGame(2);
  s.phase = 'tension';
  s.clips = [1, 0, 1, 0];
  advance(s, 4);
  assert.equal(screenPrompts(s)[0].prompts[0].emphasis, 'danger');
  advance(s, 1.2, ['KeyE']);
  assert.doesNotMatch(s.message, /отскочит|чередуйте|противоположный/i);
  advance(s, 0.1);
  assert.deepEqual(s.clips, [0, 0, 1, 0]);
  assert.equal(s.events.findLast((e) => e.kind === 'pop').side, 0);
  assert.equal(s.tool.status, 'held');
  assert.equal(s.tool.needsPass, true);
  assert.equal(s.penalties, 1);
});

void test('Roma spotting boosts a matching real balance correction but never remotely holds chairs', () => {
  const working = () => {
    const s = createScreenEpisode(3, 'drill');
    Object.assign(s, {
      drillMode: 'drill',
      climb: 1,
      balance: 0.65,
      phaseTime: 0.8,
      cooldown: 0,
    });
    equipDriller(s);
    return s;
  };
  const soloCorrection = working(),
    matching = working(),
    remoteOnly = working(),
    idle = working();
  advance(soloCorrection, 0.15, ['KeyE', 'KeyA']);
  advance(matching, 0.15, ['KeyE', 'KeyA', 'KeyJ']);
  assert.ok(matching.balance < soloCorrection.balance - 0.03);
  assert.equal(matching.workers[2].animation, 'guide');
  advance(remoteOnly, 0.15, ['KeyJ']);
  advance(idle, 0.15);
  assert.equal(remoteOnly.braceHeld, false);
  assert.equal(remoteOnly.balance, idle.balance);
  assert.equal(screenPrompts(remoteOnly)[2].prompts[0].direction, 'left');
});

void test('third player guides the lift, and every player can finish a settled level', () => {
  const s = freshGame(3);
  Object.assign(s, { phase: 'lift', holes: [5.9, 5.9] });
  advance(s, 0.4, ['KeyL']);
  assert.ok(s.liftX > -0.7);
  assert.equal(s.workers[2].animation, 'guide');
  assert.equal(screenPrompts(s)[2].prompts[0].direction, 'right');
  for (let player = 0; player < 3; player++) {
    const level = freshGame(3);
    Object.assign(level, { phase: 'level', angle: 0.04, bubble: 0.04 });
    advance(level, 0.8, [CONTROLS[player].left]);
    assert.ok(Math.abs(level.angle) < 0.01);
    advance(level, 1.4);
    assert.ok(level.levelStable >= 1);
    advance(level, dt, [CONTROLS[player].action]);
    assert.equal(level.phase, 'result');
  }
});

void test('cooperative state remains finite JSON and continues identically after a host snapshot', () => {
  const s = freshGame(3);
  s.phase = 'tension';
  advance(s, 4);
  advance(s, 0.5, ['KeyE', 'Enter']);
  const copy = JSON.parse(JSON.stringify(s));
  for (const keys of [['KeyE', 'Enter'], [], ['KeyQ', 'KeyO'], []]) {
    advance(s, 0.5, keys);
    advance(copy, 0.5, keys);
  }
  assert.deepEqual(s, copy);
  const inspect = (value) => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
    else if (value && typeof value === 'object') {
      assert.ok(
        Array.isArray(value) ||
          Object.getPrototypeOf(value) === Object.prototype,
      );
      Object.values(value).forEach(inspect);
    } else
      assert.ok(['string', 'boolean'].includes(typeof value) || value === null);
  };
  inspect(s);
});

void test('a held action is released before the next frame click or final level check', () => {
  const s = freshGame(3);
  s.frameStage = 'lock';
  s.heldKeys = ['Enter'];
  assert.equal(screenPrompts(s)[1].prompts[0].mode, 'release');
  s.heldKeys = [];
  assert.equal(screenPrompts(s)[1].prompts[0].mode, 'tap');
  Object.assign(s, {
    phase: 'level',
    angle: 0,
    bubble: 0,
    levelStable: 1.1,
    heldKeys: ['KeyO'],
  });
  assert.equal(screenPrompts(s)[2].prompts[0].mode, 'release');
  s.heldKeys = [];
  assert.equal(screenPrompts(s)[2].prompts[0].mode, 'tap');
});
