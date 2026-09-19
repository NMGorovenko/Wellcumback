import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cityBuildings,
  cityRoads,
  distanceToRoad,
  CITY_YENISEY_SIGN,
  cityParcelClear,
} from '../lib/game/city/layout.ts';
import { cityGroundHeight } from '../lib/game/city/surface.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createDistrictLandmark } from '../components/game/city/district-landmarks.ts';
import { createYeniseySign } from '../components/game/city/yenisey-sign.ts';
import { liftScenery } from '../components/game/city/relief.ts';

void test('the Orbita group and Doner fit their collision parcels without moving Borisova or IKIT', () => {
  const kit = new RenderKit(new THREE.Scene());
  try {
    assert.equal(cityBuildings.filter((b) => b.kind === 'orbita').length, 3);
    for (const b of cityBuildings.filter((b) =>
      ['borisova', 'orbita', 'doner'].includes(b.kind),
    )) {
      const root = new THREE.Group();
      assert.ok(createDistrictLandmark(kit, root, b));
      assert.equal(root.children[0].position.y, 0);
      const bounds = new THREE.Box3().setFromObject(root);
      assert.ok(
        bounds.min.x >= b.x - b.w / 2 - 0.001 &&
          bounds.max.x <= b.x + b.w / 2 + 0.001,
        `${b.kind} width`,
      );
      assert.ok(
        bounds.min.z >= b.z - b.d / 2 - 0.001 &&
          bounds.max.z <= b.z + b.d / 2 + 0.001,
        `${b.kind} depth`,
      );
      assert.ok(bounds.max.y <= b.h + 0.01, `${b.kind} height`);
      if (b.kind !== 'borisova')
        assert.ok(
          cityParcelClear(b.x, b.z, b.w, b.d),
          `${b.kind} does not block a road`,
        );
    }
  } finally {
    kit.dispose();
  }
});

void test('Orbita balcony glazing is curved and exposed ahead of the wall, with a small geometry budget', () => {
  const kit = new RenderKit(new THREE.Scene());
  try {
    let triangles = 0;
    for (const b of cityBuildings.filter((b) =>
      ['borisova', 'orbita'].includes(b.kind),
    )) {
      const root = new THREE.Group();
      createDistrictLandmark(kit, root, b);
      root.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(
        new THREE.Vector3(
          b.x + b.w * (0.225 + 0.17 * Math.sin(0.3)),
          b.h * 0.514,
          b.z + b.d,
        ),
        new THREE.Vector3(0, 0, -1),
      );
      const hit = ray.intersectObject(root, true)[0];
      assert.equal(hit?.object.name, 'orbita:curved-balconies');
      assert.ok(
        hit.point.z > b.z + b.d * 0.39,
        'glass projects substantially beyond the structural wall',
      );
      root.traverse((o) => {
        if (o.isMesh)
          triangles +=
            (o.geometry.index?.count ?? o.geometry.attributes.position.count) /
            3;
      });
    }
    assert.ok(
      triangles < 14000,
      `${triangles} triangles across four Orbita buildings`,
    );
  } finally {
    kit.dispose();
  }
});

void test('all sixteen hillside letters remain clear of roads and houses, and terrain preserves each glyph', () => {
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  try {
    const sign = createYeniseySign(kit, root);
    assert.equal(sign.position.y, 0);
    const letters = sign.children.filter((o) =>
      o.name.startsWith('yenisey:letter:'),
    );
    assert.equal(
      letters.map((o) => o.name.split(':').at(-1)).join(''),
      'ЕНИСЕЙСКАЯСИБИРЬ',
    );
    root.updateMatrixWorld(true);
    const heights = new Map();
    for (const letter of letters) {
      const bounds = new THREE.Box3().setFromObject(letter),
        center = bounds.getCenter(new THREE.Vector3());
      heights.set(letter, bounds.max.y - bounds.min.y);
      for (const road of cityRoads)
        assert.ok(
          distanceToRoad(center.x, center.z, road) > road.width / 2 + 2,
          `${letter.name} stays off ${road.id}`,
        );
      for (const b of cityBuildings)
        assert.ok(
          center.x < b.x - b.w / 2 ||
            center.x > b.x + b.w / 2 ||
            center.z < b.z - b.d / 2 ||
            center.z > b.z + b.d / 2,
          'no letter is hidden inside a building',
        );
    }
    assert.equal(sign.rotation.y, CITY_YENISEY_SIGN.angle);
    liftScenery(kit, root, cityGroundHeight);
    for (const letter of letters) {
      const bounds = new THREE.Box3().setFromObject(letter);
      assert.ok(
        Math.abs(bounds.max.y - bounds.min.y - heights.get(letter)) < 0.001,
        'terrain moves each letter rigidly',
      );
      assert.ok(bounds.min.y > 30, 'the sign is on the hillside');
    }
  } finally {
    kit.dispose();
  }
});
