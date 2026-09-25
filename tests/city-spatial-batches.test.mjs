import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  partitionCityGeometry,
  splitOversizedCityGeometry,
  pruneEmptyCityGroups,
} from '../components/game/city/spatial-batches.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createCityLod } from '../components/game/city/lod.ts';

// Compare the rendered vertex tuples, preserving each triangle's winding while
// permitting spatial chunks to change triangle order and compact vertex indices.
function triangles(geometry, active = false) {
  const names = Object.keys(geometry.attributes).sort();
  const count = geometry.index?.count ?? geometry.attributes.position.count;
  const start = active ? geometry.drawRange.start : 0;
  const end = active
    ? Math.min(count, start + geometry.drawRange.count)
    : count;
  const result = [];
  for (let i = start; i < end; i += 3) {
    const corners = [];
    for (let k = 0; k < 3; k++) {
      const vertex = geometry.index?.getX(i + k) ?? i + k;
      const values = [];
      for (const name of names) {
        const attribute = geometry.attributes[name];
        const raw = attribute.isInterleavedBufferAttribute
          ? attribute.data.array
          : attribute.array;
        const stride = attribute.isInterleavedBufferAttribute
          ? attribute.data.stride
          : attribute.itemSize;
        const offset = attribute.isInterleavedBufferAttribute
          ? attribute.offset
          : 0;
        values.push(name, attribute.itemSize, attribute.normalized);
        for (let item = 0; item < attribute.itemSize; item++)
          values.push(raw[vertex * stride + offset + item]);
      }
      corners.push(values);
    }
    result.push(JSON.stringify(corners));
  }
  return result.sort();
}
function fixture() {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [0, 0, 0, 1, 0, 0, 0, 1, 0, 1000, 0, 0, 1001, 0, 0, 1000, 1, 0],
      3,
    ),
  );
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      3,
    ),
  );
  g.setAttribute(
    'color',
    new THREE.BufferAttribute(
      Uint8Array.from({ length: 18 }, (_, i) => i * 7),
      3,
      true,
    ),
  );
  g.setIndex([0, 1, 2, 3, 4, 5, 0, 2, 1, 3, 5, 4]);
  return g;
}

void test('spatial partition preserves exact topology, normals and raw normalized color values', () => {
  const source = fixture();
  const before = triangles(source);
  const sourceIndex = [...source.index.array];
  const parts = partitionCityGeometry(source, new THREE.Matrix4(), 320);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.flatMap((g) => triangles(g)).sort(), before);
  assert.deepEqual(
    [...source.index.array],
    sourceIndex,
    'source is not mutated',
  );
  assert.equal(
    parts.reduce((sum, g) => sum + g.attributes.position.count, 0),
    6,
    'each cell retains compact shared vertices instead of triangle soup',
  );
  assert.ok(
    parts.every(
      (g) =>
        g.attributes.color.array instanceof Uint8Array &&
        g.attributes.color.normalized,
    ),
  );
  for (const part of parts) {
    for (let i = 0; i < part.index.count; i++)
      assert.ok(part.index.getX(i) < part.attributes.position.count);
    part.dispose();
  }
  source.dispose();
});

void test('LOD prefixes and current draw ranges render the same triangles after partition', () => {
  const source = fixture();
  source.userData.cityLod = { silhouette: 6, landmark: 9, full: 12 };
  source.userData.cityLodRanges = [
    { start: 0, count: 6, tier: 'silhouette' },
    { start: 6, count: 3, tier: 'landmark-detail' },
    { start: 9, count: 3, tier: 'house-detail' },
  ];
  source.setDrawRange(3, 6);
  const expectedActive = triangles(source, true);
  const parts = partitionCityGeometry(source, new THREE.Matrix4(), 320);
  assert.deepEqual(
    parts.flatMap((g) => triangles(g, true)).sort(),
    expectedActive,
  );
  for (const tier of ['silhouette', 'landmark', 'full']) {
    source.setDrawRange(0, source.userData.cityLod[tier]);
    for (const part of parts) part.setDrawRange(0, part.userData.cityLod[tier]);
    assert.deepEqual(
      parts.flatMap((g) => triangles(g, true)).sort(),
      triangles(source, true),
      tier,
    );
  }
  assert.deepEqual(
    parts.map((g) =>
      g.userData.cityLodRanges.map((r) => [r.start, r.count, r.tier]),
    ),
    [
      [
        [0, 3, 'silhouette'],
        [3, 3, 'landmark-detail'],
      ],
      [
        [0, 3, 'silhouette'],
        [3, 3, 'house-detail'],
      ],
    ],
  );
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial();
  parts.forEach((g) => root.add(new THREE.Mesh(g, material)));
  const lod = createCityLod(root);
  assert.equal(lod.update({ x: 50000, z: 50000 }, 'low').selectedTriangles, 2);
  assert.equal(lod.update({ x: 0, z: 0 }, 'high').selectedTriangles, 3);
  lod.dispose();
  assert.equal(
    parts.reduce((sum, g) => sum + g.drawRange.count, 0),
    12,
  );
  parts.forEach((g) => g.dispose());
  material.dispose();
  source.dispose();
});

void test('nonindexed interleaved geometry keeps its attributes and conservative crossing bounds', () => {
  const source = new THREE.BufferGeometry();
  const data = new THREE.InterleavedBuffer(
    new Float32Array([
      -20, 0, 0, 0, 0, 660, 0, 0, 1, 0, 10, 3, 0, 0, 1, 1500, 0, 0, 0, 0, 1501,
      0, 0, 1, 0, 1500, 3, 0, 0, 1,
    ]),
    5,
  );
  source.setAttribute(
    'position',
    new THREE.InterleavedBufferAttribute(data, 3, 0),
  );
  source.setAttribute('uv', new THREE.InterleavedBufferAttribute(data, 2, 3));
  const world = new THREE.Matrix4().makeTranslation(-100, 7, -100);
  const pieces = partitionCityGeometry(source, world, 320);
  assert.equal(pieces.length, 2);
  assert.deepEqual(
    pieces.flatMap((g) => triangles(g)).sort(),
    triangles(source),
  );
  // A triangle that crosses a cell edge must never be clipped to the cell box.
  const crossing = pieces.find((g) => g.boundingBox.min.x < 0);
  assert.equal(crossing.boundingBox.min.x, -20);
  assert.equal(crossing.boundingBox.max.x, 660);
  const p = new THREE.Vector3();
  for (const piece of pieces) {
    for (let i = 0; i < piece.attributes.position.count; i++) {
      p.fromBufferAttribute(piece.attributes.position, i);
      assert.ok(piece.boundingSphere.distanceToPoint(p) < 1e-5);
    }
    piece.dispose();
  }
  source.dispose();
});

void test('scene partition keeps shared materials, transforms and one owner for replaced resources', () => {
  const kit = new RenderKit(new THREE.Scene());
  const root = new THREE.Group();
  kit.scene.add(root);
  const shared = fixture();
  shared.setIndex(Array.from({ length: 600 }, () => [0, 1, 2, 3, 4, 5]).flat());
  const material = kit.material('#abcdef');
  const first = kit.mesh(shared, material, root);
  const second = kit.mesh(shared, material, root);
  second.position.z = 1000;
  const expectedMatrices = [
    first.matrix.clone(),
    new THREE.Matrix4().makeTranslation(0, 0, 1000),
  ];
  let disposed = 0;
  shared.addEventListener('dispose', () => disposed++);
  const result = splitOversizedCityGeometry(kit, root, 320);
  assert.equal(result.splitSources, 2);
  assert.equal(
    disposed,
    1,
    'shared source releases only after both references are replaced',
  );
  assert.equal(kit.geometries.has(shared), false);
  const pieces = root.children.filter((o) => o.isMesh);
  assert.equal(pieces.length, 4);
  assert.ok(
    pieces.every(
      (o) => o.material === material && o.castShadow && o.receiveShadow,
    ),
  );
  assert.equal(
    pieces.reduce((sum, o) => sum + o.geometry.index.count, 0),
    7200,
  );
  for (const piece of pieces) {
    piece.updateMatrix();
    assert.ok(
      expectedMatrices.some((expected) => expected.equals(piece.matrix)),
    );
  }
  kit.dispose();
  assert.equal(disposed, 1, 'disposed source is no longer owned by RenderKit');
});

void test('pruning removes nested empty transforms but preserves named landmarks and live geometry', () => {
  const root = new THREE.Group(),
    branch = new THREE.Group(),
    empty = new THREE.Group();
  root.add(branch);
  branch.add(empty);
  const namedParent = new THREE.Group(),
    named = new THREE.Group();
  named.name = 'landmark:komsomoll';
  namedParent.add(named);
  root.add(namedParent);
  const liveParent = new THREE.Group(),
    live = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
    );
  liveParent.position.set(3, 4, 5);
  liveParent.add(live);
  root.add(liveParent);
  root.updateMatrixWorld(true);
  const before = live.matrixWorld.clone();
  assert.equal(pruneEmptyCityGroups(root), 2);
  assert.equal(root.getObjectByName('landmark:komsomoll'), named);
  assert.equal(named.parent, namedParent);
  root.updateMatrixWorld(true);
  assert.ok(before.equals(live.matrixWorld));
  assert.equal(pruneEmptyCityGroups(root), 0, 'repeated pruning is harmless');
  live.geometry.dispose();
  live.material.dispose();
});
