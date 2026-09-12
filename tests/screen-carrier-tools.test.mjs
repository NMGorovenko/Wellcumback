import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRig } from '../components/game/world/rig.ts';
import { drillStaging } from '../lib/game/screen/staging.ts';
import { carrierStaging } from '../lib/game/screen/carrier-staging.ts';
import {
  toolGripTarget,
  TOOL_ANCHORS,
} from '../lib/game/screen/tool-staging.ts';
import {
  mountTransform,
  SCREEN_Z,
} from '../components/game/screen/screen-model.ts';
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
function pose(r, w, crouch = w.crouch) {
  r.root.position.set(w.x, w.y, w.z);
  r.root.rotation.set(0, w.rotation, w.lean);
  r.update(0, 'carry');
  r.setCrouch(crouch);
  r.root.updateWorldMatrix(true, true);
}

function vertices(rig) {
  const result = [];
  rig.root.traverse((m) => {
    if (!m.isMesh) return;
    const a = m.geometry.getAttribute('position');
    for (let i = 0; i < a.count; i++)
      result.push(
        new THREE.Vector3()
          .fromBufferAttribute(a, i)
          .applyMatrix4(m.matrixWorld),
      );
  });
  return result;
}
let min = 99,
  maxReach = 0,
  obstacleHits = 0,
  details;
const obstacles = [
  [-4.12, -3.48, 0, 1.3, 0.12, 0.78],
  [-3.47, -2.83, 0, 1.3, 2.27, 2.93],
  [-4.35, -3.22, 0, 1, -2.24, -0.26],
  [-1.71, 1.71, 0, 0.47, -3.215, -2.765],
  [3.87, 5.23, 0, 1.3, -2.68, -1.26],
  [-1.76, -0.68, 0, 0.9, 1.52, 2.94],
];
assert.ok(
  SCREEN_Z >= -2.67,
  'screen and carriers must stay before the console',
);
for (const planeZ of [SCREEN_Z])
  for (const logicalX of [-1.2, 0, 1.2])
    for (const finalHeight of [2.6, 5.1, 7])
      for (let n = 0; n <= 30; n++)
        for (const side of [0, 1]) {
          const t = n / 30,
            tr = mountTransform(finalHeight, finalHeight, logicalX),
            q = new THREE.Quaternion()
              .setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
              .slerp(
                new THREE.Quaternion().setFromEuler(
                  new THREE.Euler(0, 0, tr.angle),
                ),
                t,
              );
          const p = new THREE.Vector3(0, 0.12, -0.56).lerp(
              new THREE.Vector3(tr.x, tr.y, planeZ),
              t,
            ),
            up = new THREE.Vector3(0, 1, 0).applyQuaternion(q.clone().invert());
          p.y = Math.max(
            p.y,
            2.415 * Math.abs(up.x) +
              1.37 * Math.abs(up.y) +
              0.077 * Math.abs(up.z) +
              0.04,
          );
          const matrix = new THREE.Matrix4().compose(
              p,
              q,
              new THREE.Vector3(tr.scaleX, 1, 1),
            ),
            inverse = matrix.clone().invert(),
            grip = new THREE.Vector3(
              side ? 2.04 : -2.04,
              -1.295,
              0.06,
            ).applyMatrix4(matrix);
          const rig = createRig(new Kit(), person);
          pose(rig, carrierStaging(grip));
          maxReach = Math.max(
            maxReach,
            rig.reach('left', grip.clone().add(new THREE.Vector3(0.13, 0, 0))),
            rig.reach(
              'right',
              grip.clone().add(new THREE.Vector3(-0.13, 0, 0)),
            ),
          );
          for (const v of vertices(rig)) {
            for (const b of obstacles)
              if (
                v.x > b[0] &&
                v.x < b[1] &&
                v.y > b[2] &&
                v.y < b[3] &&
                v.z > b[4] &&
                v.z < b[5]
              ) {
                obstacleHits++;
                details = { logicalX, n, side, finalHeight, p: v.toArray(), b };
              }
            v.applyMatrix4(inverse);
            if (Math.abs(v.x) < 2.27 && Math.abs(v.y) < 1.22)
              min = Math.min(min, v.z);
          }
        }
assert.ok(min > 0.04, `body crossed cloth: ${min}`);
assert.ok(maxReach < 0.0001);
assert.equal(obstacleHits, 0, JSON.stringify(details));
console.log('carrier geometry PASS', { min, maxReach, obstacleHits });
for (const chairs of [1, 2]) {
  let maxRight = 0,
    maxLeft = 0,
    maxTipError = 0;
  for (const aim of chairs === 1 ? [4.6, 5.1, 5.35] : [5.4, 5.9, 7])
    for (const balance of [-0.99, 0, 0.99]) {
      const s = {
          chairs,
          chairX: 4.4,
          drillMode: 'drill',
          climb: 1,
          fallHeight: 0,
          fallProgress: 0,
          balance,
          aim,
        },
        stage = drillStaging(s),
        rig = createRig(new Kit(), person);
      pose(rig, stage.workers[1]);
      for (const [kind, hand, arm] of [
        ['drill', 'right', rig.rightArm],
        ['vacuum', 'left', rig.leftArm],
      ]) {
        const tip = new THREE.Vector3(
            s.chairX * 0.49,
            2.7 + (aim - 2.6) * 0.13 - (kind === 'vacuum' ? 0.05 : 0),
            -3.255,
          ),
          shoulder = new THREE.Vector3();
        arm.getWorldPosition(shoulder);
        const w = toolGripTarget(kind, tip, shoulder),
          target = new THREE.Vector3(w.x, w.y, w.z),
          e = rig.reach(hand, target);
        if (hand === 'right') maxRight = Math.max(maxRight, e);
        else maxLeft = Math.max(maxLeft, e);
        const anchor = TOOL_ANCHORS[kind],
          localGrip = new THREE.Vector3(...Object.values(anchor.grip)),
          localTip = new THREE.Vector3(...Object.values(anchor.tip));
        const q = new THREE.Quaternion().setFromUnitVectors(
          localTip.clone().sub(localGrip).normalize(),
          tip.clone().sub(target).normalize(),
        );
        const origin = target.clone().sub(localGrip.applyQuaternion(q));
        const actual = localTip.applyQuaternion(q).add(origin);
        maxTipError = Math.max(maxTipError, actual.distanceTo(tip));
      }
    }
  assert.ok(maxRight < 1e-8);
  assert.ok(maxLeft < 1e-8);
  assert.ok(maxTipError < 1e-8);
  console.log('fixed anchored tools PASS', chairs);
}
