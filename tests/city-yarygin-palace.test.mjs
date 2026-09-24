import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { cityBuildings } from '../lib/game/city/layout.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createDistrictLandmark } from '../components/game/city/district-landmarks.ts';

function model() {
  const b = cityBuildings.find((b) => b.kind === 'arena');
  const root = new THREE.Group();
  const kit = new RenderKit(new THREE.Scene());
  assert.equal(createDistrictLandmark(kit, root, b), true);
  root.updateMatrixWorld(true);
  return { b, root, kit };
}

void test('Yarygin Palace and its forecourt monument fit the existing island parcel', () => {
  const { b, root, kit } = model();
  try {
    const bounds = new THREE.Box3().setFromObject(root);
    assert.ok(bounds.min.x >= b.x - b.w / 2 - 0.01);
    assert.ok(bounds.max.x <= b.x + b.w / 2 + 0.01);
    assert.ok(bounds.min.z >= b.z - b.d / 2 - 0.01);
    assert.ok(bounds.max.z <= b.z + b.d / 2 + 0.01);
    assert.ok(bounds.min.y >= -0.01 && bounds.min.y < 0.01);
    assert.ok(bounds.max.y <= b.h + 0.01);
    assert.ok(root.getObjectByName('yarygin:monument'));
    assert.equal(
      root.getObjectByName('landmark:arena').userData.landmarkName,
      'Дворец спорта имени Ивана Ярыгина',
    );
    const source = readFileSync(
      new URL('../components/game/city/district-landmarks.ts', import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(source, /ПЛАТИНУМ|PLATINUM/i);
  } finally {
    kit.dispose();
  }
});

void test('Yarygin roof has high front/rear tips and lower curved sides, with a flared hull', () => {
  const { b, root, kit } = model();
  try {
    const roof = root.getObjectByName('yarygin:curved-roof').geometry.attributes
      .position;
    const side = [],
      tip = [],
      centre = [];
    const cz = -b.d * 0.074;
    for (let i = 0; i < roof.count; i++) {
      const x = roof.getX(i),
        y = roof.getY(i),
        z = roof.getZ(i) - cz;
      if (Math.abs(x) > b.w * 0.47) side.push(y);
      if (Math.abs(z) > b.d * 0.35) tip.push(y);
      if (Math.hypot(x, z) < 0.1) centre.push(y);
    }
    assert.ok(Math.min(...tip) > Math.max(...side) + 3.5);
    assert.ok(Math.min(...centre) > Math.max(...side) + 1);
    assert.ok(Math.max(...centre) < Math.min(...tip) - 2);
    const hull = root.getObjectByName('yarygin:curved-hull').geometry.attributes
      .position;
    const lowXs = [],
      highXs = [];
    for (let i = 0; i < hull.count; i++) {
      if (Math.abs(hull.getY(i) - b.h * 0.265) < 0.01)
        lowXs.push(Math.abs(hull.getX(i)));
      highXs.push(Math.abs(hull.getX(i)));
    }
    assert.ok(
      Math.max(...highXs) - Math.max(...lowXs) > 1.5,
      'upper hull widens beyond its base',
    );
    assert.equal(root.getObjectByName('yarygin:portholes').count, 42);
  } finally {
    kit.dispose();
  }
});

void test('the low glazed entrance remains visible below its projecting canopy', () => {
  const { b, root, kit } = model();
  try {
    const hit = new THREE.Raycaster(
      new THREE.Vector3(b.x + 5.3, 1.5, b.z + b.d),
      new THREE.Vector3(0, 0, -1),
    ).intersectObject(root, true)[0];
    assert.equal(hit?.object.name, 'yarygin:entrance-gallery');
    const canopy = new THREE.Box3().setFromObject(
      root.getObjectByName('yarygin:entrance-canopy'),
    );
    assert.ok(canopy.max.z - hit.point.z > 1.8);
    const seam = new THREE.Box3().setFromObject(
      root.getObjectByName('yarygin:glazed-seam'),
    );
    assert.ok(seam.max.y > b.h * 0.95);
  } finally {
    kit.dispose();
  }
});
