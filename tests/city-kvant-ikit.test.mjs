import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cityBuildings } from '../lib/game/city/layout.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createCentreLandmark } from '../components/game/city/centre-landmarks.ts';
import { createDistrictLandmark } from '../components/game/city/district-landmarks.ts';

function model(kind) {
  const b = cityBuildings.find((building) => building.kind === kind);
  assert.ok(b, `${kind} has a canonical collision parcel`);
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  const build =
    kind === 'kvant' ? createCentreLandmark : createDistrictLandmark;
  assert.ok(build(kit, root, b));
  root.updateMatrixWorld(true);
  return { b, kit, root };
}

void test('Kvant and IKIT silhouettes and steps remain inside the collision parcels and start at local ground', () => {
  for (const kind of ['kvant', 'ikit']) {
    const { b, kit, root } = model(kind);
    try {
      assert.equal(
        root.children[0].position.y,
        0,
        'terrain is applied once to the complete group',
      );
      const bounds = new THREE.Box3().setFromObject(root);
      assert.ok(bounds.min.x >= b.x - b.w / 2 - 0.001, `${kind} west`);
      assert.ok(bounds.max.x <= b.x + b.w / 2 + 0.001, `${kind} east`);
      assert.ok(bounds.min.z >= b.z - b.d / 2 - 0.001, `${kind} back`);
      assert.ok(bounds.max.z <= b.z + b.d / 2 + 0.001, `${kind} front`);
      assert.ok(
        bounds.min.y >= -0.001 && bounds.min.y < 0.1,
        `${kind} grounded`,
      );
      assert.ok(bounds.max.y <= b.h + 0.01, `${kind} roof fits`);
    } finally {
      kit.dispose();
    }
  }
});

const frontHit = (root, b, x, y) =>
  new THREE.Raycaster(
    new THREE.Vector3(b.x + x, y, b.z + b.d),
    new THREE.Vector3(0, 0, -1),
  ).intersectObject(root, true)[0];

void test('Kvant entrance is behind its glass risalits and its screen is visible above the canopy', () => {
  const { b, kit, root } = model('kvant');
  try {
    const entry = frontHit(root, b, b.w * 0.09 + 0.6, 1.8);
    const risalit = frontHit(root, b, -b.w * 0.22 + 0.4, 1.8);
    assert.equal(entry?.object.name, 'kvant:recessed-entry');
    assert.ok(
      risalit.point.z - entry.point.z > b.d * 0.13,
      'entry remains genuinely inset',
    );
    const screen = frontHit(root, b, b.w * (0.09 + 0.096), b.h * 0.52);
    assert.equal(screen?.object.name, 'kvant:screen-frame');
    const tower = root.getObjectByName('kvant:left-risalit');
    const main = root.getObjectByName('kvant:main-wing');
    assert.ok(
      new THREE.Box3().setFromObject(tower).max.y -
        new THREE.Box3().setFromObject(main).max.y >
        3,
      'the roofline is stepped',
    );
  } finally {
    kit.dispose();
  }
});

void test('IKIT entrance is open under the teaching wing and recessed behind the wide blank tower', () => {
  const { b, kit, root } = model('ikit');
  try {
    const entry = frontHit(root, b, b.w * 0.28, 1.3);
    assert.equal(
      entry?.object.name,
      'ikit:recessed-entry',
      'solid facade must not seal the entry recess',
    );
    const tower = frontHit(root, b, b.w * 0.07 + 0.3, 1.3);
    assert.ok(tower.point.z - entry.point.z > b.d * 0.4);
    const bounds = new THREE.Box3().setFromObject(
      root.getObjectByName('ikit:blank-tower'),
    );
    assert.ok(
      bounds.max.x - bounds.min.x > b.w * 0.14,
      'the distinctive blank volume is broad, not a decorative strip',
    );
  } finally {
    kit.dispose();
  }
});
