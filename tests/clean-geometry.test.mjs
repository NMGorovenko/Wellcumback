import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import {
  createWasher,
  createShower,
  createToilet,
  createTraceField,
  createTrouserLeak,
  floorWorld,
} from '../components/game/clean/props-v3.ts';
import { createRig } from '../components/game/world/rig.ts';
import {
  mapSize,
  bounds,
  stations,
  furniture,
  MAP_UNITS_PER_METRE,
} from '../lib/game/clean/layout.ts';
const washer = furniture.find((item) => item.kind === 'washer');
const toiletFixture = furniture.find((item) => item.kind === 'toilet');
const person = {
  id: 'roma',
  skin: '#d7ac91',
  hair: '#938473',
  color: '#637466',
  uniform: true,
  hairstyle: 'buzz',
};
const kit = () => new RenderKit(new THREE.Scene());

void test('map coordinates have exact common engine anchors', () => {
  assert.deepEqual(
    floorWorld(mapSize.width / 2, mapSize.height / 2).toArray(),
    [0, 0, 0],
  );
  assert.deepEqual(floorWorld(bounds.minX, bounds.maxY).toArray(), [
    (bounds.minX - mapSize.width / 2) / MAP_UNITS_PER_METRE,
    0,
    (bounds.maxY - mapSize.height / 2) / MAP_UNITS_PER_METRE,
  ]);
});
void test('washer opens towards the playable approach; trousers live inside visible drum', () => {
  const k = kit(),
    w = createWasher(
      k,
      floorWorld(washer.x + washer.w / 2, washer.y + washer.h / 2),
    );
  w.root.rotation.y = 0;
  w.root.scale.set(
    washer.w / MAP_UNITS_PER_METRE / 1.1,
    1,
    washer.h / MAP_UNITS_PER_METRE / 0.8,
  );
  w.root.updateWorldMatrix(true, true);
  const pantsBox = new THREE.Box3().setFromObject(w.pants.root),
    door = w.hinge.getWorldPosition(new THREE.Vector3());
  assert.ok(pantsBox.max.y < 1.0 && pantsBox.min.y > 0.15);
  assert.ok(
    pantsBox.max.z < door.z + 0.06,
    'garment does not sit in front of glass',
  );
  const camera = new THREE.Vector3(
    w.root.position.x,
    0.555,
    w.root.position.z + 2,
  );
  const ray = new THREE.Raycaster(camera, new THREE.Vector3(0, 0, -1));
  const hits = ray
    .intersectObjects(w.root.children, true)
    .filter((hit) => !hit.object.material.transparent);
  assert.ok(hits.length > 0);
  assert.ok(
    hits[0].point.z > w.root.position.z + 0.28,
    'open center shows garment rather than rear wall',
  );
  w.hinge.rotation.y = -1.75;
  w.root.updateWorldMatrix(true, true);
  assert.ok(Math.abs(w.hinge.rotation.y) > 1.5);
  k.dispose();
});
void test('laundry interaction hands reach door from grounded stance', () => {
  const k = kit(),
    w = createWasher(
      k,
      floorWorld(washer.x + washer.w / 2, washer.y + washer.h / 2),
    );
  w.root.rotation.y = 0;
  w.root.scale.set(
    washer.w / MAP_UNITS_PER_METRE / 1.1,
    1,
    washer.h / MAP_UNITS_PER_METRE / 0.8,
  );
  w.root.updateWorldMatrix(true, true);
  const target = w.root.localToWorld(new THREE.Vector3(0, 0.555, 0.49));
  target.z += 0.12;
  const r = createRig(k, person, k.scene, { anonymous: true });
  r.root.position.copy(w.root.position).add(new THREE.Vector3(0, 0, 0.74));
  r.root.rotation.y = Math.PI;
  r.update(0, 'carry');
  r.setCrouch(0.36);
  assert.ok(r.reach('left', target) < 0.025);
  target.x += 0.1;
  assert.ok(r.reach('right', target) < 0.025);
  assert.equal(r.root.position.y, 0);
  k.dispose();
});
void test('canonical stains, footprints and cleanup progress use one bounded instance pool', () => {
  const k = kit(),
    field = createTraceField(k, 4);
  const geometryCount = k.geometries.size,
    materialCount = k.materials.size;
  const spots = [
    { x: 170, y: 670, size: 12, progress: 0, kind: 'spill' },
    { x: 190, y: 645, size: 8, progress: 0, kind: 'footprint' },
    { x: 1040, y: 715, size: 24, progress: 0, kind: 'foam' },
  ];
  field.update(spots, 0);
  assert.equal(field.mesh.count, 10);
  for (let i = 0; i < 200; i++) field.update(spots, i / 60);
  assert.equal(k.geometries.size, geometryCount);
  assert.equal(k.materials.size, materialCount);
  spots[0].progress = 1;
  field.update(spots, 1);
  assert.equal(field.mesh.count, 6);
  field.update(
    Array.from({ length: 80 }, (_, i) => ({
      x: 170 + i,
      y: 650,
      size: 8,
      progress: 0,
      kind: 'footprint',
    })),
    2,
  );
  assert.equal(
    field.mesh.count,
    160,
    'long detours never create invisible cleanup targets',
  );
  k.dispose();
});
void test('visible trouser leak and shower water stop without new meshes', () => {
  const k = kit(),
    parent = new THREE.Group();
  k.scene.add(parent);
  const leak = createTrouserLeak(k, parent),
    shower = createShower(k, floorWorld(stations[2].x, stations[2].y)),
    toilet = createToilet(
      k,
      floorWorld(
        toiletFixture.x + toiletFixture.w / 2,
        toiletFixture.y + toiletFixture.h / 2,
      ),
    );
  leak.update(2, true, true);
  assert.ok(leak.root.visible);
  assert.ok(
    leak.root.children
      .slice(0, 10)
      .every(
        (c) => c.visible && c.position.y <= 0.325 && c.position.y >= 0.025,
      ),
  );
  leak.update(3, false, false);
  assert.equal(leak.root.visible, false);
  shower.update(2, true);
  assert.ok(shower.water.visible);
  shower.update(3, false);
  assert.equal(shower.water.visible, false);
  assert.ok(toilet.door.geometry.parameters.height > 1);
  k.dispose();
});

void test('entire room builds with batched scenery and independent interactive props', async () => {
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      createElement: () => ({
        width: 512,
        height: 96,
        getContext: () => new Proxy({}, { get: () => () => {} }),
      }),
    },
  });
  const { createBarracks } =
    await import('../components/game/clean/environment-v3.ts');
  const k = kit(),
    room = createBarracks(k);
  let batches = 0,
    meshes = 0;
  k.scene.traverse((o) => {
    if (o.isMesh) meshes++;
    if (o.name === 'barracks-static-fixtures') batches++;
  });
  assert.ok(batches > 10);
  assert.ok(
    meshes < 360,
    `scene mesh count ${meshes} should remain bounded after batching`,
  );
  assert.equal(room.washer.drum.parent, room.washer.root);
  assert.equal(room.toilet.privacy.parent, room.toilet.root);
  room.washer.hinge.rotation.y = -1.7;
  room.gear.doors[0].rotation.y = -1.4;
  room.shower.update(1, true);
  assert.ok(room.washer.root.parent === k.scene);
  assert.ok(room.markers.every((m) => m.parent === k.scene));
  k.dispose();
  globalThis.document = previousDocument;
});
