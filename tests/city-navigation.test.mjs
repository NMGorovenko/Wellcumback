import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cityStops,
  CITY_PARKING,
  cityRoads,
  distanceToRoad,
} from '../lib/game/city/layout.ts';
import {
  cityTravelArrival,
  teleportCityCar,
  cityCarBlocked,
  freshCity,
  tickCity,
} from '../lib/game/city/engine.ts';
import {
  cityNavigationRoute,
  cityRouteLength,
  fullCityMapView,
  minimapTarget,
  zoomCityMap,
} from '../lib/game/city/navigation.ts';
import { presentedVehicle } from '../lib/game/city/vehicle-presentation.ts';

void test('GPS reaches every destination along connected roads, including both island crossings', () => {
  const start = cityStops[0];
  for (const target of cityStops.slice(1)) {
    const route = cityNavigationRoute(start, target);
    assert.ok(route.length > 1, target.id);
    assert.deepEqual(route[0], start);
    assert.deepEqual([route.at(-1).x, route.at(-1).z], [target.x, target.z]);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1],
        b = route[i];
      const length = Math.hypot(a.x - b.x, a.z - b.z);
      for (let d = 0; d < length; d += 12) {
        const x = a.x + ((b.x - a.x) * d) / length,
          z = a.z + ((b.z - a.z) * d) / length;
        assert.ok(
          cityRoads.some((r) => distanceToRoad(x, z, r) < r.width / 2 + 1) ||
            CITY_PARKING.some(
              (p) =>
                Math.abs(x - p.x) <= p.w / 2 + 1 &&
                Math.abs(z - p.z) <= p.d / 2 + 1,
            ),
          `${target.id}: route cuts across ${x},${z}`,
        );
      }
    }
  }
  const route = cityNavigationRoute(
    start,
    cityStops.find((s) => s.id === 'planeta'),
  );
  assert.ok(cityRouteLength(route) > 2200 && cityRouteLength(route) < 2800);
});
void test('fast travel resolves every place to a clear road and erases motion without resetting progress', () => {
  for (const stop of cityStops) {
    const s = freshCity();
    Object.assign(s, {
      elapsed: 500,
      bumps: 7,
      driftDistance: 123,
      players: 3,
      vx: 14,
      vz: 5,
      speed: 15,
      drifting: true,
      driftBlend: 1,
      steering: 0.8,
      throttle: 1,
      accumulator: 0.015,
      previousAction: true,
      previousHorn: true,
      interaction: 'screen',
      bumpCooldown: 1.2,
    });
    s.conversation.bridge = 'kommunalny';
    const seed = s.conversation.seed;
    assert.equal(teleportCityCar(s, stop.id), true);
    assert.equal(cityCarBlocked(s.x, s.z, s.heading), false, stop.id);
    assert.ok(
      cityRoads.some((r) => distanceToRoad(s.x, s.z, r) < 0.1) ||
        CITY_PARKING.some(
          (p) =>
            Math.abs(s.x - p.x) <= p.w / 2 && Math.abs(s.z - p.z) <= p.d / 2,
        ),
    );
    assert.ok(Math.hypot(s.x - stop.x, s.z - stop.z) < 100, stop.id);
    assert.deepEqual(
      [
        s.vx,
        s.vz,
        s.speed,
        s.throttle,
        s.driftBlend,
        s.steering,
        s.accumulator,
        s.bumpCooldown,
      ],
      Array(8).fill(0),
    );
    assert.equal(s.previousAction, false);
    assert.equal(s.previousHorn, false);
    assert.equal(s.drifting, false);
    assert.equal(s.interaction, null);
    assert.equal(s.conversation.bridge, null);
    assert.equal(s.conversation.seed, seed);
    assert.deepEqual(
      [s.elapsed, s.bumps, s.driftDistance, s.players],
      [500, 7, 123, 3],
    );
    const pose = presentedVehicle(s).car;
    assert.equal(pose.x, s.x);
    assert.equal(pose.z, s.z);
    const at = { x: s.x, z: s.z };
    tickCity(s, 1 / 60, new Set());
    assert.equal(s.x, at.x);
    assert.equal(s.z, at.z);
  }
  const s = freshCity(),
    before = structuredClone(s);
  assert.equal(cityTravelArrival('__proto__'), null);
  assert.equal(teleportCityCar(s, 'unknown-place'), false);
  assert.deepEqual(s, before);
});
void test('arrivals face a clear 25 metre exit; Planeta faces south down 9 Maya, away from the mall', () => {
  for (const stop of cityStops) {
    const arrival = cityTravelArrival(stop.id);
    assert.ok(arrival, stop.id);
    for (let distance = 0; distance <= 25; distance += 0.5)
      assert.equal(
        cityCarBlocked(
          arrival.x + Math.sin(arrival.heading) * distance,
          arrival.z - Math.cos(arrival.heading) * distance,
          arrival.heading,
        ),
        false,
        `${stop.id}: obstructed ${distance} metres after arrival`,
      );
  }
  const planeta = cityTravelArrival('planeta');
  assert.ok(
    Math.cos(planeta.heading) < -0.99,
    'exit is south, not into the northern mall facade',
  );
  assert.ok(
    Math.abs(Math.sin(planeta.heading)) < 0.01,
    'car is aligned with 9 Maya',
  );
});
void test('minimap keeps distant destinations on its edge and zoom remains anchored under the cursor', () => {
  const car = { x: -1500, z: 790 };
  for (const stop of cityStops) {
    const indicator = minimapTarget(car, stop);
    assert.ok(Math.abs(indicator.x - car.x) <= 302);
    assert.ok(Math.abs(indicator.z - car.z) <= 197);
  }
  assert.equal(minimapTarget(car, { x: -1480, z: 800 }).offscreen, false);
  assert.equal(
    minimapTarget(
      car,
      cityStops.find((s) => s.id === 'planeta'),
    ).offscreen,
    true,
  );
  const view = fullCityMapView(),
    anchor = { x: 400, z: -300 };
  const next = zoomCityMap(view, 0.5, anchor);
  assert.equal(
    (anchor.x - view.x) / view.width,
    (anchor.x - next.x) / next.width,
  );
  assert.equal(
    (anchor.z - view.z) / view.width,
    (anchor.z - next.z) / next.width,
  );
  assert.ok(zoomCityMap(view, 0).width >= 400);
});

void test('arriving at a stop clears the GPS line and parking departures never detour around the road graph', () => {
  for (const stop of cityStops) {
    const arrival = cityTravelArrival(stop.id);
    const route = cityNavigationRoute(arrival, stop);
    if (Math.hypot(arrival.x - stop.x, arrival.z - stop.z) < 2.8) {
      assert.equal(route.length, 1, stop.id);
      assert.equal(cityRouteLength(route), 0, stop.id);
    }
  }
  for (const id of ['kubatura', 'komsomoll']) {
    const stop = cityStops.find((s) => s.id === id),
      arrival = cityTravelArrival(id);
    for (const metres of [0, 1, 2.7, 3, 5, 12, 25]) {
      const start = {
        x: arrival.x + Math.sin(arrival.heading) * metres,
        z: arrival.z - Math.cos(arrival.heading) * metres,
      };
      const route = cityNavigationRoute(start, stop);
      assert.ok(
        cityRouteLength(route) <= metres + 0.01,
        `${id} ${metres}m must not make a GPS loop`,
      );
      assert.deepEqual(
        route[0],
        start,
        'route starts at the real car position',
      );
    }
    // Reproduce the former 25m/full-map and 35m/minimap grid points too.
    for (const cell of [25, 35]) {
      const start = {
        x: Math.round(arrival.x / cell) * cell,
        z: Math.round(arrival.z / cell) * cell,
      };
      const route = cityNavigationRoute(start, stop);
      assert.ok(
        cityRouteLength(route) <=
          Math.hypot(start.x - stop.x, start.z - stop.z) + 0.01,
      );
    }
  }
});
void test('moving origins follow the cached destination graph without snapping the first point', () => {
  const target = cityStops.find((s) => s.id === 'planeta');
  const start = cityStops.find((s) => s.id === 'nikita');
  const first = cityRouteLength(cityNavigationRoute(start, target));
  for (let i = 1; i <= 20; i++) {
    const moving = { x: start.x + i * 0.1, z: start.z - i * 0.15 };
    const route = cityNavigationRoute(moving, target);
    assert.deepEqual(route[0], moving);
    assert.ok(Math.abs(cityRouteLength(route) - first) < 10);
  }
});
