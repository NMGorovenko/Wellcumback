import { levelKeys } from './screen-level-controller.mjs';
import { equipDriller, drillControls } from './screen-drill-controller.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshGame, tick } from '../lib/game/screen/engine.ts';
import {
  createScreenEpisode,
  screenEpisodes,
} from '../lib/game/screen/episodes.ts';

const DT = 1 / 60;
function advance(s, seconds, controls = () => []) {
  for (let frame = 0; frame < Math.round(seconds / DT); frame++)
    tick(s, DT, new Set(controls(s)));
}
function until(s, complete, controls, seconds = 10) {
  for (let frame = 0; frame < Math.round(seconds / DT) && !complete(s); frame++)
    tick(s, DT, new Set(controls(s)));
  assert.ok(
    complete(s),
    `stalled at ${s.phase}/${s.drillMode}, gear=${s.drillGear}`,
  );
}
function braced(s, extra = []) {
  const keys = ['KeyE', ...extra];
  if (s.balance > 0.04) keys.push('KeyA');
  if (s.balance < -0.04) keys.push('KeyD');
  return keys;
}
function atDrill(players = 1) {
  const s = freshGame(players);
  s.phase = 'drill';
  s.drillMode = 'drill';
  s.climb = 1;
  return s;
}
function cooledSolo(s, vacuum = true) {
  const keys = vacuum ? ['ShiftLeft'] : [];
  if (
    s.drillHeat < 0.73 &&
    (s.simulation.previousActions[0] || s.drillHeat < 0.25)
  )
    keys.push('KeyE');
  return keys;
}

void test('the driller cannot run either tool until the drill and vacuum have both been supplied', () => {
  for (const gear of ['none', 'drill']) {
    const s = atDrill();
    equipDriller(s, gear);
    advance(s, 1, () => ['KeyE', 'ShiftLeft']);
    assert.equal(s.drill, 0);
    assert.equal(s.drillHeat, 0);
    assert.equal(s.dustGenerated, 0);
    assert.equal(s.drillRunning, false);
    assert.equal(s.vacuumRunning, false);
    equipDriller(s);
    advance(s, DT, () => ['KeyE', 'ShiftLeft']);
    assert.ok(s.drill > 0);
    assert.equal(s.drillRunning, true);
    assert.equal(s.vacuumRunning, true);
  }
});

void test('climbing needs a sustained hold and both players complete two ordered tool handoffs', () => {
  const s = createScreenEpisode(2, 'drill');
  const both = (state) => braced(state, ['Enter']);
  until(s, (state) => state.drillMode === 'climb', both, 1);
  advance(s, 0.6, both);
  assert.ok(s.climb > 0 && s.climb < 1);
  const height = s.climb;
  advance(s, 0.3, (state) => braced(state));
  assert.equal(s.climb, height, 'letting go pauses the climb');
  until(s, (state) => state.drillMode === 'handoff', both, 3);
  assert.equal(s.drillGear, 'none');
  assert.equal(s.handoffProgress, 0);
  advance(s, 0.3, (state) => braced(state));
  assert.equal(s.handoffProgress, 0, 'the climber must accept');
  advance(s, 0.3, () => ['Enter']);
  assert.equal(s.handoffProgress, 0, 'the assistant must supply');
  until(
    s,
    (state) => state.drillGear === 'drill',
    (state) => [...drillControls(state)],
    30,
  );
  assert.equal(s.drillMode, 'handoff');
  assert.equal(s.handoffProgress, 0);
  assert.equal(s.drillRunning, false);
  advance(s, 0.5, (state) => braced(state));
  assert.equal(
    s.drillGear,
    'drill',
    'waiting cannot silently supply the vacuum',
  );
  until(
    s,
    (state) => state.drillGear === 'ready',
    (state) => [...drillControls(state)],
    4,
  );
  assert.equal(s.drillMode, 'drill');
  advance(s, 0.4, (state) => braced(state));
  assert.equal(s.drill, 0, 'bracing alone does not drill');
  advance(s, DT, (state) => braced(state, ['Enter', 'ShiftRight']));
  assert.equal(s.drillRunning, true);
  assert.equal(s.vacuumRunning, true);
  assert.ok(s.drill > 0);
  assert.equal(s.falls, 0);
});

void test('a fall drops supplied tools and current work, preserves completed holes and dust, then recovers to the floor', () => {
  const s = atDrill(2);
  equipDriller(s);
  s.holes = [5.85];
  s.wallDust = [0.2, 0.4];
  s.dustGenerated = 0.8;
  s.dustCaptured = 0.2;
  s.balance = 0.99;
  s.drill = 0.7;
  s.drillMark = 6.1;
  s.drillHeat = 0.65;
  advance(s, 0.1, () => ['KeyE', 'KeyD', 'Enter', 'ShiftRight']);
  assert.equal(s.drillMode, 'fallen');
  assert.equal(s.falls, 1);
  assert.equal(s.workers[1].animation, 'fall');
  assert.notEqual(s.workers[0].animation, 'fall');
  assert.equal(s.fallHeight, 1);
  assert.equal(s.drillGear, 'none');
  assert.equal(s.handoffProgress, 0);
  assert.equal(s.drill, 0);
  assert.equal(s.drillMark, null);
  assert.equal(s.drillHeat, 0);
  assert.equal(s.drillRunning, false);
  assert.equal(s.vacuumRunning, false);
  advance(s, 0.4);
  assert.equal(
    s.drillMode,
    'fallen',
    'the recovery is visible, not an immediate teleport',
  );
  until(
    s,
    (state) => state.drillMode === 'position',
    () => [],
    1.5,
  );
  assert.equal(s.climb, 0);
  assert.equal(s.drillGear, 'none');
  assert.deepEqual(s.holes, [5.85]);
  assert.deepEqual(s.wallDust, [0.2, 0.4]);
  assert.equal(s.dustGenerated, 0.8);
  assert.equal(s.dustCaptured, 0.2);
  assert.equal(s.events.find((event) => event.kind === 'fall').worker, 1);
});

void test('the vacuum captures real drilling dust and leaves a cleaner wall for identical progress', () => {
  const dry = atDrill(),
    wet = atDrill();
  equipDriller(dry);
  equipDriller(wet);
  advance(dry, 2, () => ['KeyE']);
  advance(wet, 2, () => ['KeyE', 'ShiftLeft']);
  assert.equal(wet.drill, dry.drill);
  assert.equal(wet.dustGenerated, dry.dustGenerated);
  assert.ok(dry.dustGenerated > 0);
  assert.equal(dry.dustCaptured, 0);
  assert.ok(wet.dustCaptured / wet.dustGenerated > 0.98);
  assert.ok(wet.wallDust[0] < dry.wallDust[0] / 50);
  assert.ok(
    Math.abs(wet.wallDust[0] + wet.dustCaptured - wet.dustGenerated) < 1e-10,
  );
});

void test('solo keyboard input drills and reports falls for Yarik, worker 1, while Nikita braces', () => {
  const s = atDrill();
  equipDriller(s);
  advance(s, DT, () => ['KeyE', 'ShiftLeft']);
  assert.equal(s.workers[1].animation, 'drill');
  assert.equal(s.workers[0].animation, 'hold');
  assert.equal(s.braceHeld, true);
  until(s, (state) => state.drillMode === 'descend', cooledSolo, 12);
  assert.equal(s.events.find((event) => event.kind === 'hole').worker, 1);
  assert.equal(s.drillOverheats, 0);
  const fallen = atDrill();
  fallen.drillGear = 'ready';
  fallen.balance = 1.2;
  advance(fallen, DT, () => ['KeyE', 'ShiftLeft']);
  assert.equal(fallen.drillMode, 'fallen');
  assert.equal(fallen.workers[1].animation, 'fall');
  assert.notEqual(fallen.workers[0].animation, 'fall');
  assert.equal(fallen.events.find((event) => event.kind === 'fall').worker, 1);
});

void test('episode checkpoints skip completed preparation without inventing earned points or queued input', () => {
  for (const episode of screenEpisodes) {
    const s = createScreenEpisode(3, episode.id);
    assert.equal(s.phase, episode.id);
    assert.equal(s.practice, true);
    assert.equal(s.score, 0);
    assert.deepEqual(s.awards, []);
    assert.deepEqual(s.heldKeys, []);
    assert.ok(s.simulation.pendingActions.every((held) => !held));
    assert.ok(s.simulation.previousActions.every((held) => !held));
  }
  const s = createScreenEpisode(1, 'drill');
  advance(s, 0.2);
  assert.equal(s.phase, 'drill');
  assert.equal(s.corners, 4);
  assert.deepEqual(s.rods, [1, 1, 1, 1]);
  assert.deepEqual(s.clips, [4, 4, 4, 4]);
  assert.deepEqual(s.tension, [1, 1, 1, 1]);
  assert.deepEqual(s.simulation.clipBest, [4, 4, 4, 4]);
  assert.deepEqual(s.holes, []);
  assert.equal(s.drillGear, 'none');
  assert.equal(s.score, 0);
});

void test('finishing a practice episode earns no party score or awards', () => {
  const s = createScreenEpisode(1, 'level');
  assert.deepEqual(s.holes, [5.9, 6.03]);
  assert.deepEqual(s.latched, [true, true]);
  until(
    s,
    (state) => state.phase === 'result',
    (state) => [...levelKeys(state)],
    45,
  );
  assert.equal(s.practice, true);
  assert.equal(s.score, 0);
  assert.deepEqual(s.awards, []);
});

void test('falling on the way down after the second hole recovers to lifting without drilling a third hole', () => {
  const s = atDrill(2);
  equipDriller(s);
  s.holes = [5.85];
  s.drill = 0.999;
  s.balance = 0.3;
  s.wallDust = [0.2, 0.1];
  s.dustGenerated = 0.4;
  s.dustCaptured = 0.1;
  advance(s, DT, () => ['KeyE', 'Enter', 'ShiftRight']);
  assert.equal(s.drillMode, 'descend');
  assert.equal(s.holes.length, 2);
  const holes = [...s.holes],
    dust = [...s.wallDust];
  // Let go of the brace before descending: both holes already exist, but
  // Yarik must still visibly fall and recover before the crew can lift.
  until(
    s,
    (state) => state.drillMode === 'fallen',
    () => [],
    8,
  );
  const scoreAfterFall = s.score;
  assert.equal(s.falls, 1);
  assert.equal(s.phase, 'drill');
  until(
    s,
    (state) => state.phase === 'lift',
    () => [],
    2,
  );
  assert.equal(s.climb, 0);
  assert.equal(s.drillGear, 'none');
  assert.deepEqual(s.holes, holes);
  assert.deepEqual(s.wallDust, dust);
  assert.ok(s.wallDust.every(Number.isFinite));
  assert.equal(
    s.score,
    scoreAfterFall + Math.round((250 * s.dustCaptured) / s.dustGenerated),
  );
  advance(s, 0.4);
  assert.equal(
    s.awards.filter((entry) => entry.label === 'Белая стена').length,
    1,
  );
});
