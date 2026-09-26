import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { batchCity } from '../components/game/city/environment.ts';
import {
  cityLodRanges,
  createCityLod,
  orderCityLodGeometry,
} from '../components/game/city/lod.ts';
import { createNeighbourhoodBuilding } from '../components/game/city/neighbourhoods.ts';
import { createRightBankLandmark } from '../components/game/city/right-bank-landmarks.ts';
import { cityBuildings } from '../lib/game/city/layout.ts';

function activeBounds(geometry) {
  const bounds = new THREE.Box3(),
    p = new THREE.Vector3();
  const count = geometry.index?.count ?? geometry.attributes.position.count;
  const end = Math.min(
    count,
    geometry.drawRange.start + geometry.drawRange.count,
  );
  for (let i = geometry.drawRange.start; i < end; i++) {
    p.fromBufferAttribute(
      geometry.attributes.position,
      geometry.index?.getX(i) ?? i,
    );
    bounds.expandByPoint(p);
  }
  return bounds;
}

void test('LOD partitions every original triangle once without changing attributes or winding', () => {
  const geometry = new THREE.BoxGeometry(10, 20, 30);
  const index = Array.from(geometry.index.array),
    positions = geometry.attributes.position;
  const normal = geometry.attributes.normal,
    uv = geometry.attributes.uv;
  const counts = orderCityLodGeometry(geometry, [
    { start: 0, count: 12, tier: 'house-detail' },
    { start: 12, count: 12, tier: 'silhouette' },
    { start: 24, count: 12, tier: 'landmark-detail' },
  ]);
  assert.deepEqual(counts, { silhouette: 12, landmark: 24, full: 36 });
  assert.deepEqual(Array.from(geometry.index.array), [
    ...index.slice(12),
    ...index.slice(0, 12),
  ]);
  assert.equal(geometry.attributes.position, positions);
  assert.equal(geometry.attributes.normal, normal);
  assert.equal(geometry.attributes.uv, uv);
  geometry.dispose();
});

void test('near, mid and far share one indexed material batch, including alternating viewports', () => {
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  let released = false;
  try {
    const core = kit.box(40, 30, 30, '#b6c1c0', 100, 15, 100, root, 0);
    const landmark = kit.box(2, 1, 2, '#b6c1c0', 100, 4, 116, root, 0);
    landmark.userData.cityLodTier = 'landmark-detail';
    const house = kit.box(1, 1, 1, '#b6c1c0', 100, 8, 116, root, 0);
    house.userData.cityLodTier = 'house-detail';
    const coreBounds = new THREE.Box3().setFromObject(core);
    for (const _ of batchCity(kit, root)) {
      /* exhaust the loader's merge stage */
    }
    assert.equal(root.children.length, 1, 'tiers must not multiply draw calls');
    assert.equal(kit.geometries.size, 1, 'source geometry is released');
    const mesh = root.children[0],
      lod = createCityLod(root);
    assert.ok(mesh.geometry.index, 'shared vertices remain indexed');
    const resources = [
      kit.geometries.size,
      kit.materials.size,
      kit.textures.size,
    ];
    assert.equal(
      lod.update({ x: 100, z: 100 }, 'medium').selectedTriangles,
      36,
    );
    assert.equal(
      lod.update({ x: 500, z: 100 }, 'medium').selectedTriangles,
      24,
    );
    assert.equal(
      lod.update({ x: 1200, z: 100 }, 'medium').selectedTriangles,
      12,
    );
    assert.deepEqual(
      activeBounds(mesh.geometry),
      coreBounds,
      'far distance retains the whole body',
    );
    for (let frame = 0; frame < 120; frame++) {
      assert.equal(
        lod.update({ x: 100, z: 100 }, 'high').selectedTriangles,
        36,
      );
      assert.equal(
        lod.update({ x: 1200, z: 100 }, 'low').selectedTriangles,
        12,
      );
    }
    assert.deepEqual(
      [kit.geometries.size, kit.materials.size, kit.textures.size],
      resources,
    );
    lod.dispose();
    lod.dispose();
    assert.equal(mesh.geometry.drawRange.count, 108);
    assert.equal(mesh.visible, true);
    let disposed = 0;
    mesh.geometry.addEventListener('dispose', () => disposed++);
    kit.dispose();
    released = true;
    assert.equal(disposed, 1, 'RenderKit remains the only GPU resource owner');
  } finally {
    if (!released) kit.dispose();
  }
});

void test('orthographic overview uses projected detail size and a cell edge keeps nearby details', () => {
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  try {
    const body = kit.box(600, 30, 30, '#b6c1c0', 300, 15, 0, root, 0);
    const detail = kit.box(1, 1, 1, '#b6c1c0', 5, 8, 0, root, 0);
    detail.userData.cityLodTier = 'house-detail';
    for (const _ of batchCity(kit, root)) {
    }
    const lod = createCityLod(root);
    assert.equal(
      lod.update({ x: -1, z: 0 }, 'low').selectedTriangles,
      24,
      'nearest AABB extent avoids measuring a nearby building from the far cell centre',
    );
    assert.equal(
      lod.update({ x: 50000, z: 50000 }, 'medium', true, 0.1).selectedTriangles,
      24,
    );
    assert.equal(
      lod.update({ x: 0, z: 0 }, 'medium', true, 3).selectedTriangles,
      12,
    );
    assert.equal(lod.stats.largeBatches, 0);
    assert.equal(
      body.geometry.attributes.position.count,
      24,
      'source footprint was not simplified',
    );
    lod.dispose();
  } finally {
    kit.dispose();
  }
});

void test('ordinary houses lose small facade geometry while every body and roof remains', (t) => {
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  let homes = 0,
    originalTriangles = 0;
  try {
    for (const [i, b] of cityBuildings.entries()) {
      const group = new THREE.Group();
      if (!createNeighbourhoodBuilding(kit, group, b, i)) continue;
      const mesh = group.children[0],
        geometry = mesh.geometry;
      originalTriangles += geometry.index.count / 3;
      geometry.computeBoundingBox();
      const full = geometry.boundingBox.clone();
      const counts = orderCityLodGeometry(geometry, cityLodRanges(mesh)) ?? {
        silhouette: geometry.index.count,
      };
      assert.ok(
        counts.silhouette > 0,
        `${b.style} keeps a closed building body`,
      );
      geometry.setDrawRange(0, counts.silhouette);
      const far = activeBounds(geometry);
      assert.ok(
        full.max.y - far.max.y < 0.16,
        `${b.style} keeps roof/chimney height`,
      );
      assert.ok(far.min.y <= 0.001, `${b.style} still reaches its foundation`);
      assert.ok(
        full.max.x - full.min.x - (far.max.x - far.min.x) < 1,
        `${b.style} retains full-width building volumes`,
      );
      assert.ok(
        full.max.z - full.min.z - (far.max.z - far.min.z) < 1,
        `${b.style} retains full-depth building volumes`,
      );
      // The production merger needs the source ranges, rather than a preordered buffer.
      kit.geometries.delete(geometry);
      geometry.dispose();
      if (createNeighbourhoodBuilding(kit, root, b, i)) homes++;
    }
    for (const _ of batchCity(kit, root)) {
    }
    const lod = createCityLod(root);
    const far = { ...lod.update({ x: 50000, z: 50000 }, 'low') };
    assert.ok(homes > 300);
    assert.equal(
      far.fullTriangles,
      originalTriangles,
      'near geometry has no added fallback duplicates',
    );
    assert.ok(
      far.selectedTriangles < far.fullTriangles * 0.6,
      'ordinary houses simplify substantially',
    );
    assert.equal(
      far.selectedMeshes,
      far.fullMeshes,
      'no ordinary house batch disappears',
    );
    assert.ok(
      kit.geometries.size < 100,
      '320m housing cells remain spatially batched',
    );
    t.diagnostic(
      `${homes} homes: ${far.fullTriangles} → ${far.selectedTriangles} triangles in ${far.fullMeshes} batches`,
    );
    lod.dispose();
  } finally {
    kit.dispose();
  }
});

void test('the fighter, rocket and broad Zori facade batches keep their identifying geometry', () => {
  const kit = new RenderKit(new THREE.Scene());
  let protectedMeshes = 0;
  try {
    for (const b of cityBuildings.filter((b) =>
      ['aerokos', 'fighter', 'zori'].includes(b.kind),
    )) {
      const root = new THREE.Group();
      root.userData.cityLodBuilding = b.kind;
      createRightBankLandmark(kit, root, b);
      root.traverse((object) => {
        if (!object.isMesh) return;
        let rocket = false;
        for (let owner = object; owner; owner = owner.parent)
          rocket ||= owner.name === 'aerokos:cosmos-3m';
        if (
          b.kind === 'fighter' ||
          rocket ||
          object.name === 'rightbank:window-batch'
        ) {
          assert.ok(
            cityLodRanges(object).every((range) => range.tier === 'silhouette'),
            `${b.kind} ${object.name} remains identifiable from afar`,
          );
          protectedMeshes++;
        }
      });
    }
    assert.ok(protectedMeshes > 40);
  } finally {
    kit.dispose();
  }
});
