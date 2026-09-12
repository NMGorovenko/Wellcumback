import assert from 'node:assert/strict';
import test from 'node:test';
import { createScreenMotors } from '../hooks/use-screen-motors.ts';

class Param {
  value = 0;
  calls = [];
  cancelScheduledValues(...args) {
    this.calls.push(['cancel', ...args]);
  }
  setValueAtTime(...args) {
    this.calls.push(['set', ...args]);
    this.value = args[0];
  }
  linearRampToValueAtTime(...args) {
    this.calls.push(['ramp', ...args]);
    this.value = args[0];
  }
  setTargetAtTime(...args) {
    this.calls.push(['target', ...args]);
    this.value = args[0];
  }
}
class Node {
  connections = [];
  disconnected = 0;
  connect(node) {
    this.connections.push(node);
  }
  disconnect() {
    this.disconnected++;
  }
}
class Oscillator extends Node {
  frequency = new Param();
  starts = [];
  stops = [];
  start(...args) {
    this.starts.push(args);
  }
  stop(...args) {
    this.stops.push(args);
  }
}
class Context {
  currentTime = 12;
  destination = new Node();
  oscillators = [];
  filters = [];
  gains = [];
  createOscillator() {
    const node = new Oscillator();
    this.oscillators.push(node);
    return node;
  }
  createGain() {
    const node = Object.assign(new Node(), { gain: new Param() });
    this.gains.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = Object.assign(new Node(), {
      frequency: new Param(),
      Q: new Param(),
    });
    this.filters.push(node);
    return node;
  }
}

void test('motors are independent, start silent and do not allocate on snapshots', () => {
  const context = new Context(),
    motors = createScreenMotors(context);
  assert.deepEqual(
    context.gains.map((n) => n.gain.value),
    [0, 0],
  );
  assert.deepEqual(
    context.oscillators.map((n) => n.frequency.value),
    [205, 79],
  );
  assert.deepEqual(
    context.filters.map((n) => n.frequency.value),
    [1450, 390],
  );
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(context.oscillators[i].connections, [context.filters[i]]);
    assert.deepEqual(context.filters[i].connections, [context.gains[i]]);
    assert.deepEqual(context.gains[i].connections, [context.destination]);
  }
  motors.setRunning(true, false);
  assert.deepEqual(
    context.gains.map((n) => n.gain.value),
    [0.018, 0],
  );
  const count = context.gains[0].gain.calls.length;
  for (let i = 0; i < 100; i++) motors.setRunning(true, false);
  assert.equal(context.gains[0].gain.calls.length, count);
  assert.equal(context.oscillators.length, 2);
  motors.setRunning(false, true);
  assert.deepEqual(
    context.gains.map((n) => n.gain.value),
    [0, 0.024],
  );
  motors.silence();
  assert.deepEqual(
    context.gains.map((n) => n.gain.value),
    [0, 0],
  );
  assert.equal(context.gains[1].gain.calls.at(-1)[2], 12.045);
  motors.dispose();
  context.oscillators.forEach((node) => node.onended());
});

void test('dispose fades/stops once and disconnects even with a suspended audio clock', async () => {
  const context = new Context(),
    motors = createScreenMotors(context);
  motors.setRunning(true, true);
  motors.dispose();
  motors.dispose();
  motors.setRunning(true, true);
  assert.deepEqual(
    context.gains.map((n) => n.gain.value),
    [0, 0],
  );
  for (const oscillator of context.oscillators) {
    assert.equal(oscillator.starts.length, 1);
    assert.deepEqual(oscillator.stops, [[12.03]]);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  for (const node of [
    ...context.oscillators,
    ...context.filters,
    ...context.gains,
  ])
    assert.equal(node.disconnected, 1);
  assert.ok(context.oscillators.every((n) => n.onended === null));
});
