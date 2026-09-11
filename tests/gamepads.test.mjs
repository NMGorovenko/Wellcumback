import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPadInput,
  createPadNavigation,
  digitalAxis,
  mapGamepads,
  mergeInputKeys,
  navigateGamepad,
  resetPadInput,
  gamepadHint,
} from '../lib/game/input/gamepads.ts';
function pad(
  index = 0,
  pressed = [],
  axes = [0, 0],
  mapping = 'standard',
  id = `pad-${index}`,
) {
  return {
    index,
    id,
    mapping,
    connected: true,
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: pressed.includes(i),
      value: pressed.includes(i) ? 1 : 0,
    })),
  };
}
function armed(players = 1, count = 1) {
  const s = createPadInput();
  mapGamepads(
    s,
    Array.from({ length: count }, (_, i) => pad(i)),
    players,
  );
  return s;
}

test('standard button positions map to action, shared throw and pause without invented device layouts', () => {
  const s = armed();
  const f = mapGamepads(s, [pad(0, [0, 5, 9, 12, 14])]);
  assert.deepEqual([...f.keys].sort(), ['KeyA', 'KeyE', 'KeyQ', 'KeyW']);
  assert.equal(f.primaryActionPressed, true);
  assert.equal(f.pausePressed, true);
  const held = mapGamepads(s, [pad(0, [0, 5, 9, 12, 14])]);
  assert.equal(held.primaryActionPressed, false);
  assert.equal(held.pausePressed, false);
  assert.equal(held.keys.has('KeyE'), true);
});

test('stick has engage/release hysteresis and rejects drifting or invalid input', () => {
  assert.equal(digitalAxis(0.39, 0), 0);
  assert.equal(digitalAxis(0.41, 0), 1);
  assert.equal(digitalAxis(0.3, 1), 1);
  assert.equal(digitalAxis(0.24, 1), 0);
  assert.equal(digitalAxis(-0.41, 1), -1);
  assert.equal(digitalAxis(NaN, 1), 0);
  const s = armed();
  assert.equal(mapGamepads(s, [pad(0, [], [0.2, -0.2])]).keys.size, 0);
  assert.deepEqual([...mapGamepads(s, [pad(0, [], [0.8, -0.8])]).keys].sort(), [
    'KeyD',
    'KeyW',
  ]);
  assert.deepEqual(
    [...mapGamepads(s, [pad(0, [14], [0.8, 0])]).keys],
    ['KeyA'],
  );
});

test('one multiplayer pad controls player 2 while keyboard player 1 remains independent', () => {
  const s = armed(3);
  const f = mapGamepads(s, [pad(0, [0], [1, 0])], 3);
  assert.deepEqual(f.assignments, [{ index: 0, player: 1, ready: true }]);
  assert.deepEqual([...f.keys].sort(), ['ArrowRight', 'Enter']);
  assert.equal(f.primaryActionPressed, false);
  const keyboard = new Set(['KeyW', 'KeyE']),
    combined = mergeInputKeys(keyboard, f.keys);
  assert.deepEqual([...combined].sort(), [
    'ArrowRight',
    'Enter',
    'KeyE',
    'KeyW',
  ]);
  combined.clear();
  assert.deepEqual([...keyboard], ['KeyW', 'KeyE']);
});

test('two and three pads map by sparse browser index to players 1,2,3', () => {
  const s = createPadInput();
  mapGamepads(s, [null, pad(1), null, pad(3), pad(4)], 3);
  const f = mapGamepads(
    s,
    [null, pad(1, [0]), null, pad(3, [0]), pad(4, [0])],
    3,
  );
  assert.deepEqual(
    f.assignments.map((p) => p.player),
    [0, 1, 2],
  );
  assert.deepEqual([...f.keys].sort(), ['Enter', 'KeyE', 'KeyO']);
  assert.equal(f.primaryActionPressed, true);
});

test('hotplug and reassignment consume held input until the physical controls return neutral', () => {
  const s = armed(2);
  const first = mapGamepads(s, [pad(0, [0])], 2);
  assert.equal(first.keys.has('Enter'), true);
  const changed = mapGamepads(s, [pad(0, [0]), pad(1, [0])], 2);
  assert.equal(changed.keys.size, 0);
  assert.equal(changed.primaryActionPressed, false);
  assert.ok(changed.assignments.every((p) => !p.ready));
  mapGamepads(s, [pad(0), pad(1)], 2);
  assert.equal(
    mapGamepads(s, [pad(0, [0]), pad(1)], 2).primaryActionPressed,
    true,
  );
});

test('disconnect clears only pad state and never leaves motion or clears keyboard holds', () => {
  const s = armed(),
    keyboard = new Set(['KeyD']);
  assert.equal(mapGamepads(s, [pad(0, [0], [1, 0])]).keys.has('KeyE'), true);
  const gone = mapGamepads(s, [null]);
  assert.equal(gone.keys.size, 0);
  assert.equal(gone.assignments.length, 0);
  assert.equal(s.pads.size, 0);
  assert.deepEqual([...mergeInputKeys(keyboard, gone.keys)], ['KeyD']);
});

test('blur/pause reset needs release; B or Start resumes on the next fresh press only', () => {
  const s = armed();
  assert.equal(mapGamepads(s, [pad(0, [1])]).pausePressed, true);
  resetPadInput(s);
  assert.equal(mapGamepads(s, [pad(0, [1])]).pausePressed, false);
  mapGamepads(s, [pad(0)]);
  assert.equal(mapGamepads(s, [pad(0, [9])]).pausePressed, true);
  assert.equal(mapGamepads(s, [pad(0, [9])]).pausePressed, false);
});

test('reusing a disconnected browser index for another controller does not inherit held state', () => {
  const s = armed();
  mapGamepads(s, [pad(0, [0])]);
  const replaced = mapGamepads(s, [
    pad(0, [0], [0, 0], 'standard', 'replacement'),
  ]);
  assert.equal(replaced.keys.size, 0);
  assert.equal(replaced.assignments[0].ready, false);
});

test('unsupported raw layouts are reported instead of guessed and phantom pads are ignored', () => {
  const s = createPadInput();
  const disconnected = pad(2);
  disconnected.connected = false;
  const f = mapGamepads(s, [pad(0, [0], [1, 0], ''), disconnected], 3);
  assert.deepEqual(f.unsupported, [0]);
  assert.equal(f.keys.size, 0);
  assert.equal(f.assignments.length, 0);
  assert.match(gamepadHint(f), /Нестандартный/);
});

test('lobby selection repeats at a bounded rate and release resets it', () => {
  const s = armed(),
    navigation = createPadNavigation();
  let f = mapGamepads(s, [pad(0, [13])]);
  assert.equal(navigateGamepad(navigation, f, 0).direction, 'down');
  assert.equal(navigateGamepad(navigation, f, 0.2).direction, null);
  assert.equal(navigateGamepad(navigation, f, 0.36).direction, 'down');
  assert.equal(navigateGamepad(navigation, f, 0.4).direction, null);
  assert.equal(navigateGamepad(navigation, f, 0.5).direction, 'down');
  navigateGamepad(navigation, mapGamepads(s, [pad()]), 0.51);
  f = mapGamepads(s, [pad(0, [13])]);
  assert.equal(navigateGamepad(navigation, f, 0.52).direction, 'down');
});

test('menu confirm/back is edge triggered, wins over movement, and works on multiplayer partner pad', () => {
  const s = armed(2),
    navigation = createPadNavigation();
  const confirm = navigateGamepad(
    navigation,
    mapGamepads(s, [pad(0, [0, 13])], 2),
    0,
  );
  assert.deepEqual(confirm, { direction: null, confirm: true, back: false });
  mapGamepads(s, [pad()], 2);
  const back = navigateGamepad(
    navigation,
    mapGamepads(s, [pad(0, [0, 1])], 2),
    1,
  );
  assert.deepEqual(back, { direction: null, confirm: false, back: true });
});

test('shared Q remains held if one of two controllers releases its shoulder button', () => {
  const s = armed(2, 2);
  assert.equal(
    mapGamepads(s, [pad(0, [5]), pad(1, [5])], 2).keys.has('KeyQ'),
    true,
  );
  assert.equal(mapGamepads(s, [pad(0), pad(1, [5])], 2).keys.has('KeyQ'), true);
  assert.equal(mapGamepads(s, [pad(0), pad(1)], 2).keys.has('KeyQ'), false);
});
