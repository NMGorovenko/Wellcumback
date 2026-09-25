import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cityBuildings,
  cityRoads,
  distanceToRoad,
} from '../lib/game/city/layout.ts';
import { cityGroundHeight, cityRoadLayer } from '../lib/game/city/surface.ts';
import { roadSurfaceOutlines } from '../lib/game/city/road-surfaces.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createOperaLandmark } from '../components/game/city/opera-landmark.ts';
import { drapedGeometry } from '../components/game/city/relief.ts';

void test('the opera footprint and exposed rear corners have solid support above coarse rendered terrain', () => {
  const b = cityBuildings.find((building) => building.kind === 'theatre'),
    base = cityGroundHeight(b.x, b.z),
    kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  root.position.y = base;
  createOperaLandmark(kit, root, b);
  root.updateMatrixWorld(true);
  const foundation = root.getObjectByName('theatre:foundation');
  assert.ok(
    foundation?.isMesh,
    'the raised opera needs a closed structural base',
  );

  // Use the same eight-metre world grid and road cutouts as the surrounding
  // terrain. Analytic cityGroundHeight alone is flat under the parcel and
  // cannot detect the visible gap caused by interpolation outside its edge.
  const area = [
    { x: 80, z: 88 },
    { x: 128, z: 88 },
    { x: 128, z: 152 },
    { x: 80, z: 152 },
  ];
  const terrain = kit.mesh(
    drapedGeometry(
      [area],
      cityGroundHeight,
      0,
      8,
      roadSurfaceOutlines(
        cityRoads.filter((r) => cityRoadLayer(r) !== 'raised'),
        undefined,
        0.65,
      ),
    ),
    kit.material('#82966d'),
  );
  const ray = new THREE.Raycaster(
    new THREE.Vector3(),
    new THREE.Vector3(0, -1, 0),
  );
  const bounds = new THREE.Box3().setFromObject(foundation);
  let probes = 0,
    exposedProbes = 0;
  try {
    for (let x = b.x - b.w / 2; x <= b.x + b.w / 2; x += 0.5)
      for (let z = b.z - b.d / 2; z <= b.z + b.d / 2; z += 0.5) {
        ray.ray.origin.set(x, base + 0.2, z);
        const top = ray.intersectObject(foundation)[0],
          ground = ray.intersectObject(terrain)[0];
        assert.ok(top, `unsupported footprint at ${x},${z}`);
        assert.ok(Math.abs(top.point.y - base) < 0.05);
        assert.ok(ground, 'the fixture includes the adjacent land');
        assert.ok(
          bounds.min.y < ground.point.y - 0.1,
          'the base penetrates the rendered land',
        );
        if (base - ground.point.y > 0.5) exposedProbes++;
        probes++;
      }
    assert.ok(
      probes > 1900 && exposedProbes > 100,
      'exercise the actual rear-corner terrain gap',
    );

    // Horizontal rays close the visible wall below the opera, rather than
    // merely hiding the gap with a floating horizontal slab.
    ray.ray.direction.set(1, 0, 0);
    for (const z of [120, 126, 132])
      for (const depth of [0.1, 0.75, 1.5, 2.5, 3.5]) {
        ray.ray.origin.set(b.x - b.w / 2 - 4, base - depth, z);
        const hit = ray.intersectObject(foundation)[0];
        assert.ok(hit, `open retaining face at ${z}, depth ${depth}`);
        assert.ok(Math.abs(hit.point.x - bounds.min.x) < 0.001);
      }
    for (const x of [bounds.min.x, bounds.max.x])
      for (let z = bounds.min.z; z <= bounds.max.z; z += 0.5)
        for (const road of cityRoads)
          assert.ok(
            distanceToRoad(x, z, road) > road.width / 2 + 1,
            'foundation clears the complete street width',
          );
    assert.equal(foundation.material, kit.material('#b6c1c0'));
    assert.ok(foundation.geometry.index.count / 3 <= 24);
  } finally {
    kit.dispose();
  }
});
