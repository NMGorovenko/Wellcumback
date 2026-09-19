import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createCityEnvironment } from '../components/game/city/environment.ts';
import {
  convexPieces,
  drapedGeometry,
  liftScenery,
} from '../components/game/city/relief.ts';
import { cityRoads, RIVER_SECTIONS } from '../lib/game/city/layout.ts';
import {
  cityGroundHeight,
  cityRoadHeight,
  cityRoadLayer,
  citySurfacePose,
} from '../lib/game/city/surface.ts';
import {
  roadSurfaceOutlines,
  roadPolygonArea,
  subtractRoadPolygons,
} from '../lib/game/city/road-surfaces.ts';

const square = (x, z, size) => [
  { x, z },
  { x: x + size, z },
  { x: x + size, z: z + size },
  { x, z: z + size },
];
function projectedArea(geometry) {
  const p = geometry.attributes.position;
  let area = 0;
  for (let i = 0; i < p.count; i += 3)
    area +=
      Math.abs(
        (p.getX(i + 1) - p.getX(i)) * (p.getZ(i + 2) - p.getZ(i)) -
          (p.getZ(i + 1) - p.getZ(i)) * (p.getX(i + 2) - p.getX(i)),
      ) / 2;
  return area;
}

void test('terrain holes preserve exact area and upward triangles across grid and polygon boundaries', () => {
  const outer = square(-20, -20, 40),
    holes = [square(-7, -8, 16), square(2, 1, 12)];
  // The two holes overlap by 7x7; that overlap must be removed exactly once.
  const expected = 1600 - 256 - 144 + 49;
  const heightAt = (x, z) => 20 + Math.sin(x / 12) * 3 + Math.cos(z / 14) * 2;
  const geometry = drapedGeometry(convexPieces(outer), heightAt, 0, 4, holes);
  try {
    assert.ok(Math.abs(projectedArea(geometry) - expected) < 0.001);
    const p = geometry.attributes.position,
      n = geometry.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      assert.ok(Math.abs(p.getY(i) - heightAt(p.getX(i), p.getZ(i))) < 0.00001);
      assert.ok(
        n.getY(i) > 0,
        'new cut edges must not invert the visible terrain',
      );
    }
    assert.ok(
      p.count / 3 < 500,
      'a local hole must not cause global polygon fragmentation',
    );
  } finally {
    geometry.dispose();
  }
});

void test('terrain cut footprints match rounded asphalt and include the roundabout without seams', () => {
  const roads = [
    { id: 'test-road', from: { x: -20, z: 0 }, to: { x: 20, z: 0 }, width: 10 },
  ];
  const holes = roadSurfaceOutlines(
    roads,
    { x: 20, z: 0, outerRadius: 12 },
    0.65,
  );
  const pieces = subtractRoadPolygons([square(-40, -40, 80)], holes);
  const geometry = drapedGeometry(pieces, () => 8, 0, 4);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(),
    new THREE.Vector3(0, -1, 0),
  );
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  try {
    for (const [x, z] of [
      [-24.9, 0],
      [0, 5.5],
      [20, 12.4],
      [31.5, 0],
    ]) {
      ray.ray.origin.set(x, 30, z);
      assert.equal(
        ray.intersectObject(mesh).length,
        0,
        'terrain cannot remain under road/curb or a circular cap',
      );
    }
    ray.ray.origin.set(0, 8, 7);
    assert.ok(
      ray.intersectObject(mesh).length > 0,
      'nearby unoccupied land must not disappear',
    );
    assert.ok(
      Math.abs(
        projectedArea(geometry) -
          pieces.reduce((sum, p) => sum + roadPolygonArea(p), 0),
      ) < 0.001,
    );
  } finally {
    geometry.dispose();
    mesh.material.dispose();
  }
});

void test('lifting a rigid prop moves it vertically in world space and releases its old geometry', () => {
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group(),
    rotated = new THREE.Group();
  root.add(rotated);
  rotated.position.set(3, 2, -4);
  rotated.rotation.set(0.2, 0.7, -0.1);
  const mesh = kit.box(2, 3, 2, '#fff', 1, 1.5, 2, rotated, 0);
  root.updateMatrixWorld(true);
  const before = new THREE.Box3().setFromObject(mesh),
    old = mesh.geometry;
  let oldDisposals = 0,
    replacementDisposals = 0;
  old.addEventListener('dispose', () => oldDisposals++);
  liftScenery(kit, root, () => 17);
  root.updateMatrixWorld(true);
  const current = new THREE.Box3().setFromObject(mesh);
  assert.ok(Math.abs(current.min.x - before.min.x) < 0.00001);
  assert.ok(Math.abs(current.max.z - before.max.z) < 0.00001);
  assert.ok(Math.abs(current.min.y - before.min.y - 17) < 0.00001);
  assert.equal(oldDisposals, 1);
  assert.equal(kit.geometries.has(old), false);
  mesh.geometry.addEventListener('dispose', () => replacementDisposals++);
  kit.dispose();
  assert.equal(
    oldDisposals,
    1,
    'source geometry must not be retained for another disposal',
  );
  assert.equal(replacementDisposals, 1);
});

let fixture;
function renderedCity() {
  if (fixture) return fixture;
  const previous = globalThis.document;
  Reflect.set(globalThis, 'document', {
    createElement: () => ({
      width: 1024,
      height: 1024,
      getContext: () => new Proxy({}, { get: () => () => {} }),
    }),
  });
  const kit = new RenderKit(new THREE.Scene());
  try {
    const city = createCityEnvironment(kit);
    city.root.updateMatrixWorld(true);
    const colors = new Map();
    city.root.traverse((mesh) => {
      if (!mesh.isMesh || mesh.isInstancedMesh || Array.isArray(mesh.material))
        return;
      const color = mesh.material.color?.getHexString();
      const entries = colors.get(color) ?? [];
      entries.push(mesh);
      colors.set(color, entries);
    });
    fixture = { kit, city, colors };
    return fixture;
  } finally {
    globalThis.document = previous;
  }
}
after(() => {
  fixture?.kit.dispose();
});

// A vertical probe on actual emitted triangles, with spatial bins so broad
// road coverage remains cheap after static meshes have lost individual names.
function surfaceProbe(meshes, accept = () => true) {
  const bins = new Map(),
    cell = 32;
  for (const mesh of meshes) {
    const p = mesh.geometry.attributes.position,
      index = mesh.geometry.index,
      count = index?.count ?? p.count;
    for (let i = 0; i < count; i += 3) {
      const v = [0, 1, 2].map((j) =>
        new THREE.Vector3()
          .fromBufferAttribute(p, index ? index.getX(i + j) : i + j)
          .applyMatrix4(mesh.matrixWorld),
      );
      const [a, b, c] = v;
      const determinant = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(determinant) < 1e-8 || !accept(v)) continue;
      const triangle = { a, b, c, determinant };
      for (
        let x = Math.floor(Math.min(...v.map((p) => p.x)) / cell);
        x <= Math.floor(Math.max(...v.map((p) => p.x)) / cell);
        x++
      )
        for (
          let z = Math.floor(Math.min(...v.map((p) => p.z)) / cell);
          z <= Math.floor(Math.max(...v.map((p) => p.z)) / cell);
          z++
        ) {
          const key = `${x}:${z}`,
            entries = bins.get(key) ?? [];
          entries.push(triangle);
          bins.set(key, entries);
        }
    }
  }
  return (x, z) => {
    const hits = [];
    for (const { a, b, c, determinant } of bins.get(
      `${Math.floor(x / cell)}:${Math.floor(z / cell)}`,
    ) ?? []) {
      const u =
        ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / determinant;
      const v =
        ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / determinant;
      if (Math.min(u, v, 1 - u - v) < -1e-6) continue;
      hits.push(u * a.y + v * b.y + (1 - u - v) * c.y);
    }
    return hits;
  };
}

void test('actual terrain never covers the top asphalt across ground/lower roads and island bridge landings', () => {
  const { colors } = renderedCity();
  const asphalt = surfaceProbe(colors.get('535b5e') ?? []);
  const land = surfaceProbe(colors.get('82966d') ?? []);
  const island = surfaceProbe(colors.get('708858') ?? [], (vertices) =>
    vertices.every(
      (p) => Math.abs(p.y - cityGroundHeight(p.x, p.z) - 0.027) < 0.01,
    ),
  );
  const failures = [];
  for (const road of cityRoads) {
    const dx = road.to.x - road.from.x,
      dz = road.to.z - road.from.z,
      length = Math.hypot(dx, dz);
    for (let along = 1.9; along < length; along += 7.7)
      for (const lateral of [-0.35, 0, 0.35]) {
        const x =
          road.from.x +
          (dx * along) / length -
          (dz / length) * road.width * lateral;
        const z =
          road.from.z +
          (dz * along) / length +
          (dx / length) * road.width * lateral;
        const roadY = Math.max(...asphalt(x, z)),
          terrainY = Math.max(...land(x, z), ...island(x, z));
        if (terrainY > roadY + 0.02)
          failures.push({ road: road.id, x, z, burial: terrainY - roadY });
      }
  }
  assert.equal(
    failures.length,
    0,
    JSON.stringify(failures.sort((a, b) => b.burial - a.burial).slice(0, 5)),
  );
});

void test('rendered road height follows the drivable surface through sharp parcel blends', () => {
  const { colors } = renderedCity(),
    asphalt = surfaceProbe(colors.get('535b5e') ?? []);
  const failures = [];
  for (const road of cityRoads) {
    const dx = road.to.x - road.from.x,
      dz = road.to.z - road.from.z,
      length = Math.hypot(dx, dz),
      heading = Math.atan2(dx, -dz);
    for (
      let along = 1.9;
      along < length;
      along += cityRoadLayer(road) === 'raised' ? 1.3 : 7.7
    )
      for (const lateral of [-0.35, 0, 0.35]) {
        const x =
          road.from.x +
          (dx * along) / length -
          (dz / length) * road.width * lateral;
        const z =
          road.from.z +
          (dz * along) / length +
          (dx / length) * road.width * lateral;
        const pose = citySurfacePose(
          x,
          z,
          heading,
          cityRoadHeight(road, x, z),
          `road:${road.id}`,
        );
        const error = Math.min(
          ...asphalt(x, z).map((y) => Math.abs(y - pose.elevation - 0.065)),
        );
        if (error > 0.18) failures.push({ road: road.id, x, z, error });
      }
  }
  assert.equal(
    failures.length,
    0,
    JSON.stringify(failures.sort((a, b) => b.error - a.error).slice(0, 5)),
  );
});

void test('bank faces close the visible gap from the river to the elevated land', () => {
  const { colors } = renderedCity(),
    walls = colors.get('8f8c82') ?? [];
  const ray = new THREE.Raycaster(),
    failures = [];
  for (let i = 1; i < RIVER_SECTIONS.length; i++) {
    const a = RIVER_SECTIONS[i - 1],
      b = RIVER_SECTIONS[i];
    for (const side of [-1, 1])
      for (const t of [0.23, 0.53, 0.79]) {
        const x = a.x + (b.x - a.x) * t;
        const z =
          a.z + side * a.half + (b.z + side * b.half - a.z - side * a.half) * t;
        const top = cityGroundHeight(x, z + side * 0.3);
        if (top < -2.5) continue;
        ray.set(
          new THREE.Vector3(x, (top - 3) / 2, z - side * 0.1),
          new THREE.Vector3(0, 0, side),
        );
        ray.far = 0.6;
        if (!ray.intersectObjects(walls, false).length)
          failures.push({ x, z, top });
      }
  }
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 5)));
});

void test('terrain batching retains only live geometry and frame updates allocate no graphics resources', () => {
  const { kit, city } = renderedCity(),
    used = new Set();
  kit.scene.traverse((mesh) => {
    if (mesh.geometry) used.add(mesh.geometry);
  });
  assert.ok(
    kit.geometries.size < 160,
    'source terrain and prop geometries must be released after batching',
  );
  for (const geometry of kit.geometries)
    assert.ok(used.has(geometry), 'unreferenced source geometry retained');
  const resources = [
    kit.geometries.size,
    kit.materials.size,
    kit.textures.size,
  ];
  for (let i = 0; i < 120; i++) city.update(i / 60, 0, -1, false);
  assert.deepEqual(
    [kit.geometries.size, kit.materials.size, kit.textures.size],
    resources,
  );
});
