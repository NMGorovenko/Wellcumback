import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import {
  drapedGeometry,
  createDrapedEdgeStitcher,
} from '../components/game/city/relief.ts';
import {
  cityRoads,
  cityBuildings,
  distanceToRoad,
} from '../lib/game/city/layout.ts';
import { cityGroundHeight, cityRoadLayer } from '../lib/game/city/surface.ts';
import { roadSurfaceOutlines } from '../lib/game/city/road-surfaces.ts';
import {
  createHillGrounds,
  HILL_FOUNDATION_FOOTPRINTS,
  HILL_PLAZA_FOOTPRINTS,
} from '../components/game/city/hill-landmarks.ts';
const rect = (outline) => ({
  minX: Math.min(...outline.map((p) => p.x)),
  maxX: Math.max(...outline.map((p) => p.x)),
  minZ: Math.min(...outline.map((p) => p.z)),
  maxZ: Math.max(...outline.map((p) => p.z)),
});
const inside = (x, z, r) =>
  x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
// Two-dimensional bins make dense probes inexpensive without a full city scene.
function heightProbe(meshes) {
  const bins = new Map();
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position,
      index = mesh.geometry.index;
    for (let i = 0; i < (index?.count ?? pos.count); i += 3) {
      const p = [0, 1, 2].map((j) =>
        new THREE.Vector3()
          .fromBufferAttribute(pos, index ? index.getX(i + j) : i + j)
          .applyMatrix4(mesh.matrixWorld),
      );
      const [a, b, c] = p,
        det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(det) < 1e-9) continue;
      for (
        let x = Math.floor(Math.min(...p.map((v) => v.x)) / 2);
        x <= Math.floor(Math.max(...p.map((v) => v.x)) / 2);
        x++
      )
        for (
          let z = Math.floor(Math.min(...p.map((v) => v.z)) / 2);
          z <= Math.floor(Math.max(...p.map((v) => v.z)) / 2);
          z++
        ) {
          const key = x + ':' + z,
            items = bins.get(key) ?? [];
          items.push({ a, b, c, det });
          bins.set(key, items);
        }
    }
  }
  return (x, z) => {
    let y = -Infinity;
    for (const { a, b, c, det } of bins.get(
      Math.floor(x / 2) + ':' + Math.floor(z / 2),
    ) ?? []) {
      const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / det,
        v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / det;
      if (Math.min(u, v, 1 - u - v) >= -1e-7)
        y = Math.max(y, u * a.y + v * b.y + (1 - u - v) * c.y);
    }
    return y === -Infinity ? undefined : y;
  };
}
function fixture(id) {
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  createHillGrounds(kit, root);
  root.updateMatrixWorld(true);
  const outline = HILL_PLAZA_FOOTPRINTS[id],
    r = rect(outline),
    bounds = {
      minX: Math.floor((r.minX - 16) / 8) * 8,
      maxX: Math.ceil((r.maxX + 16) / 8) * 8,
      minZ: Math.floor((r.minZ - 16) / 8) * 8,
      maxZ: Math.ceil((r.maxZ + 16) / 8) * 8,
    };
  const paving = root.children.filter(
    (m) =>
      m.isMesh &&
      inside(
        new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).x,
        new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).z,
        {
          minX: r.minX - 0.01,
          maxX: r.maxX + 0.01,
          minZ: r.minZ - 0.01,
          maxZ: r.maxZ + 0.01,
        },
      ),
  );
  const roads = cityRoads.filter(
    (road) =>
      cityRoadLayer(road) !== 'raised' &&
      Math.max(road.from.x, road.to.x) + road.width > bounds.minX &&
      Math.min(road.from.x, road.to.x) - road.width < bounds.maxX &&
      Math.max(road.from.z, road.to.z) + road.width > bounds.minZ &&
      Math.min(road.from.z, road.to.z) - road.width < bounds.maxZ,
  );
  const holes = [
    ...roadSurfaceOutlines(roads, undefined, 0.65),
    ...HILL_PLAZA_FOOTPRINTS,
    ...HILL_FOUNDATION_FOOTPRINTS,
  ];
  const terrain = kit.mesh(
    drapedGeometry(
      [
        [
          { x: bounds.minX, z: bounds.minZ },
          { x: bounds.maxX, z: bounds.minZ },
          { x: bounds.maxX, z: bounds.maxZ },
          { x: bounds.minX, z: bounds.maxZ },
        ],
      ],
      cityGroundHeight,
      0,
      8,
      holes,
    ),
    kit.material('#82966d'),
  );
  terrain.updateMatrixWorld(true);
  const stitcher = createDrapedEdgeStitcher(),
    seams = [];
  stitcher.add(terrain.geometry);
  for (const mesh of paving) {
    stitcher.add(mesh.geometry);
    const seam = kit.mesh(
      stitcher.stitch(mesh.geometry),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    seam.updateMatrixWorld(true);
    seams.push(seam);
  }
  return {
    kit,
    paving,
    terrain,
    seams,
    roads,
    r,
    sample: heightProbe(paving),
    ground: heightProbe([terrain]),
  };
}
const foundationRects = HILL_FOUNDATION_FOOTPRINTS.map(rect);
const buildings = cityBuildings.filter((b) =>
  [
    'karaulnaya-chapel',
    'chapel-cannon',
    'monastery',
    'monastery-wing',
  ].includes(b.kind),
);
function expectedPaving(x, z) {
  const b = buildings.find(
    (b) => Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2,
  );
  return (b ? cityGroundHeight(b.x, b.z) : cityGroundHeight(x, z)) + 0.04;
}

void test('plazas cover their terrain holes, clear roads and follow ground including narrow foundation collars', (t) => {
  for (let id = 0; id < 2; id++) {
    const f = fixture(id);
    try {
      let probes = 0,
        maxError = 0,
        worst;
      const check = (x, z) => {
        if (!inside(x, z, f.r) || foundationRects.some((r) => inside(x, z, r)))
          return;
        const y = f.sample(x, z);
        assert.ok(Number.isFinite(y), `missing plaza ${id} at ${x},${z}`);
        assert.equal(
          f.ground(x, z),
          undefined,
          'no old ground inside plaza cutout',
        );
        const error = Math.abs(y - expectedPaving(x, z));
        if (error > maxError) {
          maxError = error;
          worst = { x, z, y, expected: expectedPaving(x, z) };
        }
        probes++;
      };
      for (let x = f.r.minX + 0.027; x < f.r.maxX; x += 0.43)
        for (let z = f.r.minZ + 0.031; z < f.r.maxZ; z += 0.43) check(x, z);
      for (const b of buildings)
        if (inside(b.x, b.z, f.r))
          for (let t = 0.011; t < 1; t += 0.019)
            for (const offset of [
              -0.071, -0.05, -0.025, -0.005, 0.005, 0.02, 0.05, 0.1, 0.25,
            ]) {
              check(b.x - b.w / 2 - offset, b.z - b.d / 2 + b.d * t);
              check(b.x + b.w / 2 + offset, b.z - b.d / 2 + b.d * t);
              check(b.x - b.w / 2 + b.w * t, b.z - b.d / 2 - offset);
              check(b.x - b.w / 2 + b.w * t, b.z + b.d / 2 + offset);
            }
      for (let side = 0; side < 4; side++)
        for (let t = 0; t <= 1; t += 0.01) {
          const x =
              side < 2
                ? side
                  ? f.r.maxX
                  : f.r.minX
                : f.r.minX + (f.r.maxX - f.r.minX) * t,
            z =
              side >= 2
                ? side === 3
                  ? f.r.maxZ
                  : f.r.minZ
                : f.r.minZ + (f.r.maxZ - f.r.minZ) * t;
          assert.ok(
            f.roads.every((r) => distanceToRoad(x, z, r) > r.width / 2 + 0.45),
            'plaza clears complete asphalt width',
          );
        }
      assert.ok(maxError < 0.08, JSON.stringify({ id, maxError, worst }));
      assert.ok(probes > 7000);
      t.diagnostic(
        JSON.stringify({
          id,
          probes,
          maxError,
          triangles: f.paving.reduce(
            (n, m) => n + m.geometry.attributes.position.count / 3,
            0,
          ),
        }),
      );
    } finally {
      f.kit.dispose();
    }
  }
});

void test('shared terrain stitcher closes outer paving seams and parcel height steps from either side', (t) => {
  for (let id = 0; id < 2; id++) {
    const f = fixture(id);
    try {
      let gaps = 0,
        maxGap = 0;
      const boundaries = [
        { ...f.r, outer: true },
        ...buildings
          .filter((b) => inside(b.x, b.z, f.r))
          .map((b) => ({
            minX: b.x - b.w / 2,
            maxX: b.x + b.w / 2,
            minZ: b.z - b.d / 2,
            maxZ: b.z + b.d / 2,
            outer: false,
          })),
      ];
      const ray = new THREE.Raycaster();
      ray.far = 0.2;
      for (const r of boundaries)
        for (let side = 0; side < 4; side++)
          for (let t = 0.017; t < 1; t += 0.037) {
            const x =
                side < 2
                  ? side === 0
                    ? r.minX
                    : r.maxX
                  : r.minX + (r.maxX - r.minX) * t,
              z =
                side >= 2
                  ? side === 2
                    ? r.minZ
                    : r.maxZ
                  : r.minZ + (r.maxZ - r.minZ) * t,
              nx = side === 0 ? -1 : side === 1 ? 1 : 0,
              nz = side === 2 ? -1 : side === 3 ? 1 : 0;
            const a = f.sample(x - nx * 0.003, z - nz * 0.003),
              b = (r.outer ? f.ground : f.sample)(
                x + nx * 0.003,
                z + nz * 0.003,
              );
            if (a === undefined || b === undefined || Math.abs(a - b) < 0.08)
              continue;
            maxGap = Math.max(maxGap, Math.abs(a - b));
            for (const direction of [-1, 1]) {
              ray.set(
                new THREE.Vector3(
                  x + nx * 0.05 * direction,
                  (a + b) / 2,
                  z + nz * 0.05 * direction,
                ),
                new THREE.Vector3(-nx * direction, 0, -nz * direction),
              );
              assert.ok(
                ray.intersectObjects(f.seams).length,
                `unsealed ${id} boundary at ${x},${z}, gap ${a - b}`,
              );
            }
            gaps++;
          }
      assert.ok(gaps > 5, 'exercise actual unequal boundary heights');
      t.diagnostic(
        JSON.stringify({
          id,
          gaps,
          maxGap,
          seamTriangles: f.seams.reduce(
            (n, m) => n + m.geometry.attributes.position.count / 3,
            0,
          ),
        }),
      );
    } finally {
      f.kit.dispose();
    }
  }
});
