import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CITY_SPAWN,
  cityRoads,
  distanceToRoad,
} from '../lib/game/city/layout.ts';
import {
  freshCity,
  resetCityCar,
  tickCity,
  stepCityCar,
} from '../lib/game/city/engine.ts';
import {
  cityGroundHeight,
  cityRoadHeight,
  citySurfacePose,
} from '../lib/game/city/surface.ts';

const street = cityRoads.find((r) => r.id === 'svobodny-mira-9maya:0');
const ramp = cityRoads.find((r) => r.id === 'nikolaevsky-left:0');
const close = (actual, expected, note) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, note);

void test('an upper car keeps its layer through the rounded approach joint beyond either segment axis', () => {
  const road = cityRoads.find((r) => r.id === 'bridge-nikolaevsky:0');
  const origin = { x: -721.8055772620131, z: 425.10159615295345 };
  const heading = -0.9728415260122579;
  const elevation = cityRoadHeight(road, origin.x, origin.z);
  for (const dx of [-0.1, 0, 0.1])
    for (const dz of [-0.1, 0, 0.1]) {
      const x = origin.x + dx,
        z = origin.z + dz;
      assert.ok(distanceToRoad(x, z, road) < road.width / 2 - 2);
      close(
        citySurfacePose(x, z, heading, elevation, `road:${road.id}`).elevation,
        cityRoadHeight(road, x, z),
        'rounded asphalt is not ground seven metres below',
      );
    }
  const car = {
    ...freshCity(),
    ...origin,
    heading,
    elevation,
    surfaceId: `road:${road.id}`,
    speed: 8,
    vx: Math.sin(heading) * 8,
    vz: -Math.cos(heading) * 8,
  };
  for (let frame = 0; frame < 30; frame++) {
    assert.equal(
      stepCityCar(car, { throttle: 0.18, steer: 0, handbrake: false }, 1 / 60)
        .worldContact,
      false,
    );
    close(
      car.elevation,
      cityRoadHeight(road, car.x, car.z),
      'ordinary driving remains on the rounded joint',
    );
  }
  assert.ok(Math.hypot(car.x - origin.x, car.z - origin.z) > 3);
});

void test('fresh city, reset and JSON rejoin start on top of the shared fork from their first frame', () => {
  close(CITY_SPAWN.x, -769, 'fix the junction, not the spawn location');
  close(CITY_SPAWN.z, 432.9636363636364, 'keep the original start');
  const fresh = freshCity();
  const reset = freshCity();
  Object.assign(reset, { x: -700, z: 490, elevation: 0, surfaceId: 'ground' });
  resetCityCar(reset);
  for (const car of [fresh, reset, JSON.parse(JSON.stringify(fresh))]) {
    close(
      car.elevation,
      cityRoadHeight(ramp, car.x, car.z),
      'the car cannot start inside the slab',
    );
    const before = structuredClone(car);
    for (let frame = 0; frame < 120; frame++) tickCity(car, 1 / 60, new Set());
    close(
      car.elevation,
      before.elevation,
      'idle cannot require driving away to repair the height',
    );
    close(car.x, before.x, 'no hidden relocation');
    close(car.z, before.z, 'no hidden relocation');
    for (const forward of [-1.7, 0, 1.7])
      for (const side of [-0.85, 0, 0.85]) {
        const x =
          car.x +
          Math.sin(car.heading) * forward +
          Math.cos(car.heading) * side;
        const z =
          car.z -
          Math.cos(car.heading) * forward +
          Math.sin(car.heading) * side;
        if (distanceToRoad(x, z, ramp) <= ramp.width / 2)
          close(
            cityRoadHeight(ramp, x, z),
            cityGroundHeight(x, z),
            'the complete car body clears the slab',
          );
      }
  }
});

void test('all cross-sections of the starting street share the raised fork height', () => {
  const dx = street.to.x - street.from.x,
    dz = street.to.z - street.from.z;
  const length = Math.hypot(dx, dz);
  let checked = 0;
  for (let along = 0; along <= length; along += 0.5)
    for (let side = -10; side <= 10; side += 0.5) {
      const x = street.from.x + (dx * along) / length - (dz * side) / length;
      const z = street.from.z + (dz * along) / length + (dx * side) / length;
      if (distanceToRoad(x, z, ramp) > ramp.width / 2) continue;
      close(
        cityRoadHeight(ramp, x, z),
        cityRoadHeight(street, x, z),
        'no partial basement at the branch',
      );
      checked++;
    }
  assert.ok(checked > 1000);
});

void test('normal driving traverses the original spawn in both directions on all street lanes', () => {
  const dx = street.to.x - street.from.x,
    dz = street.to.z - street.from.z;
  const length = Math.hypot(dx, dz),
    heading = Math.atan2(dx, -dz);
  for (const direction of [-1, 1])
    for (const side of [-7, -3, 0, 3, 7]) {
      const along = direction > 0 ? 1 : length - 1;
      const car = {
        ...freshCity(),
        x: street.from.x + (dx * along) / length - (dz * side) / length,
        z: street.from.z + (dz * along) / length + (dx * side) / length,
        heading: heading + (direction < 0 ? Math.PI : 0),
      };
      Object.assign(car, citySurfacePose(car.x, car.z, car.heading));
      let progress = along;
      for (
        let frame = 0;
        frame < 12 * 60 &&
        (direction > 0 ? progress < length - 1 : progress > 1);
        frame++
      ) {
        tickCity(car, 1 / 60, new Set(), { throttle: 0.6, steer: 0 });
        progress =
          ((car.x - street.from.x) * dx + (car.z - street.from.z) * dz) /
          length;
        close(
          car.elevation,
          cityRoadHeight(street, car.x, car.z),
          'keep the street level through the complete overlap',
        );
        assert.equal(
          car.bumps,
          0,
          `street lane ${side}, direction ${direction}`,
        );
      }
      assert.ok(
        direction > 0 ? progress >= length - 1 : progress <= 1,
        'cross the entire fork without a teleport',
      );
    }
});
