import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRig } from '../components/game/world/rig.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { getPersonPreset, people } from '../lib/game/presets.ts';

const fixture = (id) => {
  const kit = new RenderKit(new THREE.Scene());
  kit.texture = (url) => {
    const texture = new THREE.Texture();
    texture.name = url;
    kit.textures.add(texture);
    return texture;
  };
  const rig = createRig(kit, getPersonPreset(id));
  return { kit, rig };
};
const matrices = (rig) => {
  rig.root.updateMatrixWorld(true);
  const result = [];
  rig.root.traverse((object) => result.push(...object.matrixWorld.elements));
  assert.ok(
    result.every(Number.isFinite),
    'all world transforms remain finite',
  );
  return result;
};
const photo = (rig) => {
  let face;
  rig.head.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material.map) face = object;
  });
  return face;
};

void test('seated poses rest on a 0.48 m seat with bent knees, unchanged limb lengths, and feet on the floor', () => {
  const { kit, rig } = fixture('anastasia');
  const torso = rig.head.parent.children.find(
    (child) =>
      child instanceof THREE.Group &&
      child.position.y > 0.9 &&
      child.position.y < 1.1,
  );
  const pelvis = torso.children.find(
    (child) =>
      child instanceof THREE.Mesh &&
      child.geometry.type === 'SphereGeometry' &&
      child.position.y < 0,
  );
  const feet = rig.root.children.filter((child) => child instanceof THREE.Mesh);
  try {
    assert.equal(feet.length, 2);
    for (const pose of ['sit', 'phone', 'type', 'toilet'])
      for (const time of [0, 0.7, 2.4]) {
        rig.update(time, pose);
        matrices(rig);
        const pelvisBounds = new THREE.Box3().setFromObject(pelvis, true);
        assert.ok(
          pelvisBounds.min.y >= 0.47 && pelvisBounds.min.y <= 0.5,
          `${pose}: pelvis rests on the seat instead of sinking inside it`,
        );
        for (const [i, leg] of [rig.leftLeg, rig.rightLeg].entries()) {
          const knee = leg.children.find(
            (child) => child instanceof THREE.Group,
          );
          const hipPoint = leg.getWorldPosition(new THREE.Vector3());
          const kneePoint = knee.getWorldPosition(new THREE.Vector3());
          const ankle = knee.localToWorld(new THREE.Vector3(0, -0.4, 0));
          assert.ok(Math.abs(hipPoint.distanceTo(kneePoint) - 0.4) < 1e-6);
          assert.ok(Math.abs(kneePoint.distanceTo(ankle) - 0.4) < 1e-6);
          assert.ok(
            kneePoint.z > hipPoint.z + 0.25,
            `${pose}: knees bend forward`,
          );
          assert.ok(
            Math.abs(ankle.y - 0.155) < 1e-6,
            `${pose}: lower legs still meet the shoes`,
          );
          const footBounds = new THREE.Box3().setFromObject(feet[i], true);
          assert.ok(footBounds.min.y >= 0 && footBounds.min.y < 0.015);
        }
      }
  } finally {
    kit.dispose();
  }
});

void test('packing, sitting, typing, phone, toilet, speech and reaching all reset cleanly to walking', () => {
  for (const id of [...people.map((person) => person.id), 'anastasia']) {
    const current = fixture(id),
      reference = fixture(id);
    try {
      for (const pose of [
        'pack',
        'sit',
        'type',
        'phone',
        'toilet',
        'talk',
        'fall',
      ]) {
        current.rig.update(1.3, pose, 0.7);
        current.rig.speak(1);
        current.rig.reach('left', new THREE.Vector3(0, 1.3, 0.5));
        matrices(current.rig);
        current.rig.update(2.7, 'walk');
        reference.rig.update(2.7, 'walk');
        const actual = matrices(current.rig),
          expected = matrices(reference.rig);
        assert.equal(actual.length, expected.length);
        assert.ok(
          actual.every((value, i) => Math.abs(value - expected[i]) < 1e-9),
          `${id}/${pose}: no bent joint or crouch survives the walking update`,
        );
        assert.deepEqual(
          photo(current.rig).geometry.getAttribute('position').array,
          photo(reference.rig).geometry.getAttribute('position').array,
          'speech deformation is reset too',
        );
      }
    } finally {
      current.kit.dispose();
      reference.kit.dispose();
    }
  }
});

void test('Anastasia hair leaves eyes, nose and mouth visible, and speech is bounded and reversible without changing photo UVs', () => {
  const { kit, rig } = fixture('anastasia');
  try {
    rig.update(0, 'idle');
    matrices(rig);
    const face = photo(rig);
    assert.equal(face.material.map.name, '/characters/faces/anastasia.png');
    const geometry = face.geometry;
    const initial = geometry.getAttribute('position').array.slice();
    const uv = geometry.getAttribute('uv').array.slice();
    for (const angle of [0, 0.3, -0.3, 0.6, -0.6])
      for (const elevation of [0.2, 1.2]) {
        const direction = new THREE.Vector3(
          Math.sin(angle),
          elevation,
          Math.cos(angle),
        ).normalize();
        for (const y of [-0.11, 0, 0.07, 0.12])
          for (const x of [-0.07, 0, 0.07]) {
            const point = face.localToWorld(new THREE.Vector3(x, y, 0.15));
            const ray = new THREE.Raycaster(
              point.clone().addScaledVector(direction, 3),
              direction.clone().negate(),
            );
            assert.equal(
              ray.intersectObject(rig.head, true)[0]?.object,
              face,
              'hair cannot cover the central features from front or a three-quarter view',
            );
          }
      }
    rig.speak(1);
    const open = geometry.getAttribute('position').array.slice();
    assert.ok(
      open.some((value, i) => Math.abs(value - initial[i]) > 0.005),
      'speech actually moves the jaw',
    );
    assert.ok(
      open.every(
        (value, i) =>
          Number.isFinite(value) && Math.abs(value - initial[i]) <= 0.01401,
      ),
    );
    for (let i = 0; i < 30; i++) rig.speak(5);
    assert.deepEqual(
      geometry.getAttribute('position').array,
      open,
      'repeated speech does not accumulate stretching',
    );
    rig.speak(-1);
    assert.deepEqual(geometry.getAttribute('position').array, initial);
    assert.deepEqual(
      geometry.getAttribute('uv').array,
      uv,
      'the source photo crop remains unchanged',
    );
  } finally {
    kit.dispose();
  }
});
