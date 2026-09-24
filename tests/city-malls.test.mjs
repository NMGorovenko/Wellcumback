import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cityBuildings,
  CITY_PARKING,
  cityRoads,
  distanceToRoad,
} from '../lib/game/city/layout.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import {
  createMallLandmark,
  createMallParking,
} from '../components/game/city/mall-landmarks.ts';

void test('mall silhouettes stay inside the same parcels used by driving collision', () => {
  const kit = new RenderKit(new THREE.Scene());
  try {
    for (const kind of ['planeta', 'komsomoll', 'kubatura']) {
      const building = cityBuildings.find((b) => b.kind === kind);
      const root = new THREE.Group();
      createMallLandmark(kit, root, building);
      const bounds = new THREE.Box3().setFromObject(root);
      assert.ok(bounds.min.x >= building.x - building.w / 2 - 0.01, kind);
      assert.ok(bounds.max.x <= building.x + building.w / 2 + 0.01, kind);
      assert.ok(bounds.min.z >= building.z - building.d / 2 - 0.01, kind);
      assert.ok(bounds.max.z <= building.z + building.d / 2 + 0.01, kind);
      assert.ok(bounds.max.y <= building.h + 0.3, kind);
      assert.ok(bounds.max.y >= building.h * 0.9, kind);
    }
  } finally {
    kit.dispose();
  }
});

void test('Planeta portal is open above its low wings and in front of the recessed glazing', () => {
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  const b = { ...cityBuildings.find((b) => b.kind === 'planeta'), x: 0, z: 0 };
  try {
    createMallLandmark(kit, root, b);
    root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, b.h * 0.63, b.d),
      new THREE.Vector3(0, 0, -1),
    );
    const center = ray.intersectObject(root, true)[0];
    assert.ok(center, 'the recessed hall exists behind the opening');
    assert.ok(
      center.point.z < b.d * 0.25,
      'the portal must not be a solid facade',
    );
    ray.ray.origin.x = (b.w * (0.39 - 0.028)) / 2;
    const pier = ray.intersectObject(root, true)[0];
    assert.ok(
      pier.point.z > center.point.z + 10,
      'piers stand substantially ahead of the hall',
    );
  } finally {
    kit.dispose();
  }
});

void test('mall side and rear details remain exposed outside their structural walls', () => {
  const kit = new RenderKit(new THREE.Scene());
  try {
    for (const kind of ['planeta', 'komsomoll', 'kubatura']) {
      const building = cityBuildings.find((b) => b.kind === kind);
      assert.ok(building);
      const b = { ...building, x: 0, z: 0 };
      const root = new THREE.Group();
      createMallLandmark(kit, root, b);
      root.updateMatrixWorld(true);
      const ray =
        kind === 'planeta'
          ? new THREE.Raycaster(
              new THREE.Vector3(b.w * 0.265, b.h * 0.2, b.d * -1),
              new THREE.Vector3(0, 0, 1),
            )
          : new THREE.Raycaster(
              new THREE.Vector3(
                b.w,
                b.h * (kind === 'komsomoll' ? 0.42 : 0.61),
                b.d * -0.17,
              ),
              new THREE.Vector3(-1, 0, 0),
            );
      const hit = ray.intersectObject(root, true)[0];
      assert.equal(
        hit?.object.name,
        {
          planeta: 'planeta:rear-entrance',
          komsomoll: 'komsomoll:blue-side',
          kubatura: 'kubatura:side-gallery',
        }[kind],
        `${kind}: a solid base wall must not hide the exterior treatment`,
      );
    }
  } finally {
    kit.dispose();
  }
});

void test('parking furniture and covered ramps leave actual streets and lot through aisles clear', () => {
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  try {
    createMallParking(kit, root);
    root.updateMatrixWorld(true);
    for (const lot of root.children) {
      const p = CITY_PARKING.find((p) => lot.name === `parking:${p.id}`);
      if (p.id === 'kubatura') {
        // The sloped terrace is emitted in world space and checked against
        // its clipped footprint and road lanes in city-kubatura-terrace.
        assert.ok(lot.getObjectByName('kubatura:terrace-pavement'));
        continue;
      }
      let raised = 0;
      for (const mesh of lot.children) {
        if (!mesh.isMesh) continue;
        const bounds = new THREE.Box3().setFromObject(mesh);
        if (bounds.max.y < 0.14) continue; // Flat surface and painted lines.
        raised++;
        const x = (bounds.min.x + bounds.max.x) / 2,
          z = (bounds.min.z + bounds.max.z) / 2;
        const w = bounds.max.x - bounds.min.x,
          d = bounds.max.z - bounds.min.z;
        assert.ok(
          bounds.min.x >= p.x - p.w / 2 && bounds.max.x <= p.x + p.w / 2,
          p.id,
        );
        assert.ok(
          bounds.min.z >= p.z - p.d / 2 && bounds.max.z <= p.z + p.d / 2,
          p.id,
        );
        assert.ok(
          Math.abs(x - p.x) - w / 2 >= 4,
          `${p.id}: open front-to-back aisle`,
        );
        assert.ok(
          Math.abs(z - p.z) - d / 2 >= 4,
          `${p.id}: open transverse aisle`,
        );
        for (const road of cityRoads)
          assert.ok(
            distanceToRoad(x, z, road) > road.width / 2 + Math.hypot(w, d) / 2,
            `${p.id}: ${road.id}`,
          );
      }
      assert.ok(raised > 0, `${p.id}: usable lot still has its own furniture`);
    }
    const ramps = root
      .getObjectByName('parking:planeta')
      .children.filter((o) => o.name === 'parking:barrel-ramp');
    assert.equal(
      ramps.length,
      2,
      'both distinctive Planeta ramp canopies fit without blocking the access',
    );
  } finally {
    kit.dispose();
  }
});
