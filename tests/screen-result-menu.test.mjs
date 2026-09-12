import test from 'node:test';
import assert from 'node:assert/strict';
import {
  screenResultMenu,
  moveScreenResultChoice,
  runScreenResultAction,
} from '../lib/game/screen/result-menu.ts';
import {
  createPadInput,
  createPadNavigation,
  mapGamepads,
  navigateGamepad,
} from '../lib/game/input/gamepads.ts';

const pad = (buttons = []) => ({
  index: 2,
  id: 'DualSense Wireless Controller',
  mapping: 'standard',
  connected: true,
  axes: [0, 0],
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: buttons.includes(i),
    value: buttons.includes(i) ? 1 : 0,
  })),
});
for (const hasNext of [false, true])
  void test(`result controller selects and activates every visible action ${hasNext ? 'with' : 'without'} a next chapter`, () => {
    const called = [],
      options = screenResultMenu(hasNext),
      actions = {
        onExit: () => called.push('exit'),
        restart: () => called.push('restart'),
        ...(hasNext ? { onNext: () => called.push('next') } : {}),
      },
      input = createPadInput(),
      navigation = createPadNavigation();
    assert.deepEqual(
      options.map((option) => option.id),
      hasNext ? ['next', 'exit', 'restart'] : ['exit', 'restart'],
    );
    let choice = 0,
      time = 0;
    const frame = (buttons = []) => {
      const nav = navigateGamepad(
        navigation,
        mapGamepads(input, [pad(buttons)], 3),
        (time += 0.02),
      );
      if (nav.direction)
        choice = moveScreenResultChoice(choice, nav.direction, options);
      if (nav.confirm) runScreenResultAction(options[choice].id, actions);
    };
    frame();
    frame([12]);
    assert.equal(
      options[choice].id,
      'restart',
      'up wraps to the visible replay action',
    );
    frame();
    frame([0]);
    frame([0]);
    assert.deepEqual(called, ['restart'], 'held confirm cannot replay twice');
    for (let index = 0; index < options.length - 1; index++) {
      frame();
      frame([13]);
      frame();
      frame([0]);
      assert.equal(choice, index);
      assert.equal(called.at(-1), options[index].id);
    }
    assert.deepEqual(called, [
      'restart',
      ...options.slice(0, -1).map((option) => option.id),
    ]);
  });
