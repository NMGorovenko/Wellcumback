import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Same standalone/checkout esbuild pattern as player-menu.test.mjs.
const checkout = resolve(process.env.FRIENDSLOP_CHECKOUT || process.cwd());
const candidate = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(checkout, 'package.json'));
const { build } = require('esbuild');
const source = (file) => {
  const path = [candidate, checkout]
    .map((base) => join(base, file))
    .find(existsSync);
  assert.ok(path, `Missing source: ${file}`);
  return path;
};
const bundle = await build({
  stdin: {
    contents: [
      'lib/game/city/engine.ts',
      'lib/game/city/layout.ts',
      'lib/game/city/surface.ts',
      'lib/game/city/destruction.ts',
      'lib/game/city/kacha.ts',
      'lib/game/network/protocol.ts',
    ]
      .map((file) => `export * from ${JSON.stringify(source(file))};`)
      .join('\n'),
    resolveDir: checkout,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const {
  freshCity,
  stepCityCar,
  tickCity,
  cityRoads,
  inCityWater,
  cityRoadHeight,
  citySurfacePose,
  CITY_DECK_THICKNESS,
  breakableObjects,
  strikeCityObject,
  isCityObjectBroken,
  inKachaWater,
  sampleKacha,
  NETWORK_VERSION,
  readPeerPacket,
} = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

const STEP = 1 / 60;
const neutral = { throttle: 0, steer: 0, handbrake: false };
const clone = (value) => JSON.parse(JSON.stringify(value));
const close = (actual, expected, note) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-8,
    `${note}: ${actual} != ${expected}`,
  );
function step(car, input = neutral) {
  car.elapsed += STEP;
  return stepCityCar(car, input, STEP);
}
function airborne(height = 30) {
  const car = freshCity();
  car.elevation += height;
  car.flight.airborne = true;
  return car;
}
const motion = (car) =>
  Object.fromEntries(
    [
      'x',
      'z',
      'vx',
      'vz',
      'elevation',
      'pitch',
      'heading',
      'speed',
      'surfaceId',
      'flight',
    ].map((key) => [key, car[key]]),
  );
function intersection(a, b) {
  const ax = a.to.x - a.from.x,
    az = a.to.z - a.from.z;
  const bx = b.to.x - b.from.x,
    bz = b.to.z - b.from.z;
  const denominator = ax * bz - az * bx;
  if (Math.abs(denominator) < 1e-9) return null;
  const dx = b.from.x - a.from.x,
    dz = b.from.z - a.from.z;
  const t = (dx * bz - dz * bx) / denominator;
  const u = (dx * az - dz * ax) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
    ? { x: a.from.x + ax * t, z: a.from.z + az * t }
    : null;
}
const lower = cityRoads.find((road) => road.id === 'left-quay:3');
const upper = cityRoads.find(
  (road) => road.bridge === 'nikolaevsky' && intersection(road, lower),
);
assert.ok(upper, 'Nikolaevsky deck crosses the lower quay');
const crossing = intersection(upper, lower);
const upperY = cityRoadHeight(upper, crossing.x, crossing.z);
const lowerY = cityRoadHeight(lower, crossing.x, crossing.z);

void test('airborne height follows the ballistic curve at every 60 Hz step', () => {
  const car = airborne(),
    y0 = car.elevation,
    vy0 = 3;
  car.flight.vy = vy0;
  for (let frame = 1; frame <= 60; frame++) {
    assert.equal(step(car).worldContact, false);
    const t = frame * STEP;
    close(car.elevation, y0 + vy0 * t - 9 * t * t, `ballistic height at ${t}`);
    close(car.flight.vy, vy0 - 18 * t, `vertical velocity at ${t}`);
    assert.equal(car.flight.airborne, true);
  }
});

void test('airborne pedals, steering and handbrake preserve translational inertia in either direction', () => {
  for (const heading of [Math.PI / 2, -Math.PI / 2]) {
    let reference;
    for (const input of [
      neutral,
      { ...neutral, throttle: 1 },
      { ...neutral, throttle: -1 },
      { ...neutral, handbrake: true },
      { ...neutral, steer: 1, handbrake: true, throttle: 1 },
    ]) {
      const car = airborne(60);
      Object.assign(car, {
        heading,
        vx: 20,
        vz: 3,
        speed: Math.hypot(20, 3),
        driftDistance: 7,
      });
      for (let frame = 0; frame < 60; frame++) step(car, input);
      const translation = ['x', 'z', 'elevation', 'vx', 'vz'].map(
        (key) => car[key],
      );
      if (reference)
        assert.deepEqual(
          translation,
          reference,
          'tyre input cannot bend or brake flight',
        );
      else reference = translation;
      assert.ok(
        car.vx > 19,
        'reverse-facing flight must not invoke the 6 m/s ground cap',
      );
      close(car.vz / car.vx, 3 / 20, 'drag preserves the momentum direction');
      assert.equal(car.drifting, false);
      assert.equal(car.driftDistance, 7, 'flight earns no drift distance');
    }
  }
});

void test('a dry landing produces one impact and settles without penetration or repeated contact', () => {
  const car = airborne(),
    ground = citySurfacePose(car.x, car.z, car.heading).elevation;
  let contacts = 0,
    landed = false;
  for (let frame = 0; frame < 240; frame++) {
    if (step(car).worldContact) contacts++;
    assert.ok(
      car.elevation >= ground - 1e-8,
      'the body cannot pass through the ground',
    );
    if (!car.flight.airborne) {
      landed = true;
      close(car.elevation, ground, 'supported height remains stable');
      close(car.flight.vy, 0, 'landing clears vertical speed');
    }
  }
  assert.equal(landed, true);
  assert.equal(contacts, 1);
});

void test('a broken real bridge rail permits a continuous ballistic departure', () => {
  const rail = breakableObjects.find(
    (object) =>
      object.kind === 'rail' &&
      object.roadId === 'bridge-nikolaevsky:0' &&
      object.d > 4,
  );
  const road = cityRoads.find((item) => item.id === rail.roadId);
  const dx = road.to.x - road.from.x,
    dz = road.to.z - road.from.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((rail.x - road.from.x) * dx + (rail.z - road.from.z) * dz) /
        (dx * dx + dz * dz),
    ),
  );
  const px = road.from.x + dx * t,
    pz = road.from.z + dz * t;
  const distance = Math.hypot(rail.x - px, rail.z - pz);
  const nx = (rail.x - px) / distance,
    nz = (rail.z - pz) / distance;
  const car = freshCity(),
    heading = Math.atan2(nx, -nz);
  Object.assign(car, {
    x: rail.x - nx * 6,
    z: rail.z - nz * 6,
    heading,
    vx: nx * 25,
    vz: nz * 25,
    speed: 25,
  });
  Object.assign(
    car,
    citySurfacePose(
      car.x,
      car.z,
      heading,
      cityRoadHeight(road, car.x, car.z),
      `road:${road.id}`,
    ),
  );
  let airFrames = 0;
  for (let frame = 0; frame < 45; frame++) {
    const wasAirborne = car.flight.airborne,
      previousY = car.elevation;
    step(car);
    if (car.flight.airborne) airFrames++;
    if (!wasAirborne && car.flight.airborne) {
      const releaseVelocity = car.flight.vy + 18 * STEP;
      assert.ok(
        releaseVelocity > 0 && releaseVelocity <= 5.5,
        'a broken bridge edge gives one bounded upward hop',
      );
      close(
        car.elevation,
        previousY + releaseVelocity * STEP - 9 * STEP * STEP,
        'takeoff starts at the last contact height',
      );
    }
  }
  assert.equal(isCityObjectBroken(car.damage, rail.id), true);
  assert.ok(airFrames > 10, 'the broken rail permits sustained flight');
  assert.ok(
    (car.x - rail.x) * nx + (car.z - rail.z) * nz > 2,
    'the car crosses the former barrier',
  );
  assert.ok(car.flight.vy < -1);
});

for (const [name, point, waterY] of [
  ['Yenisei', { x: -649.8633508238634, z: 535.414130764297 }, 0],
  ['Kacha', { x: -780, z: -440 }, sampleKacha(-780, -440).waterHeight],
])
  void test(`${name} splash recovers once to the saved dry road and preserves damage`, () => {
    assert.equal(inCityWater(point.x, point.z), true);
    assert.equal(inKachaWater(point.x, point.z), name === 'Kacha');
    const car = freshCity();
    step(car); // Obtain a safe pose through the real supported-driving path.
    const safe = clone(car.flight.safe);
    assert.ok(safe?.surfaceId.startsWith('road:'));
    const rail = breakableObjects.find((object) => object.kind === 'rail');
    assert.equal(
      strikeCityObject(
        car.damage,
        rail.id,
        Math.cos(rail.angle) * 20,
        -Math.sin(rail.angle) * 20,
        car.elapsed,
      ),
      true,
    );
    const marks = car.damage.marks;
    Object.assign(car, {
      ...point,
      elevation: waterY + 10,
      surfaceId: 'ground',
    });
    car.flight.airborne = true;
    let splashed = false,
      recoveries = 0,
      revision = car.travelRevision ?? 0;
    for (let frame = 0; frame < 240; frame++) {
      tickCity(car, STEP, new Set());
      if (frame < 30) {
        assert.equal(
          car.flight.waterTime,
          0,
          'being above water is not a splash',
        );
        assert.equal(car.travelRevision ?? 0, revision);
      }
      if (car.flight.waterTime > 0) {
        splashed = true;
        assert.ok(
          car.elevation < waterY && car.elevation > waterY - 2,
          'splash uses the local water level',
        );
      }
      const nextRevision = car.travelRevision ?? 0;
      if (nextRevision !== revision) {
        assert.equal(
          splashed,
          true,
          'recovery follows an actual water contact',
        );
        recoveries++;
        revision = nextRevision;
      }
    }
    assert.equal(splashed, true);
    assert.equal(recoveries, 1);
    for (const key of ['x', 'z', 'heading', 'elevation'])
      close(car[key], safe[key], `restored ${key}`);
    assert.equal(car.flight.airborne, false);
    assert.equal(car.flight.vy, 0);
    assert.equal(car.flight.waterTime, 0);
    assert.equal(car.damage.marks, marks);
  });

void test('falling above or below Nikolaevsky lands on the physically crossed road layer', () => {
  assert.ok(upperY - lowerY > 8);
  for (const [height, expected, road] of [
    [upperY + 5, upperY, upper],
    [upperY - 5, lowerY, lower],
  ]) {
    const car = airborne();
    Object.assign(car, {
      ...crossing,
      elevation: height,
      surfaceId: `road:${lower.id}`,
    });
    car.flight.vy = -5;
    for (let frame = 0; frame < 180 && car.flight.airborne; frame++) {
      const previousY = car.elevation;
      step(car);
      assert.ok(
        car.elevation <= previousY + 1e-8,
        'a falling car cannot snap upward to another layer',
      );
    }
    assert.equal(car.flight.airborne, false);
    close(car.elevation, expected, 'landing layer');
    assert.equal(car.surfaceId, `road:${road.id}`);
  }
});

void test('upward flight hits the solid underside instead of passing through onto the upper deck', () => {
  const car = airborne();
  Object.assign(car, {
    ...crossing,
    elevation: upperY - 5,
    surfaceId: `road:${lower.id}`,
  });
  car.flight.vy = 16;
  let contacted = false;
  for (let frame = 0; frame < 240 && car.flight.airborne; frame++) {
    const contact = step(car).worldContact;
    contacted ||= contact;
    assert.ok(
      car.elevation <= upperY - CITY_DECK_THICKNESS + 1e-8,
      'the vehicle must remain below the concrete slab',
    );
  }
  assert.equal(
    contacted,
    true,
    'underside collision produces contact feedback',
  );
  assert.equal(car.flight.airborne, false);
  close(car.elevation, lowerY, 'the car falls back onto the lower road');
  assert.equal(car.surfaceId, `road:${lower.id}`);
});

void test('JSON and peer snapshots retain airborne motion and continue without re-grounding', () => {
  const original = airborne(35);
  Object.assign(original, { vx: 10, speed: 10, heading: Math.PI / 2 });
  for (let frame = 0; frame < 20; frame++) step(original);
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
  assert.ok(peer, 'peer parser accepts the airborne snapshot');
  assert.deepEqual(peer.flight, original.flight);
  for (let frame = 0; frame < 30; frame++) {
    step(original);
    step(restored);
    step(peer);
  }
  assert.deepEqual(clone(original), restored);
  assert.deepEqual(motion(original), motion(peer));
  for (const invalid of [{ vy: 101 }, { waterTime: -1 }, { airborne: 'yes' }]) {
    const bad = clone(original);
    Object.assign(bad.flight, invalid);
    assert.equal(
      packet(bad),
      null,
      'malformed flight fields do not enter peer state',
    );
  }
});
