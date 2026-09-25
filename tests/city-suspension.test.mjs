import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshFlight,
  roadVerticalMotion,
  advanceCitySuspension,
  compressCitySuspension,
  validCityFlight,
} from '../lib/game/city/flight.ts';
import { freshCity, stepCityCar, tickCity } from '../lib/game/city/engine.ts';
import { cityRoads } from '../lib/game/city/layout.ts';
import { citySurfacePose, cityRoadHeight } from '../lib/game/city/surface.ts';
import { vehicleTuning } from '../lib/game/race/vehicles.ts';
import {
  NETWORK_VERSION,
  readPeerPacket,
} from '../lib/game/network/protocol.ts';
import {
  vehiclePose,
  rememberVehicleStep,
  setVehicleRemainder,
  presentedVehicle,
} from '../lib/game/city/vehicle-presentation.ts';

const STEP = 1 / 60;
const neutral = { throttle: 0, steer: 0, handbrake: false };
const close = (actual, expected, label) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-8,
    `${label}: ${actual} != ${expected}`,
  );
const clone = (value) => JSON.parse(JSON.stringify(value));
function step(car) {
  car.elapsed += STEP;
  return stepCityCar(car, neutral, STEP);
}
const motion = (car) => ({
  x: car.x,
  z: car.z,
  elevation: car.elevation,
  vx: car.vx,
  vz: car.vz,
  pitch: car.pitch,
  flight: car.flight,
});

// This real graded street has a shallow crown followed by a downhill section.
// Keep the fixture tied to road coordinates, not a fabricated height field.
function atCrest(speed) {
  const road = cityRoads.find(
    (r) => r.id === 'district-vzletka:north-south-0:0',
  );
  const dx = road.to.x - road.from.x,
    dz = road.to.z - road.from.z;
  const length = Math.hypot(dx, dz),
    heading = Math.atan2(dx, -dz);
  const x = (road.from.x + road.to.x) / 2,
    z = (road.from.z + road.to.z) / 2;
  return Object.assign(freshCity(), {
    x,
    z,
    heading,
    speed,
    vx: (dx / length) * speed,
    vz: (dz / length) * speed,
    ...citySurfacePose(
      x,
      z,
      heading,
      cityRoadHeight(road, x, z),
      `road:${road.id}`,
    ),
  });
}

void test('road response follows travel direction and curvature, with no invented bumps on a constant grade', () => {
  const plane = (x, z) => 4 + x * 0.15 - z * 0.07;
  for (const [vx, vz] of [
    [12, 0],
    [-12, 0],
    [0, 12],
    [8, -5],
  ]) {
    const sample = roadVerticalMotion(plane, 3, -2, vx, vz);
    close(sample.velocity, vx * 0.15 - vz * 0.07, 'vertical travel tangent');
    close(sample.acceleration, 0, 'constant grade has no curvature impulse');
  }
  const crown = (x) => 10 - 0.03 * x * x;
  const slow = roadVerticalMotion(crown, 0, 0, 4, 0);
  const fast = roadVerticalMotion(crown, 0, 0, 25, 0);
  assert.ok(slow.acceleration > -18 && fast.acceleration < -18);
  close(
    fast.acceleration / slow.acceleration,
    (25 / 4) ** 2,
    'crest load grows with speed squared',
  );
});

void test('a smooth physical bump compresses and releases the spring; faster crossing increases its response', () => {
  const height = (x) =>
    Math.abs(x) < 4 ? (0.18 * (1 + Math.cos((Math.PI * x) / 4))) / 2 : 0;
  const response = (speed) => {
    const flight = freshFlight();
    let minimum = 0,
      maximum = 0;
    for (let x = -8; x < 8; x += speed * STEP) {
      const road = roadVerticalMotion(height, x, 0, speed, 0);
      advanceCitySuspension(flight, road.acceleration, STEP);
      minimum = Math.min(minimum, flight.suspension.offset);
      maximum = Math.max(maximum, flight.suspension.offset);
      assert.ok(validCityFlight(flight));
    }
    for (let frame = 0; frame < 120; frame++)
      advanceCitySuspension(flight, 0, STEP);
    assert.ok(
      Math.abs(flight.suspension.offset) < 1e-8,
      'spring settles after the bump',
    );
    assert.ok(Math.abs(flight.suspension.velocity) < 1e-7);
    return { minimum, maximum };
  };
  const slow = response(4),
    fast = response(12);
  assert.ok(
    slow.minimum < 0 && slow.maximum > 0,
    'compression and rebound follow the bump',
  );
  assert.ok(Math.abs(fast.minimum) > Math.abs(slow.minimum) * 1.8);
  assert.ok(fast.maximum > slow.maximum * 1.8);
  const idle = freshFlight();
  for (let frame = 0; frame < 600; frame++)
    advanceCitySuspension(idle, 0, STEP);
  assert.deepEqual(
    idle.suspension,
    { offset: 0, velocity: 0 },
    'no time-based vibration at rest',
  );
});

void test('a short city crown extends the suspension instead of prematurely losing wheel contact', () => {
  const slow = atCrest(4),
    fast = atCrest(25);
  let slowExtension = 0,
    fastExtension = 0;
  for (let frame = 0; frame < 10; frame++) {
    step(slow);
    step(fast);
    assert.equal(slow.flight.airborne, false);
    assert.equal(fast.flight.airborne, false);
    slowExtension = Math.max(slowExtension, slow.flight.suspension.offset);
    fastExtension = Math.max(fastExtension, fast.flight.suspension.offset);
  }
  assert.ok(slowExtension > 0);
  assert.ok(fastExtension > slowExtension * 4);
  assert.ok(
    fastExtension < 0.12,
    'the small crown fits available wheel travel',
  );
});

void test('a sustained descending crown exhausts suspension travel and releases with the earned downhill velocity', () => {
  const road = cityRoads.find((r) => r.id === 'akadem-udachny:5');
  const dx = road.to.x - road.from.x,
    dz = road.to.z - road.from.z,
    length = Math.hypot(dx, dz),
    heading = Math.atan2(dx, -dz);
  const x = road.from.x + dx * 0.95,
    z = road.from.z + dz * 0.95;
  const car = Object.assign(freshCity(), {
    x,
    z,
    heading,
    speed: 60,
    vx: (dx / length) * 60,
    vz: (dz / length) * 60,
    ...citySurfacePose(
      x,
      z,
      heading,
      cityRoadHeight(road, x, z),
      `road:${road.id}`,
    ),
  });
  let takeoff = null;
  for (let frame = 0; frame < 15 && !takeoff; frame++) {
    const y = car.elevation,
      vy = car.flight.vy;
    stepCityCar(car, neutral, STEP, vehicleTuning('mustang', true));
    if (car.flight.airborne) takeoff = { y, vy, frame };
  }
  assert.ok(
    takeoff && takeoff.frame > 0,
    'wheel travel absorbs the first crest samples',
  );
  assert.ok(takeoff.vy < 0, 'takeoff is possible while already descending');
  close(car.flight.vy, takeoff.vy - 18 * STEP, 'no extra launch impulse');
  close(
    car.elevation,
    takeoff.y + takeoff.vy * STEP - 9 * STEP * STEP,
    'ballistic release is continuous',
  );
  assert.ok(car.elevation > citySurfacePose(car.x, car.z, heading).elevation);
});

void test('a stencil crossing another vertical layer never fabricates road curvature or a takeoff tangent', () => {
  const deckBesideChannel = (x) => (x < -0.8 ? -4 : 3);
  for (const direction of [-1, 1])
    assert.deepEqual(
      roadVerticalMotion(deckBesideChannel, 0, 0, direction * 8, 0),
      { velocity: 0, acceleration: 0 },
    );
  // This is the actual AMG circuit contact immediately before its Kacha turn.
  // The rear sample crosses the bank; the centre is still on level pavement.
  const car = Object.assign(freshCity(), {
    x: 457.47367227814385,
    z: -124.64032526021,
    heading: -1.3513138291138393,
    speed: 8.28707628567476,
    vx: -7.6858392945930545,
    vz: -3.098952678290249,
    elevation: 2.7951722760197115,
    surfaceId: 'ground',
  });
  car.flight.vy = 0.017026644539992475;
  for (let frame = 0; frame < 4; frame++) {
    stepCityCar(car, neutral, 1 / 120, vehicleTuning('amg-gt'));
    assert.equal(car.flight.airborne, false);
    assert.ok(
      Math.abs(car.flight.vy) < 0.1,
      'bank sample cannot create a 13 m/s upward impulse',
    );
    close(
      car.elevation,
      citySurfacePose(car.x, car.z, car.heading, car.elevation, car.surfaceId)
        .elevation,
      'retains the actual contact plane',
    );
  }
});

void test('short grading seams at highway speed use suspension travel without extra flights or momentum loss', () => {
  const road = cityRoads.find((r) => r.id === 'left-quay:1');
  const dx = road.to.x - road.from.x,
    dz = road.to.z - road.from.z,
    length = Math.hypot(dx, dz),
    heading = Math.atan2(dx, -dz);
  const x = -1771,
    z = road.from.z + ((x - road.from.x) * dz) / dx;
  const car = Object.assign(freshCity(), {
    x,
    z,
    heading,
    speed: 77,
    vx: (dx / length) * 77,
    vz: (dz / length) * 77,
    ...citySurfacePose(
      x,
      z,
      heading,
      cityRoadHeight(road, x, z),
      `road:${road.id}`,
    ),
  });
  let travel = 0;
  for (let frame = 0; frame < 30; frame++) {
    stepCityCar(car, neutral, STEP, vehicleTuning('mustang', true));
    assert.equal(car.flight.airborne, false, 'small seams retain tyre contact');
    travel = Math.max(travel, Math.abs(car.flight.suspension.offset));
  }
  assert.ok(travel > 0.01, 'the body responds to the real seam');
  assert.ok(car.speed > 70, 'no landing impulse drains forward momentum');
});

void test('a landing compresses the same suspension once and its rebound settles', () => {
  const car = freshCity();
  car.elevation += 3;
  car.flight.airborne = true;
  for (let frame = 0; frame < 120 && car.flight.airborne; frame++) step(car);
  assert.equal(car.flight.airborne, false);
  assert.ok(
    car.flight.suspension.velocity < -1,
    'landing loads the suspension',
  );
  let minimum = 0,
    contacts = 0;
  for (let frame = 0; frame < 120; frame++) {
    if (step(car).worldContact) contacts++;
    minimum = Math.min(minimum, car.flight.suspension.offset);
  }
  assert.ok(minimum < -0.04, 'landing visibly compresses the chassis');
  assert.equal(contacts, 0, 'settling is not a chain of collision events');
  assert.ok(Math.abs(car.flight.suspension.offset) < 1e-8);
  const bounded = freshFlight();
  compressCitySuspension(bounded, 100);
  for (let frame = 0; frame < 60; frame++) {
    advanceCitySuspension(bounded, frame < 10 ? 1000 : 0, STEP);
    assert.ok(
      validCityFlight(bounded),
      'travel and damper speed remain bounded',
    );
  }
});

void test('suspension and crest motion remain identical across 30, 60 and 144 Hz frames', () => {
  for (const speed of [4, 25]) {
    let expected;
    for (const hz of [30, 60, 144]) {
      const car = atCrest(speed);
      for (let frame = 0; frame < hz; frame++) tickCity(car, 1 / hz, new Set());
      if (expected) assert.deepEqual(motion(car), expected);
      else expected = clone(motion(car));
    }
  }
});

void test('a loaded suspension survives JSON and peer reconnect, while old snapshots still initialize at rest', () => {
  const original = atCrest(4);
  for (let frame = 0; frame < 6; frame++) step(original);
  assert.ok(Math.abs(original.flight.suspension.offset) > 0.001);
  const restored = clone(original);
  const packet = (car) =>
    readPeerPacket(
      JSON.stringify({
        type: 'city',
        version: NETWORK_VERSION,
        seq: 1,
        epoch: 1,
        driver: 'host',
        state: car,
      }),
    );
  const peer = packet(original)?.state;
  assert.ok(peer);
  assert.deepEqual(peer.flight, original.flight);
  for (let frame = 0; frame < 60; frame++) {
    step(original);
    step(restored);
    step(peer);
  }
  assert.deepEqual(motion(original), motion(restored));
  assert.deepEqual(motion(original), motion(peer));
  const legacy = freshCity();
  delete legacy.flight.suspension;
  const old = packet(legacy)?.state;
  assert.ok(old);
  step(old);
  assert.deepEqual(old.flight.suspension, { offset: 0, velocity: 0 });
  for (const suspension of [
    { offset: 0.2, velocity: 0 },
    { offset: 0, velocity: 4 },
    { offset: '0', velocity: 0 },
  ]) {
    const invalid = clone(original);
    invalid.flight.suspension = suspension;
    assert.equal(packet(invalid), null);
  }
});

void test('chassis travel interpolates on the vehicle clock without changing authoritative flight state', () => {
  const car = freshCity();
  car.flight.suspension = { offset: -0.12, velocity: 0.5 };
  const previous = vehiclePose(car);
  car.elapsed += STEP;
  car.flight.suspension.offset = 0.08;
  rememberVehicleStep(car, previous, vehiclePose(car), STEP);
  setVehicleRemainder(car, STEP / 2);
  const json = JSON.stringify(car);
  const shown = presentedVehicle(car).car;
  close(shown.flight.suspension.offset, -0.02, 'half-step chassis pose');
  assert.equal(
    shown.flight.suspension.velocity,
    car.flight.suspension.velocity,
  );
  assert.equal(
    'suspensionOffset' in shown,
    false,
    'render metadata never enters CityState',
  );
  assert.equal(JSON.stringify(car), json);
  car.flight.suspension.offset = 0;
  assert.equal(
    presentedVehicle(car).car.flight.suspension.offset,
    0,
    'authoritative corrections do not replay old body travel',
  );
});

void test('a 144 Hz chassis view uses adjacent real suspension steps rather than holding each 60 Hz pose', () => {
  const reference = atCrest(4),
    samples = [0];
  for (let frame = 0; frame < 60; frame++) {
    tickCity(reference, STEP, new Set());
    samples.push(reference.flight.suspension.offset);
  }
  const car = atCrest(4);
  for (let frame = 1; frame <= 144; frame++) {
    tickCity(car, 1 / 144, new Set());
    const json = JSON.stringify(car),
      time = frame / 144;
    const ticks = Math.floor(time / STEP + 1e-8);
    const alpha = Math.max(0, (time - ticks * STEP) / STEP);
    const shown = presentedVehicle(car).car;
    if (ticks > 0)
      close(
        shown.flight.suspension.offset,
        samples[ticks - 1] + (samples[ticks] - samples[ticks - 1]) * alpha,
        'chassis shares position and camera interpolation',
      );
    assert.equal(JSON.stringify(car), json);
  }
});
