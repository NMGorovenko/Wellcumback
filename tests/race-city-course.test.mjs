import test from 'node:test';
import assert from 'node:assert/strict';
import {
  krasnoyarskCourse as course,
  crossedGate,
} from '../lib/game/race/course.ts';
import {
  freshRace,
  changeLocalRacers,
  startRace,
  tickRace,
  carBlocked,
  resolveCarContacts,
  respawnRacer,
  RACE_TIME_LIMIT,
} from '../lib/game/race/engine.ts';
import {
  cityRoads,
  distanceToRoad,
  inCityWater,
} from '../lib/game/city/layout.ts';

const wrap = (value) => Math.atan2(Math.sin(value), Math.cos(value));
const carRadius = 0.85;
const headingAt = (p) => Math.atan2(p.dx, -p.dz);
function bodyOnRoad(x, z, heading) {
  return [-1.2, 0, 1.2].every((offset) => {
    const px = x + Math.sin(heading) * offset,
      pz = z - Math.cos(heading) * offset;
    return cityRoads.some(
      (road) => distanceToRoad(px, pz, road) <= road.width / 2 - carRadius,
    );
  });
}
function ready(vehicleId = 'mustang') {
  const state = freshRace();
  state.racers[0].vehicleId = vehicleId;
  state.racers[0].ready = true;
  assert.equal(startRace(state, course), true);
  return state;
}

void test('city circuit remains on asphalt with a clear car body in both lanes, away from water and buildings', () => {
  assert.ok(
    course.length > 2500 && course.length < 3100,
    `party circuit grew to ${course.length}m`,
  );
  assert.deepEqual(course.points[0], course.points.at(-1));
  for (let distance = 0; distance < course.length; distance += 1) {
    const p = course.sample(distance),
      heading = headingAt(p);
    for (const lane of [-4.5, 0, 4.5]) {
      const x = p.x - p.dz * lane,
        z = p.z + p.dx * lane;
      assert.ok(
        bodyOnRoad(x, z, heading),
        `off asphalt at ${distance}m, lane ${lane}`,
      );
      assert.equal(
        carBlocked(course, x, z, heading),
        false,
        `body blocked at ${distance}m, lane ${lane}`,
      );
      assert.equal(
        inCityWater(x, z, carRadius),
        false,
        `water at ${distance}m`,
      );
    }
  }
});

void test('all nine city grid slots face the straight start gate and cross it with ordinary throttle', () => {
  const state = freshRace(),
    gate = course.gates[0];
  for (let slot = 0; slot < 3; slot++)
    changeLocalRacers(state, slot, 3, `Device ${slot}`);
  state.racers.forEach((r) => {
    r.ready = true;
  });
  assert.equal(startRace(state, course), true);
  for (const { car } of state.racers) {
    assert.ok(
      (car.x - gate.x) * gate.dx + (car.z - gate.z) * gate.dz < -5,
      'whole grid starts behind the gate',
    );
    assert.ok(
      Math.abs(wrap(car.heading - headingAt(gate))) < 1e-8,
      'start does not require an immediate corner',
    );
    assert.ok(bodyOnRoad(car.x, car.z, car.heading));
    assert.equal(carBlocked(course, car.x, car.z, car.heading), false);
  }
  assert.equal(
    resolveCarContacts(
      state,
      course,
      state.racers.map((r) => ({ ...r.car })),
    ).size,
    0,
  );
  const inputs = new Map(
    state.racers.map((r) => [
      r.id,
      { throttle: 0.8, steer: 0, handbrake: false, reset: false },
    ]),
  );
  for (let frame = 0; frame < 60 * 6; frame++)
    tickRace(state, 1 / 60, inputs, course);
  state.racers.forEach((r) => {
    assert.equal(r.started, true);
    assert.equal(r.passedGates, 1);
    assert.equal(r.laps, 0);
  });
});

void test('every city gate has clear approach, legal shoulder crossings and a safe earned respawn', () => {
  const state = ready(),
    racer = state.racers[0];
  for (const [index, gate] of course.gates.entries()) {
    assert.ok(
      course.distances
        .slice(1, -1)
        .every((d) => Math.abs(d - gate.distance) > 20),
      `gate ${index} lies on a corner`,
    );
    for (const lane of [-gate.halfWidth + 0.5, 0, gate.halfWidth - 0.5]) {
      const x = gate.x - gate.dz * lane,
        z = gate.z + gate.dx * lane;
      const before = { x: x - gate.dx * 2, z: z - gate.dz * 2 };
      const after = { x: x + gate.dx * 2, z: z + gate.dz * 2 };
      for (const p of [before, after]) {
        assert.ok(
          bodyOnRoad(p.x, p.z, headingAt(gate)),
          `gate ${index} lane ${lane} off asphalt`,
        );
        assert.equal(carBlocked(course, p.x, p.z, headingAt(gate)), false);
      }
      assert.equal(crossedGate(before, after, gate), true);
      assert.equal(crossedGate(after, before, gate), false);
    }
    racer.nextGate = (index + 1) % course.gates.length;
    racer.passedGates = index + 1;
    respawnRacer(state, racer, course);
    assert.equal(
      carBlocked(course, racer.car.x, racer.car.z, racer.car.heading),
      false,
    );
    assert.ok(bodyOnRoad(racer.car.x, racer.car.z, racer.car.heading));
    assert.ok(
      Math.abs(
        course.closest(racer.car.x, racer.car.z).distance - (gate.distance + 5),
      ) < 0.001,
    );
  }
});

// Pure pursuit uses only pedals/steering and brakes for upcoming street corners.
// It never changes poses, gates or physics, and never invokes reset.
const corners = course.distances.slice(1, -1).map((distance, i) => ({
  distance,
  angle: Math.abs(
    wrap(
      Math.atan2(
        course.points[i + 2].x - course.points[i + 1].x,
        course.points[i + 2].z - course.points[i + 1].z,
      ) -
        Math.atan2(
          course.points[i + 1].x - course.points[i].x,
          course.points[i + 1].z - course.points[i].z,
        ),
    ),
  ),
}));
function drivingInput(car) {
  const nearest = course.closest(car.x, car.z),
    speed = car.speed;
  let targetSpeed = 20;
  for (const corner of corners) {
    const ahead =
      (corner.distance - nearest.distance + course.length) % course.length;
    if (ahead > 150 || corner.angle < 0.08) continue;
    const cornerSpeed = corner.angle > 1 ? 5.5 : corner.angle > 0.5 ? 9 : 16;
    targetSpeed = Math.min(
      targetSpeed,
      Math.sqrt(cornerSpeed ** 2 + 16 * Math.max(0, ahead - 8)),
    );
  }
  const target = course.sample(nearest.distance + Math.max(3, speed * 0.35));
  const angle = wrap(
    Math.atan2(target.x - car.x, car.z - target.z) - car.heading,
  );
  return {
    throttle: speed > targetSpeed + 1 ? -1 : speed < targetSpeed - 1 ? 1 : 0.3,
    steer: Math.max(-1, Math.min(1, angle * 1.5)),
    handbrake: false,
    reset: false,
  };
}
for (const vehicleId of ['mustang', 'amg-gt'])
  void test(`${vehicleId}: ordinary driving completes all three city laps below ten minutes`, () => {
    const state = ready(vehicleId),
      racer = state.racers[0];
    for (let frame = 0; frame < 60 * 600 && state.phase !== 'result'; frame++) {
      tickRace(
        state,
        1 / 60,
        new Map([[racer.id, drivingInput(racer.car)]]),
        course,
      );
      assert.equal(
        carBlocked(course, racer.car.x, racer.car.z, racer.car.heading),
        false,
      );
      assert.equal(inCityWater(racer.car.x, racer.car.z, carRadius), false);
      if (frame % 3 === 0)
        assert.ok(
          bodyOnRoad(racer.car.x, racer.car.z, racer.car.heading),
          `body left asphalt at ${state.elapsed.toFixed(2)}s`,
        );
    }
    assert.equal(state.phase, 'result');
    assert.equal(racer.laps, 3);
    assert.ok(
      racer.finishTime !== null && racer.finishTime < RACE_TIME_LIMIT - 30,
      `three laps must finish with margin: ${racer.finishTime}`,
    );
    assert.equal(racer.passedGates, course.gates.length * 3 + 1);
    assert.equal(racer.respawns, 0);
  });
