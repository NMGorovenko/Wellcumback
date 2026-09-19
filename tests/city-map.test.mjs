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
  cityRoads,
  cityStops,
  cityBuildings,
  BRIDGES,
  inCityWater,
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
void test('geographic city has meaningful separation and correct banks, not a enlarged cluster of labels', () => {
  assert.ok(CITY_BOUNDS.maxX - CITY_BOUNDS.minX >= 8000);
  const at = (id) => cityStops.find((s) => s.id === id),
    b = (kind) => cityBuildings.find((b) => b.kind === kind);
  assert.ok(
    at('udachny').x < at('akadem').x && at('akadem').x < at('nikita').x,
  );
  assert.ok(at('nikita').x - at('udachny').x > 2300);
  assert.ok(Math.abs(b('planeta').x - b('komsomoll').x) < 120);
  assert.ok(b('komsomoll').z - b('planeta').z > 1300);
  assert.ok(b('kubatura').x > b('planeta').x + 650);
  assert.ok(
    b('kubatura').z > b('planeta').z && b('kubatura').z < b('komsomoll').z,
  );
  assert.equal(BRIDGES.length, 3);
  assert.ok(cityBuildings.length > 600);
  for (const s of cityStops)
    assert.equal(cityCarBlocked(s.x, s.z, 0), false, s.id);
});
void test('Studgorodok to Planeta takes 3–5 minutes at normal driving pace without hitting anything', (t) => {
  const s = freshCity();
  const elapsed = driveRoute(s, CITY_ROUTES.studPlaneta.slice(1), 20);
  t.diagnostic(`Normal-input Studgorodok→Planeta: ${elapsed.toFixed(1)} s`);
  assert.ok(
    elapsed >= 180 && elapsed <= 300,
    `actual simulated trip ${elapsed.toFixed(1)} s`,
  );
  assert.equal(s.bumps, 0);
  assert.ok(Math.hypot(s.x - 1100, s.z + 1760) < 2);
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
    cityBlocked(-3900, 1620),
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
    driveRoute(s, b.points.slice(1), 10);
    assert.equal(s.bumps, 0, b.id);
  }
});
void test('city geometry is batched and animated frames never allocate new graphics resources', () => {
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
          (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
      }
    });
    assert.ok(meshes < 100, `${meshes} render batches`);
    assert.ok(triangles < 1600000, `${triangles} triangles`);
    assert.ok(
      kit.geometries.size < 150,
      'source mesh geometry released after batching',
    );
    const before = [kit.geometries.size, kit.materials.size, kit.textures.size];
    for (let i = 0; i < 120; i++) city.update(i / 60, 0, -1, false);
    assert.deepEqual(
      [kit.geometries.size, kit.materials.size, kit.textures.size],
      before,
    );
    assert.ok(city.root.getObjectByName('landmark:komsomoll'));
  } finally {
    kit.dispose();
    globalThis.document = previous;
  }
});
void test('overview camera fits the whole expanded geography across wide and portrait viewports', () => {
  for (const aspect of [0.6, 1, 16 / 9, 3]) {
    const c = cityOverviewCamera(aspect);
    assert.ok(c.far > 10000);
    assert.ok(c.halfHeight > 2000);
    assert.ok(Number.isFinite(c.distance));
  }
  assert.ok(!cityCarBlocked(CITY_SPAWN.x, CITY_SPAWN.z, CITY_SPAWN.heading));
});
