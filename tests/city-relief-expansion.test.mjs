import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CITY_BOBROVY_LOG,
  cityStops,
  cityBuildings,
  cityRoads,
  riverBankZ,
} from '../lib/game/city/layout.ts';
import { cityGroundHeight, cityRoadHeight } from '../lib/game/city/surface.ts';
import { cityNavigationRoute } from '../lib/game/city/navigation.ts';
import { currentCityStreet } from '../lib/game/city/street-names.ts';
import {
  freshCity,
  teleportCityCar,
  cityCarBlocked,
} from '../lib/game/city/engine.ts';
import {
  terrainTiles,
  drapedGeometry,
} from '../components/game/city/relief.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { loadCityEnvironment } from '../components/game/city/environment.ts';

void test('Studgorodok crest, northern terrace and south-bank ski slopes remain distinct from the low river and centre', () => {
  const home = cityBuildings.find((b) => b.kind === 'borisova');
  assert.ok(cityGroundHeight(home.x, home.z) > 40);
  assert.ok(
    cityGroundHeight(-880, 400) >
      cityGroundHeight(-880, riverBankZ(-880, -1) - 0.1) + 40,
  );
  assert.ok(cityGroundHeight(-60, -1470) > cityGroundHeight(-60, -150) + 20);
  const { base, summit } = CITY_BOBROVY_LOG;
  assert.ok(base.z > riverBankZ(base.x, 1));
  assert.ok(
    cityGroundHeight(summit.x, summit.z) >
      cityGroundHeight(base.x, base.z) + 70,
  );
});
void test('Bobrovy Log is appended without changing existing destination indexes, with a reachable clear arrival', () => {
  assert.equal(cityStops[13].id, 'kvant');
  assert.equal(cityStops[14].id, 'bobrovy-log');
  const destination = cityStops.at(-1),
    car = freshCity();
  assert.ok(cityNavigationRoute(cityStops[0], destination).length > 4);
  assert.ok(teleportCityCar(car, destination.id));
  assert.equal(cityCarBlocked(car.x, car.z, car.heading), false);
});
void test('street name distinguishes the deck from Dubrovinskogo underneath it', () => {
  const lower = cityRoads.find((r) => r.id === 'left-quay:3');
  let upper, point;
  for (const road of cityRoads.filter((r) => r.bridge === 'nikolaevsky')) {
    const ax = lower.to.x - lower.from.x,
      az = lower.to.z - lower.from.z,
      bx = road.to.x - road.from.x,
      bz = road.to.z - road.from.z,
      dx = road.from.x - lower.from.x,
      dz = road.from.z - lower.from.z,
      determinant = ax * bz - az * bx;
    const t = (dx * bz - dz * bx) / determinant,
      u = (dx * az - dz * ax) / determinant;
    if (!(t > 0 && t < 1 && u > 0 && u < 1)) continue;
    upper = road;
    point = { x: lower.from.x + t * ax, z: lower.from.z + t * az };
    break;
  }
  assert.ok(upper && point, 'the bridge and lower quay physically cross');
  assert.ok(
    cityRoadHeight(upper, point.x, point.z) -
      cityRoadHeight(lower, point.x, point.z) >
      8,
    'street names are checked on two separate levels',
  );
  assert.equal(
    currentCityStreet({
      ...point,
      elevation: cityRoadHeight(upper, point.x, point.z),
    }),
    'Николаевский проспект',
  );
  assert.equal(
    currentCityStreet({
      ...point,
      elevation: cityRoadHeight(lower, point.x, point.z),
    }),
    'Дубровинского',
  );
});
void test('spatial terrain tiles preserve shared-edge heights and can be independently culled', () => {
  const polygon = [
    { x: -300, z: -100 },
    { x: 600, z: -100 },
    { x: 600, z: 500 },
    { x: -300, z: 500 },
  ];
  const seen = new Map();
  let shared = 0;
  const tiles = [...terrainTiles([polygon])];
  assert.ok(tiles.length > 8);
  for (const polygons of tiles) {
    const g = drapedGeometry(
      polygons,
      (x, z) => Math.sin(x / 100) * 20 + z / 20,
      0,
      8,
    );
    const bounds = g.boundingBox;
    assert.ok(bounds.max.x - bounds.min.x <= 240.001);
    assert.ok(bounds.max.z - bounds.min.z <= 240.001);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i)},${p.getZ(i)}`,
        previous = seen.get(key);
      if (previous !== undefined) {
        assert.equal(previous, p.getY(i));
        shared++;
      } else seen.set(key, p.getY(i));
    }
    g.dispose();
  }
  assert.ok(shared > 100);
});
void test('loading can be cancelled after its first visible stage without constructing a city', async () => {
  const kit = new RenderKit(new THREE.Scene()),
    abort = new AbortController();
  const stages = [];
  await assert.rejects(
    loadCityEnvironment(kit, abort.signal, (p) => {
      stages.push(p);
      abort.abort();
    }),
    { name: 'AbortError' },
  );
  assert.equal(stages.length, 1);
  assert.equal(kit.geometries.size, 0);
  kit.dispose();
});
