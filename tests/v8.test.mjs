import { CITY_ROUTES, cityRoads } from '../lib/game/city/layout.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceV8, freshV8, exhaustWave } from '../lib/game/audio/v8-model.ts';
import { freshCity, tickCity, resetCityCar } from '../lib/game/city/engine.ts';
import { stepCar } from '../lib/game/city/car-physics.ts';
import { CITY_TOP_SPEED } from '../lib/game/city/powertrain.ts';
import { citySurfacePose } from '../lib/game/city/surface.ts';
const input = (speed, throttle = 1) => ({
  speed,
  throttle,
  forward: speed,
  lateral: 0,
  horn: false,
});
const roadRun = () => {
  const road = cityRoads.find((r) => r.id === 'left-quay:1');
  const dx = road.to.x - road.from.x,
    dz = road.to.z - road.from.z,
    length = Math.hypot(dx, dz);
  const city = {
    ...freshCity(),
    x: road.from.x + (dx / length) * 15,
    z: road.from.z + (dz / length) * 15,
    heading: Math.atan2(dx, -dz),
  };
  return Object.assign(city, citySurfacePose(city.x, city.z, city.heading));
};
const advanceStraightCar = (city, dt) => {
  city.accumulator += dt;
  while (city.accumulator + 1e-9 >= 1 / 60) {
    stepCar(
      city,
      { throttle: 1, steer: 0, handbrake: false },
      1 / 60,
      () => false,
    );
    city.accumulator = Math.max(0, city.accumulator - 1 / 60);
  }
};
void test('V8 idles, revs and shifts without affecting vehicle speed', () => {
  const s = freshV8();
  for (let i = 0; i < 60; i++) advanceV8(s, input(0, 0), 1 / 60);
  assert.ok(s.rpm > 720 && s.rpm < 900);
  let shifts = 0,
    gear = s.gear;
  for (let i = 0; i < 900; i++) {
    advanceV8(s, input(Math.min(CITY_TOP_SPEED, i / 10)), 1 / 60);
    assert.ok(s.rpm <= 5700 && Number.isFinite(s.rpm));
    if (s.gear !== gear) {
      shifts++;
      gear = s.gear;
    }
  }
  assert.equal(s.gear, 6);
  assert.equal(shifts, 5);
  assert.ok(
    s.rpm > 4100 && s.rpm < 4500,
    'top gear cruises without sitting on the limiter',
  );
  advanceV8(s, input(CITY_TOP_SPEED, 0), 1 / 60);
  assert.equal(s.crackle, true);
  advanceV8(s, input(CITY_TOP_SPEED, 1), 1 / 60);
  advanceV8(s, input(CITY_TOP_SPEED, 0), 1 / 60);
  assert.equal(s.crackle, false);
});
for (const rate of [30, 60, 144])
  void test(`shared car physics has five audible automatic upshifts at ${rate} Hz`, () => {
    // The compact city has no straight long enough for the entire 0–300 run.
    // Use its real drivetrain with the same fixed timestep, on an open flat run.
    const city = freshCity(),
      motor = freshV8();
    const shifts = [];
    for (let i = 0; i < 25 * rate; i++) {
      advanceStraightCar(city, 1 / rate);
      const previousGear = motor.gear;
      advanceV8(
        motor,
        {
          speed: city.speed,
          powertrain: city.powertrain,
          forward:
            city.vx * Math.sin(city.heading) - city.vz * Math.cos(city.heading),
          throttle: city.throttle,
          lateral:
            city.vx * Math.cos(city.heading) + city.vz * Math.sin(city.heading),
          horn: false,
        },
        1 / rate,
      );
      if (motor.gear > previousGear)
        shifts.push({
          time: city.powertrain.shiftStartedAt,
          from: motor.rpm,
          min: motor.rpm,
          minLoad: 1,
        });
      const shift = shifts.at(-1);
      if (shift && motor.time - shift.time < 0.25) {
        shift.min = Math.min(shift.min, motor.rpm);
        shift.minLoad = Math.min(shift.minLoad, motor.load);
      }
    }
    assert.ok(Math.abs(city.speed - CITY_TOP_SPEED) < 1e-8);
    assert.equal(shifts.length, 5);
    assert.ok(
      shifts[0].time > 1.5 && shifts[0].time < 2.3,
      'first shift accompanies the rapid real acceleration',
    );
    for (const shift of shifts) {
      assert.ok(
        shift.min < shift.from * 0.78,
        'each shift audibly lowers pitch by at least 22%',
      );
      assert.ok(shift.minLoad < 0.12, 'exhaust unloads during a shift');
    }
    assert.ok(
      shifts.slice(1).every((s, i) => s.time - shifts[i].time > 0.3),
      'no gear chatter',
    );
    assert.ok(
      motor.rpm > 4100 && motor.rpm < 4500,
      'full-speed top gear stays below the shift point',
    );
    const intervals = shifts.map(
      (shift, i) => shift.time - (shifts[i - 1]?.time ?? 0),
    );
    assert.ok(
      intervals[1] > 1 && intervals[1] < 2,
      'second gear has an audible acceleration range',
    );
    assert.ok(intervals[3] >= 3, 'fourth gear lasts longer');
    assert.ok(
      intervals[4] >= 5 && intervals[4] >= intervals[3] * 1.5,
      'fifth gear builds speed for substantially longer',
    );
    const top = motor.gear;
    for (let i = 0; i < 2 * rate; i++)
      advanceV8(motor, input(CITY_TOP_SPEED, i % 2 ? 0 : 1), 1 / rate);
    assert.equal(
      motor.gear,
      top,
      'pedal changes at steady speed do not hunt gears',
    );
    for (let i = 0; i < 10 * rate; i++)
      advanceV8(
        motor,
        input(Math.max(0, CITY_TOP_SPEED - (i / rate) * 12), 0),
        1 / rate,
      );
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
      scheduled: [],
      cancelScheduledValues(t) {
        this.scheduled = this.scheduled.filter((event) => event[2] < t);
        this.calls.push(['cancel', t]);
      },
      setTargetAtTime(v, t) {
        this.scheduled.push(['target', v, t]);
        this.calls.push(['target', v, t]);
      },
      setValueAtTime(v, t) {
        this.scheduled.push(['value', v, t]);
        this.calls.push(['value', v, t]);
      },
      linearRampToValueAtTime(v, t) {
        this.scheduled.push(['linear', v, t]);
        this.calls.push(['linear', v, t]);
      },
      exponentialRampToValueAtTime(v, t) {
        this.scheduled.push(['exponential', v, t]);
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
    createBufferSource: () =>
      Object.assign(source('buffer'), { playbackRate: parameter() }),
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
    context.currentTime = i / 60;
    graph.update(s, true, context.currentTime);
    if (i % 60 === 0) graph.impact('rail', 0.5);
    assert.ok(
      params.every((p) => p.scheduled.length <= 4),
      'live graph has no growing native automation queues',
    );
  }
  assert.equal(nodes.length, count);
  assert.equal(sources.length, 7);
  graph.silence(20);
  const fades = params.filter(
    (p) =>
      p.calls.at(-1)?.[0] === 'target' &&
      p.calls.at(-1)[1] === 0 &&
      p.calls.at(-1)[2] === 20,
  );
  assert.equal(fades.length, 4, 'master, horn, exhaust and impact all fade');
  graph.dispose();
  graph.dispose();
  graph.update(s, true);
  assert.ok(sources.every((s) => s.started === 1 && s.stopped === 1));
  assert.ok(nodes.slice(1).every((n) => n.disconnected === 1));
});

void test('authoritative gearbox freezes on pause and survives JSON reconnect without an audio-only restart', () => {
  const city = roadRun();
  for (let i = 0; i < 150; i++) tickCity(city, 1 / 60, new Set(['KeyW']));
  city.paused = true;
  const before = structuredClone(city);
  tickCity(city, 5, new Set(['KeyW']));
  assert.deepEqual(city, before);
  const resumed = JSON.parse(JSON.stringify(city));
  const listener = freshV8();
  advanceV8(
    listener,
    { ...input(city.speed), powertrain: resumed.powertrain },
    1 / 60,
  );
  assert.equal(listener.gear, city.powertrain.gear);
  assert.equal(listener.rpm, city.powertrain.rpm);
  assert.equal(listener.load, city.powertrain.load);
  resumed.paused = false;
  tickCity(resumed, 1 / 60, new Set(['KeyW']));
  assert.ok(resumed.powertrain.time > city.powertrain.time);
  const old = freshCity();
  delete old.powertrain;
  tickCity(old, 1 / 60, new Set(['KeyW']));
  assert.ok(
    old.powertrain.rpm >= 780 && old.speed > 0,
    'older save acquires a gearbox lazily',
  );
});
void test('each automatic shift unloads real wheel acceleration as well as exhaust volume', () => {
  const city = freshCity();
  let priorAcceleration = 0,
    cuts = 0;
  for (let i = 0; i < 1200; i++) {
    const speed = city.speed,
      gear = city.powertrain.gear;
    advanceStraightCar(city, 1 / 60);
    const acceleration = (city.speed - speed) * 60;
    if (city.powertrain.gear > gear) {
      assert.ok(
        acceleration < priorAcceleration * 0.5,
        'torque actually dips at the audible shift',
      );
      cuts++;
    }
    priorAcceleration = acceleration;
  }
  assert.equal(cuts, 5);
});
void test('sideways sliding cannot over-rev the motor like faster driven wheels', () => {
  const straight = freshV8(),
    sideways = freshV8();
  for (let i = 0; i < 100; i++) {
    advanceV8(straight, input(8), 1 / 60);
    advanceV8(sideways, { ...input(24), forward: 8, lateral: 22 }, 1 / 60);
  }
  assert.equal(straight.rpm, sideways.rpm);
  assert.equal(straight.gear, sideways.gear);
  assert.ok(sideways.skid > straight.skid);
});

void test('restarting the car clears the old exhaust cooldown and a restored timeline cannot fake a pedal release', () => {
  const city = {
    ...freshCity(),
    ...CITY_ROUTES.studPlaneta.at(-2),
    heading: 0,
  };
  const motor = freshV8();
  city.powertrain.time = 100;
  const hear = (throttle) =>
    advanceV8(
      motor,
      { ...input(city.speed, throttle), powertrain: city.powertrain },
      1 / 60,
    );
  for (let i = 0; i < 240; i++) {
    tickCity(city, 1 / 60, new Set(['KeyW']));
    hear(1);
  }
  hear(0);
  assert.equal(motor.crackle, true);
  assert.ok(motor.crackleReadyAt > 100, 'old run owns a far-future cooldown');
  resetCityCar(city);
  hear(0);
  assert.equal(motor.crackle, false, 'the reset itself is silent');
  assert.equal(
    motor.crackleReadyAt,
    0,
    'old deadline cannot suppress the new run',
  );
  Object.assign(city, { ...CITY_ROUTES.studPlaneta.at(-2), heading: 0 });
  for (let i = 0; i < 240; i++) {
    tickCity(city, 1 / 60, new Set(['KeyW']));
    hear(1);
  }
  hear(0);
  assert.equal(
    motor.crackle,
    true,
    'first real throttle lift after reset still pops',
  );
  assert.ok(motor.crackleReadyAt < 6);
  hear(1);
  motor.crackleReadyAt = 0;
  city.powertrain.time = 0.5;
  assert.ok(city.powertrain.rpm > 2800);
  hear(0);
  assert.equal(
    motor.crackle,
    false,
    'restoring an earlier moving snapshot is not a new pedal-release event',
  );
});
