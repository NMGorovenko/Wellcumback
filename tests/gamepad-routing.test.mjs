import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPadInput,
  createPadNavigation,
  inputPlayerCount,
  mapGamepads,
  navigateGamepad,
} from '../lib/game/input/gamepads.ts';
import {
  freshClean,
  cleanAction,
  cleanTick,
  planRoute,
  stations,
} from '../lib/game/clean/engine.ts';

const pad = (buttons = [], axes = [0, 0]) => ({
  index: 0,
  id: 'controller',
  mapping: 'standard',
  connected: true,
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: buttons.includes(i),
    value: buttons.includes(i) ? 1 : 0,
  })),
});
void test('available input slots follow playable humans and never recruit a solo AI helper', () => {
  assert.equal(inputPlayerCount({ players: 3 }), 3);
  assert.equal(inputPlayerCount({ players: 3, actorCount: 1 }), 1);
  assert.equal(inputPlayerCount({ players: 1, actorCount: 2 }), 1);
  assert.equal(inputPlayerCount({ players: 2, actorCount: 2 }), 2);
});
for (const players of [2, 3])
  void test(`one controller completes the anonymous-soldier chapters with ${players} selected players, then changes to partner`, () => {
    const s = freshClean(players),
      memory = createPadInput();
    const update = (buttons = [], axes = [0, 0], dt = 0.025) => {
      const frame = mapGamepads(
        memory,
        [pad(buttons, axes)],
        inputPlayerCount(s),
      );
      if (frame.primaryActionPressed) cleanAction(s);
      cleanTick(s, dt, frame.keys);
      return frame;
    };
    const run = (seconds, buttons = []) => {
      for (let t = 0; t < seconds; t += 0.025) update(buttons);
    };
    const approach = (station, radius = 53) => {
      const phase = s.phase,
        route = planRoute({ x: s.x[0], y: s.y[0] }, station, radius - 5);
      let cursor = 0;
      for (let n = 0; n < 10000; n++) {
        if (
          s.phase !== phase ||
          Math.hypot(s.x[0] - station.x, s.y[0] - station.y) < radius
        )
          return;
        const waypoint = route[cursor];
        assert.ok(waypoint, 'station is reachable');
        if (Math.hypot(s.x[0] - waypoint.x, s.y[0] - waypoint.y) < 3) {
          cursor++;
          continue;
        }
        const dx = waypoint.x - s.x[0],
          dy = waypoint.y - s.y[0],
          axes = [
            Math.abs(dx) > 1.2 ? Math.sign(dx) : 0,
            Math.abs(dy) > 1.2 ? Math.sign(dy) : 0,
          ];
        const buttons =
          s.rhythm.active && s.rhythm.clock >= s.rhythm.period - 0.04
            ? [s.rhythm.expected === 'KeyQ' ? 5 : 0]
            : [];
        const frame = update(buttons, axes, 0.01);
        assert.equal(frame.assignments[0].player, 0);
      }
      assert.fail('controller route stalled');
    };
    update();
    cleanAction(s);
    run(4.1);
    assert.equal(s.phase, 'find');
    approach(stations[0]);
    update();
    update([0]);
    assert.equal(s.phase, 'accident');
    run(12);
    assert.equal(s.phase, 'toilet');
    approach(stations[1]);
    run(3.2, [0]);
    assert.equal(s.phase, 'shower');
    update();
    approach(stations[2]);
    run(3.7, [0]);
    assert.equal(s.phase, 'laundry');
    update();
    approach(stations[3]);
    run(2.7, [0]);
    assert.equal(s.phase, 'spin');
    for (let n = 0; n < 2000 && s.phase !== 'clean'; n++) update([0]);
    assert.equal(s.phase, 'clean');
    const held = update([0]);
    assert.equal(held.assignments[0].player, 1);
    assert.equal(held.assignments[0].ready, false);
    assert.equal(
      held.keys.size,
      0,
      'held station action cannot leak into new actor',
    );
    update();
    const before = [...s.y];
    for (let n = 0; n < 12; n++) update([], [0, 1]);
    assert.ok(
      s.y[1] > before[1] + 20,
      'partner now responds to the same controller',
    );
    assert.equal(
      s.y[0],
      before[0],
      'keyboard actor remains independently controlled',
    );
    assert.equal(s.players, players);
  });

void test('any teammate can resume with B or confirm A and navigate a shared pause menu', () => {
  const s = createPadInput(),
    navigation = createPadNavigation();
  const devices = (active = -1, buttons = [], axes = [0, 0]) =>
    [0, 1, 2].map((index) => ({
      ...pad(index === active ? buttons : [], index === active ? axes : [0, 0]),
      index,
      id: `controller-${index}`,
    }));
  mapGamepads(s, devices(), 3);
  for (const player of [1, 2]) {
    const pause = mapGamepads(s, devices(player, [1]), 3);
    assert.equal(pause.pausePressed, true);
    assert.equal(navigateGamepad(navigation, pause, 0).back, true);
    mapGamepads(s, devices(), 3);
    const confirm = mapGamepads(s, devices(player, [0]), 3);
    assert.equal(navigateGamepad(navigation, confirm, 1).confirm, true);
    mapGamepads(s, devices(), 3);
    const direction = mapGamepads(s, devices(player, [], [0, 1]), 3);
    assert.equal(navigateGamepad(navigation, direction, 2).direction, 'down');
    navigateGamepad(navigation, mapGamepads(s, devices(), 3), 3);
  }
});
