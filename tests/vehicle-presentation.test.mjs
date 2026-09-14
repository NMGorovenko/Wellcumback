import * as THREE from 'three';
import {
  cityDriveCamera,
  cityOverviewCamera,
} from '../components/game/city/camera.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshCity, tickCity, resetCityCar } from '../lib/game/city/engine.ts';
import { freshRace, tickRace, RACE_STEP } from '../lib/game/race/engine.ts';
import { raceCourse } from '../lib/game/race/course.ts';
import { neutralRaceInput } from '../lib/game/race/types.ts';
import {
  vehiclePose,
  rememberVehicleStep,
  setVehicleRemainder,
  presentedVehicle,
} from '../lib/game/city/vehicle-presentation.ts';
const close = (actual, expected, message) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-8,
    `${message}: ${actual} != ${expected}`,
  );
function straight(car = freshCity()) {
  Object.assign(car, {
    x: -80,
    z: -54,
    heading: Math.PI / 2,
    vx: 32,
    vz: 0,
    speed: 32,
    paused: false,
  });
  Object.assign(car.powertrain, { gear: 6, rpm: 4300, shiftReadyAt: 1e6 });
  return car;
}
for (const hz of [60, 120, 144, 240]) {
  void test(`actual city at ${hz}Hz interpolates its 60Hz steps without frame freezes or position lag growth`, () => {
    const car = straight();
    let previous;
    for (let frame = 1; frame <= hz; frame++) {
      tickCity(car, 1 / hz, new Set(['KeyW']));
      const before = JSON.stringify(car);
      const visual = presentedVehicle(car).car;
      assert.equal(
        JSON.stringify(car),
        before,
        'presentation must not mutate simulation or JSON',
      );
      if (frame / hz > 1 / 60)
        close(
          visual.x,
          -80 + 32 * (frame / hz - 1 / 60),
          'bounded one-step interpolation delay',
        );
      if (previous !== undefined && frame / hz > 3 / 60)
        close(
          visual.x - previous,
          32 / hz,
          'every rendered frame advances evenly',
        );
      previous = visual.x;
    }
    close(car.x, -48, 'authoritative final distance');
    assert.equal(
      car.bumps,
      0,
      'actual open road, no collision can explain a duplicate pose',
    );
  });
}
function raceFixture() {
  const s = freshRace();
  s.paused = false;
  s.phase = 'racing';
  s.countdown = 0;
  straight(s.racers[0].car);
  return s;
}
for (const hz of [60, 120, 144, 240]) {
  void test(`actual race at ${hz}Hz uses the last 120Hz substep, including multi-step frames`, () => {
    const course = raceCourse('krasnoyarsk'),
      inputs = new Map([['0:0', { ...neutralRaceInput(), throttle: 1 }]]);
    const reference = raceFixture();
    const samples = [reference.racers[0].car.x];
    for (let i = 0; i < 120; i++) {
      tickRace(reference, RACE_STEP, inputs, course);
      samples.push(reference.racers[0].car.x);
    }
    const s = raceFixture();
    let last;
    for (let frame = 1; frame <= hz; frame++) {
      tickRace(s, 1 / hz, inputs, course);
      const r = s.racers[0],
        before = JSON.stringify(s);
      const visual = presentedVehicle(r.car, r.elevation, r.pitch, s.paused);
      assert.equal(JSON.stringify(s), before);
      const elapsed = frame / hz,
        ticks = Math.floor(elapsed / RACE_STEP + 1e-8),
        alpha = Math.max(0, (elapsed - ticks * RACE_STEP) / RACE_STEP);
      if (ticks > 0)
        close(
          visual.car.x,
          samples[ticks - 1] + (samples[ticks] - samples[ticks - 1]) * alpha,
          'render must use actual adjacent substeps',
        );
      if (last !== undefined && frame / hz > 3 * RACE_STEP)
        assert(
          visual.car.x > last,
          'no repeated pose while driving, even at240Hz',
        );
      last = visual.car.x;
    }
    close(
      s.racers[0].car.x,
      reference.racers[0].car.x,
      'render cadence cannot change physics',
    );
  });
}
void test('pause, short external teleport, reset and JSON restore snap without stale pose sweeps', () => {
  const car = straight();
  tickCity(car, 1 / 60, new Set(['KeyW']));
  tickCity(car, 1 / 120, new Set(['KeyW']));
  assert(presentedVehicle(car).car.x < car.x);
  car.paused = true;
  const frozen = presentedVehicle(car).car.x;
  close(frozen, car.x, 'pause shows the saved authoritative point immediately');
  close(
    presentedVehicle(car).car.x,
    frozen,
    'repeated paused frames remain fixed',
  );
  car.paused = false;
  tickCity(car, 1 / 60, new Set(['KeyW']));
  car.x += 0.3;
  close(
    presentedVehicle(car).car.x,
    car.x,
    'sub-metre direct authoritative correction invalidates history',
  );
  tickCity(car, 1 / 60, new Set(['KeyW']));
  resetCityCar(car);
  close(
    presentedVehicle(car).car.x,
    car.x,
    'reset never interpolates back toward old road',
  );
  tickCity(car, 1 / 60, new Set(['KeyW']));
  const restored = JSON.parse(JSON.stringify(car));
  assert.equal(
    presentedVehicle(restored).car,
    restored,
    'restored state has no serialized render history',
  );
});
void test('cyclic heading uses the short arc, and interpolated elevation/pitch share the same clock', () => {
  const car = straight();
  car.heading = Math.PI - 0.02;
  const before = vehiclePose(car, 10, -0.2);
  car.heading = -Math.PI + 0.02;
  car.elapsed += 1 / 60;
  rememberVehicleStep(car, before, vehiclePose(car, 12, 0.2), 1 / 60);
  setVehicleRemainder(car, 1 / 120);
  const visual = presentedVehicle(car, 12, 0.2);
  close(
    Math.abs(visual.car.heading),
    Math.PI,
    'north crossing must not spin through zero',
  );
  close(visual.elevation, 11, 'same frame elevation');
  close(visual.pitch, 0, 'same frame pitch');
  close(visual.car.elapsed, 1 / 120, 'head/bob clock uses the rendered pose');
});
void test('actual race reset snaps even when its teleport is shorter than one car', () => {
  const s = raceFixture(),
    course = raceCourse(s.trackId),
    r = s.racers[0];
  tickRace(s, 1 / 120, new Map(), course);
  const p = course.sample(-6);
  Object.assign(r.car, {
    x: p.x + 0.2,
    z: p.z,
    heading: Math.atan2(p.dx, -p.dz),
    vx: 0,
    vz: 0,
    speed: 0,
  });
  tickRace(
    s,
    1 / 120,
    new Map([[r.id, { ...neutralRaceInput(), reset: true }]]),
    course,
  );
  assert.equal(r.respawns, 1);
  close(
    presentedVehicle(r.car, r.elevation, r.pitch, s.paused).car.x,
    r.car.x,
    'explicit respawn invalidates interpolation',
  );
});

for (const hz of [120, 144])
  void test(`actual city camera no longer makes a steadily driven car alternate backwards at${hz}Hz`, () => {
    const car = straight(),
      initial = cityDriveCamera(car, 16 / 9);
    const look = new THREE.Vector3(
      initial.look.x,
      initial.look.y,
      initial.look.z,
    );
    const outward = new THREE.Vector3(
      initial.outward.x,
      initial.outward.y,
      initial.outward.z,
    );
    const h = initial.halfHeight,
      camera = new THREE.OrthographicCamera(
        (-h * 16) / 9,
        (h * 16) / 9,
        h,
        -h,
        0.1,
        2000,
      );
    const point = new THREE.Vector3(),
      distance = cityOverviewCamera(16 / 9).distance;
    let previous;
    for (let frame = 0; frame < hz; frame++) {
      tickCity(car, 1 / hz, new Set(['KeyW']));
      const visual = presentedVehicle(car).car,
        target = cityDriveCamera(visual, 16 / 9);
      look.lerp(
        new THREE.Vector3(target.look.x, target.look.y, target.look.z),
        1 - Math.exp(-8 / hz),
      );
      camera.position.copy(look).addScaledVector(outward, distance);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      point.set(visual.x, 1, visual.z).project(camera);
      const pixel = (1 - point.y) * 360;
      if (frame > hz * 0.2)
        assert.ok(
          pixel - previous <= 1e-8,
          'camera and car must not alternate direction at constant forward speed',
        );
      previous = pixel;
    }
  });
