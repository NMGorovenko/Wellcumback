import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { freshCity } from '../lib/game/city/engine.ts';
import {
  cityDriveCamera,
  cityFaceCamera,
  followCityHeading,
} from '../components/game/city/camera.ts';
import { createMustang } from '../components/game/city/mustang.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';

const cameraFor = (s, aspect, faceView = false) => {
  const view = faceView
    ? cityFaceCamera(s, aspect)
    : cityDriveCamera(s, aspect);
  const half = view.halfHeight;
  const camera = new THREE.OrthographicCamera(
    -half * aspect,
    half * aspect,
    half,
    -half,
    0.1,
    180,
  );
  const look = new THREE.Vector3(view.look.x, view.look.y, view.look.z);
  camera.position
    .copy(look)
    .addScaledVector(
      new THREE.Vector3(view.outward.x, view.outward.y, view.outward.z),
      90,
    );
  camera.lookAt(look);
  camera.updateMatrixWorld();
  return { camera, view };
};

void test('driving view leads real forward, reversing and sideways motion while keeping the whole coupe in frame', () => {
  for (const aspect of [16 / 9, 4 / 3, 9 / 16])
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
      for (const motion of [
        [0, -32],
        [0, 6],
        [32, 0],
        [-12, -8],
      ]) {
        const [vx, vz] = motion;
        const s = {
          ...freshCity(),
          x: 0,
          z: 0,
          heading,
          vx,
          vz,
          speed: Math.hypot(vx, vz),
        };
        const { camera, view } = cameraFor(s, aspect);
        assert.ok(
          view.look.x * vx + view.look.z * vz > 0,
          'camera space is reserved ahead of actual travel',
        );
        for (const x of [-1.1, 1.1])
          for (const y of [0, 1.65])
            for (const z of [-2.2, 2.2]) {
              const corner = new THREE.Vector3(x, y, z)
                .applyAxisAngle(new THREE.Vector3(0, 1, 0), -heading)
                .project(camera);
              assert.ok(
                Math.abs(corner.x) < 1 && Math.abs(corner.y) < 1,
                'coupe remains fully visible even when sliding sideways on a narrow display',
              );
            }
      }
});

void test('all three actual photo faces are large enough and unobstructed by the coupe in the face inspection view', () => {
  const scene = new THREE.Scene();
  const kit = new RenderKit(scene);
  kit.texture = (url) => {
    const texture = new THREE.Texture();
    texture.name = url;
    kit.textures.add(texture);
    return texture;
  };
  const car = createMustang(kit);
  try {
    assert.deepEqual(
      car.passengers.map((head) => head.name),
      ['passenger-nikita', 'passenger-yaroslav', 'passenger-roma'],
    );
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const s = { ...freshCity(), heading };
      car.update(s, 0, true);
      scene.updateMatrixWorld(true);
      const { camera } = cameraFor(s, 16 / 9, true);
      for (const head of car.passengers) {
        let face;
        head.traverse((object) => {
          if (object instanceof THREE.Mesh && object.material.map)
            face = object;
        });
        assert.ok(face?.material.map.name.startsWith('/characters/faces/'));
        const vertices = face.geometry.getAttribute('position');
        const projected = Array.from({ length: vertices.count }, (_, i) =>
          face
            .localToWorld(new THREE.Vector3().fromBufferAttribute(vertices, i))
            .project(camera),
        );
        const width =
          (Math.max(...projected.map((p) => p.x)) -
            Math.min(...projected.map((p) => p.x))) *
          640;
        const height =
          (Math.max(...projected.map((p) => p.y)) -
            Math.min(...projected.map((p) => p.y))) *
          360;
        assert.ok(
          width > 28 && height > 32,
          `${head.name} needs a readable face at 1280×720`,
        );
        const centre = face.localToWorld(new THREE.Vector3(0, 0, 0.15));
        const outward = new THREE.Vector3(0, 0, 1).applyQuaternion(
          camera.quaternion,
        );
        const ray = new THREE.Raycaster(
          centre.clone().addScaledVector(outward, 90),
          outward.negate(),
        );
        const hit = ray.intersectObject(car.root, true).find((result) => {
          const materials = Array.isArray(result.object.material)
            ? result.object.material
            : [result.object.material];
          return materials.some(
            (material) =>
              material.visible &&
              (!material.transparent || material.opacity >= 0.5),
          );
        });
        assert.equal(
          hit?.object,
          face,
          `${head.name} is not hidden by a roof, pillar, bonnet, or another head`,
        );
      }
    }
    const before = [kit.geometries.size, kit.materials.size, kit.textures.size];
    for (let i = 0; i < 120; i++)
      car.update({ ...freshCity(), elapsed: i / 60 }, 1 / 60, i % 2 === 0);
    assert.deepEqual(
      [kit.geometries.size, kit.materials.size, kit.textures.size],
      before,
      'camera toggles do not allocate new render resources',
    );
  } finally {
    kit.dispose();
  }
});

void test('chase camera sits behind the car and gives the forward road more room than the rear', () => {
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const fx = Math.sin(heading),
      fz = -Math.cos(heading);
    const s = {
      ...freshCity(),
      x: 0,
      z: 0,
      heading,
      vx: fx * 16,
      vz: fz * 16,
      speed: 16,
    };
    const { camera, view } = cameraFor(s, 16 / 9);
    assert.ok(
      view.outward.x * fx + view.outward.z * fz < -0.5,
      'look over the boot toward the next corner, never from the bonnet',
    );
    const car = new THREE.Vector3(0, 0, 0).project(camera);
    const road = new THREE.Vector3(fx * 14, 0, fz * 14).project(camera);
    assert.ok(
      car.y < -0.2 && car.y > -0.7,
      'car stays in lower half of the play surface',
    );
    assert.ok(
      road.y > car.y && road.y < 1,
      'at least 14m of the forward road is visible',
    );
    assert.ok(
      view.halfHeight > 10,
      'driving is wider than the face inspection',
    );
  }
});
void test('camera heading crosses north smoothly and ignores frame-rate spikes', () => {
  const a = Math.PI - 0.02,
    b = -Math.PI + 0.02;
  const next = followCityHeading(a, b, 1 / 60);
  assert.ok(
    next > a && next - a < 0.01,
    'take the short turn across the angle seam',
  );
  assert.ok(
    Math.abs(followCityHeading(0, 1.5, 5)) < 0.25,
    'a stalled frame cannot whip the camera around',
  );
  assert.equal(followCityHeading(0.5, 1, 0), 0.5);
});

void test('speed progressively opens the chase view and reserves more forward road under a shallow angle', () => {
  const frames = [0, 6, 12, 18, 24, 32].map((speed) =>
    cityDriveCamera(
      { ...freshCity(), x: 0, z: 0, heading: 0, vx: 0, vz: -speed, speed },
      16 / 9,
    ),
  );
  for (let i = 1; i < frames.length; i++) {
    assert.ok(frames[i].halfHeight > frames[i - 1].halfHeight);
    assert.ok(-frames[i].look.z > -frames[i - 1].look.z);
  }
  assert.ok(
    frames.at(-1).halfHeight > frames[0].halfHeight * 1.8,
    'full speed reveals almost twice the street area on each axis',
  );
  const v = frames[0];
  const elevation =
    (Math.atan2(v.outward.y, Math.hypot(v.outward.x, v.outward.z)) * 180) /
    Math.PI;
  assert.ok(
    elevation > 30 && elevation < 37,
    'a shallow rear angle shows the road instead of looking straight down',
  );
  const { camera } = cameraFor(
    { ...freshCity(), x: 0, z: 0, heading: 0, vx: 0, vz: -18, speed: 18 },
    16 / 9,
  );
  const road = new THREE.Vector3(0, 0, -30).project(camera);
  assert.ok(
    Math.abs(road.y) < 0.9,
    'at speed the next 30m remain clearly in view',
  );
});
