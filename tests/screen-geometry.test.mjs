import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  mountTransform,
  hookHeight,
  MOUNT_Z,
} from '../components/game/screen/screen-model.ts';
import { createRig } from '../components/game/world/rig.ts';
class Kit {
  scene = new THREE.Scene();
  material(color) {
    return new THREE.MeshBasicMaterial({ color });
  }
  texture() {
    return new THREE.Texture();
  }
  mesh(g, m, p = this.scene) {
    const o = new THREE.Mesh(g, m);
    p.add(o);
    return o;
  }
  sphere(a, b, c, color, x = 0, y = 0, z = 0, p = this.scene) {
    const o = this.mesh(
      new THREE.SphereGeometry(1, 8, 6),
      this.material(color),
      p,
    );
    o.scale.set(a, b, c);
    o.position.set(x, y, z);
    return o;
  }
  cylinder(a, b, c, color, x = 0, y = 0, z = 0, p = this.scene) {
    const o = this.mesh(
      new THREE.CylinderGeometry(a, b, c, 8),
      this.material(color),
      p,
    );
    o.position.set(x, y, z);
    return o;
  }
  box(a, b, c, color, x = 0, y = 0, z = 0, p = this.scene) {
    const o = this.mesh(
      new THREE.BoxGeometry(a, b, c),
      this.material(color),
      p,
    );
    o.position.set(x, y, z);
    return o;
  }
  rod(a, b, r, color, p = this.scene) {
    const o = this.cylinder(r, r, a.distanceTo(b), color, 0, 0, 0, p);
    o.position.copy(a).add(b).multiplyScalar(0.5);
    return o;
  }
}
const person = {
  id: 'yaroslav',
  skin: '#805739',
  hair: '#211d18',
  color: '#393b37',
  uniform: false,
  hairstyle: 'curls',
};
function matrix(t) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(t.x, t.y, t.z),
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      t.angle,
    ),
    new THREE.Vector3(t.scaleX, 1, 1),
  );
}
void test('lift anchors match target hook X Y Z, including extreme uneven holes', () => {
  for (const [l, r] of [
    [2.6, 2.6],
    [5.9, 5.9],
    [4.6, 7],
    [7, 4.6],
    [2, 7.5],
  ]) {
    const m = matrix(mountTransform(l, r));
    for (const [i, h] of [l, r].entries()) {
      const p = new THREE.Vector3(i ? 2.16 : -2.16, 1.235, 0.068).applyMatrix4(
        m,
      );
      assert.ok(
        p.distanceTo(
          new THREE.Vector3(i ? 2.16 : -2.16, hookHeight(h), MOUNT_Z),
        ) < 1e-10,
      );
    }
  }
});
void test('upright initial screen stays above floor and supported range fits ceiling', () => {
  const t = mountTransform(2.6, 2.6);
  assert.ok(t.y - 1.35 >= 0.08);
  const top = mountTransform(7.5, 7.5);
  assert.ok(top.y + 1.35 < 3.65);
  for (const [l, r] of [
    [2, 2],
    [2, 7.5],
    [7.5, 2],
  ]) {
    const m = matrix(mountTransform(l, r));
    for (const x of [-2.4, 2.4])
      assert.ok(new THREE.Vector3(x, -1.35, 0).applyMatrix4(m).y >= 0);
  }
});
void test('two-bone hands reach real lower edge with grounded feet', () => {
  for (const height of [2.6, 5.9, 7]) {
    const kit = new Kit(),
      rig = createRig(kit, person);
    const m = matrix(mountTransform(height, height));
    const grip = new THREE.Vector3(-2.04, -1.295, 0.06).applyMatrix4(m);
    rig.root.position.set(grip.x, 0, grip.z + 0.34);
    rig.root.rotation.y = Math.PI;
    rig.update(0, 'carry');
    rig.setCrouch(THREE.MathUtils.clamp(1.39 - grip.y - 0.43, 0, 0.72));
    assert.ok(
      rig.reach('left', grip.clone().add(new THREE.Vector3(0.13, 0, 0))) < 1e-8,
    );
    assert.ok(
      rig.reach('right', grip.clone().add(new THREE.Vector3(-0.13, 0, 0))) <
        1e-8,
    );
    assert.equal(rig.root.position.y, 0);
  }
});
void test('floor crouch hand reaches cloth without raising character origin', () => {
  const kit = new Kit(),
    rig = createRig(kit, person);
  rig.root.position.set(0, 0, 0.34);
  rig.root.rotation.y = Math.PI;
  rig.update(0, 'work');
  rig.setCrouch(0.72);
  assert.ok(rig.reach('right', new THREE.Vector3(-0.13, 0.15, 0)) < 1e-8);
  assert.equal(rig.root.position.y, 0);
});
void test('anonymous recruit never loads a photograph, existing calls still use photo', () => {
  const kit = new Kit();
  let photos = 0;
  kit.texture = () => {
    photos++;
    return new THREE.Texture();
  };
  createRig(kit, person, kit.scene, { anonymous: true });
  assert.equal(photos, 0);
  createRig(kit, person);
  assert.equal(photos, 1);
});
