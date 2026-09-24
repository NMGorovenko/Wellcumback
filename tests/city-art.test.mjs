import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createCityArt } from '../components/game/city/city-art.ts';
import {
  CITY_ART_PARCELS,
  CITY_MURALS,
  METRO_CONSTRUCTION,
} from '../lib/game/city/city-art.ts';
import { cityRoads, inCityWater } from '../lib/game/city/layout.ts';
import { cityGroundHeight } from '../lib/game/city/surface.ts';

function roadGap(p, r) {
  const a = { x: r.from.x - p.x, z: r.from.z - p.z };
  const b = { x: r.to.x - p.x, z: r.to.z - p.z };
  const w = p.w / 2,
    d = p.d / 2;
  let lo = 0,
    hi = 1;
  for (const [origin, delta, half] of [
    [a.x, b.x - a.x, w],
    [a.z, b.z - a.z, d],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(origin) > half) {
        lo = 2;
        break;
      }
    } else {
      const first = (-half - origin) / delta,
        last = (half - origin) / delta;
      lo = Math.max(lo, Math.min(first, last));
      hi = Math.min(hi, Math.max(first, last));
    }
  }
  if (lo <= hi) return -r.width / 2;
  let distance = Math.min(
    ...[a, b].map((v) =>
      Math.hypot(
        Math.max(0, Math.abs(v.x) - w),
        Math.max(0, Math.abs(v.z) - d),
      ),
    ),
  );
  const dx = b.x - a.x,
    dz = b.z - a.z;
  for (const x of [-w, w])
    for (const z of [-d, d]) {
      const t = Math.max(
        0,
        Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)),
      );
      distance = Math.min(
        distance,
        Math.hypot(x - a.x - t * dx, z - a.z - t * dz),
      );
    }
  return distance - r.width / 2;
}

void test('addressed mural hosts and the City Hall construction keep clear of roads and water', () => {
  for (const p of CITY_ART_PARCELS) {
    for (const r of cityRoads)
      assert.ok(roadGap(p, r) > 3, `${p.id} / ${r.id}`);
    for (let i = 0; i <= 10; i++)
      for (let j = 0; j <= 10; j++)
        assert.equal(
          inCityWater(p.x + (i / 10 - 0.5) * p.w, p.z + (j / 10 - 0.5) * p.d),
          false,
          p.id,
        );
  }
  const bear = CITY_MURALS.find((p) => p.subject === 'stolby');
  assert.ok(
    bear.z > 400,
    'Karamzina host belongs on the landward side of the right-bank road',
  );
  assert.ok(
    METRO_CONSTRUCTION.x > 180 && METRO_CONSTRUCTION.z < 70,
    'the remembered heap is by City Hall / Karl Marx, away from Revolution Square',
  );
});

void test('city art is terrain anchored, fits its reserved parcels and stays below 4000 triangles', () => {
  const scene = new THREE.Scene(),
    kit = new RenderKit(scene),
    parent = new THREE.Group();
  scene.add(parent);
  const group = createCityArt(kit, parent);
  scene.updateMatrixWorld(true);
  try {
    let triangles = 0;
    group.traverse((o) => {
      if (o.isMesh)
        triangles +=
          (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    });
    assert.ok(triangles < 4000, `${triangles} triangles`);
    for (const p of CITY_ART_PARCELS) {
      const landmark = group.getObjectByName(p.id);
      assert.ok(landmark, p.id);
      const bounds = new THREE.Box3().setFromObject(landmark),
        ground = cityGroundHeight(p.x, p.z);
      assert.ok(Math.abs(bounds.min.y - ground) < 0.01, p.id);
      assert.ok(
        bounds.min.x >= p.x - p.w / 2 - 0.2 &&
          bounds.max.x <= p.x + p.w / 2 + 0.2,
        p.id,
      );
      assert.ok(
        bounds.min.z >= p.z - p.d / 2 - 0.2 &&
          bounds.max.z <= p.z + p.d / 2 + 0.3,
        p.id,
      );
      assert.ok(bounds.max.y <= ground + p.h + 0.4, p.id);
    }
    for (const spec of CITY_MURALS)
      assert.ok(group.getObjectByName(`${spec.id}:art`));
    const heap = group.getObjectByName('metro-cityhall:spoil-heap');
    const bounds = new THREE.Box3().setFromObject(heap);
    assert.ok(
      bounds.max.y - bounds.min.y >= 10,
      'the remembered spoil heap must remain several storeys high',
    );
  } finally {
    kit.dispose();
  }
});
