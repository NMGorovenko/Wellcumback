import test from 'node:test';
import assert from 'node:assert/strict';
import { freshGame, tick } from '../lib/game/screen/engine.ts';
import { screenDrillStatus } from '../components/game/screen/screen-drill-status.ts';

function start() {
  const s = freshGame(1);
  s.phase = 'drill';
  return s;
}
function step(s, held = true) {
  const keys = new Set(held ? ['KeyE'] : []);
  if (!s.braceHeld && s.balance > 0.04) keys.add('KeyA');
  if (!s.braceHeld && s.balance < -0.04) keys.add('KeyD');
  tick(s, 1 / 60, keys);
}

void test('after the real first ascent the HUD reports the supply walk, not a transfer or automatic brace', () => {
  const s = start();
  for (let n = 0; n < 140; n++) step(s);
  assert.equal(s.drillMode, 'handoff');
  assert.equal(s.drillAssistant.activity, 'walk');
  const status = screenDrillStatus(s);
  assert.equal(status.assistant, 'идёт за приборами');
  assert.equal(status.climber, 'держит равновесие');
  assert.equal(status.braced, false);
  assert.equal(status.transfer, null);
});

void test('the actual solo delivery distinguishes pickup, return, interrupted acceptance and each tool transfer', () => {
  const s = start(),
    seen = new Set();
  let interrupted = false;
  for (let n = 0; n < 40 * 60 && s.drillMode !== 'drill'; n++) {
    step(s);
    const status = screenDrillStatus(s);
    if (status.pickup) seen.add(`pickup:${status.pickup}`);
    if (status.assistant === 'возвращается с приборами') {
      seen.add('return');
      assert.equal(status.transfer, null);
      assert.equal(status.braced, false);
    }
    if (status.transfer) {
      seen.add(`transfer:${status.transfer}`);
      if (!interrupted) {
        step(s, false);
        interrupted = true;
        assert.equal(
          screenDrillStatus(s).transfer,
          null,
          'releasing acceptance stops the transfer label',
        );
      }
    }
  }
  assert.equal(s.drillMode, 'drill');
  assert.deepEqual(
    [...seen].sort((a, b) => a.localeCompare(b)),
    [
      'pickup:drill',
      'pickup:vacuum',
      'return',
      'transfer:drill',
      'transfer:vacuum',
    ],
  );
});

void test('the recovered climber is described as standing beside the chairs', () => {
  const s = start();
  s.drillMode = 'fallen';
  s.climb = 1;
  s.fallProgress = 0.98;
  for (let n = 0; n < 5; n++) tick(s, 1 / 60, new Set());
  assert.equal(s.drillMode, 'position');
  assert.equal(s.climb, 0);
  assert.equal(screenDrillStatus(s).climber, 'у стульев');
});
