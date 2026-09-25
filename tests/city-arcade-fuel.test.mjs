import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const checkout = process.env.FRIENDSLOP_CHECKOUT || process.cwd();
const require = createRequire(checkout + '/package.json');
const THREE = require('three');
const source = (file) => import(pathToFileURL(checkout + '/' + file));
const { freshCity, stepCityCar, teleportCityCar } = await source(
  'lib/game/city/engine.ts',
);
const { CITY_FUEL_STOPS } = await source('lib/game/city/right-bank.ts');
const { cityBuildings, cityRoads } = await source('lib/game/city/layout.ts');
const { citySurfacePose, cityGroundHeight, cityRoadHeight } = await source(
  'lib/game/city/surface.ts',
);
const { sampleKachaAlong } = await source('lib/game/city/kacha.ts');
const { cityCruiseCamera, clearCityCruiseCamera, cityCameraFocus } =
  await source('components/game/city/camera.ts');
const { createRightBankLandmark } = await source(
  'components/game/city/right-bank-landmarks.ts',
);
const { RenderKit } = await source('components/game/world/render-kit.ts');
const { NETWORK_VERSION, readPeerPacket } = await source(
  'lib/game/network/protocol.ts',
);
const { vehicleTuning } = await source('lib/game/race/vehicles.ts');
const STEP = 1 / 60,
  neutral = { throttle: 0, steer: 0, handbrake: false };
const step = (car) => {
  car.elapsed += STEP;
  return stepCityCar(car, neutral, STEP);
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const close = (a, b, note) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${note}: ${a} != ${b}`);
const vec = (p) => new THREE.Vector3(p.x, p.y, p.z);
const packet = (state) =>
  readPeerPacket(
    JSON.stringify({
      type: 'city',
      version: NETWORK_VERSION,
      seq: 1,
      epoch: 1,
      driver: 'host',
      state,
    }),
  );

for (const stop of CITY_FUEL_STOPS)
  void test(`${stop.id}: fast travel leaves the actual coupe visible under the actual canopy in landscape and portrait`, () => {
    const scene = new THREE.Scene(),
      kit = new RenderKit(scene),
      root = new THREE.Group();
    scene.add(root);
    const building = cityBuildings.find(
      (b) => b.kind === 'fuel' && b.x === stop.x && b.z === stop.z,
    );
    assert.ok(building);
    assert.equal(createRightBankLandmark(kit, root, building), true);
    root.children[0].position.y = cityGroundHeight(building.x, building.z);
    scene.updateMatrixWorld(true);
    try {
      for (const aspect of [16 / 9, 4 / 3, 9 / 16]) {
        const car = freshCity();
        assert.equal(teleportCityCar(car, stop.id), true);
        const view = cityCruiseCamera(car, aspect),
          eye = clearCityCruiseCamera(view.position, car),
          focus = cityCameraFocus(view.look, view.position, eye, car);
        const rear =
          -(eye.x - car.x) * Math.sin(car.heading) +
          (eye.z - car.z) * Math.cos(car.heading);
        assert.ok(
          rear > 4.5,
          'arrival retains a rear camera, not the overhead fallback',
        );
        const camera = new THREE.PerspectiveCamera(
          view.fov,
          aspect,
          0.12,
          1200,
        );
        camera.position.copy(vec(eye));
        camera.lookAt(vec(focus));
        camera.updateMatrixWorld(true);
        for (const x of [-1.1, 1.1])
          for (const y of [0.2, 1.65])
            for (const z of [-2.2, 2.2]) {
              const point = new THREE.Vector3(x, y, z)
                .applyAxisAngle(new THREE.Vector3(0, 1, 0), -car.heading)
                .add(new THREE.Vector3(car.x, car.elevation, car.z));
              const ndc = point.clone().project(camera);
              assert.ok(
                Math.abs(ndc.x) < 0.99 && Math.abs(ndc.y) < 0.99,
                'complete body remains in frame',
              );
              const direction = point.clone().sub(vec(eye)),
                distance = direction.length();
              const ray = new THREE.Raycaster(
                vec(eye),
                direction.normalize(),
                0,
                distance - 0.05,
              );
              assert.equal(
                ray.intersectObject(root, true).length,
                0,
                'the rendered canopy, cabin and pump geometry must not hide the car',
              );
            }
      }
    } finally {
      kit.dispose();
    }
  });

void test('a rising rear boom stays below a fuel roof while an airborne car above it is not pulled underneath', () => {
  const b = { kind: 'fuel', x: 0, z: 0, w: 42, d: 30, h: 6 },
    surface = {
      heightAt: () => 0,
      ceilingAt: () => null,
      buildingBaseAt: () => 0,
    };
  const under = { x: 0, z: 0, elevation: 0 },
    desired = { x: 0, z: 8, y: 12 };
  const low = clearCityCruiseCamera(desired, under, [b], surface);
  assert.ok(
    low.y < 4.575,
    'the eye cannot enter or rise above the roof while following a car underneath',
  );
  assert.ok(low.z > 4.5, 'the available center lane retains a rear boom');
  const high = clearCityCruiseCamera(
    { x: 0, z: 8, y: 12 },
    { x: 0, z: 0, elevation: 8, flight: { airborne: true } },
    [b],
    surface,
  );
  assert.ok(
    high.y >= 12,
    'above-roof flight must not activate the underside cap',
  );
});

function kachaCar(speed = 25) {
  const p = sampleKachaAlong(3273),
    nx = -p.nx,
    nz = -p.nz,
    x = p.x - nx * 9,
    z = p.z - nz * 9,
    heading = Math.atan2(nx, -nz);
  return {
    p,
    nx,
    nz,
    car: Object.assign(
      freshCity(),
      { x, z, heading, vx: nx * speed, vz: nz * speed, speed },
      citySurfacePose(x, z, heading),
    ),
  };
}

void test('a modest running takeoff crosses the actual Kacha and lands dry on the opposite bank', () => {
  const { car, p, nx, nz } = kachaCar();
  let takeoffs = 0,
    landings = 0,
    airFrames = 0,
    landingAcross = 0,
    release;
  for (let frame = 0; frame < 120; frame++) {
    const wasAirborne = car.flight.airborne,
      vy = car.flight.vy,
      y = car.elevation;
    step(car);
    assert.equal(
      car.flight.waterTime,
      0,
      'the full jump and rollout remain dry',
    );
    if (!wasAirborne && car.flight.airborne) {
      takeoffs++;
      release = car.flight.vy + 18 * STEP;
      assert.ok(release > 3 && release <= 5.5, 'one bounded upward hop');
      assert.ok(car.elevation > y, 'first flight frame rises');
    } else if (wasAirborne && car.flight.airborne) {
      close(car.flight.vy, vy - 18 * STEP, 'no repeated boost in flight');
      close(
        car.elevation,
        y + vy * STEP - 9 * STEP * STEP,
        'ballistic height after release',
      );
    }
    if (car.flight.airborne) airFrames++;
    if (wasAirborne && !car.flight.airborne) {
      landings++;
      landingAcross = (car.x - p.x) * nx + (car.z - p.z) * nz;
    }
  }
  assert.equal(takeoffs, 1);
  assert.equal(landings, 1);
  assert.ok(airFrames > 20);
  assert.ok(landingAcross > 6, 'touchdown passes the far water edge');
  assert.ok(
    (car.x - p.x) * nx + (car.z - p.z) * nz > 12,
    'drive away onto the opposite bank',
  );
});

void test('resting near the river receives no upward hop', () => {
  const { car } = kachaCar(0),
    x = car.x,
    z = car.z,
    y = car.elevation;
  for (let frame = 0; frame < 120; frame++) {
    step(car);
    assert.ok(car.flight.vy <= 0);
    assert.equal(car.flight.airborne, false);
  }
  close(car.x, x, 'stationary x');
  close(car.z, z, 'stationary z');
  close(car.elevation, y, 'stationary height');
});

void test('landing cooldown suppresses a second crest kick until supported contact settles', () => {
  const road = cityRoads.find((r) => r.id === 'akadem-udachny:5'),
    dx = road.to.x - road.from.x,
    dz = road.to.z - road.from.z,
    len = Math.hypot(dx, dz),
    heading = Math.atan2(dx, -dz),
    x = road.from.x + dx * 0.95,
    z = road.from.z + dz * 0.95;
  const car = Object.assign(freshCity(), {
    x,
    z,
    heading,
    speed: 60,
    vx: (dx / len) * 60,
    vz: (dz / len) * 60,
    ...citySurfacePose(
      x,
      z,
      heading,
      cityRoadHeight(road, x, z),
      `road:${road.id}`,
    ),
  });
  car.flight.launchCooldown = 0.25;
  let released = false;
  for (let frame = 0; frame < 14 && !released; frame++) {
    const vy = car.flight.vy;
    stepCityCar(car, neutral, STEP, vehicleTuning('mustang', true));
    if (car.flight.airborne) {
      released = true;
      assert.ok(car.flight.launchCooldown > 0);
      close(
        car.flight.vy,
        vy - 18 * STEP,
        'cooldown preserves earned velocity',
      );
      assert.ok(car.flight.vy < 0);
    }
  }
  assert.equal(
    released,
    true,
    'the physical crest still releases during cooldown',
  );
});

void test('hop cooldown survives peer reconnect; old snapshots and malformed cooldowns are handled', () => {
  const { car } = kachaCar();
  for (let f = 0; f < 8; f++) step(car);
  assert.equal(car.flight.airborne, true);
  assert.equal(car.flight.launchCooldown, 0.25);
  const restored = packet(car)?.state;
  assert.ok(restored);
  assert.deepEqual(restored.flight, car.flight);
  for (let f = 0; f < 80; f++) {
    step(car);
    step(restored);
  }
  for (const key of ['x', 'z', 'vx', 'vz', 'speed', 'elevation', 'flight'])
    assert.deepEqual(restored[key], car[key]);
  const legacy = freshCity();
  delete legacy.flight.launchCooldown;
  assert.ok(packet(legacy));
  for (const cooldown of [-0.01, 0.26, '0', null]) {
    const bad = clone(car);
    bad.flight.launchCooldown = cooldown;
    assert.equal(packet(bad), null);
  }
});
