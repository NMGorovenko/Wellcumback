import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRig } from '../components/game/world/rig.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createScreenModel } from '../components/game/screen/screen-model.ts';
import {
  createSpiritLevel,
  placeLevelHands,
} from '../components/game/screen/spirit-level.ts';
import { createScreenEpisode } from '../lib/game/screen/episodes.ts';
import { tick } from '../lib/game/screen/engine.ts';
import {
  levelCheckStage,
  LEVEL_APPROACH,
  LEVEL_SHELF,
} from '../lib/game/screen/level-check.ts';
import { people } from '../lib/game/presets.ts';
import { levelKeys } from './screen-level-controller.mjs';

void test('level stays in the hand through placement and all permitted pickup approaches align first', () => {
  const document = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: { createElement: () => ({ getContext: () => ({}) }) },
  });
  const kit = new RenderKit(new THREE.Scene());
  kit.texture = () => new THREE.Texture();
  try {
    const rig = createRig(kit, people[0]),
      screen = createScreenModel(kit),
      prop = createSpiritLevel(kit);
    const s = createScreenEpisode(1, 'level');
    // Deliberately trigger from the far edge of the interaction radius.
    Object.assign(s.levelCheck, {
      x: LEVEL_APPROACH.x,
      z: LEVEL_APPROACH.z + 0.4,
      rotation: 0,
    });
    tick(s, 1 / 60, new Set(['KeyE']));
    assert.equal(s.levelCheck.mode, 'pickup');
    let pickup = 0,
      placing = 0,
      settled = 0;
    for (let i = 0; i < 2400 && s.phase !== 'result'; i++) {
      tick(s, 1 / 60, levelKeys(s));
      if (s.phase === 'result') break;
      screen.update(s, 1 / 60);
      const c = s.levelCheck,
        stage = levelCheckStage(s),
        worker = stage.workers[1];
      rig.root.position.copy(worker);
      rig.root.rotation.set(0, worker.rotation, 0);
      rig.update(
        s.elapsed,
        s.workers[1].animation === 'walk' ? 'walk' : 'work',
      );
      rig.setCrouch(worker.crouch);
      const target = screen.levelWorld();
      placeLevelHands(s, rig, target);
      const angle = Math.atan((Math.tan(s.angle) * 8.8 * 0.13) / 4.32);
      prop.update(s, rig, target, angle);
      const hand = rig.rightHand.getWorldPosition(new THREE.Vector3());
      if (c.mode === 'pickup' && c.progress > 0) {
        assert.ok(
          Math.hypot(c.x - LEVEL_APPROACH.x, c.z - LEVEL_APPROACH.z) < 0.016,
        );
        if (Math.abs(c.progress - 0.5) < 0.015) {
          assert.ok(
            hand.distanceTo(
              new THREE.Vector3()
                .copy(LEVEL_SHELF)
                .add(new THREE.Vector3(-0.18, 0, 0)),
            ) < 0.01,
            'hand reaches the actual shelf grip',
          );
          pickup++;
        }
      }
      if (c.mode === 'place' && c.progress > 0) {
        assert.ok(
          prop.root.position.distanceTo(
            hand.clone().add(new THREE.Vector3(0.18, 0, 0)),
          ) < 1e-8,
          'one interpolation only; prop cannot leave the gripping hand',
        );
        if (c.progress > 0.97)
          assert.ok(
            hand.distanceTo(
              target.clone().add(new THREE.Vector3(-0.18, 0, 0)),
            ) < 0.04,
            'top rail is within arm reach',
          );
        placing++;
      }
      if (c.mode === 'settle') {
        assert.ok(
          hand.distanceTo(target.clone().add(new THREE.Vector3(-0.18, 0, 0))) <
            0.01,
          'right hand does not cross over the left',
        );
        assert.ok(
          rig.leftHand
            .getWorldPosition(new THREE.Vector3())
            .distanceTo(target.clone().add(new THREE.Vector3(0.18, 0, 0))) <
            0.01,
        );
        settled++;
      }
    }
    assert.equal(s.phase, 'result');
    assert.ok(pickup && placing && settled);
  } finally {
    kit.dispose();
    globalThis.document = document;
  }
});
