import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioTargets } from '../lib/game/audio/automation.ts';
function parameter() {
  return {
    value: 0.25,
    events: [],
    cancelScheduledValues(at) {
      this.events = this.events.filter((e) => e.at < at);
    },
    setValueAtTime(value, at) {
      this.events.push({ type: 'value', value, at });
    },
    setTargetAtTime(value, at, lag) {
      this.events.push({ type: 'target', value, at, lag });
    },
  };
}
void test('30 minutes of live automation stays bounded even when silent nodes never prune', () => {
  const context = { currentTime: 0 },
    target = createAudioTargets(context),
    param = parameter();
  let expected = param.value,
    lastValue = expected,
    previousTime = 0,
    lastLag = 0.035;
  for (let i = 0; i < 30 * 60 * 30; i++) {
    context.currentTime = i / 30;
    expected =
      lastValue +
      (expected - lastValue) *
        Math.exp(-(context.currentTime - previousTime) / lastLag);
    const value = 0.3 + Math.sin(i * 0.03) * 0.2,
      lag = i % 2 ? 0.018 : 0.035;
    target(param, value, context.currentTime, lag);
    assert.ok(param.events.length <= 2);
    assert.ok(
      Math.abs(param.events[0].value - expected) < 1e-12,
      'continuity at every replacement',
    );
    previousTime = context.currentTime;
    lastValue = value;
    lastLag = lag;
  }
});
void test('unchanged silent target does not enqueue another event every frame', () => {
  const context = { currentTime: 0 },
    target = createAudioTargets(context),
    param = parameter();
  for (let i = 0; i < 10000; i++) {
    context.currentTime = i / 30;
    target(param, 0);
  }
  assert.equal(param.events.length, 2);
  assert.equal(param.events[1].at, 0);
});
void test('offline future automation is retained until audio has actually consumed it', () => {
  const context = { currentTime: 0 },
    target = createAudioTargets(context),
    param = parameter();
  target(param, 1, 0);
  target(param, 2, 1);
  target(param, 3, 2);
  assert.deepEqual(
    param.events.map((e) => e.at),
    [0, 0, 1, 2],
  );
  context.currentTime = 3;
  target(param, 4, 3);
  assert.deepEqual(
    param.events.map((e) => e.at),
    [3, 3],
  );
});
