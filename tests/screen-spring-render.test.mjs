import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSpringFeedback } from '../components/game/screen/spring-feedback.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createRig } from '../components/game/world/rig.ts';
import { people } from '../lib/game/presets.ts';
import {
  createSpringFlight,
  SPRING_FLIGHT_LIFETIME,
} from '../lib/game/screen/spring-feedback.ts';

const layout = {
  scale: 0.49,
  offsetZ: -0.56,
  bounds: { minX: -6.5, maxX: 6.5, minZ: -4, maxZ: 4 },
};
const fixture = () => {
  const kit = new RenderKit(new THREE.Scene());
  const feedback = createSpringFeedback(kit);
  return { kit, feedback };
};

void test('tumbling spring hooks stay above the floor through bounce and fade', () => {
  const { kit, feedback } = fixture();
  try {
    const bounds = new THREE.Box3();
    for (let side = 0; side < 4; side++) {
      const flight = createSpringFlight(1, side, 2, 0, 0, 0.9, layout);
      for (let elapsed = 0; elapsed < SPRING_FLIGHT_LIFETIME; elapsed += 0.01) {
        feedback.update({ phase: 'tension', elapsed, springFlights: [flight] });
        const coil = kit.scene.children.find(
          (item) => item instanceof THREE.Group && item.visible,
        );
        assert.ok(coil, 'spring remains rendered before its lifetime ends');
        bounds.setFromObject(coil, true);
        assert.ok(
          bounds.min.y >= 0.005,
          `side=${side} time=${elapsed} floor=${bounds.min.y}`,
        );
      }
    }
    feedback.update({ phase: 'tension', elapsed: 3, springFlights: [] });
    assert.ok(kit.scene.children.every((object) => !object.visible));
  } finally {
    kit.dispose();
  }
});

void test('paused hit snapshots keep the hand over the eye without accumulating pose changes', () => {
  const { kit, feedback } = fixture();
  kit.texture = () => {
    const texture = new THREE.Texture();
    kit.textures.add(texture);
    return texture;
  };
  const rig = createRig(kit, people[0]);
  const flight = createSpringFlight(1, 0, 2, 0, 0, 0.9, layout);
  flight.hit = { worker: 1, at: 0.2, point: { x: 0, y: 1.12, z: -2.1 } };
  const state = {
    phase: 'tension',
    elapsed: 0.4,
    paused: true,
    springFlights: [flight],
  };
  const face = new THREE.Vector3();
  const hand = new THREE.Vector3();
  let expected;
  try {
    for (let frame = 0; frame < 20; frame++) {
      feedback.update(state);
      rig.update(4, 'work');
      rig.setCrouch(0.72);
      feedback.react(rig, 1);
      rig.root.updateMatrixWorld(true);
      rig.head.localToWorld(face.set(0.08, 0.015, 0.225));
      rig.rightHand.getWorldPosition(hand);
      assert.ok(
        hand.distanceTo(face) < 0.1,
        'the hand actually reaches the eye',
      );
      const pose = [
        ...hand.toArray(),
        ...rig.head.rotation.toArray().slice(0, 3),
      ];
      if (expected) assert.deepEqual(pose, expected);
      expected = pose;
    }
  } finally {
    kit.dispose();
  }
});
