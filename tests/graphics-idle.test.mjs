import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdleRenderGate } from '../lib/game/graphics/idle-render.ts';

void test('paused city keeps its last frame and wakes for camera, resize or graphics changes', () => {
  const gate = createIdleRenderGate();
  const settings = { detail: 'high' };
  const inputs = [12, 'cruise', 720, settings];
  assert.equal(gate(0, false, inputs), true);
  assert.equal(gate(500, true, inputs), true, 'camera may settle');
  assert.equal(
    gate(1100, true, [...inputs]),
    false,
    'no rendering for an unchanged paused scene',
  );
  assert.equal(
    gate(1200, true, [12, 'map', 720, settings]),
    true,
    'camera change is immediate',
  );
  assert.equal(gate(2300, true, [12, 'map', 720, settings]), false);
  assert.equal(
    gate(2400, true, [12, 'map', 900, settings]),
    true,
    'resize restores the cleared drawing buffer',
  );
  assert.equal(gate(3500, true, [12, 'map', 900, settings]), false);
  assert.equal(
    gate(3600, true, [12, 'map', 900, { detail: 'low' }]),
    true,
    'settings need no unpause',
  );
  assert.equal(
    gate(6000, false, inputs),
    true,
    'resuming never waits for a timer',
  );
  assert.equal(gate(6100, false, inputs), true);
});

// A DPR change clears the backing buffer even without a CSS resize. Context
// restoration similarly needs a fresh frame while gameplay remains paused.
void test('paused rendering wakes for backing-buffer scale and context restoration', () => {
  const gate = createIdleRenderGate();
  assert.equal(gate(0, true, [720, 2, 0]), true);
  assert.equal(gate(1100, true, [720, 2, 0]), false);
  assert.equal(gate(1200, true, [720, 1, 0]), true);
  assert.equal(gate(2300, true, [720, 1, 0]), false);
  assert.equal(gate(2400, true, [720, 1, 1]), true);
});
