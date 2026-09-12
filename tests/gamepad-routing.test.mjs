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
  void test(`one controller stays with Nikita while keyboard controls the soldier and Roma for ${players} players`, () => {
    const routeInput = (
      s,
      memory,
      buttons = [],
      axes = [0, 0],
      keyboard = [],
      dt = 0.025,
    ) => {
      const source = new Set(keyboard);
      const frame = mapGamepads(
        memory,
        [pad(buttons, axes)],
        inputPlayerCount(s),
      );
      cleanTick(s, dt, mergeInputKeys(source, frame.keys));
      assert.deepEqual(
        [...source],
        keyboard,
        'pad keys never contaminate the keyboard source',
      );
      assert.equal(frame.assignments[0].player, 1);
      assert.equal(
        frame.primaryActionPressed,
        false,
        'the partner never triggers the primary action',
      );
      return frame;
    };
    // Real episode prerequisites, with clear corridor positions to isolate input ownership.
    for (const chapter of [
      'duty',
      'find',
      'toilet',
      'shower',
      'laundry',
      'spin',
      'response',
      'clean',
    ]) {
      const s = createCleanEpisode(players, chapter),
        memory = createPadInput();
      s.x[0] = 800;
      s.y[0] = 650;
      s.x[1] = 900;
      s.y[1] = 650;
      assert.equal(inputPlayerCount(s), players, chapter);
      routeInput(s, memory);
      const frame = routeInput(s, memory, [], [0, 1], [], 0.15);
      assert.deepEqual([...frame.keys], ['ArrowDown']);
      assert.equal(
        s.y[0],
        650,
        `${chapter}: the pad never moves the anonymous soldier or Roma`,
      );
      assert.ok(s.y[1] > 670, `${chapter}: the pad moves Nikita`);
      const partnerY = s.y[1];
      routeInput(s, memory, [], [0, 0], ['KeyD'], 0.15);
      assert.ok(s.x[0] > 820, `${chapter}: keyboard still moves player 1`);
      assert.equal(
        s.y[1],
        partnerY,
        `${chapter}: released stick cannot keep moving Nikita`,
      );
      const primaryX = s.x[0];
      routeInput(s, memory, [], [0, 1], ['KeyD'], 0.1);
      assert.ok(
        s.x[0] > primaryX && s.y[1] > partnerY,
        `${chapter}: mixed sources work simultaneously`,
      );
    }
    // A partner's A cannot perform the soldier's personal station action.
    const toilet = createCleanEpisode(players, 'toilet'),
      stationPad = createPadInput();
    toilet.x[0] = stations[1].x;
    toilet.y[0] = stations[1].y;
    toilet.x[1] = 900;
    toilet.y[1] = 650;
    routeInput(toilet, stationPad);
    const partnerAction = routeInput(toilet, stationPad, [0]);
    assert.deepEqual([...partnerAction.keys], ['Enter']);
    assert.equal(toilet.relief, 0);
    routeInput(toilet, stationPad, [0], [0, 0], ['KeyE']);
    assert.ok(toilet.relief > 0, 'only the keyboard soldier starts relief');

    // Trigger the actual NPC handoff while A is held. Player 2 does not change
    // identity, so held A stays Enter; it must never become Roma's KeyE.
    const s = createCleanEpisode(players, 'response'),
      memory = createPadInput();
    s.responseStage = 'gear';
    for (const [i, npc] of s.npcs.slice(1).entries()) {
      npc.x = crewSpawn.x + (i ? 25 : -25);
      npc.y = crewSpawn.y;
    }
    mapGamepads(memory, [pad()], inputPlayerCount(s));
    const crossing = routeInput(s, memory, [0]);
    assert.equal(s.phase, 'clean');
    assert.equal(crossing.assignments[0].ready, true);
    const held = routeInput(s, memory, [0]);
    assert.equal(
      held.assignments[0].ready,
      true,
      'stable actor ownership needs no remapping reset',
    );
    assert.deepEqual([...held.keys], ['Enter']);
    assert.equal(
      s.activity[0],
      'idle',
      'held partner action does not leak into Roma',
    );
    s.x[1] = stations[4].x;
    s.y[1] = stations[4].y;
    routeInput(s, memory, [0], [0, 0], [], 0.1);
    assert.ok(
      s.valve > 0,
      'the held controller works the real valve as Nikita',
    );
    assert.equal(s.activity[1], 'valve');
    assert.equal(s.activity[0], 'idle');
    assert.equal(
      routeInput(s, memory).keys.size,
      0,
      'release clears the controller source after handoff',
    );
    const before = s.x[0];
    routeInput(s, memory, [], [0, 0], ['KeyA'], 0.1);
    assert.ok(s.x[0] < before, 'keyboard controls Roma after the handoff');
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
