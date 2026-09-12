import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createDrillProps } from '../components/game/screen/drill-props.ts';
import { freshGame } from '../lib/game/screen/engine.ts';

void test('animated brick particles stay millimetres across and persistent stains stay flat against the wall', () => {
  const kit = new RenderKit(new THREE.Scene());
  const props = createDrillProps(kit);
  const rig = () => ({
    leftHand: new THREE.Object3D(),
    rightHand: new THREE.Object3D(),
  });
  const s = freshGame(1);
  Object.assign(s, {
    phase: 'drill',
    drillMode: 'drill',
    drillGear: 'ready',
    drillRunning: true,
    wallDust: [1, 0.5],
  });
  const rigs = [rig(), rig(), rig()];
  for (const vacuum of [false, true]) {
    s.vacuumRunning = vacuum;
    props.update(s, rigs, 0.173);
    const dust = kit.scene.children.filter(
      (mesh) => mesh.material?.color?.getHexString() === 'b86d36',
    );
    const stains = kit.scene.children.filter(
      (mesh) => mesh.material?.color?.getHexString() === 'ae6536',
    );
    assert.equal(dust.length, 32);
    assert.equal(stains.length, 44);
    for (const mesh of dust)
      assert.ok(Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z) <= 0.012);
    for (const mesh of stains) {
      assert.ok(
        mesh.scale.z <= 0.0021,
        'stain must be a flat decal, never an orange ball',
      );
      assert.ok(mesh.scale.x <= 0.08 && mesh.scale.y <= 0.09);
    }
    s.drillRunning = false;
    props.update(s, rigs, 0.18);
    assert.ok(
      dust.every((mesh) => !mesh.visible),
      'hot but released drill emits no dust',
    );
    s.drillRunning = true;
  }
  kit.dispose();
});
