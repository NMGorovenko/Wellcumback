import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshCity,
  tickCity,
  cityCarBlocked,
} from '../lib/game/city/engine.ts';
import { CITY_TOP_SPEED } from '../lib/game/city/powertrain.ts';
import { stepCar } from '../lib/game/city/car-physics.ts';
import {
  CITY_ROUTES,
  cityRoads,
  distanceToRoad,
} from '../lib/game/city/layout.ts';
import { vehicleTuning } from '../lib/game/race/vehicles.ts';
import {
  NETWORK_VERSION,
  readPeerPacket,
} from '../lib/game/network/protocol.ts';

const straight = () => ({
  ...freshCity(),
  ...CITY_ROUTES.studPlaneta.at(-2),
  heading: 0,
});
const fullSpeedRun = () => {
  const road = cityRoads.find((r) => r.id === 'left-quay:1');
  const dx = road.to.x - road.from.x,
    dz = road.to.z - road.from.z,
    length = Math.hypot(dx, dz);
  const car = {
    ...freshCity(),
    x: road.from.x + (dx / length) * 15,
    z: road.from.z + (dz / length) * 15,
    heading: Math.atan2(dx, -dz),
    speed: 260 / 3.6,
    vx: ((dx / length) * 260) / 3.6,
    vz: ((dz / length) * 260) / 3.6,
  };
  Object.assign(car.powertrain, { gear: 6, rpm: (4358 * 260) / 300, load: 1 });
  return car;
};
const cruising = () => {
  const car = {
    ...straight(),
    z: straight().z - 40,
    speed: CITY_TOP_SPEED,
    vz: -CITY_TOP_SPEED,
  };
  Object.assign(car.powertrain, { gear: 6, rpm: 4358, load: 1 });
  return car;
};
const throttle = { throttle: 1, steer: 0, handbrake: false };

void test('city Mustang reaches 300 progressively and the AMG stays competitively close', (t) => {
  const results = [];
  for (const id of ['mustang', 'amg-gt']) {
    const car = straight(),
      tuning = vehicleTuning(id, true),
      marks = new Map();
    for (let frame = 0; frame < 30 * 60; frame++) {
      stepCar(car, throttle, 1 / 60, () => false, tuning);
      assert.ok(car.speed <= tuning.maxSpeed + 1e-8);
      assert.ok(Number.isFinite(car.powertrain.rpm));
      for (const kmh of [100, 200, tuning.maxSpeed * 3.6 - 0.01])
        if (car.speed * 3.6 >= kmh && !marks.has(kmh))
          marks.set(kmh, (frame + 1) / 60);
    }
    const topTime = marks.get(tuning.maxSpeed * 3.6 - 0.01);
    assert.ok(marks.get(100) > 3.5 && marks.get(100) < 4.5);
    assert.ok(marks.get(200) > 9 && marks.get(200) < 12);
    assert.ok(
      topTime > 22 && topTime < 30,
      'the maximum needs sustained acceleration',
    );
    assert.equal(car.speed, tuning.maxSpeed);
    assert.equal(car.powertrain.gear, id === 'mustang' ? 6 : 9);
    results.push({ marks, maximum: car.speed });
    t.diagnostic(
      `${id}: 0–100 ${marks.get(100).toFixed(2)} s; 0–200 ${marks.get(200).toFixed(2)} s; maximum ${(car.speed * 3.6).toFixed(0)} km/h in ${topTime.toFixed(2)} s`,
    );
  }
  assert.equal(results[0].maximum * 3.6, 300);
  assert.ok(results[1].maximum / results[0].maximum > 0.97);
  for (const speed of [100, 200])
    assert.ok(
      results[1].marks.get(speed) / results[0].marks.get(speed) > 0.9,
      'AMG acceleration must remain within 10% of Mustang',
    );
});

void test('keyboard and analog high-speed drives agree through a natural crest and landing at 30, 60 and 144 Hz', () => {
  const states = [30, 60, 144].flatMap((hz) =>
    [false, true].map((analog) => {
      const car = fullSpeedRun();
      let maximum = 0,
        flew = false;
      for (let frame = 0; frame < 8.2 * hz; frame++) {
        tickCity(
          car,
          1 / hz,
          new Set(analog ? [] : ['KeyW']),
          analog ? throttle : undefined,
        );
        maximum = Math.max(maximum, car.speed * 3.6);
        flew ||= car.flight?.airborne;
        const road = cityRoads.find((r) => r.id === 'left-quay:1');
        assert.ok(distanceToRoad(car.x, car.z, road) + 2 < road.width / 2);
        assert.equal(cityCarBlocked(car.x, car.z, car.heading), false);
      }
      assert.equal(car.bumps, 1, 'one landing after the crest');
      assert.equal(flew, true);
      assert.ok(maximum > 290 && maximum <= CITY_TOP_SPEED * 3.6);
      assert.ok(
        car.speed * 3.6 > 180 && car.speed <= CITY_TOP_SPEED,
        'landing loses speed, but preserves forward momentum',
      );
      assert.equal(car.powertrain.gear, 6);
      assert.equal(car.drifting, false);
      return car;
    }),
  );
  for (const car of states.slice(1)) {
    assert.ok(Math.abs(car.z - states[0].z) < 1e-8);
    assert.deepEqual(car.powertrain, states[0].powertrain);
  }
});

void test('a short steering tap at 300 stays inside a 20 m street and settles without a spin', () => {
  const road = cityRoads.find(
    (r) =>
      r.id.startsWith('svobodny-mira-9maya:') &&
      r.from.x === straight().x &&
      r.from.z === straight().z,
  );
  assert.equal(road.width, 20);
  for (const direction of [-1, 1]) {
    const car = cruising();
    for (let frame = 0; frame < 60; frame++) {
      tickCity(car, 1 / 60, new Set(), {
        throttle: 1,
        steer: frame < 6 ? direction : 0,
      });
      assert.equal(cityCarBlocked(car.x, car.z, car.heading), false);
      for (const offset of [-1.2, 0, 1.2]) {
        const x = car.x + Math.sin(car.heading) * offset;
        const z = car.z - Math.cos(car.heading) * offset;
        assert.ok(distanceToRoad(x, z, road) + 0.85 < road.width / 2);
      }
    }
    assert.ok(Math.abs(car.x - road.from.x) < 4);
    assert.ok(Math.abs(car.heading) < 0.07);
    assert.ok(
      Math.abs(
        car.vx * Math.cos(car.heading) + car.vz * Math.sin(car.heading),
      ) < 0.03,
    );
    assert.equal(car.drifting, false);
    assert.equal(car.bumps, 0);
  }
});

void test('braking from 300 is progressive and stops within a clear 160 m approach', (t) => {
  const car = cruising(),
    startZ = car.z;
  let frames = 0;
  while (car.vz < -0.35 && frames < 300) {
    const speed = car.speed;
    tickCity(car, 1 / 60, new Set(['KeyS']));
    assert.ok(car.speed < speed);
    assert.equal(cityCarBlocked(car.x, car.z, car.heading), false);
    frames++;
  }
  const distance = startZ - car.z;
  assert.ok(frames / 60 > 3.5 && frames / 60 < 4.5);
  assert.ok(distance > 135 && distance < 160);
  assert.ok(car.speed < 0.35);
  assert.equal(car.bumps, 0);
  t.diagnostic(
    `300 km/h braking: ${(frames / 60).toFixed(2)} s, ${distance.toFixed(1)} m`,
  );
});

void test('pausing and JSON rejoining preserve the high-speed transmission and continuation', () => {
  const host = fullSpeedRun();
  for (let frame = 0; frame < 4 * 60; frame++)
    tickCity(host, 1 / 60, new Set(['KeyW']));
  const uninterrupted = JSON.parse(JSON.stringify(host));
  host.paused = true;
  const paused = JSON.stringify(host);
  tickCity(host, 3, new Set(['KeyW']));
  assert.equal(JSON.stringify(host), paused);
  const rejoined = JSON.parse(JSON.stringify(host));
  rejoined.paused = false;
  for (let frame = 0; frame < 4.2 * 60; frame++) {
    tickCity(rejoined, 1 / 60, new Set(), throttle);
    tickCity(uninterrupted, 1 / 60, new Set(['KeyW']));
  }
  assert.equal(rejoined.speed, uninterrupted.speed);
  assert.ok(rejoined.speed * 3.6 > 180 && rejoined.speed <= CITY_TOP_SPEED);
  assert.equal(rejoined.z, uninterrupted.z);
  assert.deepEqual(rejoined.powertrain, uninterrupted.powertrain);
});

void test('manual network snapshots accept the 300 km/h drive and keep rejecting over-limit speed', () => {
  const state = cruising();
  const packet = {
    type: 'city',
    version: NETWORK_VERSION,
    seq: 1,
    epoch: 1,
    driver: 'host',
    state,
  };
  const accepted = readPeerPacket(JSON.stringify(packet));
  assert.equal(accepted?.state.speed, CITY_TOP_SPEED);
  assert.deepEqual(accepted.state.powertrain, state.powertrain);
  state.speed = CITY_TOP_SPEED + 1;
  assert.equal(readPeerPacket(JSON.stringify(packet)), null);
});
