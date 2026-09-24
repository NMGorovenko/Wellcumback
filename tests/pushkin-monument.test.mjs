import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cityBuildings,
  cityRoads,
  distanceToRoad,
} from '../lib/game/city/layout.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createPushkinMonument } from '../components/game/city/pushkin-monument.ts';
import { createCentreLandmark } from '../components/game/city/centre-landmarks.ts';

function model(t) {
  const b = cityBuildings.find(
    (building) => building.kind === 'pushkin-monument',
  );
  assert.ok(
    b,
    'the monument is registered independently from the drama theatre',
  );
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  t.after(() => kit.dispose());
  assert.equal(createPushkinMonument(kit, root, b), true);
  root.updateMatrixWorld(true);
  return { b, kit, root };
}

void test('the Pushkin rotunda fits its road-clear parcel west of the drama theatre', (t) => {
  const { b, root } = model(t),
    bounds = new THREE.Box3().setFromObject(root);
  assert.ok(bounds.min.x >= b.x - b.w / 2 && bounds.max.x <= b.x + b.w / 2);
  assert.ok(bounds.min.z >= b.z - b.d / 2 && bounds.max.z <= b.z + b.d / 2);
  assert.ok(bounds.min.y >= -1e-6 && bounds.min.y < 0.01);
  assert.ok(bounds.max.y <= b.h);
  const theatre = cityBuildings.find((building) => building.kind === 'pushkin');
  assert.ok(b.x + b.w / 2 < theatre.x - theatre.w / 2);
  // A circumscribed circle conservatively clears every corner, including bends.
  for (const road of cityRoads)
    assert.ok(
      distanceToRoad(b.x, b.z, road) - Math.hypot(b.w, b.d) / 2 >
        road.width / 2 + 1,
      road.id,
    );
  for (const other of cityBuildings.filter((building) => building !== b))
    assert.ok(
      Math.abs(b.x - other.x) > (b.w + other.w) / 2 + 1 ||
        Math.abs(b.z - other.z) > (b.d + other.d) / 2 + 1,
      other.kind ?? other.district,
    );
});

void test('a low three-wing canopy covers twelve supports and leaves both bronze figures visible from Mira', (t) => {
  const { b, root } = model(t);
  const canopy = root.getObjectByName('pushkin:three-wing-canopy'),
    ceiling = new THREE.Box3().setFromObject(canopy),
    positions = canopy.geometry.attributes.position;
  assert.ok(
    ceiling.max.y - ceiling.min.y < 0.5,
    'flat entablature, not a dome',
  );
  const radii = Array.from({ length: positions.count }, (_, i) =>
    Math.hypot(positions.getX(i), positions.getZ(i)),
  );
  const maxRadius = Math.max(...radii),
    wingAngles = new Set();
  for (let i = 0; i < positions.count; i++)
    if (radii[i] > maxRadius - 0.01)
      wingAngles.add(
        Math.round(Math.atan2(positions.getX(i), positions.getZ(i)) * 100),
      );
  assert.equal(wingAngles.size, 3, 'three distinct outward wings');
  assert.ok(maxRadius - Math.min(...radii) > 1, 'open bays separate the wings');
  const columns = root.getObjectByName('pushkin:columns').children;
  assert.equal(columns.length, 12);
  for (const column of columns) {
    const bounds = new THREE.Box3().setFromObject(column),
      centre = bounds.getCenter(new THREE.Vector3());
    centre.y = bounds.max.y - 0.01;
    const hit = new THREE.Raycaster(
      centre,
      new THREE.Vector3(0, 1, 0),
    ).intersectObject(canopy)[0];
    assert.ok(hit && hit.distance < 0.03, 'each capital supports the canopy');
  }
  const standing = root.getObjectByName('pushkin:standing-poet'),
    seated = root.getObjectByName('pushkin:seated-natalia');
  assert.ok(
    new THREE.Box3().setFromObject(standing).max.y -
      new THREE.Box3().setFromObject(seated).max.y >
      0.35,
  );
  for (const [figure, heights] of [
    [standing, [1.6, 1.09]],
    [seated, [1.18, 0.82]],
  ])
    for (const height of heights) {
      const target = figure.localToWorld(new THREE.Vector3(0, height, 0));
      const ray = new THREE.Raycaster(
        new THREE.Vector3(target.x, target.y, b.z - b.d),
        new THREE.Vector3(0, 0, 1),
      );
      let hit = ray.intersectObject(root, true)[0]?.object;
      while (hit && hit !== figure) hit = hit.parent;
      assert.equal(
        hit,
        figure,
        'the face and torso are visible through the northern entrance',
      );
    }
});

void test('the monument stays below a small geometry budget and reuses neighbouring landmark materials', (t) => {
  const { root, kit } = model(t);
  let triangles = 0,
    bytes = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    triangles +=
      (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    bytes +=
      Object.values(geometry.attributes).reduce(
        (sum, attribute) => sum + attribute.array.byteLength,
        0,
      ) + (geometry.index?.array.byteLength ?? 0);
  });
  assert.ok(triangles < 5000, `${triangles} triangles`);
  assert.ok(bytes < 330000, `${bytes} bytes before city batching`);
  assert.ok(
    kit.materials.size <= 4,
    `${kit.materials.size} untextured materials`,
  );

  const previous = globalThis.document;
  Reflect.set(globalThis, 'document', {
    createElement: () => ({
      width: 1024,
      height: 128,
      getContext: () => new Proxy({}, { get: () => () => {} }),
    }),
  });
  const sharedKit = new RenderKit(new THREE.Scene()),
    sharedRoot = new THREE.Group();
  try {
    for (const kind of ['pushkin', 'apollo', 'theatre-fountain'])
      createCentreLandmark(
        sharedKit,
        sharedRoot,
        cityBuildings.find((b) => b.kind === kind),
      );
    const before = sharedKit.materials.size;
    createPushkinMonument(
      sharedKit,
      sharedRoot,
      cityBuildings.find((b) => b.kind === 'pushkin-monument'),
    );
    assert.equal(
      sharedKit.materials.size - before,
      1,
      'only the inscription needs a new material',
    );
  } finally {
    sharedKit.dispose();
    Reflect.set(globalThis, 'document', previous);
  }
});
