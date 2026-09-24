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

const street = cityRoads.filter((r) => r.id.startsWith('baykitskaya:')).at(-1);
const spawnStreet = cityRoads
  .filter((r) => r.id.startsWith('kirenskogo-south:'))
  .at(-1);
const ramp = cityRoads.find((r) => r.id === 'nikolaevsky-left:0');
const close = (actual, expected, note) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, note);

void test('an upper car keeps its layer through the rounded approach joint beyond either segment axis', () => {
  const road = cityRoads.find((r) => r.id === 'bridge-nikolaevsky:0');
  const heading = Math.atan2(road.to.x - road.from.x, road.from.z - road.to.z);
  const origin = {
    x: road.from.x + Math.cos(heading) * 4,
    z: road.from.z + Math.sin(heading) * 4,
  };
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

void test('fresh city, reset and JSON rejoin start on the Orbita access from their first frame', () => {
  assert.ok(distanceToRoad(CITY_SPAWN.x, CITY_SPAWN.z, spawnStreet) < 1);
  assert.ok(distanceToRoad(CITY_SPAWN.x, CITY_SPAWN.z, ramp) > 100);
  const fresh = freshCity();
  const reset = freshCity();
  Object.assign(reset, { x: -700, z: 490, elevation: 0, surfaceId: 'ground' });
  resetCityCar(reset);
  for (const car of [fresh, reset, JSON.parse(JSON.stringify(fresh))]) {
    close(
      car.elevation,
      cityRoadHeight(spawnStreet, car.x, car.z),
      'the car starts on the actual courtyard access',
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
        assert.ok(distanceToRoad(x, z, spawnStreet) <= spawnStreet.width / 2);
        close(
          cityRoadHeight(spawnStreet, x, z),
          cityGroundHeight(x, z),
          'the complete car body starts on the ground access',
        );
      }
  }
});

void test('all cross-sections of the Baykitskaya entry share the raised approach height', () => {
  const dx = street.to.x - street.from.x,
    dz = street.to.z - street.from.z;
  const length = Math.hypot(dx, dz);
  let checked = 0;
  const checkedSides = new Set();
  for (let along = 0; along <= length; along += 0.25)
    for (let side = -street.width / 2; side <= street.width / 2; side += 0.25) {
      const x = street.from.x + (dx * along) / length - (dz * side) / length;
      const z = street.from.z + (dz * along) / length + (dx * side) / length;
      if (distanceToRoad(x, z, ramp) > ramp.width / 2) continue;
      close(
        cityRoadHeight(ramp, x, z),
        cityRoadHeight(street, x, z),
        'no partial basement at the branch',
      );
      checked++;
      checkedSides.add(side);
    }
  assert.ok(checked > 1000, 'the complete fork receives dense coverage');
  assert.ok(checkedSides.has(-street.width / 2));
  assert.ok(checkedSides.has(street.width / 2));
});

void test('normal driving traverses the Baykitskaya approach junction in both directions on all lanes', () => {
  const dx = street.to.x - street.from.x,
    dz = street.to.z - street.from.z;
  const length = Math.hypot(dx, dz),
    heading = Math.atan2(dx, -dz);
  for (const direction of [-1, 1])
    for (const side of [
      -street.width / 2 + 2,
      -street.width / 4,
      0,
      street.width / 4,
      street.width / 2 - 2,
    ]) {
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
          `street lane ${side}, direction ${direction} at ${car.x},${car.z} on ${car.surfaceId}`,
        );
      }
      assert.ok(
        direction > 0 ? progress >= length - 1 : progress <= 1,
        'cross the entire fork without a teleport',
      );
    }
});
