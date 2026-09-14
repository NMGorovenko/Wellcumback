import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshRace,
  changeLocalRacers,
  startRace,
  tickRace,
} from '../lib/game/race/engine.ts';
import { raceCourse } from '../lib/game/race/course.ts';
import { neutralRaceInput } from '../lib/game/race/types.ts';
import {
  raceStartSignal,
  raceStartSnapshotKey,
} from '../lib/game/race/start-signal.ts';

function start(track, players = 2) {
  const state = freshRace();
  state.trackId = track;
  changeLocalRacers(state, 0, players, 'Игрок');
  state.racers.forEach((r) => (r.ready = true));
  assert(startRace(state, raceCourse(track)));
  return state;
}
const held = (state, reset = true) =>
  new Map(
    state.racers.map((r, i) => [
      r.id,
      {
        throttle: 1,
        steer: i ? -1 : 1,
        handbrake: true,
        reset,
      },
    ]),
  );
for (const track of ['krasnoyarsk', 'nordschleife']) {
  for (const hz of [30, 60, 120, 144, 240]) {
    void test(`${track}: both cars stay on grid until green at ${hz} Hz`, () => {
      const state = start(track),
        course = raceCourse(track);
      const grid = state.racers.map((r) => structuredClone(r.car));
      const signals = new Set();
      for (let frame = 0; frame < hz * 3; frame++) {
        tickRace(state, 1 / hz, held(state), course);
        signals.add(raceStartSignal(state));
        if (state.phase === 'countdown') {
          state.racers.forEach((r, i) => assert.deepEqual(r.car, grid[i]));
          assert.equal(state.elapsed, 0);
          assert(
            state.racers.every(
              (r) => r.passedGates === 0 && r.score === 0 && r.respawns === 0,
            ),
          );
        }
      }
      assert.equal(state.phase, 'racing');
      assert.deepEqual([...signals], ['red', 'yellow', 'green']);
      for (let i = 0; i < hz / 3; i++)
        tickRace(state, 1 / hz, held(state), course);
      assert(
        state.racers.every((r) => r.car.speed > 0),
        'holding gas starts both cars on green',
      );
      assert(
        state.racers.every((r) => r.respawns === 0),
        'reset held since red must not teleport on green',
      );
      tickRace(
        state,
        0.02,
        new Map(state.racers.map((r) => [r.id, neutralRaceInput()])),
        course,
      );
      tickRace(state, 0.02, held(state), course);
      assert(
        state.racers.every((r) => r.respawns === 1),
        'new reset after release still works',
      );
    });
  }
}

void test('yellow survives pause and JSON reload, green is explicit before moving and disappears after start', () => {
  let state = start('nordschleife');
  const course = raceCourse(state.trackId);
  for (let i = 0; i < 150; i++) tickRace(state, 1 / 60, held(state), course);
  assert.equal(raceStartSignal(state), 'yellow');
  state.paused = true;
  state = JSON.parse(JSON.stringify(state));
  const paused = structuredClone(state);
  for (let i = 0; i < 60; i++) tickRace(state, 1 / 30, held(state), course);
  assert.deepEqual(state, paused);
  state.paused = false;
  for (let i = 0; i < 60; i++) tickRace(state, 1 / 120, held(state), course);
  assert.equal(raceStartSignal(state), 'green');
  assert.equal(state.elapsed, 0);
  for (let i = 0; i < 120; i++) tickRace(state, 1 / 120, held(state), course);
  assert.equal(raceStartSignal(state), null);
  state.phase = 'lobby';
  assert.equal(raceStartSignal(state), null);
});

void test('a green transition invalidates the HUD snapshot even between 30Hz telemetry updates', () => {
  const s = start('krasnoyarsk', 1),
    course = raceCourse(s.trackId);
  s.countdown = 1 / 120;
  const before = raceStartSnapshotKey(s);
  tickRace(s, 1 / 120, held(s), course);
  assert.notEqual(raceStartSnapshotKey(s), before);
  assert.equal(raceStartSignal(s), 'green');
  assert.equal(s.racers[0].car.speed, 0);
});
