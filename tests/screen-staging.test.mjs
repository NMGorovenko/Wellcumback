import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRig } from '../components/game/world/rig.ts';
import { drillStaging, DRILL_STAGE } from '../lib/game/screen/staging.ts';
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
const fresh = (chairs, mode = 'climb', climb = 0) => ({
  chairs,
  chairX: -4.4,
  drillMode: mode,
  climb,
  fallHeight: climb,
  fallProgress: 0,
  balance: 0,
  aim: chairs === 2 ? 5.9 : 5.1,
});
function pose(rig, worker) {
  rig.root.position.set(worker.x, worker.y, worker.z);
  rig.root.rotation.set(0, worker.rotation, worker.lean);
  rig.update(0, 'idle');
  rig.setCrouch(worker.crouch);
  rig.root.updateWorldMatrix(true, true);
}
function bodyVertices(rig) {
  const points = [];
  rig.root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const p = mesh.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++)
      points.push(
        new THREE.Vector3()
          .fromBufferAttribute(p, i)
          .applyMatrix4(mesh.matrixWorld),
      );
  });
  return points;
}
function insideBox(p, center, half, margin = 0.0008) {
  return (
    Math.abs(p.x - center.x) < half.x - margin &&
    Math.abs(p.y - center.y) < half.y - margin &&
    Math.abs(p.z - center.z) < half.z - margin
  );
}
function chairSolid(p, stool) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(stool.x, stool.y, stool.z),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, stool.rotation, stool.lean),
    ),
    new THREE.Vector3(1, stool.scaleY, 1),
  );
  const q = p.clone().applyMatrix4(matrix.invert());
  if (
    insideBox(
      q,
      new THREE.Vector3(0, 0.83, 0),
      new THREE.Vector3(0.295, 0.065, 0.285),
    )
  )
    return 'seat';
  const back = q
    .clone()
    .sub(new THREE.Vector3(0, 1.05, 0.25))
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), -0.1);
  if (insideBox(back, new THREE.Vector3(), new THREE.Vector3(0.3, 0.21, 0.06)))
    return 'back';
  for (const sx of [-0.23, 0.23])
    for (const sz of [-0.2, 0.2]) {
      const a = new THREE.Vector3(sx * 1.24, 0.04, sz * 1.24),
        b = new THREE.Vector3(sx, 0.81, sz);
      const line = new THREE.Line3(a, b),
        near = line.closestPointToPoint(q, true, new THREE.Vector3());
      if (near.distanceTo(q) < 0.016) return 'leg';
    }
  return null;
}
for (const chairs of [1, 2])
  void test(`${chairs} chairs: soles supported, handoff reachable, wall clear`, () => {
    const s = fresh(chairs, 'handoff', 1),
      stage = drillStaging(s),
      n = createRig(new Kit(), person),
      y = createRig(new Kit(), person);
    pose(n, stage.workers[0]);
    pose(y, stage.workers[1]);
    const target = new THREE.Vector3(...Object.values(stage.handoffTarget));
    assert.ok(n.reach('left', target) < 0.03);
    assert.ok(y.reach('right', target) < 0.03);
    assert.ok(y.reach('left', target) < 0.03);
    const points = bodyVertices(y);
    assert.ok(Math.min(...points.map((p) => p.y)) >= stage.seatTop - 1e-5);
    assert.ok(
      Math.min(...points.map((p) => p.z)) > DRILL_STAGE.wallFaceZ + 0.04,
    );
    assert.ok(Math.max(...points.map((p) => p.y)) < 3.585);
    for (const p of points)
      for (const stool of stage.stools.filter((p) => p.visible))
        assert.equal(
          chairSolid(p, stool),
          null,
          `handoff body in chair at ${p.toArray()}`,
        );
  });
for (const chairs of [1, 2])
  void test(`${chairs} chairs: sampled climb and descent never pass through seats/backs/legs or wall`, () => {
    const rig = createRig(new Kit(), person);
    let previous;
    for (let n = 0; n <= 160; n++) {
      const s = fresh(chairs, 'climb', n / 160),
        stage = drillStaging(s);
      pose(rig, stage.workers[1]);
      for (const p of bodyVertices(rig)) {
        assert.ok(p.y >= -0.0001, 'body above floor');
        assert.ok(p.z > DRILL_STAGE.wallFaceZ + 0.015, 'body before wall');
        for (const stool of stage.stools.filter((p) => p.visible))
          assert.equal(
            chairSolid(p, stool),
            null,
            `climb ${n}/160 ${chairs}chair at ${p.toArray()}`,
          );
      }
      if (previous)
        assert.ok(
          new THREE.Vector3(
            stage.workers[1].x,
            stage.workers[1].y,
            stage.workers[1].z,
          ).distanceTo(previous) < 0.06,
          'trajectory has no teleport',
        );
      previous = new THREE.Vector3(
        stage.workers[1].x,
        stage.workers[1].y,
        stage.workers[1].z,
      );
      assert.deepEqual(drillStaging({ ...s, drillMode: 'descend' }), stage);
    }
  });
for (const chairs of [1, 2])
  void test(`${chairs} chairs: falls clear seat before dropping, land outside, then position is continuous`, () => {
    const rig = createRig(new Kit(), person);
    for (const initial of [0.25, 0.6, 1])
      for (let n = 0; n <= 160; n++) {
        const s = {
            ...fresh(chairs, 'fallen', initial),
            fallHeight: initial,
            fallProgress: n / 160,
          },
          stage = drillStaging(s);
        pose(rig, stage.workers[1]);
        for (const p of bodyVertices(rig)) {
          assert.ok(p.y >= -0.035, `fall body below floor ${n}/160`);
          assert.ok(p.z > DRILL_STAGE.wallFaceZ + 0.005);
          for (const stool of stage.stools.filter((p) => p.visible))
            assert.equal(
              chairSolid(p, stool),
              null,
              `fall ${initial} ${n}/160 ${chairs}chair at ${p.toArray()}`,
            );
        }
        if (n === 160) {
          assert.deepEqual(
            stage.workers,
            drillStaging({ ...s, drillMode: 'position', climb: 0 }).workers,
          );
          assert.deepEqual(
            stage.stools,
            drillStaging({ ...s, drillMode: 'position', climb: 0 }).stools,
          );
        }
      }
  });
void test('transport lane avoids both console and loose fabric across full allowed chair travel', () => {
  for (const chairs of [1, 2])
    for (let x = -4.75; x <= 4.75; x += 0.05) {
      const stage = drillStaging({
        ...fresh(chairs, 'position', 0),
        chairX: x,
      });
      for (const stool of stage.stools.filter((p) => p.visible)) {
        if (stool.y < 0.47)
          assert.ok(stool.z - 0.32 > -2.765, 'chair before console');
        assert.ok(stool.z + 0.32 < -1.91, 'chair behind fabric');
      }
      const [a, b, c] = stage.workers;
      for (const [left, right] of [
        [a, b],
        [a, c],
        [b, c],
      ])
        assert.ok(Math.hypot(left.x - right.x, left.z - right.z) >= 0.52);
    }
});

void test('upper chair legs rest on the lower seat and clear its back', () => {
  const stage = drillStaging(fresh(2, 'handoff', 1)),
    upper = stage.stools[1],
    lower = stage.stools[0];
  const footY =
    0.04 -
    (0.017 * Math.hypot(0.0552, 0.048)) / Math.hypot(0.77, 0.0552, 0.048);
  assert.ok(Math.abs(upper.y + footY * upper.scaleY - 0.895) < 1e-10);
  for (const sx of [-0.23, 0.23])
    for (const sz of [-0.2, 0.2])
      for (let i = 0; i <= 40; i++) {
        const t = i / 40,
          p = new THREE.Vector3(
            upper.x + sx * (1.24 - 0.24 * t),
            upper.y + (0.04 + 0.77 * t) * upper.scaleY,
            upper.z + sz * (1.24 - 0.24 * t),
          );
        assert.equal(chairSolid(p, lower), null);
      }
});
void test('standing driller and bracer remain separate from chairs and wall at maximum allowed wobble', () => {
  for (const chairs of [1, 2])
    for (const balance of [-0.99, 0, 0.99]) {
      const stage = drillStaging({ ...fresh(chairs, 'drill', 1), balance }),
        rig = createRig(new Kit(), person);
      pose(rig, stage.workers[1]);
      for (const p of bodyVertices(rig)) {
        assert.ok(p.z > DRILL_STAGE.wallFaceZ + 0.015);
        assert.ok(p.y < 3.585);
        for (const stool of stage.stools.filter((p) => p.visible))
          assert.equal(
            chairSolid(p, stool),
            null,
            `wobble ${balance} ${chairs} body ${p.toArray()}`,
          );
      }
    }
});
