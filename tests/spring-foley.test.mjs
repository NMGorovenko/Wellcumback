import assert from 'node:assert/strict';
import test from 'node:test';
import { playSpringFoley } from '../lib/game/audio/spring-foley.ts';

function context(state = 'running') {
  const nodes = [];
  const node = () => {
    const value = {
      connect() {},
      disconnect() {
        this.disconnected = true;
      },
    };
    nodes.push(value);
    return value;
  };
  const parameter = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  return {
    state,
    nodes,
    currentTime: 7,
    destination: {},
    createStereoPanner: () => Object.assign(node(), { pan: parameter() }),
    createGain: () => Object.assign(node(), { gain: parameter() }),
    createOscillator: () =>
      Object.assign(node(), {
        frequency: parameter(),
        start(at) {
          this.started = at;
        },
        stop(at) {
          this.stopped = at;
        },
      }),
  };
}

void test('spring foley stays silent without a running audio context', () => {
  for (const state of ['suspended', 'closed']) {
    const audio = context(state);
    playSpringFoley(audio, 'release');
    assert.equal(audio.nodes.length, 0);
  }
});

void test('spring release and impact terminate and free every audio node', () => {
  for (const kind of ['release', 'impact']) {
    const audio = context();
    playSpringFoley(audio, kind, Infinity);
    assert.equal(audio.nodes[0].pan.value, 0);
    const voices = audio.nodes.filter((n) => n.start);
    assert.ok(voices.length > 0);
    for (const voice of voices) {
      assert.equal(voice.started, 7);
      assert.ok(voice.stopped > 7 && voice.stopped < 7.5);
      voice.onended();
    }
    assert.ok(audio.nodes.every((n) => n.disconnected));
  }
});
