import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { batchCity } from '../components/game/city/environment.ts';
import { partitionCityInstances } from '../components/game/city/spatial-batches.ts';
void test('solid paints share a batch and retain exact linear RGB; transparent signs remain separate', () => {
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  try {
    const red = kit.box(3, 3, 3, '#bd4136', 10, 2, 10, root, 0),
      blue = kit.box(3, 3, 3, '#507eac', 20, 2, 10, root, 0);
    const rgb = [red.material.color.toArray(), blue.material.color.toArray()];
    const sign = kit.mesh(
      new THREE.PlaneGeometry(3, 2),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 }),
      root,
    );
    for (const _ of batchCity(kit, root)) {
    }
    assert.equal(root.children.length, 2);
    assert.equal(sign.material.opacity, 0.5);
    const mesh = root.children.find((o) => o !== sign);
    assert.ok(mesh.material.vertexColors);
    assert.equal(mesh.material.color.getHex(), 0xffffff);
    const actual = new Set();
    const c = mesh.geometry.attributes.color;
    for (let i = 0; i < c.count; i++)
      actual.add(
        [c.getX(i), c.getY(i), c.getZ(i)].map((v) => v.toFixed(6)).join(','),
      );
    assert.deepEqual(
      actual,
      new Set(rgb.map((c) => c.map((v) => v.toFixed(6)).join(','))),
    );
    assert.equal(mesh.geometry.index.count, 72);
  } finally {
    kit.dispose();
  }
});
void test('instance cells preserve tree IDs, colours and transforms under a transformed parent', () => {
  const root = new THREE.Group();
  root.position.set(100, 10, 25);
  const source = new THREE.InstancedMesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
    4,
  );
  root.add(source);
  source.position.x = 12;
  source.userData.cityTreeIndices = [19, 3, 91, 6];
  const matrix = new THREE.Matrix4(),
    colors = [];
  for (let i = 0; i < 4; i++) {
    source.setMatrixAt(i, matrix.makeTranslation(i * 500, 2, i * 20));
    const c = new THREE.Color(i / 4, 0.2, 0.4);
    source.setColorAt(i, c);
    colors.push(c);
  }
  const parts = partitionCityInstances(source);
  assert.equal(parts.length, 4);
  for (const part of parts) {
    const i = [19, 3, 91, 6].indexOf(part.userData.cityTreeIndices[0]);
    part.getMatrixAt(0, matrix);
    assert.equal(matrix.elements[12], i * 500);
    assert.equal(part.position.x, 12);
    assert.equal(part.parent, root);
    assert.ok(part.boundingSphere.radius < 2);
    const color = new THREE.Color();
    part.getColorAt(0, color);
    assert.ok(Math.abs(color.r - colors[i].r) < 1e-6);
    part.dispose();
  }
  source.geometry.dispose();
  source.material.dispose();
});
