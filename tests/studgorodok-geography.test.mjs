import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIDGES,
  CITY_STUD_ROUNDABOUT,
  CITY_YENISEY_SIGN,
  cityBuildings,
  cityRoads,
  cityStops,
} from '../lib/game/city/layout.ts';
import { cityGroundHeight } from '../lib/game/city/surface.ts';

// Independent directional constraints from the 2GIS/Yandex source review in
// docs/studgorodok-geography-019.md. A shared translation remains valid;
// swapping the landmarks or flattening their street hierarchy does not.
void test('the campus is north of Orbita and southwest of the Kirenskogo–Baykitskaya ring', () => {
  const home = cityBuildings.find((b) => b.kind === 'borisova');
  const ikit = cityBuildings.find((b) => b.kind === 'ikit');
  const ring = CITY_STUD_ROUNDABOUT;
  const doner = cityBuildings.find((b) => b.kind === 'doner');
  assert.ok(ikit.z < home.z && ikit.x > home.x);
  assert.ok(ring.z < ikit.z && ring.x > ikit.x);
  assert.ok(doner.x > ring.x && doner.z > ring.z);
  assert.ok(
    Math.hypot(doner.x - ring.x, doner.z - ring.z) <
      Math.hypot(ikit.x - ring.x, ikit.z - ring.z),
    'Doner is beside the ring; IKIT sits farther south in the campus',
  );
});

void test('the separate Orbita towers form the southern frontage of the Borisova 30 courtyard', () => {
  const home = cityBuildings.find((b) => b.kind === 'borisova');
  const towers = cityBuildings
    .filter((b) => b.kind === 'orbita')
    .sort((a, b) => b.x - a.x);
  assert.equal(towers.length, 4);
  assert.ok(towers.every((tower) => tower.z > home.z));
  assert.ok(towers[0].x > home.x, 'Borisova 32 is southeast of the courtyard');
  assert.ok(towers[1].z > towers[0].z, 'Borisova 34 is southwest of 32');
  assert.ok(towers.at(-1).z < towers.at(-2).z, 'the western end turns north');
  assert.ok(towers[0].x - towers.at(-1).x > 60);
});

void test('the sign occupies the eastern cliff and Nikolaevsky crosses toward the south-southeast', () => {
  const home = cityBuildings.find((b) => b.kind === 'borisova');
  const bridge = BRIDGES.find((b) => b.id === 'nikolaevsky');
  const first = bridge.points[0],
    last = bridge.points.at(-1);
  assert.ok(CITY_YENISEY_SIGN.x > home.x);
  assert.ok(CITY_YENISEY_SIGN.z < home.z);
  assert.ok(CITY_YENISEY_SIGN.x < first.x);
  const bearing =
    (Math.atan2(last.x - first.x, first.z - last.z) * 180) / Math.PI;
  assert.ok(bearing > 150 && bearing < 175, `SSE bridge bearing: ${bearing}`);
  assert.ok(cityGroundHeight(home.x, home.z) > 35);
});

void test('Orbita arrival and the bridge entry belong to separate connected street nodes', () => {
  const arrival = cityStops.find((s) => s.id === 'nikita');
  const courtyard = cityRoads
    .filter((r) => r.id.startsWith('kirenskogo-south:'))
    .at(-1);
  const baykitskaya = cityRoads
    .filter((r) => r.id.startsWith('baykitskaya:'))
    .at(-1);
  const approach = cityRoads.find((r) => r.id === 'nikolaevsky-left:0');
  assert.equal(arrival.x, courtyard.to.x);
  assert.equal(arrival.z, courtyard.to.z);
  assert.deepEqual(baykitskaya.to, approach.from);
  assert.ok(
    Math.hypot(arrival.x - approach.from.x, arrival.z - approach.from.z) > 200,
  );
  assert.ok(approach.from.x > arrival.x && approach.from.z < arrival.z);
});
