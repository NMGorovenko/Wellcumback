import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPadInput,
  createPadNavigation,
  inputPlayerCount,
  mapGamepads,
  navigateGamepad,
  gamepadPrompt,
  mergeInputKeys,
} from '../lib/game/input/gamepads.ts';
import { cleanTick, stations } from '../lib/game/clean/engine.ts';
import { createCleanEpisode } from '../lib/game/clean/episodes.ts';
import { crewSpawn } from '../lib/game/clean/layout.ts';

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
  void test(`controller remaps safely from the soldier to a partner when ${players} cleaners arrive`, () => {
    const s = createCleanEpisode(players, 'response'),
      memory = createPadInput();
    const input = (buttons = [], axes = [0, 0], keyboard = []) => {
      const frame = mapGamepads(
        memory,
        [pad(buttons, axes)],
        inputPlayerCount(s),
      );
      cleanTick(s, 0.025, mergeInputKeys(new Set(keyboard), frame.keys));
      return frame;
    };
    assert.equal(input().assignments[0].player, 0);
    s.x[0] = 800;
    s.y[0] = 650;
    input([], [1, 0]);
    assert.ok(s.x[0] > 800, 'the only pad controls the soldier in the opening');
    s.responseStage = 'gear';
    s.npcs.slice(1).forEach((npc, i) => {
      npc.x = crewSpawn.x + (i ? 25 : -25);
      npc.y = crewSpawn.y;
    });
    input([0]);
    assert.equal(s.phase, 'clean');
    const before = structuredClone(s.x),
      held = input([0], [1, 0]);
    assert.equal(held.assignments[0].player, 1);
    assert.equal(held.assignments[0].ready, false);
    assert.equal(
      held.keys.size,
      0,
      'old held input cannot leak into a new identity',
    );
    assert.deepEqual(s.x, before);
    input();
    s.x[1] = stations[4].x;
    s.y[1] = stations[4].y;
    input([0]);
    assert.ok(s.valve > 0, 'after releasing, the partner can close the valve');
    assert.equal(s.activity[0], 'idle');
    input();
    s.x[0] = 800;
    s.y[0] = 650;
    s.x[1] = 900;
    s.y[1] = 650;
    input([], [0, 1], ['KeyD']);
    assert.ok(
      s.x[0] > 800 && s.y[1] > 650,
      'keyboard and pad control separate cleaners',
    );
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

void test('vacuum trigger reaches each assigned actor independently of screwdriver action and physical index', () => {
  const s = createPadInput();
  const devices = (active = -1, buttons = []) =>
    [2, 5, 8].map((index, player) => ({
      ...pad(player === active ? buttons : []),
      index,
      id:
        player === 0
          ? 'DualSense Wireless Controller'
          : 'Xbox Wireless Controller',
    }));
  mapGamepads(s, devices(), 3);
  for (const { player, secondary, action } of [
    { player: 0, secondary: 'ShiftLeft', action: 'KeyE' },
    { player: 1, secondary: 'ShiftRight', action: 'Enter' },
    { player: 2, secondary: 'KeyU', action: 'KeyO' },
  ]) {
    const f = mapGamepads(s, devices(player, [0, 6]), 3);
    assert.deepEqual([...f.keys].sort(), [action, secondary].sort());
    assert.equal(
      gamepadPrompt(f, player, 'secondary'),
      player === 0 ? 'L2' : 'LT',
    );
    assert.equal(f.primaryActionPressed, player === 0);
    assert.equal(mapGamepads(s, devices(), 3).keys.size, 0);
  }
});
