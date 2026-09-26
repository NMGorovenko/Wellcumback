import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cityBuildings,
  cityRoads,
  cityStops,
  distanceToRoad,
  inCityWater,
} from '../lib/game/city/layout.ts';
import { cityGroundHeight, citySurfacePose } from '../lib/game/city/surface.ts';
import {
  cityCarBlocked,
  freshCity,
  stepCityCar,
} from '../lib/game/city/engine.ts';

void test('Dubrovinskogo connects continuously to Kvant, NEO and the market', () => {
  const road = cityRoads.filter((r) =>
    r.id.startsWith('dubrovinskogo-market:'),
  );
  assert.equal(road.length, 3);
  assert.ok(
    cityRoads.some(
      (r) =>
        r.id.startsWith('left-quay:') &&
        distanceToRoad(road[0].from.x, road[0].from.z, r) < 0.01,
    ),
  );
  assert.deepEqual(
    road.at(-1).to,
    cityRoads.find((r) => r.id === 'neo-market-access:0').from,
  );
  const route = [
    ...road,
    ...cityRoads.filter((r) => r.id.startsWith('neo-market-access:')),
  ];
  for (const segment of route) {
    const { x, z } = segment.from,
      heading = Math.atan2(segment.to.x - x, z - segment.to.z);
    const car = {
      ...freshCity(),
      x,
      z,
      heading,
      ...citySurfacePose(x, z, heading),
    };
    const length = Math.hypot(segment.to.x - x, segment.to.z - z);
    for (let t = 0; t < length / 8; t += 1 / 60) {
      stepCityCar(
        car,
        {
          throttle: Math.max(-1, Math.min(1, (8 - car.speed) * 0.3)),
          steer: 0,
          handbrake: false,
        },
        1 / 60,
      );
      assert.equal(car.flight.airborne, false, segment.id);
      assert.equal(cityCarBlocked(car.x, car.z, heading), false, segment.id);
    }
    assert.ok(
      Math.hypot(car.x - x, car.z - z) > length * 0.55,
      'vehicle actually drives the segment',
    );
  }
});
void test('commercial landmarks have dry footprints, separate parking and reachable gentle approaches', () => {
  const b = (kind) => cityBuildings.find((b) => b.kind === kind);
  assert.ok(b('ttx').x < b('mixmax').x && b('mixmax').x < b('na-svobodnom').x);
  assert.equal(b('ttx').z, b('mixmax').z);
  const road = cityRoads.find((r) => r.id === 'vysotnaya:2');
  assert.ok(b('ttx').x + b('ttx').w / 2 < road.from.x - road.width / 2);
  assert.ok(b('mixmax').x - b('mixmax').w / 2 > road.from.x + road.width / 2);
  for (const kind of ['ttx', 'mixmax', 'na-svobodnom']) {
    const p = b(kind),
      stop = cityStops.find((s) => s.id === kind);
    for (const dx of [-1, 0, 1])
      for (const dz of [-1, 0, 1])
        assert.equal(
          inCityWater(p.x + (dx * p.w) / 2, p.z + (dz * p.d) / 2),
          false,
          kind,
        );
    assert.equal(cityCarBlocked(stop.x, stop.z, 0), false, kind);
  }
  for (const r of cityRoads.filter((r) =>
    /^(vysotnaya|televizornaya|svobodny-mall-access|mixmax-forecourt|ttx-forecourt):/.test(
      r.id,
    ),
  )) {
    const length = Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z),
      n = Math.ceil(length);
    let prev = cityGroundHeight(r.from.x, r.from.z);
    for (let i = 1; i <= n; i++) {
      const t = i / n,
        x = r.from.x + (r.to.x - r.from.x) * t,
        z = r.from.z + (r.to.z - r.from.z) * t,
        y = cityGroundHeight(x, z);
      assert.ok(
        Math.abs(y - prev) / (length / n) < 0.4,
        `${r.id}: no cliff at ${x},${z}`,
      );
      prev = y;
    }
  }
});
