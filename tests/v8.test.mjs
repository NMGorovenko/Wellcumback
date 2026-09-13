import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceV8, freshV8, exhaustWave } from '../lib/game/audio/v8-model.ts';
import { freshCity, tickCity } from '../lib/game/city/engine.ts';
const input = (speed, throttle = 1) => ({
  speed,
  throttle,
  forward: speed,
  lateral: 0,
  horn: false,
});
void test('V8 idles, revs and shifts without affecting vehicle speed', () => {
  const s = freshV8();
  for (let i = 0; i < 60; i++) advanceV8(s, input(0, 0), 1 / 60);
  assert.ok(s.rpm > 720 && s.rpm < 900);
  let shifts = 0,
    gear = s.gear;
  for (let i = 0; i < 360; i++) {
    advanceV8(s, input(Math.min(18, i / 10)), 1 / 60);
    assert.ok(s.rpm <= 4400 && Number.isFinite(s.rpm));
    if (s.gear !== gear) {
      shifts++;
      gear = s.gear;
    }
  }
  assert.equal(s.gear, 4);
  assert.equal(shifts, 3);
  assert.ok(
    s.rpm > 2800 && s.rpm < 3600,
    'top gear cruises without sitting on the limiter',
  );
  advanceV8(s, input(18, 0), 1 / 60);
  assert.equal(s.crackle, true);
  advanceV8(s, input(18, 1), 1 / 60);
  advanceV8(s, input(18, 0), 1 / 60);
  assert.equal(s.crackle, false);
});
for (const rate of [30, 60, 144])
  void test(`actual city acceleration has three audible automatic upshifts at ${rate} Hz`, () => {
    // A real uninterrupted road across the north of the existing city.
    const city = { ...freshCity(), x: -104, z: -63, heading: Math.PI / 2 },
      motor = freshV8();
    const shifts = [];
    for (let i = 0; i < 7 * rate; i++) {
      tickCity(city, 1 / rate, new Set(['KeyW']));
      const previousGear = motor.gear;
      advanceV8(
        motor,
        {
          speed: city.speed,
          forward: city.vx,
          throttle: city.throttle,
          lateral: city.vz,
          horn: false,
        },
        1 / rate,
      );
      if (motor.gear > previousGear)
        shifts.push({
          time: motor.time,
          from: motor.rpm,
          min: motor.rpm,
          minLoad: 1,
        });
      const shift = shifts.at(-1);
      if (shift && motor.time - shift.time < 0.31) {
        shift.min = Math.min(shift.min, motor.rpm);
        shift.minLoad = Math.min(shift.minLoad, motor.load);
      }
    }
    assert.equal(city.bumps, 0);
    assert.equal(shifts.length, 3);
    assert.ok(
      shifts[0].time < 1.05,
      'first shift accompanies the rapid real acceleration',
    );
    for (const shift of shifts) {
      assert.ok(
        shift.min < shift.from * 0.76,
        'each shift audibly lowers pitch by at least 24%',
      );
      assert.ok(shift.minLoad < 0.12, 'exhaust unloads during a shift');
    }
    assert.ok(
      shifts.slice(1).every((s, i) => s.time - shifts[i].time > 0.65),
      'no gear chatter',
    );
    assert.ok(
      motor.rpm > 3000 && motor.rpm < 3500,
      'full-speed top gear stays below the shift point',
    );
    const top = motor.gear;
    for (let i = 0; i < 2 * rate; i++)
      advanceV8(motor, input(18, i % 2 ? 0 : 1), 1 / rate);
    assert.equal(
      motor.gear,
      top,
      'pedal changes at steady speed do not hunt gears',
    );
    for (let i = 0; i < 6 * rate; i++)
      advanceV8(motor, input(Math.max(0, 18 - (i / rate) * 8), 0), 1 / rate);
    assert.equal(motor.gear, 1);
    assert.ok(motor.rpm < 900, 'braking to a stop returns to idle');
  });
void test('reverse, actual lateral slip, and bank waveforms have distinct safe states', () => {
  const s = freshV8();
  for (let i = 0; i < 120; i++)
    advanceV8(s, { ...input(6, -1), forward: -6, lateral: 3 }, 1 / 60);
  assert.equal(s.gear, 1);
  assert.ok(s.load > 0.9 && s.skid > 0);
  const a = exhaustWave(0),
    b = exhaustWave(1);
  assert.equal(a.real[0], 0);
  assert.equal(a.imag[0], 0);
  assert.notDeepEqual(a, b);
  assert.ok(
    [...a.real, ...b.real, ...a.imag, ...b.imag].every(Number.isFinite),
  );
});

void test('V8 graph reuses sources, clears transients and disposes exactly once', async () => {
  const { createCityFoley } = await import('../lib/game/audio/city-foley.ts');
  const params = [],
    nodes = [],
    sources = [];
  const parameter = () => {
    const p = {
      value: 0,
      calls: [],
      cancelScheduledValues(t) {
        this.calls.push(['cancel', t]);
      },
      setTargetAtTime(v, t) {
        this.calls.push(['target', v, t]);
      },
      setValueAtTime(v, t) {
        this.calls.push(['value', v, t]);
      },
      linearRampToValueAtTime(v, t) {
        this.calls.push(['linear', v, t]);
      },
      exponentialRampToValueAtTime(v, t) {
        this.calls.push(['exponential', v, t]);
      },
    };
    params.push(p);
    return p;
  };
  const node = (type) => {
    const n = {
      type,
      connects: 0,
      disconnected: 0,
      connect(target) {
        this.connects++;
        return target;
      },
      disconnect() {
        this.disconnected++;
      },
    };
    nodes.push(n);
    return n;
  };
  const source = (type) => {
    const n = node(type);
    Object.assign(n, {
      started: 0,
      stopped: 0,
      start() {
        this.started++;
      },
      stop() {
        this.stopped++;
      },
    });
    sources.push(n);
    return n;
  };
  const context = {
    currentTime: 0,
    sampleRate: 8000,
    destination: node('destination'),
    createGain: () => Object.assign(node('gain'), { gain: parameter() }),
    createDynamicsCompressor: () =>
      Object.assign(
        node('compressor'),
        Object.fromEntries(
          ['threshold', 'knee', 'ratio', 'attack', 'release'].map((k) => [
            k,
            parameter(),
          ]),
        ),
      ),
    createWaveShaper: () => node('shape'),
    createBiquadFilter: () =>
      Object.assign(node('filter'), { frequency: parameter(), Q: parameter() }),
    createBuffer: (_c, n) => ({ getChannelData: () => new Float32Array(n) }),
    createBufferSource: () => source('buffer'),
    createOscillator: () =>
      Object.assign(source('oscillator'), {
        frequency: parameter(),
        setPeriodicWave() {},
      }),
    createPeriodicWave: () => ({}),
  };
  const graph = createCityFoley(context),
    count = nodes.length;
  const s = freshV8();
  for (let i = 0; i < 1000; i++) {
    advanceV8(s, { ...input(i / 100), horn: true }, 1 / 60);
    graph.update(s, true, i / 60);
  }
  assert.equal(nodes.length, count);
  assert.equal(sources.length, 5);
  graph.silence(20);
  const fades = params.filter(
    (p) =>
      p.calls.at(-1)?.[0] === 'target' &&
      p.calls.at(-1)[1] === 0 &&
      p.calls.at(-1)[2] === 20,
  );
  assert.equal(fades.length, 3, 'master, horn and exhaust pop all fade');
  graph.dispose();
  graph.dispose();
  graph.update(s, true);
  assert.ok(sources.every((s) => s.started === 1 && s.stopped === 1));
  assert.ok(nodes.slice(1).every((n) => n.disconnected === 1));
});
