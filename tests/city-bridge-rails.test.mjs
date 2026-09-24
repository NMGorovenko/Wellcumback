import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createBridgeRails } from '../components/game/city/bridge-rails.ts';
import { cityBarriers } from '../lib/game/city/barriers.ts';
import { cityRoads } from '../lib/game/city/layout.ts';
import { cityRoadHeight } from '../lib/game/city/surface.ts';

void test('visible bridge rails follow the collision footprints and local deck height', () => {
  const scene = new THREE.Scene();
  const kit = new RenderKit(scene);
  try {
    const groups = createBridgeRails(kit, scene);
    assert.equal(groups.length, cityBarriers.length);
    scene.updateMatrixWorld(true);
    const vertex = new THREE.Vector3();
    for (const group of groups) {
      const b = group.userData.barrier;
      const road = cityRoads.find((r) => r.id === b.roadId);
      const c = Math.cos(b.angle ?? 0),
        s = Math.sin(b.angle ?? 0);
      group.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const p = mesh.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          vertex.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
          const dx = vertex.x - b.x,
            dz = vertex.z - b.z;
          assert.ok(
            Math.abs(dx * c - dz * s) <= b.w / 2 + 0.002,
            `rail visible outside collider width at ${b.roadId}`,
          );
          assert.ok(
            Math.abs(dx * s + dz * c) <= b.d / 2 + 0.002,
            `rail extends across junction opening at ${b.roadId}`,
          );
          const elevation = vertex.y - cityRoadHeight(road, vertex.x, vertex.z);
          assert.ok(
            elevation >= -0.025 && elevation <= 1.45,
            `floating/buried rail at ${b.roadId}: ${elevation}`,
          );
        }
      });
    }
  } finally {
    kit.dispose();
  }
});
