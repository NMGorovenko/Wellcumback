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
  identifyGamepad,
  padButtonLabel,
  keyboardPrompt,
  gamepadPrompt,
  inputPrompt,
  PLAYER_BINDINGS,
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

void test('standard button positions map to action, shared throw and pause without invented device layouts', () => {
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

void test('stick has engage/release hysteresis and rejects drifting or invalid input', () => {
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

void test('one multiplayer pad controls player 2 while keyboard player 1 remains independent', () => {
  const s = armed(3);
  const f = mapGamepads(s, [pad(0, [0], [1, 0])], 3);
  assert.deepEqual(f.assignments, [
    {
      index: 0,
      player: 1,
      ready: true,
      brand: 'generic',
      label: 'Геймпад',
    },
  ]);
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

void test('two and three pads map by sparse browser index to players 1,2,3', () => {
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

void test('hotplug and reassignment consume held input until the physical controls return neutral', () => {
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

void test('disconnect clears only pad state and never leaves motion or clears keyboard holds', () => {
  const s = armed(),
    keyboard = new Set(['KeyD']);
  assert.equal(mapGamepads(s, [pad(0, [0], [1, 0])]).keys.has('KeyE'), true);
  const gone = mapGamepads(s, [null]);
  assert.equal(gone.keys.size, 0);
  assert.equal(gone.assignments.length, 0);
  assert.equal(s.pads.size, 0);
  assert.deepEqual([...mergeInputKeys(keyboard, gone.keys)], ['KeyD']);
});

void test('blur/pause reset needs release; B or Start resumes on the next fresh press only', () => {
  const s = armed();
  assert.equal(mapGamepads(s, [pad(0, [1])]).pausePressed, true);
  resetPadInput(s);
  assert.equal(mapGamepads(s, [pad(0, [1])]).pausePressed, false);
  mapGamepads(s, [pad(0)]);
  assert.equal(mapGamepads(s, [pad(0, [9])]).pausePressed, true);
  assert.equal(mapGamepads(s, [pad(0, [9])]).pausePressed, false);
});

void test('reusing a disconnected browser index for another controller does not inherit held state', () => {
  const s = armed();
  mapGamepads(s, [pad(0, [0])]);
  const replaced = mapGamepads(s, [
    pad(0, [0], [0, 0], 'standard', 'replacement'),
  ]);
  assert.equal(replaced.keys.size, 0);
  assert.equal(replaced.assignments[0].ready, false);
});

void test('unsupported raw layouts are reported instead of guessed and phantom pads are ignored', () => {
  const s = createPadInput();
  const disconnected = pad(2);
  disconnected.connected = false;
  const f = mapGamepads(s, [pad(0, [0], [1, 0], ''), disconnected], 3);
  assert.deepEqual(f.unsupported, [0]);
  assert.equal(f.keys.size, 0);
  assert.equal(f.assignments.length, 0);
  assert.match(gamepadHint(f), /Нестандартный/);
});

void test('lobby selection repeats at a bounded rate and release resets it', () => {
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

void test('menu confirm/back is edge triggered, wins over movement, and works on multiplayer partner pad', () => {
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

void test('shared Q remains held if one of two controllers releases its shoulder button', () => {
  const s = armed(2, 2);
  assert.equal(
    mapGamepads(s, [pad(0, [5]), pad(1, [5])], 2).keys.has('KeyQ'),
    true,
  );
  assert.equal(mapGamepads(s, [pad(0), pad(1, [5])], 2).keys.has('KeyQ'), true);
  assert.equal(mapGamepads(s, [pad(0), pad(1)], 2).keys.has('KeyQ'), false);
});

void test('DualSense and DualShock identity selects PlayStation labels for standard browser layouts', () => {
  for (const id of [
    'DualSense Wireless Controller',
    'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
    '054c-0ce6-Wireless Controller',
    '054c-0df2-DualSense Edge Wireless Controller',
  ]) {
    const s = createPadInput();
    const device = (pressed = []) => pad(4, pressed, [0, 0], 'standard', id);
    const neutral = mapGamepads(s, [device()]);
    assert.equal(neutral.assignments[0].label, 'DualSense');
    assert.equal(neutral.assignments[0].brand, 'playstation');
    assert.equal(gamepadPrompt(neutral, 0, 'action'), '×');
    assert.equal(gamepadPrompt(neutral, 0, 'secondary'), 'L2');
    assert.equal(gamepadPrompt(neutral, 0, 'throw'), 'R1');
    assert.equal(gamepadPrompt(neutral, 0, 'pause'), '○ / Options');
    assert.deepEqual([...mapGamepads(s, [device([0, 5, 6])]).keys].sort(), [
      'KeyE',
      'KeyQ',
      'ShiftLeft',
    ]);
  }
  for (const id of [
    'DualShock 4',
    '054c-09cc-Wireless Controller',
    'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 05c4)',
  ]) {
    assert.deepEqual(identifyGamepad(id), {
      brand: 'playstation',
      label: 'DualShock',
    });
  }
  assert.deepEqual(
    Array.from({ length: 10 }, (_, button) =>
      padButtonLabel('playstation', button),
    ),
    ['×', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create / Share', 'Options'],
  );
});

void test('Xbox and unknown standard controllers retain their actual or positional button labels', () => {
  for (const id of [
    'Xbox Wireless Controller',
    'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
    '045e-0b13-Controller',
    'Controller (STANDARD GAMEPAD Vendor: 045e Product: 02ea)',
  ])
    assert.deepEqual(identifyGamepad(id), { brand: 'xbox', label: 'Xbox' });
  assert.deepEqual(
    Array.from({ length: 10 }, (_, button) => padButtonLabel('xbox', button)),
    ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu'],
  );
  for (const id of ['Wireless Controller', '8BitDo Pro 2', 'Unknown USB pad'])
    assert.deepEqual(identifyGamepad(id), {
      brand: 'generic',
      label: 'Геймпад',
    });
  assert.equal(padButtonLabel('generic', 0), 'нижняя кнопка');
  assert.equal(padButtonLabel('generic', 6), 'левый триггер');
});

void test('context prompts follow player assignments across sparse indexes and multiplayer reassignment', () => {
  const s = createPadInput();
  const sony = pad(4, [], [0, 0], 'standard', 'DualSense Wireless Controller');
  let f = mapGamepads(s, [null, sony], 3);
  assert.equal(inputPrompt(f, 0, 'action'), 'E');
  assert.equal(gamepadPrompt(f, 0, 'action'), null);
  assert.equal(inputPrompt(f, 1, 'action'), 'Enter / ×');
  assert.equal(inputPrompt(f, 1, 'secondary'), 'правый Shift / L2');
  const xbox = pad(8, [], [0, 0], 'standard', 'Xbox Wireless Controller');
  f = mapGamepads(s, [xbox, null, sony], 3);
  assert.equal(inputPrompt(f, 0, 'action'), 'E / ×');
  assert.equal(inputPrompt(f, 1, 'action'), 'Enter / A');
  assert.equal(inputPrompt(f, 2, 'action'), 'O');
  assert.equal(gamepadPrompt(f, 0, 'horizontal'), 'стик ←/→');
  assert.equal(gamepadPrompt(f, 1, 'vertical'), 'стик ↑/↓');
  assert.equal(keyboardPrompt(0, 'horizontal'), 'A/D');
  assert.equal(keyboardPrompt(1, 'vertical'), '↑/↓');
  assert.equal(keyboardPrompt(2, 'secondary'), 'U');
  assert.equal(keyboardPrompt(2, 'move'), 'IJKL');
  assert.equal(keyboardPrompt(2, 'throw'), 'Q');
  assert.equal(keyboardPrompt(0, 'pause'), 'Esc');
  assert.equal(keyboardPrompt(9, 'action'), '');
  assert.ok(PLAYER_BINDINGS.every((keys) => keys.action !== keys.secondary));
});

void test('analog L2 works without pressed boolean and releases without threshold chatter', () => {
  const s = armed();
  const trigger = (value, pressed = false) => {
    const device = pad();
    device.buttons[6] = { value, pressed };
    return mapGamepads(s, [device]);
  };
  assert.equal(trigger(0.49).keys.has('ShiftLeft'), false);
  assert.equal(trigger(0.7).keys.has('ShiftLeft'), true);
  assert.equal(trigger(0.4).keys.has('ShiftLeft'), true);
  assert.equal(trigger(0.25).keys.has('ShiftLeft'), false);
  assert.equal(trigger(0.4).keys.has('ShiftLeft'), false);
  assert.equal(trigger(0, true).keys.has('ShiftLeft'), true);
  assert.equal(trigger(0).keys.has('ShiftLeft'), false);
  assert.equal(trigger(NaN).keys.size, 0);
  assert.equal(trigger(Infinity).keys.size, 0);
});

void test('held or partially released L2 cannot arm after connect or pause until fully released', () => {
  const s = createPadInput();
  const trigger = (value) => {
    const device = pad();
    device.buttons[6] = { value, pressed: false };
    return mapGamepads(s, [device]);
  };
  assert.equal(trigger(0.8).assignments[0].ready, false);
  assert.equal(trigger(0.3).assignments[0].ready, false);
  assert.equal(trigger(0).assignments[0].ready, true);
  assert.equal(trigger(0.8).keys.has('ShiftLeft'), true);
  resetPadInput(s);
  assert.equal(trigger(0.8).keys.size, 0);
  assert.equal(trigger(0.3).assignments[0].ready, false);
  assert.equal(trigger(0).assignments[0].ready, true);
  assert.equal(trigger(0.8).keys.has('ShiftLeft'), true);
});

void test('disconnect stops a held vacuum while preserving independently held keyboard keys', () => {
  const s = armed();
  const keyboard = new Set(['ShiftRight']);
  const active = mapGamepads(s, [pad(0, [6])]);
  assert.deepEqual([...mergeInputKeys(keyboard, active.keys)].sort(), [
    'ShiftLeft',
    'ShiftRight',
  ]);
  const gone = mapGamepads(s, [null]);
  assert.equal(gone.keys.size, 0);
  assert.deepEqual([...mergeInputKeys(keyboard, gone.keys)], ['ShiftRight']);
  const returned = mapGamepads(s, [pad(0, [6])]);
  assert.equal(returned.assignments[0].ready, false);
  assert.equal(returned.keys.size, 0);
});

void test('a familiar DualSense ID never enables an unsupported raw mapping, including mixed devices', () => {
  const s = createPadInput();
  const f = mapGamepads(
    s,
    [
      pad(0, [0, 6], [1, 1], '', 'DualSense Wireless Controller'),
      pad(3, [], [0, 0], 'standard', 'Xbox Wireless Controller'),
    ],
    2,
  );
  assert.deepEqual(f.unsupported, [0]);
  assert.equal(f.assignments.length, 1);
  assert.equal(f.assignments[0].brand, 'xbox');
  assert.equal(f.keys.size, 0);
  assert.match(gamepadHint(f), /Xbox 4 → игрок 2/);
  assert.match(gamepadHint(f), /Нестандартный геймпад/);
});
