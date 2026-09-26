import { assertCityViewBudgets } from './helpers/city-view-budgets.mjs';
import { citySurfacePose, cityRoadHeight } from '../lib/game/city/surface.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  freshCity,
  tickCity,
  cityCarBlocked,
  cityBlocked,
} from '../lib/game/city/engine.ts';
import {
  CITY_BOUNDS,
  CITY_ROUTES,
  CITY_SPAWN,
  CITY_ISLANDS,
  CITY_NEIGHBOURHOODS,
  CITY_COURTYARDS,
  distanceToRoad,
  cityRoads,
  cityStops,
  cityBuildings,
  BRIDGES,
  inCityWater,
  compactCityPoint,
  CITY_SCENERY_BOUNDS,
  ROUNDABOUT,
  CITY_PARKING,
} from '../lib/game/city/layout.ts';
import { cityOverviewCamera } from '../components/game/city/camera.ts';
import { createCityEnvironment } from '../components/game/city/environment.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
function driveRoute(s, points, speed = 20) {
  let i = 0;
  const start = s.elapsed;
  for (let f = 0; f < 600 * 60 && i < points.length; f++) {
    const p = points[i],
      dx = p.x - s.x,
      dz = p.z - s.z,
      d = Math.hypot(dx, dz);
    if (d < (i === points.length - 1 ? 1.3 : 3)) {
      i++;
      continue;
    }
    const a = wrap(Math.atan2(dx, -dz) - s.heading),
      forward = s.vx * Math.sin(s.heading) - s.vz * Math.cos(s.heading);
    const desired =
      Math.min(speed, Math.sqrt(7 * d)) * Math.max(0.16, Math.cos(a));
    tickCity(s, 1 / 60, new Set(), {
      throttle: clamp((desired - forward) * 0.35, -1, 1),
      steer: clamp(a * 2, -1, 1),
    });
    assert.equal(cityCarBlocked(s.x, s.z, s.heading), false);
  }
  assert.equal(i, points.length, `route stalled at ${i}: ${s.x},${s.z}`);
  return s.elapsed - start;
}
void test('geographic city has meaningful separation and correct banks, not a cluster of labels', () => {
  assert.ok(
    CITY_BOUNDS.maxX - CITY_BOUNDS.minX >= 4000 &&
      CITY_BOUNDS.maxX - CITY_BOUNDS.minX <= 4500,
  );
  const at = (id) => cityStops.find((s) => s.id === id),
    b = (kind) => cityBuildings.find((b) => b.kind === kind);
  assert.ok(
    at('udachny').x < at('akadem').x && at('akadem').x < at('nikita').x,
  );
  assert.ok(at('nikita').x - at('udachny').x > 1000);
  assert.ok(Math.abs(b('planeta').x - b('komsomoll').x) < 120);
  assert.ok(b('komsomoll').z - b('planeta').z > 650);
  assert.ok(b('kubatura').x > b('planeta').x + 300);
  assert.ok(
    b('kubatura').z > b('planeta').z && b('kubatura').z < b('komsomoll').z,
  );
  assert.equal(BRIDGES.length, 3);
  assert.ok(cityBuildings.length > 350);
  for (const s of cityStops)
    assert.equal(cityCarBlocked(s.x, s.z, 0), false, s.id);
});
void test('Studgorodok to Planeta takes 2–4 minutes at normal driving pace without hitting anything', (t) => {
  const s = freshCity();
  const elapsed = driveRoute(s, CITY_ROUTES.studPlaneta.slice(1), 20);
  t.diagnostic(`Normal-input Studgorodok→Planeta: ${elapsed.toFixed(1)} s`);
  assert.ok(
    elapsed >= 120 && elapsed <= 240,
    `actual simulated trip ${elapsed.toFixed(1)} s`,
  );
  assert.equal(s.bumps, 0);
  assert.ok(
    Math.hypot(
      s.x - CITY_ROUTES.studPlaneta.at(-1).x,
      s.z - CITY_ROUTES.studPlaneta.at(-1).z,
    ) < 2,
  );
});
void test('entire road surface is drivable, including angled bridges and island junctions', () => {
  for (const r of cityRoads) {
    const dx = r.to.x - r.from.x,
      dz = r.to.z - r.from.z,
      l = Math.hypot(dx, dz),
      h = Math.atan2(dx, -dz);
    for (let d = 7; d < l - 7; d += 8) {
      const x = r.from.x + (dx * d) / l,
        z = r.from.z + (dz * d) / l;
      assert.equal(
        cityCarBlocked(x, z, h),
        false,
        `${r.id} at ${x.toFixed(1)},${z.toFixed(1)}`,
      );
    }
  }
});
void test('both islands have physical dry land and road connections with entrances across their bridge rails', () => {
  for (const prefix of [
    'vinogradovsky',
    'tatyshev-loop',
    'tatyshev-exit',
    'otdyha-loop',
  ]) {
    const roads = cityRoads.filter((r) => r.id.startsWith(prefix));
    assert.ok(roads.length);
    for (const r of roads) {
      const s = {
        ...freshCity(),
        x: r.from.x,
        z: r.from.z,
        heading: Math.atan2(r.to.x - r.from.x, r.from.z - r.to.z),
      };
      Object.assign(
        s,
        citySurfacePose(
          s.x,
          s.z,
          s.heading,
          cityRoadHeight(r, s.x, s.z),
          `road:${r.id}`,
        ),
      );
      driveRoute(s, [r.to], 8);
      assert.equal(s.bumps, 0, r.id);
    }
  }
  for (const island of CITY_ISLANDS) {
    const contour = island.points.map((p) => new THREE.Vector2(p.x, p.z));
    for (const face of THREE.ShapeUtils.triangulateShape(contour, [])) {
      const x = face.reduce((s, i) => s + island.points[i].x, 0) / 3,
        z = face.reduce((s, i) => s + island.points[i].z, 0) / 3;
      assert.equal(inCityWater(x, z), false, island.id);
    }
  }
  assert.equal(
    cityBlocked(...Object.values(compactCityPoint({ x: -3900, z: 1620 }))),
    true,
    'river outside a bridge remains blocked',
  );
});
void test('bridge rails stop the car but every bridge has a complete road route', () => {
  for (const b of BRIDGES) {
    const p = b.points[0],
      next = b.points[1],
      s = {
        ...freshCity(),
        x: p.x,
        z: p.z,
        heading: Math.atan2(next.x - p.x, p.z - next.z),
      };
    const road = cityRoads.find((r) => r.bridge === b.id);
    Object.assign(
      s,
      citySurfacePose(
        s.x,
        s.z,
        s.heading,
        cityRoadHeight(road, s.x, s.z),
        `road:${road.id}`,
      ),
    );
    driveRoute(s, b.points.slice(1), 10);
    assert.equal(s.bumps, 0, b.id);
  }
});
void test('city geometry is batched and animated frames never allocate new graphics resources', (t) => {
  const previous = globalThis.document;
  const mockDocument = {
    createElement: () => ({
      width: 1024,
      height: 1024,
      getContext: () => new Proxy({}, { get: () => () => {} }),
    }),
  };
  Reflect.set(globalThis, 'document', mockDocument);
  const kit = new RenderKit(new THREE.Scene());
  try {
    const city = createCityEnvironment(kit);
    let meshes = 0,
      triangles = 0;
    city.root.traverse((o) => {
      if (o.isMesh) {
        meshes++;
        triangles +=
          ((o.geometry.index?.count ?? o.geometry.attributes.position.count) /
            3) *
          (o.isInstancedMesh ? o.count : 1);
      }
    });
    t.diagnostic(
      JSON.stringify({
        meshes,
        triangles,
        geometries: kit.geometries.size,
        materials: kit.materials.size,
      }),
    );
    assert.ok(meshes < 1600, `${meshes} render batches`);
    const spatial = new Map();
    city.root.traverse((o) => {
      if (!o.userData.citySpatialBatch) return;
      const box = new THREE.Box3().setFromObject(o);
      const entries = spatial.get(o.material) ?? [];
      entries.push(box);
      spatial.set(o.material, entries);
    });
    assert.ok(
      [...spatial.values()].some(
        (boxes) =>
          boxes.length > 6 &&
          boxes.every(
            (b) => b.max.x - b.min.x < 950 && b.max.z - b.min.z < 950,
          ) &&
          Math.max(...boxes.map((b) => b.max.x)) -
            Math.min(...boxes.map((b) => b.min.x)) >
            2000,
      ),
      'shared materials are split across distant districts, including baked props',
    );
    assert.ok(
      // Includes the drivable relief and tessellated street network, not only buildings.
      triangles < 2550000,
      `${triangles} triangles including instances`,
    );
    assert.ok(
      kit.geometries.size < 1600,
      'spatial batches stay bounded and source geometry is released',
    );
    const high = { ...city.lod.update(CITY_SPAWN, 'high') };
    const low = { ...city.lod.update(CITY_SPAWN, 'low') };
    const distant = { ...city.lod.update({ x: 50000, z: 50000 }, 'low') };
    assert.equal(
      high.fullMeshes,
      meshes,
      'LOD creates no extra render batches',
    );
    assert.equal(
      high.fullTriangles,
      triangles,
      'near LOD keeps the original topology',
    );
    assert.ok(low.selectedTriangles <= high.selectedTriangles);
    assert.ok(
      distant.selectedTriangles < triangles * 0.94,
      'far geometry meaningfully sheds detail',
    );
    assert.equal(
      distant.largeBatches,
      0,
      'no LOD group spans unrelated city districts',
    );
    t.diagnostic(
      JSON.stringify({
        lodHigh: high.selectedTriangles,
        lodLow: low.selectedTriangles,
        lodFar: distant.selectedTriangles,
        controlledMeshes: distant.controlledMeshes,
      }),
    );
    assertCityViewBudgets(city, t.diagnostic.bind(t));
    const before = [kit.geometries.size, kit.materials.size, kit.textures.size];
    for (let i = 0; i < 120; i++) city.update(i / 60, 0, -1, false);
    assert.deepEqual(
      [kit.geometries.size, kit.materials.size, kit.textures.size],
      before,
    );
    city.lod.dispose();
    assert.ok(city.root.getObjectByName('landmark:komsomoll'));
  } finally {
    kit.dispose();
    globalThis.document = previous;
  }
});
void test('overview camera fits the whole schematic geography across wide and portrait viewports', () => {
  for (const aspect of [0.6, 1, 16 / 9, 3]) {
    const c = cityOverviewCamera(aspect);
    assert.ok(
      c.far >
        Math.hypot(
          CITY_SCENERY_BOUNDS.maxX - CITY_SCENERY_BOUNDS.minX,
          CITY_SCENERY_BOUNDS.maxZ - CITY_SCENERY_BOUNDS.minZ,
        ),
    );
    assert.ok(c.halfHeight > 1000);
    assert.ok(Number.isFinite(c.distance));
  }
  assert.ok(!cityCarBlocked(CITY_SPAWN.x, CITY_SPAWN.z, CITY_SPAWN.heading));
});

void test('compact districts have deep residential blocks, varied heights and open green courtyards', () => {
  const homes = cityBuildings.filter(
    (b) => b.style && b.district !== 'connecting-streets',
  );
  const mainRoads = cityRoads.filter((r) => !r.id.startsWith('district-'));
  const interior = homes.filter((b) =>
    mainRoads.every((r) => distanceToRoad(b.x, b.z, r) > 60),
  );
  assert.ok(
    interior.length > homes.length * 0.5,
    'buildings occupy actual blocks beyond main-road frontage',
  );
  for (const district of CITY_NEIGHBOURHOODS) {
    const houses = homes.filter((b) => b.district === district.id);
    const coverage =
      houses.reduce((area, b) => area + b.w * b.d, 0) /
      (district.columns * district.rows * district.cell ** 2);
    assert.ok(
      coverage > (district.id === 'railway' ? 0.07 : 0.075), // commercial frontage replaces a few housing parcels
      `${district.id} is a developed compact neighbourhood (${coverage})`,
    );
    assert.ok(
      houses.length >= 10,
      `${district.id} must be more than one landmark`,
    );
    assert.ok(
      CITY_COURTYARDS.some((c) => c.district === district.id),
      `${district.id} keeps courtyard greenery`,
    );
    for (const b of houses) {
      const floors = b.floors;
      assert.ok(Number.isInteger(floors));
      assert.ok(
        b.h / floors >= 2.6 && b.h / floors <= 2.81,
        'windows represent a consistent physical storey',
      );
      if (district.id === 'centre') assert.ok(floors >= 2 && floors <= 5);
      if (district.id === 'udachny') assert.ok(floors >= 1 && floors <= 3);
      if (district.id !== 'vzletka')
        assert.ok(floors <= 9, 'towers do not spread into every district');
      if (b.style === 'tower') assert.ok(floors >= 14 && floors <= 25);
    }
  }
  assert.ok(
    homes.some((b) => b.orientation === 'north-south' && b.d / b.w > 3),
    'crosswise slabs enclose courtyards',
  );
  assert.ok(
    homes.some((b) => !b.orientation && b.w / b.d > 3),
    'long slab frontages differ from point towers',
  );
  for (const court of CITY_COURTYARDS) {
    assert.equal(inCityWater(court.x, court.z), false);
    assert.ok(
      cityBuildings.every(
        (b) =>
          Math.abs(b.x - court.x) >= (b.w + court.w) / 2 ||
          Math.abs(b.z - court.z) >= (b.d + court.d) / 2,
      ),
      'courtyard stays outside building parcels',
    );
    assert.ok(
      cityRoads.every(
        (r) =>
          distanceToRoad(court.x, court.z, r) >
          r.width / 2 + Math.min(court.w, court.d) / 2,
      ),
      'courtyard never fills a road',
    );
  }
});

void test('compact bridge spans take about 10–15 seconds at normal pace while lanes and ring retain full size', () => {
  for (const bridge of BRIDGES) {
    assert.ok(bridge.d >= 190 && bridge.d <= 300, `${bridge.id}: ${bridge.d}m`);
    assert.equal(bridge.w, 22);
    assert.ok(bridge.d / 20 >= 9.5 && bridge.d / 20 <= 15);
  }
  const ring = cityRoads.filter((r) => r.id.startsWith('predmostnaya-ring:'));
  assert.equal(ring.length, 32);
  for (const r of ring) {
    assert.equal(r.width, 16);
    assert.ok(
      Math.abs(
        Math.hypot(r.from.x - ROUNDABOUT.x, r.from.z - ROUNDABOUT.z) - 37,
      ) < 1e-8,
    );
  }
  for (const lot of CITY_PARKING.filter((p) =>
    ['kvant', 'komsomoll', 'kubatura', 'planeta'].includes(p.id),
  )) {
    const mall = cityBuildings.find((b) => b.kind === lot.id);
    assert.ok(
      lot.z - lot.d / 2 > mall.z + mall.d / 2,
      `${lot.id} keeps its open front forecourt`,
    );
    assert.ok(lot.w >= mall.w);
    assert.equal(cityCarBlocked(lot.x, lot.z, 0), false);
  }
});
