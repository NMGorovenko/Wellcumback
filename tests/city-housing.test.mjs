import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cityBuildings } from '../lib/game/city/layout.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createNeighbourhoodBuilding } from '../components/game/city/neighbourhoods.ts';

void test('all neighbourhood balconies and cornices remain within their collision parcels', () => {
  const kit = new RenderKit(new THREE.Scene());
  try {
    for (const [index, b] of cityBuildings.entries()) {
      if (b.kind || !b.style) continue;
      const root = new THREE.Group();
      createNeighbourhoodBuilding(kit, root, b, index);
      const bounds = new THREE.Box3().setFromObject(root);
      const overflow = Math.max(
        b.x - b.w / 2 - bounds.min.x,
        bounds.max.x - b.x - b.w / 2,
        b.z - b.d / 2 - bounds.min.z,
        bounds.max.z - b.z - b.d / 2,
      );
      assert.ok(
        overflow < 0.001,
        `${b.style} ${index} extends ${overflow}m beyond its parcel`,
      );
    }
  } finally {
    kit.dispose();
  }
});

const cross = (a, b, p) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const area = (polygon) =>
  polygon.reduce((sum, p, i) => {
    const next = polygon[(i + 1) % polygon.length];
    return sum + p[0] * next[1] - next[0] * p[1];
  }, 0) / 2;
function overlapArea(triangle, clip) {
  let polygon = triangle;
  const sign = Math.sign(area(clip));
  for (let i = 0; i < 3; i++) {
    const a = clip[i],
      b = clip[(i + 1) % 3],
      output = [];
    for (let j = 0; j < polygon.length; j++) {
      const from = polygon[j],
        to = polygon[(j + 1) % polygon.length];
      const d1 = sign * cross(a, b, from),
        d2 = sign * cross(a, b, to);
      if (d1 >= 0) output.push(from);
      if (d1 >= 0 !== d2 >= 0) {
        const t = d1 / (d1 - d2);
        output.push([
          from[0] + t * (to[0] - from[0]),
          from[1] + t * (to[1] - from[1]),
        ]);
      }
    }
    polygon = output;
  }
  return Math.abs(area(polygon));
}
function flatTriangles(geometry, axis) {
  const pos = geometry.attributes.position,
    normal = geometry.attributes.normal,
    index = geometry.index;
  const axes = [0, 1, 2].filter((a) => a !== axis),
    result = [];
  for (let i = 0; i < index.count; i += 3) {
    const vertices = [0, 1, 2].map((j) => index.getX(i + j));
    if (normal.getComponent(vertices[0], axis) < 0.99) continue;
    result.push({
      plane: pos.getComponent(vertices[0], axis),
      points: vertices.map((v) => axes.map((a) => pos.getComponent(v, a))),
    });
  }
  return result;
}
function assertNoCoplanarOverlap(triangles) {
  for (let i = 0; i < triangles.length; i++)
    for (let j = i + 1; j < triangles.length; j++) {
      if (Math.abs(triangles[i].plane - triangles[j].plane) > 0.001) continue;
      assert.ok(
        overlapArea(triangles[i].points, triangles[j].points) < 0.0001,
        'exposed coplanar faces overlap and can flicker',
      );
    }
}
void test('heritage plinth and facade decoration do not share an overlapping visible plane', () => {
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  try {
    createNeighbourhoodBuilding(
      kit,
      root,
      {
        x: 0,
        z: 0,
        w: 30,
        d: 16,
        h: 14,
        floors: 5,
        color: '#fff',
        style: 'heritage',
        lowDetail: true,
      },
      0,
    );
    assertNoCoplanarOverlap(flatTriangles(root.children[0].geometry, 2));
  } finally {
    kit.dispose();
  }
});
void test('adjacent equal-height panel roofs meet without coplanar overlap', () => {
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  try {
    createNeighbourhoodBuilding(
      kit,
      root,
      {
        x: 0,
        z: 0,
        w: 38,
        d: 16,
        h: 14,
        floors: 5,
        color: '#fff',
        style: 'panel',
        lowDetail: true,
      },
      0,
    );
    const triangles = flatTriangles(root.children[0].geometry, 1);
    const top = Math.max(...triangles.map((t) => t.plane));
    assertNoCoplanarOverlap(
      triangles.filter((t) => Math.abs(t.plane - top) < 0.001),
    );
  } finally {
    kit.dispose();
  }
});
