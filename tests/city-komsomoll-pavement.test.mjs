import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cityRoads } from '../lib/game/city/layout.ts';
import { cityGroundHeight } from '../lib/game/city/surface.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createMallParking } from '../components/game/city/mall-landmarks.ts';
import { liftScenery } from '../components/game/city/relief.ts';

void test('Komsomoll pavement follows its full surface and never overlaps the entry asphalt', () => {
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  createMallParking(kit, root);
  const pavement = root.getObjectByName('parking:komsomoll:pavement');
  assert.ok(pavement?.isMesh);
  liftScenery(kit, root, cityGroundHeight);
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(),
    new THREE.Vector3(0, -1, 0),
  );
  try {
    const position = pavement.geometry.attributes.position;
    let maximumError = 0;
    // Interior triangle probes catch the former enormous diagonal, whose
    // corner samples were correct while its interior cut through the street.
    for (let i = 0; i < position.count; i += 3) {
      const points = [0, 1, 2].map((j) =>
        new THREE.Vector3()
          .fromBufferAttribute(position, i + j)
          .applyMatrix4(pavement.matrixWorld),
      );
      for (const weights of [
        [1 / 3, 1 / 3, 1 / 3],
        [0.8, 0.1, 0.1],
        [0.1, 0.8, 0.1],
        [0.1, 0.1, 0.8],
      ]) {
        const sample = new THREE.Vector3();
        points.forEach((p, j) => sample.addScaledVector(p, weights[j]));
        maximumError = Math.max(
          maximumError,
          Math.abs(sample.y - cityGroundHeight(sample.x, sample.z) - 0.09),
        );
      }
    }
    assert.ok(maximumError < 0.045, `rendered pavement error: ${maximumError}`);
    let probes = 0;
    for (const road of cityRoads.filter((r) =>
      r.id.startsWith('komsomoll-forecourt:'),
    )) {
      const dx = road.to.x - road.from.x,
        dz = road.to.z - road.from.z,
        length = Math.hypot(dx, dz);
      for (let along = 0; along <= length; along += 1)
        for (const lateral of [
          -road.width / 2 + 0.2,
          0,
          road.width / 2 - 0.2,
        ]) {
          const x =
              road.from.x + (dx * along) / length - (dz * lateral) / length,
            z = road.from.z + (dz * along) / length + (dx * lateral) / length;
          ray.ray.origin.set(x, 40, z);
          assert.equal(
            ray.intersectObject(pavement).length,
            0,
            `duplicate pavement at ${x},${z}`,
          );
          probes++;
        }
    }
    assert.ok(probes > 450);
    assert.equal(
      root.children.filter((o) => o.name === 'parking:komsomoll').length,
      1,
    );
  } finally {
    kit.dispose();
  }
});
