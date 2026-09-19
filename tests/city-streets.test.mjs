import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CITY_NAMED_STREETS,
  CITY_ROUTES,
  cityRoads,
  cityStops,
  cityBuildings,
  distanceToRoad,
} from '../lib/game/city/layout.ts';
import {
  cityGroundHeight,
  citySurfacePose,
  cityOverpassClearance,
} from '../lib/game/city/surface.ts';
import {
  cityNavigationRoute,
  cityRouteLength,
} from '../lib/game/city/navigation.ts';
import {
  freshCity,
  tickCity,
  cityCarBlocked,
  cityTravelArrival,
} from '../lib/game/city/engine.ts';
const streets = (name) =>
  CITY_NAMED_STREETS.find((s) => s.name === name).roadIds.map((id) =>
    cityRoads.find((r) => r.id === id),
  );
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
void test('four central streets form long separate parallel corridors with usable cross streets', () => {
  const names = ['Карла Маркса', 'Мира', 'Ленина', 'Ады Лебедевой'];
  for (const name of names) {
    const roads = streets(name);
    assert.ok(roads.every(Boolean), name);
    assert.ok(
      roads.reduce(
        (sum, r) => sum + Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z),
        0,
      ) > 700,
      name,
    );
    const route = cityNavigationRoute(
      roads[0].from,
      cityStops.find((s) => s.id === 'nikita'),
    );
    assert.ok(
      route.length > 2 && cityRouteLength(route) < 2500,
      `${name} connects to the city`,
    );
  }
  for (const x of [-150, 0, 120]) {
    let previous = Infinity;
    for (const name of names) {
      const r = streets(name).find((r) => r.from.x <= x && r.to.x >= x);
      assert.ok(r, `${name} crosses centre x=${x}`);
      const z =
        r.from.z + ((r.to.z - r.from.z) * (x - r.from.x)) / (r.to.x - r.from.x);
      assert.ok(
        z < previous - 45,
        `${name} must be north of the preceding corridor`,
      );
      previous = z;
    }
  }
  assert.equal(streets('Мира')[0].width, 20);
  assert.equal(streets('Карла Маркса')[0].width, 17);
  assert.equal(streets('Ленина')[0].width, 16);
  assert.equal(streets('Ады Лебедевой')[0].width, 12);
  assert.ok(streets('Дубровинского').every((r) => r.width === 16));
  const campus = cityBuildings.find((b) => b.kind === 'university');
  assert.ok(cityGroundHeight(campus.x, campus.z) > 50);
  assert.ok(
    cityGroundHeight(-760, 139.45454545454544) > 40,
    'Svobodny stays on the western hill',
  );
  assert.ok(
    cityGroundHeight(0, 198) < 10,
    'central embankment stays near the river',
  );
});
void test('Studgorodok descends onto Dubrovinskogo and physically passes beneath Nikolaevsky in both directions', (t) => {
  for (const direction of [1, -1]) {
    const points =
      direction === 1
        ? CITY_ROUTES.studDubrovinsky
        : [...CITY_ROUTES.studDubrovinsky].reverse();
    const [a, b] = points;
    const car = {
      ...freshCity(),
      ...a,
      heading: Math.atan2(b.x - a.x, a.z - b.z),
    };
    Object.assign(car, citySurfacePose(car.x, car.z, car.heading));
    const startY = car.elevation;
    let next = 1,
      under = 0,
      maxStep = 0;
    for (let frame = 0; frame < 180 * 60 && next < points.length; frame++) {
      const p = points[next],
        dx = p.x - car.x,
        dz = p.z - car.z,
        d = Math.hypot(dx, dz);
      if (d < 1.7) {
        next++;
        continue;
      }
      const angle = Math.atan2(
        Math.sin(Math.atan2(dx, -dz) - car.heading),
        Math.cos(Math.atan2(dx, -dz) - car.heading),
      );
      const forward =
        car.vx * Math.sin(car.heading) - car.vz * Math.cos(car.heading);
      const desired =
        Math.min(12, Math.sqrt(6 * d)) * Math.max(0.16, Math.cos(angle));
      const prior = car.elevation;
      tickCity(car, 1 / 60, new Set(), {
        throttle: clamp((desired - forward) * 0.35, -1, 1),
        steer: clamp(angle * 2, -1, 1),
      });
      maxStep = Math.max(maxStep, Math.abs(car.elevation - prior));
      const deck = cityOverpassClearance(car.x, car.z);
      if (deck !== null && deck - car.elevation > 6) under++;
      assert.equal(
        cityCarBlocked(car.x, car.z, car.heading, car.elevation),
        false,
      );
    }
    assert.equal(
      next,
      points.length,
      `stalled ${direction}: ${car.x},${car.z} ${car.surfaceId}`,
    );
    assert.equal(car.bumps, 0);
    assert.ok(under > 20, 'must actually drive under the elevated bridge');
    assert.ok(maxStep < 0.1, `surface jump ${maxStep}`);
    assert.ok((startY - car.elevation) * direction > 25);
    t.diagnostic(
      `Svobodny/Stud→Dubrovinskogo direction ${direction}: ${car.elapsed.toFixed(1)}s`,
    );
  }
  const start = CITY_ROUTES.studDubrovinsky[0];
  const lower = { x: -650, z: 430.5 };
  const route = cityNavigationRoute(start, {
    ...lower,
    ...citySurfacePose(lower.x, lower.z, 0, cityGroundHeight(lower.x, lower.z)),
  });
  assert.ok(
    cityRouteLength(route) < 350,
    'GPS enters lower embankment without climbing the upper bridge',
  );
  assert.ok(
    route.some(
      (p) =>
        p.x > -750 &&
        p.x < -660 &&
        distanceToRoad(
          p.x,
          p.z,
          cityRoads.find((r) => r.id === 'left-quay:3'),
        ) < 0.1,
    ),
  );
});
void test('Kvant is the fourteenth reachable stop with a clear forecourt and exit', () => {
  assert.equal(cityStops.length, 14);
  const stop = cityStops.find((s) => s.id === 'kvant');
  const building = cityBuildings.find((b) => b.kind === 'kvant');
  assert.ok(stop.z > building.z + building.d / 2);
  const route = cityNavigationRoute(cityStops[0], stop);
  assert.ok(route.length > 2);
  assert.equal(cityCarBlocked(stop.x, stop.z, 0), false);
  const arrival = cityTravelArrival(stop.id);
  assert.ok(arrival);
  for (let d = 0; d <= 25; d++)
    assert.equal(
      cityCarBlocked(
        arrival.x + Math.sin(arrival.heading) * d,
        arrival.z - Math.cos(arrival.heading) * d,
        arrival.heading,
      ),
      false,
    );
});
