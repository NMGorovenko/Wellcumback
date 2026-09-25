import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createDrapedEdgeStitcher,
  createTerrainSeamMaterial,
  convexPieces,
  drapedGeometry,
  drapedRegionSeams,
  terrainTiles,
} from '../components/game/city/relief.ts';
import {
  buildRoadSurfaces,
  roadSurfaceOutlines,
} from '../lib/game/city/road-surfaces.ts';
import {
  CITY_BOUNDS,
  RIVER_SECTIONS,
  ROUNDABOUT,
  cityRoads,
} from '../lib/game/city/layout.ts';
import {
  cityGroundHeight,
  cityGroundRoadHeight,
  cityRoadLayer,
} from '../lib/game/city/surface.ts';

const material = () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const heightAt = (mesh, x, z) =>
  new THREE.Raycaster(
    new THREE.Vector3(x, 200, z),
    new THREE.Vector3(0, -1, 0),
  ).intersectObject(mesh)[0]?.point.y;

void test('Komso junction seals the real adaptive asphalt cracks from either viewing side', () => {
  const roads = cityRoads.filter(
    (road) =>
      cityRoadLayer(road) === 'ground' &&
      Math.min(road.from.x, road.to.x) < 550 &&
      Math.max(road.from.x, road.to.x) > 480 &&
      Math.min(road.from.z, road.to.z) < -215 &&
      Math.max(road.from.z, road.to.z) > -285,
  );
  const asphalt = drapedGeometry(
    buildRoadSurfaces(roads).asphalt,
    cityGroundRoadHeight,
    0.065,
    3,
    [],
    0.06,
  );
  const original = new Float32Array(asphalt.attributes.position.array);
  const bounds = { minX: 485, maxX: 625, minZ: -278, maxZ: -140 };
  const patch = drapedRegionSeams(asphalt, cityGroundRoadHeight, bounds);
  const stitcher = createDrapedEdgeStitcher();
  stitcher.add(asphalt);
  const gaps = stitcher.stitch(asphalt);
  const road = new THREE.Mesh(asphalt, material());
  const closure = new THREE.Mesh(patch, new THREE.MeshBasicMaterial());
  let checked = 0;
  try {
    assert.deepEqual(
      asphalt.attributes.position.array,
      original,
      'no pavement vertex is moved',
    );
    assert.ok(
      patch.attributes.position.count > 0 &&
        patch.attributes.position.count / 3 < 500,
      'only a small local set of closure triangles is needed',
    );
    const positions = gaps.attributes.position;
    for (let i = 0; i < positions.count; i += 3) {
      const points = [0, 1, 2].map((offset) =>
        new THREE.Vector3().fromBufferAttribute(positions, i + offset),
      );
      const centre = points
        .reduce((sum, point) => sum.add(point), new THREE.Vector3())
        .multiplyScalar(1 / 3);
      if (
        centre.x < 488 ||
        centre.x > 539 ||
        centre.z < -277 ||
        centre.z > -218
      )
        continue;
      const gap = Math.max(
        ...points.flatMap((a, j) =>
          points
            .slice(j + 1)
            .filter((b) => Math.hypot(a.x - b.x, a.z - b.z) < 0.001)
            .map((b) => Math.abs(a.y - b.y)),
        ),
      );
      if (!(gap > 0.01)) continue;
      const direction = points[1]
        .clone()
        .sub(points[0])
        .cross(points[2].clone().sub(points[0]));
      direction.y = 0;
      direction.normalize();
      const ray = new THREE.Raycaster(
        centre.clone().addScaledVector(direction, 0.001),
        direction.clone().negate(),
        0,
        0.002,
      );
      if (ray.intersectObject(road).length) continue;
      assert.ok(
        ray.intersectObject(closure).length,
        `close asphalt hole at ${centre.x},${centre.z}`,
      );
      ray.set(centre.clone().addScaledVector(direction, -0.001), direction);
      assert.ok(
        ray.intersectObject(closure).length,
        'the opposite road-level view is closed too',
      );
      checked++;
    }
    assert.ok(
      checked >= 10,
      `real centimetre-wide holes reproduced: ${checked}`,
    );
    for (let i = 0; i < patch.attributes.position.count; i++) {
      assert.ok(
        patch.attributes.normal.getY(i) > 0.9,
        'closure receives road lighting',
      );
      assert.ok(
        Math.abs(
          patch.attributes.uv.getX(i) - patch.attributes.position.getX(i) / 10,
        ) < 0.00001,
      );
    }
  } finally {
    for (const geometry of [asphalt, patch, gaps]) geometry.dispose();
    road.material.dispose();
    closure.material.dispose();
  }
});

void test('Kacha north-bank terrain and curbs join across both signs of their tessellation mismatch', () => {
  const roads = cityRoads.filter(
    (r) =>
      !r.bridge &&
      r.layer !== 'raised' &&
      Math.max(r.from.x, r.to.x) > 30 &&
      Math.min(r.from.x, r.to.x) < 220 &&
      Math.max(r.from.z, r.to.z) > -380 &&
      Math.min(r.from.z, r.to.z) < -300,
  );
  const surfaces = buildRoadSurfaces(roads);
  const outer = [
    { x: 30, z: -380 },
    { x: 220, z: -380 },
    { x: 220, z: -290 },
    { x: 30, z: -290 },
  ];
  const ground = new THREE.Mesh(
    drapedGeometry(
      [outer],
      cityGroundHeight,
      0,
      8,
      roadSurfaceOutlines(roads, undefined, 0.65),
    ),
    material(),
  );
  const curb = new THREE.Mesh(
    drapedGeometry(surfaces.curbs, cityGroundHeight, 0.14, 3),
    material(),
  );
  const stitcher = createDrapedEdgeStitcher();
  stitcher.add(ground.geometry);
  const seam = new THREE.Mesh(stitcher.stitch(curb.geometry), material());
  try {
    const signs = new Set();
    for (const [x, z] of [
      [172.65, -319.75],
      [97.65, -324.25],
    ]) {
      const terrainY = heightAt(ground, x + 0.001, z);
      const curbY = heightAt(curb, x - 0.001, z);
      assert.ok(Number.isFinite(terrainY) && Number.isFinite(curbY));
      const gap = curbY - terrainY;
      assert.ok(
        Math.abs(gap) > 0.2,
        'fixture exposes the existing grid mismatch',
      );
      signs.add(Math.sign(gap));
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x + 0.1, (curbY + terrainY) / 2, z),
        new THREE.Vector3(-1, 0, 0),
        0,
        0.2,
      );
      assert.ok(
        ray.intersectObject(seam).length,
        'a horizontal view must hit the closing face, never sky',
      );
    }
    assert.equal(
      signs.size,
      2,
      'either terrain or curb may be the higher edge',
    );
    assert.ok(
      seam.geometry.attributes.position.count <
        curb.geometry.attributes.position.count,
      'only matching boundary edges receive faces',
    );
  } finally {
    for (const mesh of [ground, curb, seam]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
});

void test('a curb seals its height offset while nearby unrelated boundaries remain open', () => {
  const rectangle = (a, b) => [
    { x: 0, z: a },
    { x: 20, z: a },
    { x: 20, z: b },
    { x: 0, z: b },
  ];
  const ground = drapedGeometry([rectangle(-5, 0)], () => 4, 0, 8);
  const curb = drapedGeometry([rectangle(0, 0.65)], () => 4, 0.14, 3);
  const separate = drapedGeometry([rectangle(1, 2)], () => 4, 0.14, 3);
  const stitcher = createDrapedEdgeStitcher();
  stitcher.add(ground);
  const seam = new THREE.Mesh(stitcher.stitch(curb), material());
  const unmatched = stitcher.stitch(separate);
  try {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(7, 4.07, 0.1),
      new THREE.Vector3(0, 0, -1),
      0,
      0.2,
    );
    assert.ok(
      ray.intersectObject(seam).length,
      'the fourteen-centimetre curb rise has a vertical face',
    );
    assert.equal(
      unmatched.attributes.position.count,
      0,
      'no wall bridges unrelated parallel footprints',
    );
  } finally {
    for (const geometry of [ground, curb, separate, seam.geometry, unmatched])
      geometry.dispose();
    seam.material.dispose();
  }
});

void test('cutout T-junctions inside the north terrain close the exact Kacha screenshot rays', () => {
  const north = RIVER_SECTIONS.map((p) => ({ x: p.x, z: p.z - p.half - 24 }));
  const outline = [
    { x: CITY_BOUNDS.minX, z: CITY_BOUNDS.minZ },
    { x: CITY_BOUNDS.maxX, z: CITY_BOUNDS.minZ },
    ...north.reverse(),
  ];
  // Reproduce only the affected tile, with the same bank triangulation, grid,
  // and road cutouts as the renderer. No full city scene is needed.
  const tiles = [...terrainTiles(convexPieces(outline), 256)].filter((tile) =>
    tile.some((polygon) =>
      polygon.some((p) => p.x >= 0 && p.x <= 256 && p.z >= -512 && p.z <= -256),
    ),
  );
  const holes = roadSurfaceOutlines(
    cityRoads.filter(
      (r) =>
        cityRoadLayer(r) !== 'raised' ||
        (r.bridge && r.bridge !== 'nikolaevsky'),
    ),
    ROUNDABOUT,
    0.65,
  );
  const ground = tiles.map(
    (tile) =>
      new THREE.Mesh(
        drapedGeometry(tile, cityGroundHeight, 0, 8, holes),
        material(),
      ),
  );
  const stitcher = createDrapedEdgeStitcher();
  const seams = ground.map((mesh) => {
    stitcher.add(mesh.geometry);
    return new THREE.Mesh(stitcher.stitch(mesh.geometry), material());
  });
  try {
    const camera = new THREE.PerspectiveCamera(52, 1142 / 1268, 0.1, 8000);
    camera.position.set(170, 90, -70);
    camera.lookAt(90, 12, -280);
    camera.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    for (const [x, y] of [
      [1018, 542],
      [1030, 543],
    ]) {
      ray.setFromCamera(
        new THREE.Vector2((x / 1142) * 2 - 1, 1 - (y / 1268) * 2),
        camera,
      );
      assert.equal(
        ray.intersectObjects(ground).length,
        0,
        'fixture retains the original open T-junction',
      );
      const hit = ray.intersectObjects(seams)[0];
      assert.ok(hit, 'the sky slit now hits a solid terrain join');
      assert.ok(
        Math.abs(hit.point.z + 344) < 0.001,
        'join lies on the actual eight-metre grid boundary',
      );
    }
    const sourceVertices = ground.reduce(
      (sum, mesh) => sum + mesh.geometry.attributes.position.count,
      0,
    );
    const seamVertices = seams.reduce(
      (sum, mesh) => sum + mesh.geometry.attributes.position.count,
      0,
    );
    assert.ok(
      seamVertices > 0 && seamVertices < sourceVertices * 0.1,
      `only unmatched cut edges are filled: ${seamVertices / 3} faces for ${sourceVertices / 3} terrain faces`,
    );
    const triangles = new Set();
    for (const mesh of seams) {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 3) {
        const points = [0, 1, 2].map((j) =>
          new THREE.Vector3().fromBufferAttribute(p, i + j),
        );
        assert.ok(
          new THREE.Triangle(...points).getArea() > 1e-8,
          'no zero-height or collapsed faces',
        );
        const key = points
          .map((point) => point.toArray().join(':'))
          .sort()
          .join('/');
        assert.equal(
          triangles.has(key),
          false,
          'one face per join, without mirrored duplicates',
        );
        triangles.add(key);
      }
    }
  } finally {
    for (const mesh of [...ground, ...seams]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
});

void test('two-sided terrain joins keep the natural ground normal instead of flipping it into shadow', () => {
  const terrain = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
  });
  const seam = createTerrainSeamMaterial(terrain);
  try {
    const shader = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {},
    };
    assert.match(
      THREE.ShaderChunk.normal_fragment_begin,
      /normal \*= faceDirection;/,
      'verify the installed Three shader hook still targets the face-normal flip',
    );
    seam.onBeforeCompile(shader, {});
    assert.equal(
      terrain.side,
      THREE.FrontSide,
      'ordinary terrain shading is unchanged',
    );
    assert.equal(seam.side, THREE.DoubleSide);
    assert.equal(seam.vertexColors, true);
    assert.equal(seam.roughness, terrain.roughness);
    assert.ok(
      !shader.fragmentShader.includes('#include <normal_fragment_begin>'),
    );
    assert.ok(
      shader.fragmentShader.includes('vec3 normal = normalize( vNormal );'),
    );
    assert.ok(
      !shader.fragmentShader.includes('normal *= faceDirection;'),
      'both face orientations receive the same supplied terrain normal',
    );
    assert.notEqual(
      seam.customProgramCacheKey(),
      terrain.customProgramCacheKey(),
    );
  } finally {
    seam.dispose();
    terrain.dispose();
  }
});

void test('road tessellation refines curved grades while leaving planar pavement unchanged', () => {
  const rectangle = [
    [
      { x: -30, z: -6 },
      { x: 30, z: -6 },
      { x: 30, z: 6 },
      { x: -30, z: 6 },
    ],
  ];
  const plane = (x, z) => 20 + x * 0.08 + z * 0.02;
  const bend = (x, z) => plane(x, z) + 0.4 * Math.tanh(x * 1.5);
  const coarsePlane = drapedGeometry(rectangle, plane, 0, 3);
  const precisePlane = drapedGeometry(rectangle, plane, 0, 3, [], 0.06);
  const coarseBend = drapedGeometry(rectangle, bend, 0, 3);
  const preciseBend = drapedGeometry(rectangle, bend, 0, 3, [], 0.06);
  const surface = new THREE.Mesh(preciseBend, material());
  try {
    assert.equal(
      precisePlane.attributes.position.count,
      coarsePlane.attributes.position.count,
      'flat roads consume no extra triangles',
    );
    assert.ok(
      preciseBend.attributes.position.count >
        coarseBend.attributes.position.count,
    );
    assert.ok(
      preciseBend.attributes.position.count <
        coarseBend.attributes.position.count * 4,
      'a local grade change must not uniformly refine all pavement',
    );
    for (let x = -8.8; x < 8.8; x += 0.2)
      for (let z = -5.8; z < 5.8; z += 0.7)
        assert.ok(
          Math.abs(heightAt(surface, x, z) - bend(x, z)) < 0.08,
          `curved grade remains close to the physical surface at ${x},${z}`,
        );
  } finally {
    for (const geometry of [coarsePlane, precisePlane, coarseBend, preciseBend])
      geometry.dispose();
    surface.material.dispose();
  }
});
