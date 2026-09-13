import test from 'node:test';
import assert from 'node:assert/strict';
import { raceCourse, crossedGate } from '../lib/game/race/course.ts';
import {
  freshRace,
  changeLocalRacers,
  configureCar,
  startRace,
  carBlocked,
  resolveCarContacts,
} from '../lib/game/race/engine.ts';
import { clearRaceCamera, raceCameraFraming } from '../lib/game/race/camera.ts';
import {
  defaultVehicleColor,
  vehicleTuning,
  VEHICLES,
} from '../lib/game/race/vehicles.ts';
import { freshCity } from '../lib/game/city/engine.ts';
import { stepCar } from '../lib/game/city/car-physics.ts';
import {
  advancePowertrain,
  freshPowertrain,
} from '../lib/game/city/powertrain.ts';

const nord = raceCourse('nordschleife');
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pointSegmentDistance = (p, a, b) => {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)),
  );
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
};

await test('the 14m Nordschleife retains enough turn radius for both shoulders', () => {
  assert.equal(nord.halfWidth * 2, 14);
  const points = nord.points.slice(0, -1);
  let minimumRadius = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[(i + points.length - 1) % points.length];
    const b = points[i],
      c = points[(i + 1) % points.length];
    const twiceArea = Math.abs(
      (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x),
    );
    if (twiceArea > 1e-10)
      minimumRadius = Math.min(
        minimumRadius,
        (distance(a, b) * distance(b, c) * distance(a, c)) / (2 * twiceArea),
      );
    assert(distance(b, c) <= 1.1, `undersampled road at ${b.name}, point ${i}`);
  }
  assert(
    minimumRadius > 9.5,
    `inside shoulder would fold at radius ${minimumRadius}`,
  );
});

await test('Karussell approach and exit remain separate after widening the road', () => {
  const segments = (name) =>
    nord.points
      .slice(0, -1)
      .flatMap((p, i) => (p.name === name ? [[p, nord.points[i + 1]]] : []));
  const incoming = segments('Steilstrecke'),
    outgoing = segments('Hohe Acht');
  assert(
    incoming.length > 10 && outgoing.length > 10,
    'both named branches must be present',
  );
  let minimum = Infinity;
  for (const [a, b] of incoming)
    for (const [c, d] of outgoing) {
      minimum = Math.min(
        minimum,
        pointSegmentDistance(a, c, d),
        pointSegmentDistance(b, c, d),
        pointSegmentDistance(c, a, b),
        pointSegmentDistance(d, a, b),
      );
    }
  assert(
    minimum > 18,
    `the two road/shoulder envelopes overlap: centres only ${minimum}m apart`,
  );
});

await test('every legal Nord shoulder crossing counts, while cars still collide before the rail', () => {
  for (const [index, gate] of nord.gates.entries())
    for (const side of [-1, 1]) {
      const crossing = (lateral) => {
        const x = gate.x - gate.dz * lateral * side;
        const z = gate.z + gate.dx * lateral * side;
        return [
          { x: x - gate.dx * 0.25, z: z - gate.dz * 0.25 },
          { x: x + gate.dx * 0.25, z: z + gate.dz * 0.25 },
        ];
      };
      const heading = Math.atan2(gate.dx, -gate.dz);
      // 7.1m is outside the asphalt, but the complete car still fits inside the rail.
      const [before, after] = crossing(7.1);
      for (const p of [before, after])
        assert.equal(
          carBlocked(nord, p.x, p.z, heading),
          false,
          `legal verge blocked at gate ${index}`,
        );
      assert.equal(
        crossedGate(before, after, gate),
        true,
        `legal verge missed gate ${index}`,
      );
      const [outsideBody] = crossing(7.5);
      assert.equal(
        carBlocked(nord, outsideBody.x, outsideBody.z, heading),
        true,
        `body penetrates rail at gate ${index}`,
      );
      assert.equal(
        crossedGate(...crossing(8.4), gate),
        false,
        `checkpoint extends outside the rail at gate ${index}`,
      );
    }
  const city = raceCourse('krasnoyarsk');
  assert(
    city.gates.every((gate) => gate.halfWidth === city.halfWidth),
    'Nord verge must not expand city checkpoints',
  );
});

await test('the actual six-car Nord starting grid is clear of rails and other cars', () => {
  const race = freshRace();
  race.trackId = 'nordschleife';
  for (let slot = 0; slot < 3; slot++)
    changeLocalRacers(race, slot, 2, `Driver ${slot}`);
  race.racers.forEach((r) => {
    r.ready = true;
  });
  assert.equal(startRace(race, nord), true);
  assert.equal(race.racers.length, 6);
  for (const { car } of race.racers)
    assert.equal(carBlocked(nord, car.x, car.z, car.heading), false);
  const previous = race.racers.map((r) => ({ ...r.car }));
  assert.equal(resolveCarContacts(race, nord, previous).size, 0);
});

await test('chase camera clears a hill between the car and an otherwise clear endpoint', () => {
  const car = { x: 0, y: 0, z: 0 };
  const desired = { x: 20, y: 6, z: 0 };
  const heightAt = (x) => Math.max(0, 6 - Math.abs(x - 8) * 0.8);
  assert.equal(
    heightAt(desired.x),
    0,
    'the obstruction is between car and camera',
  );
  const camera = clearRaceCamera(desired, car, heightAt);
  assert(
    camera.y > desired.y + 5,
    'checking only the camera endpoint would leave the car hidden',
  );
  assert.deepEqual(
    { x: camera.x, z: camera.z },
    { x: desired.x, z: desired.z },
  );
  assert.deepEqual(
    desired,
    { x: 20, y: 6, z: 0 },
    'camera input must not be mutated',
  );
  for (let i = 1; i <= 200; i++) {
    const t = i / 200;
    const rayY = car.y + 1.15 + (camera.y - car.y - 1.15) * t;
    assert(
      rayY > heightAt(car.x + (camera.x - car.x) * t) + 0.4,
      `hill obscures car at t=${t}`,
    );
  }
});

await test('camera stays clear of ground without changing safe flat-road framing', () => {
  const car = { x: 0, y: 0, z: 0 };
  const low = clearRaceCamera({ x: 20, y: -4, z: 0 }, car, () => 0);
  assert(low.y >= 2, 'camera must remain above its terrain surface');
  const safe = { x: 20, y: 10, z: 0 };
  assert.deepEqual(
    clearRaceCamera(safe, car, () => 0),
    safe,
  );
  const wide = raceCameraFraming(40, 16 / 9),
    split = raceCameraFraming(40, 8 / 9);
  assert(
    split.distance >= wide.distance,
    'a narrower viewport must not bring the camera closer',
  );
  assert.equal(
    split.height,
    wide.height,
    'aspect ratio alone should not change vertical framing',
  );
});

await test('AMG GT defaults to black without stealing another racer’s colour', () => {
  assert.equal(VEHICLES['amg-gt'].name, 'AMG GT');
  assert.equal(VEHICLES['amg-one'], undefined);
  const race = freshRace();
  changeLocalRacers(race, 0, 2, 'Local');
  const [first, second] = race.racers;
  const firstColour = defaultVehicleColor('amg-gt', first.colorId, [
    second.colorId,
  ]);
  assert.equal(firstColour, 'black');
  assert.equal(configureCar(race, 0, 0, 'amg-gt', firstColour), true);
  const secondColour = defaultVehicleColor('amg-gt', second.colorId, [
    first.colorId,
  ]);
  assert.equal(secondColour, second.colorId);
  assert.notEqual(secondColour, 'black');
  assert.equal(configureCar(race, 0, 1, 'amg-gt', secondColour), true);
  race.racers.forEach((r) => {
    r.ready = true;
  });
  startRace(race, nord);
  assert.equal(first.vehicleId, 'amg-gt');
  assert.equal(first.colorId, 'black');
  assert.equal(new Set(race.racers.map((r) => r.colorId)).size, 2);
  assert.equal(defaultVehicleColor('mustang', 'white', []), 'red');
});

await test('GT nine-speed cruises in ninth and downshifts into the V8 operating range', () => {
  const transmission = vehicleTuning('amg-gt', false).transmission;
  const motor = freshPowertrain();
  for (let i = 0; i < 1200; i++)
    advancePowertrain(motor, 50, 0.25, 1 / 120, transmission);
  assert.equal(motor.gear, 9);
  assert(
    motor.rpm > 3500 && motor.rpm < 8000,
    `unexpected GT cruise rpm ${motor.rpm}`,
  );
  for (let i = 0; i < 600; i++)
    advancePowertrain(motor, 4, 0.3, 1 / 120, transmission);
  assert(motor.gear <= 3, 'slowing down must leave ninth gear');
  assert(motor.rpm > 1000 && motor.rpm < 7000);
});

await test('GT holds a powered corner more steadily while Mustang keeps its straight-line advantage', () => {
  const drive = (id) => {
    const car = freshCity(),
      tuning = vehicleTuning(id, false);
    for (let i = 0; i < 960; i++)
      stepCar(
        car,
        { throttle: 1, steer: 0, handbrake: false },
        1 / 120,
        () => false,
        tuning,
      );
    const straightSpeed = car.speed;
    for (let i = 0; i < 240; i++)
      stepCar(
        car,
        { throttle: 0.6, steer: 0.65, handbrake: false },
        1 / 120,
        () => false,
        tuning,
      );
    const angle = Math.atan2(car.vx, -car.vz) - car.heading;
    return {
      straightSpeed,
      slip: Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))),
    };
  };
  const mustang = drive('mustang'),
    gt = drive('amg-gt');
  assert(mustang.straightSpeed > gt.straightSpeed);
  assert(
    gt.straightSpeed / mustang.straightSpeed > 0.85,
    'GT must remain competitively close',
  );
  assert(
    gt.slip < mustang.slip * 0.8,
    `GT slip ${gt.slip} does not improve on Mustang ${mustang.slip}`,
  );
});
