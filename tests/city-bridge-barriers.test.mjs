import test from 'node:test';
import assert from 'node:assert/strict';
import { cityBarriers } from '../lib/game/city/barriers.ts';
import {
  cityRoads,
  CITY_STUD_ROUNDABOUT,
  CITY_SPAWN,
  cityBuildings,
  distanceToRoad,
} from '../lib/game/city/layout.ts';
import {
  cityGroundHeight,
  cityRoadHeight,
  citySurfacePose,
} from '../lib/game/city/surface.ts';
import {
  cityBlocked,
  cityCarBlocked,
  freshCity,
  tickCity,
} from '../lib/game/city/engine.ts';

void test('all visible rail sections physically block their deck, including approaches and island ramps', () => {
  assert.ok(cityBarriers.length > 100);
  for (const id of [
    'nikolaevsky-left:',
    'bridge-nikolaevsky:',
    'bridge-kommunalny:',
    'bridge-oktyabrsky:',
    'vinogradovsky:',
    'tatyshev-exit:',
  ])
    assert.ok(
      cityBarriers.some((b) => b.roadId.startsWith(id)),
      `${id} missing rails`,
    );
  for (const rail of cityBarriers) {
    assert.ok(rail.d <= 8.001);
    const road = cityRoads.find((r) => r.id === rail.roadId);
    assert.ok(road);
    for (const along of [-0.45, 0, 0.45]) {
      const x = rail.x + Math.sin(rail.angle) * rail.d * along,
        z = rail.z + Math.cos(rail.angle) * rail.d * along;
      assert.equal(
        cityBlocked(x, z, cityRoadHeight(road, x, z)),
        true,
        `${road.id} allows driving through its rail`,
      );
    }
  }
});
void test('Nikolaevsky rails remain above the lower road without blocking the underpass', () => {
  const lower = cityRoads.find((r) => r.id === 'left-quay:3');
  const rails = cityBarriers.filter(
    (r) =>
      r.roadId.startsWith('bridge-nikolaevsky:') &&
      distanceToRoad(r.x, r.z, lower) < 4,
  );
  assert.ok(
    rails.length >= 2,
    'both sides of the upper deck need continuous rails at the crossing',
  );
  for (const rail of rails) {
    assert.equal(
      cityBlocked(rail.x, rail.z, cityGroundHeight(rail.x, rail.z)),
      false,
    );
    assert.equal(
      cityBlocked(
        rail.x,
        rail.z,
        cityRoadHeight(
          cityRoads.find((r) => r.id === rail.roadId),
          rail.x,
          rail.z,
        ),
      ),
      true,
    );
  }
});
void test('bridge surfaces stay continuous off the centre line at their transverse bends', () => {
  for (const road of cityRoads.filter(
    (r) => r.bridge || r.layer === 'raised',
  )) {
    const dx = road.to.x - road.from.x,
      dz = road.to.z - road.from.z,
      length = Math.hypot(dx, dz);
    for (const offset of [-7, -4, 0, 4, 7]) {
      let previous = null;
      for (let d = 0; d <= length; d += 0.25) {
        const x = road.from.x + (dx * d) / length - (dz * offset) / length,
          z = road.from.z + (dz * d) / length + (dx * offset) / length;
        const y = cityRoadHeight(road, x, z);
        if (previous !== null)
          assert.ok(
            Math.abs(y - previous) < 0.050001,
            `${road.id} lane${offset} jumps ${y - previous}m`,
          );
        previous = y;
      }
    }
  }
  assert.equal(
    cityCarBlocked(CITY_SPAWN.x, CITY_SPAWN.z, CITY_SPAWN.heading),
    false,
    'raised ramp must meet the starting street',
  );
});
void test('Kirenskogo–Baykitskaya roundabout is a real drivable loop in both directions, beside IKIT and Doner', () => {
  const ring = CITY_STUD_ROUNDABOUT;
  assert.equal(cityBlocked(ring.x, ring.z), true);
  assert.ok(cityBuildings.find((b) => b.kind === 'ikit').z > ring.z);
  const doner = cityBuildings.find((b) => b.kind === 'doner');
  assert.ok(doner.x > ring.x && doner.z > ring.z);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  for (const direction of [1, -1]) {
    const points = Array.from({ length: 33 }, (_, i) => ({
      x: ring.x + 23 * Math.sin((direction * i * Math.PI) / 16),
      z: ring.z + 23 * Math.cos((direction * i * Math.PI) / 16),
    }));
    const car = {
      ...freshCity(),
      ...points[0],
      heading: (direction * Math.PI) / 2,
    };
    Object.assign(car, citySurfacePose(car.x, car.z, car.heading));
    let next = 1;
    for (let frame = 0; frame < 90 * 60 && next < points.length; frame++) {
      const p = points[next],
        dx = p.x - car.x,
        dz = p.z - car.z,
        d = Math.hypot(dx, dz);
      if (d < 1.6) {
        next++;
        continue;
      }
      const a = Math.atan2(
        Math.sin(Math.atan2(dx, -dz) - car.heading),
        Math.cos(Math.atan2(dx, -dz) - car.heading),
      );
      const forward =
        car.vx * Math.sin(car.heading) - car.vz * Math.cos(car.heading);
      tickCity(car, 1 / 60, new Set(), {
        throttle: clamp((5 - forward) * 0.4, -1, 1),
        steer: clamp(a * 2, -1, 1),
      });
      assert.ok(
        Math.hypot(car.x - ring.x, car.z - ring.z) > ring.innerRadius + 0.8,
      );
    }
    assert.equal(next, points.length);
    assert.equal(car.bumps, 0);
  }
});
