import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import {
  createScreenModel,
  FLOOR_Z,
  MOUNT_Z,
  hookHeight,
  hookX,
} from '../components/game/screen/screen-model.ts';
import { freshGame } from '../lib/game/screen/engine.ts';

// The projection canvas is only drawn in result. Geometry tests need its texture
// object, but do not emulate WebGL, the renderer, or any of the model transforms.
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }),
  },
});
function fixture(phase = 'drill') {
  const kit = new RenderKit(new THREE.Scene());
  const model = createScreenModel(kit),
    state = freshGame(2);
  Object.assign(state, {
    phase,
    corners: 4,
    rods: [1, 1, 1, 1],
    clips: [4, 4, 4, 4],
    tension: [1, 1, 1, 1],
    liftX: 0,
    holes: [5.7, 6.3],
  });
  return { kit, model, state };
}
function settle(model, state, preview = false) {
  for (let i = 0; i < 240; i++) model.update(state, 1 / 60, preview);
  model.root.updateWorldMatrix(true, true);
}
function visibleMeshes(model) {
  model.root.updateWorldMatrix(true, true);
  const meshes = [];
  model.root.traverseVisible((object) => {
    if (object.isMesh) meshes.push(object);
  });
  return meshes;
}
function visibleBounds(model) {
  const box = new THREE.Box3();
  for (const mesh of visibleMeshes(model))
    box.union(new THREE.Box3().setFromObject(mesh));
  return box;
}

void test('drill keeps the assembled screen flat and leaves actual camera rays to both chair positions clear', () => {
  const { kit, model, state } = fixture();
  settle(model, state);
  const box = visibleBounds(model);
  assert.ok(box.min.y > 0, 'assembled screen stays above the apartment floor');
  assert.ok(
    box.max.y < 0.25,
    'drilling must not erect a screen in front of the brigade',
  );
  assert.ok(Math.abs(model.root.position.z - FLOOR_Z) < 1e-8);
  assert.ok(
    model.rings.every((ring) => ring.visible),
    'attachment rings remain on the assembled floor screen',
  );
  const meshes = visibleMeshes(model);
  for (const x of [-2.16, 2.16]) {
    const camera = new THREE.Vector3(x * 0.25 + 3.5, 4.1, 6.3);
    for (const height of [0.15, 0.9, 1.5, 2.4]) {
      const worker = new THREE.Vector3(x, height, -2.65);
      const ray = new THREE.Raycaster(
        camera,
        worker.clone().sub(camera).normalize(),
        0.01,
        camera.distanceTo(worker) - 0.02,
      );
      assert.equal(
        ray.intersectObjects(meshes, false).length,
        0,
        `screen occludes chair/worker at ${x}, ${height}`,
      );
    }
  }
  kit.dispose();
});

void test('drill to lift rotates smoothly without driving any visible frame corner through the floor', () => {
  const { kit, model, state } = fixture();
  settle(model, state);
  const before = model.root.quaternion.clone();
  state.phase = 'lift';
  model.update(state, 1 / 60);
  const turn = before.angleTo(model.root.quaternion);
  assert.ok(
    turn > 0.01 && turn < 0.3,
    'first frame rotates partially rather than snapping',
  );
  for (let i = 0; i < 150; i++) {
    model.update(state, 1 / 60);
    assert.ok(
      visibleBounds(model).min.y > 0.035,
      `frame penetrates floor during lift at frame ${i}`,
    );
  }
  kit.dispose();
});

void test('after the floor transition both actual ring meshes still converge exactly to unequal hook positions', () => {
  const { kit, model, state } = fixture();
  settle(model, state);
  state.phase = 'lift';
  state.liftLeft = 5.7;
  state.liftRight = 6.3;
  settle(model, state);
  for (let side = 0; side < 2; side++) {
    const target = new THREE.Vector3(
      hookX(side),
      hookHeight(state.holes[side]),
      MOUNT_Z,
    );
    assert.ok(model.ringWorld(side).distanceTo(target) < 1e-7);
  }
  kit.dispose();
});

void test('preview remains upright independently of the drill floor pose', () => {
  const { kit, model, state } = fixture();
  settle(model, state, true);
  assert.ok(visibleBounds(model).max.y > 3);
  assert.ok(Math.abs(model.root.rotation.x) < 1e-8);
  kit.dispose();
});
