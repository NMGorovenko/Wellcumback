import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createScreenModel,
  MOUNT_Z,
  hookHeight,
} from '../components/game/screen/screen-model.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createScreenEpisode } from '../lib/game/screen/episodes.ts';
void test('raised screen exposes its clean front and covers every spring with cloth or bezel', () => {
  const old = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: { createElement: () => ({ getContext: () => ({}) }) },
  });
  const kit = new RenderKit(new THREE.Scene());
  try {
    const screen = createScreenModel(kit);
    const s = createScreenEpisode(2, 'lift');
    s.liftX = 0;
    s.liftLeft = 5.9;
    s.liftRight = 6.03;
    for (let i = 0; i < 240; i++) screen.update(s, 1 / 60);
    screen.root.updateMatrixWorld(true);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(
      screen.root.matrixWorld,
    );
    assert.ok(normal.z < -0.99, 'back hardware faces the wall');
    for (let side = 0; side < 2; side++) {
      const ring = screen.ringWorld(side);
      assert.ok(Math.abs(ring.x - (side ? 2.16 : -2.16)) < 1e-8);
      assert.ok(Math.abs(ring.y - hookHeight(side ? 6.03 : 5.9)) < 1e-8);
      assert.ok(Math.abs(ring.z - MOUNT_Z) < 1e-8);
    }
    const ray = new THREE.Raycaster();
    for (const spring of screen.coils.flat()) {
      const center = spring.getWorldPosition(new THREE.Vector3());
      ray.set(
        new THREE.Vector3(center.x, center.y, center.z + 10),
        new THREE.Vector3(0, 0, -1),
      );
      const hits = ray.intersectObjects(
        [screen.cloth, screen.front, spring],
        true,
      );
      assert.ok(hits.length);
      let parent = hits[0].object;
      while (parent && parent !== spring) parent = parent.parent;
      assert.equal(parent, null, 'front face occludes the spring');
    }
    const left = screen.cloth.localToWorld(new THREE.Vector3(-1, 0, 0));
    const right = screen.cloth.localToWorld(new THREE.Vector3(1, 0, 0));
    assert.ok(
      right.x > left.x,
      'projection text is not mirrored by the physical flip',
    );
  } finally {
    kit.dispose();
    globalThis.document = old;
  }
});
