import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import {
  createHillLandmark,
  HILL_FOUNDATION_FOOTPRINTS,
} from '../components/game/city/hill-landmarks.ts';
import { drapedGeometry } from '../components/game/city/relief.ts';
import {
  cityBuildings,
  cityRoads,
  distanceToRoad,
  inCityWater,
  riverBankZ,
} from '../lib/game/city/layout.ts';
import {
  cityGroundHeight,
  cityRoadHeight,
  cityRoadLayer,
} from '../lib/game/city/surface.ts';
import { roadSurfaceOutlines } from '../lib/game/city/road-surfaces.ts';
import { cityCarBlocked, cityTravelArrival } from '../lib/game/city/engine.ts';

const kinds = [
  'karaulnaya-chapel',
  'chapel-cannon',
  'monastery',
  'monastery-wing',
];
const landmarks = cityBuildings.filter((b) => kinds.includes(b.kind));
function fixture(b) {
  const kit = new RenderKit(new THREE.Scene());
  const root = new THREE.Group();
  root.position.y = cityGroundHeight(b.x, b.z);
  assert.equal(createHillLandmark(kit, root, b), true);
  root.updateMatrixWorld(true);
  return { kit, root, base: root.position.y };
}
function terrainFixture(kit, b) {
  const minX = Math.floor((b.x - b.w / 2 - 16) / 8) * 8;
  const maxX = Math.ceil((b.x + b.w / 2 + 16) / 8) * 8;
  const minZ = Math.floor((b.z - b.d / 2 - 16) / 8) * 8;
  const maxZ = Math.ceil((b.z + b.d / 2 + 16) / 8) * 8;
  const roads = cityRoads.filter(
    (r) =>
      cityRoadLayer(r) !== 'raised' &&
      Math.max(r.from.x, r.to.x) + r.width > minX &&
      Math.min(r.from.x, r.to.x) - r.width < maxX &&
      Math.max(r.from.z, r.to.z) + r.width > minZ &&
      Math.min(r.from.z, r.to.z) - r.width < maxZ,
  );
  const terrain = kit.mesh(
    drapedGeometry(
      [
        [
          { x: minX, z: minZ },
          { x: maxX, z: minZ },
          { x: maxX, z: maxZ },
          { x: minX, z: maxZ },
        ],
      ],
      cityGroundHeight,
      0,
      8,
      [
        ...roadSurfaceOutlines(roads, undefined, 0.65),
        ...HILL_FOUNDATION_FOOTPRINTS,
      ],
    ),
    kit.material('#82966d'),
  );
  const ray = new THREE.Raycaster(
    new THREE.Vector3(),
    new THREE.Vector3(0, -1, 0),
  );
  return (x, z) => {
    ray.ray.origin.set(x, 200, z);
    return ray.intersectObject(terrain)[0]?.point.y;
  };
}

void test('hill landmark vertices fit their distinct physical parcels on dry land', () => {
  assert.equal(landmarks.length, 4);
  for (const b of landmarks) {
    const { kit, root, base } = fixture(b);
    try {
      // precise=true checks actual transformed vertices, rather than the rotated
      // local bounding box: the latter inflates a four-sided roof incorrectly.
      const box = new THREE.Box3().setFromObject(root, true);
      assert.ok(
        box.min.x >= b.x - b.w / 2 - 0.01 && box.max.x <= b.x + b.w / 2 + 0.01,
        b.kind + ' x footprint',
      );
      assert.ok(
        box.min.z >= b.z - b.d / 2 - 0.01 && box.max.z <= b.z + b.d / 2 + 0.01,
        b.kind + ' z footprint',
      );
      assert.ok(box.max.y <= base + b.h + 0.1, b.kind + ' collision height');
      for (const x of [b.x - b.w / 2, b.x, b.x + b.w / 2])
        for (const z of [b.z - b.d / 2, b.z, b.z + b.d / 2]) {
          assert.equal(inCityWater(x, z), false, b.kind + ' dry footprint');
          assert.ok(z < riverBankZ(x, -1), b.kind + ' correct left bank');
        }
    } finally {
      kit.dispose();
    }
  }
});

void test('terrain cutouts stay inside solid foundations and preserve the open monastery gap', () => {
  for (const b of landmarks) {
    const { kit, root, base } = fixture(b);
    try {
      const ground = terrainFixture(kit, b);
      const foundation = root.getObjectByName('landmark:foundation');
      assert.ok(foundation?.isMesh, b.kind + ' solid foundation');
      const bounds = new THREE.Box3().setFromObject(foundation, true);
      let count = 0;
      const ray = new THREE.Raycaster(
        new THREE.Vector3(),
        new THREE.Vector3(0, -1, 0),
      );
      for (let x = bounds.min.x + 0.02; x < bounds.max.x; x += 0.6)
        for (let z = bounds.min.z + 0.02; z < bounds.max.z; z += 0.6) {
          assert.equal(
            ground(x, z),
            undefined,
            b.kind + ' no soil above solid foundation',
          );
          ray.ray.origin.set(x, base + 100, z);
          const hit = ray.intersectObject(foundation)[0];
          assert.ok(hit, b.kind + ' terrain cutout has a closed top');
          assert.ok(
            Math.abs(hit.point.y - base - 0.05) < 0.001,
            b.kind + ' level foundation top',
          );
          count++;
        }
      assert.ok(count > 100);
      // The perimeter must meet visible land; this also catches a terrain hole
      // wider than the physical foundation and an under-depth retaining face.
      for (let side = 0; side < 4; side++)
        for (let t = 0.02; t < 1; t += 0.03) {
          const x =
            side < 2
              ? side === 0
                ? bounds.min.x - 0.15
                : bounds.max.x + 0.15
              : bounds.min.x + (bounds.max.x - bounds.min.x) * t;
          const z =
            side >= 2
              ? side === 2
                ? bounds.min.z - 0.15
                : bounds.max.z + 0.15
              : bounds.min.z + (bounds.max.z - bounds.min.z) * t;
          const y = ground(x, z);
          assert.ok(
            Number.isFinite(y),
            b.kind + ' no open trench beyond foundation',
          );
          assert.ok(
            bounds.min.y < y - 0.1,
            b.kind + ' foundation reaches below rendered perimeter',
          );
        }
      if (b.kind === 'monastery')
        for (let z = 615; z <= 623; z++)
          assert.ok(
            Number.isFinite(ground(-1614, z)),
            'no terrain hole across open monastery gap',
          );
    } finally {
      kit.dispose();
    }
  }
});

void test('chapel access joins the existing street and clears the full car across its width', () => {
  const roads = cityRoads.filter((r) => r.id.startsWith('karaulnaya-access:'));
  assert.ok(roads.length >= 2);
  assert.ok(
    cityRoads.some(
      (r) =>
        !roads.includes(r) &&
        distanceToRoad(roads[0].from.x, roads[0].from.z, r) < 0.1,
    ),
  );
  for (const road of roads) {
    const dx = road.to.x - road.from.x,
      dz = road.to.z - road.from.z;
    const length = Math.hypot(dx, dz),
      heading = Math.atan2(dx, -dz);
    for (let along = 0; along <= length; along += 1)
      for (const lane of [-1, 0, 1]) {
        const lateral = lane * (road.width / 2 - 2.1);
        const x = road.from.x + (dx * along) / length - (dz * lateral) / length;
        const z = road.from.z + (dz * along) / length + (dx * lateral) / length;
        const y = cityRoadHeight(road, x, z);
        assert.equal(
          cityCarBlocked(x, z, heading, y),
          false,
          road.id + ' complete car',
        );
        const grade =
          Math.abs(
            cityRoadHeight(
              road,
              x + (dx / length) * 0.5,
              z + (dz / length) * 0.5,
            ) - y,
          ) / 0.5;
        assert.ok(grade < 0.22, `${road.id}: grade ${grade} at ${x},${z}`);
      }
  }
});

void test('both arrivals have a clear exit and the monastery gap has no combined invisible collider', () => {
  for (const id of ['karaulnaya', 'monastery']) {
    const arrival = cityTravelArrival(id);
    assert.ok(arrival, id + ' arrival');
    for (let distance = 0; distance <= 25; distance += 0.5)
      assert.equal(
        cityCarBlocked(
          arrival.x + Math.sin(arrival.heading) * distance,
          arrival.z - Math.cos(arrival.heading) * distance,
          arrival.heading,
        ),
        false,
        id + ' 25 m exit',
      );
  }
  const church = landmarks.find((b) => b.kind === 'monastery');
  const wing = landmarks.find((b) => b.kind === 'monastery-wing');
  const x = (church.x - church.w / 2 + wing.x + wing.w / 2) / 2;
  for (let z = wing.z - wing.d / 2; z <= wing.z + wing.d / 2; z += 0.5)
    assert.equal(
      cityCarBlocked(x, z, 0),
      false,
      'open ground between monastery volumes',
    );
});
