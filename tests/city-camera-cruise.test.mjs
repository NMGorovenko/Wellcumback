import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CITY_CAMERA_MODES,
  cityCruiseCamera,
  clearCityCruiseCamera as clearTerrainCamera,
} from '../components/game/city/camera.ts';

const flatSurface = {
  heightAt: () => 0,
  ceilingAt: () => null,
  buildingBaseAt: () => 0,
};
const clearCityCruiseCamera = (desired, car, buildings) =>
  clearTerrainCamera(desired, car, buildings, flatSurface);

const perspective = (state, aspect) => {
  const view = cityCruiseCamera(state, aspect);
  const camera = new THREE.PerspectiveCamera(view.fov, aspect, 0.12, 1200);
  camera.position.set(view.position.x, view.position.y, view.position.z);
  camera.lookAt(view.look.x, view.look.y, view.look.z);
  camera.updateMatrixWorld();
  return { camera, view };
};

void test('low city view is an additional perspective mode with a visible car and a long forward road', () => {
  assert.deepEqual(CITY_CAMERA_MODES, ['cruise', 'drive', 'map', 'faces']);
  for (const aspect of [16 / 9, 4 / 3, 9 / 16])
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
      for (const speed of [0, 18, 32]) {
        const fx = Math.sin(heading),
          fz = -Math.cos(heading);
        const state = {
          x: 1200,
          z: -800,
          heading,
          speed,
          vx: fx * speed,
          vz: fz * speed,
        };
        const { camera, view } = perspective(state, aspect);
        for (const x of [-1.2, 1.2])
          for (const y of [0, 1.8])
            for (const z of [-2.6, 2.6]) {
              const corner = new THREE.Vector3(x, y, z)
                .applyAxisAngle(new THREE.Vector3(0, 1, 0), -heading)
                .add(new THREE.Vector3(state.x, 0, state.z))
                .project(camera);
              assert.ok(
                Math.abs(corner.x) < 0.95 &&
                  Math.abs(corner.y) < 0.95 &&
                  Math.abs(corner.z) < 1,
              );
            }
        const car = new THREE.Vector3(state.x, 0, state.z).project(camera);
        const distantRoad = new THREE.Vector3(
          state.x + fx * 120,
          0,
          state.z + fz * 120,
        ).project(camera);
        assert.ok(
          car.y < -0.2 && car.y > -0.55,
          'car sits below the road ahead',
        );
        assert.ok(
          Math.abs(distantRoad.x) < 0.85 &&
            distantRoad.y > car.y &&
            distantRoad.y < 0.8,
        );
        const elevation = Math.atan2(
          view.position.y - view.look.y,
          Math.hypot(
            view.position.x - view.look.x,
            view.position.z - view.look.z,
          ),
        );
        assert.ok(
          elevation > 0.08 && elevation < 0.23,
          'gently pitched toward the horizon rather than down at the roof',
        );
      }
});

void test('low view opens smoothly at speed and keeps the convertible visible during sideways drift', () => {
  let previousDistance = 0,
    previousLead = 0;
  for (let speed = 0; speed <= 32; speed++) {
    const view = cityCruiseCamera(
      { x: 0, z: 0, vx: 0, vz: -speed, heading: 0, speed },
      16 / 9,
    );
    assert.ok(view.position.z > previousDistance);
    assert.ok(-view.look.z > previousLead);
    previousDistance = view.position.z;
    previousLead = -view.look.z;
  }
  for (const aspect of [16 / 9, 9 / 16]) {
    const { camera } = perspective(
      { x: 0, z: 0, vx: 32, vz: 0, heading: 0, speed: 32 },
      aspect,
    );
    for (const x of [-1.2, 1.2])
      for (const z of [-2.6, 2.6]) {
        const corner = new THREE.Vector3(x, 0, z).project(camera);
        assert.ok(Math.abs(corner.x) < 0.9 && Math.abs(corner.y) < 0.9);
      }
  }
});

void test('camera boom retracts before facades, clears tight corners, and never falls below the ground', () => {
  const car = { x: 0, z: 0 };
  const building = { x: 0, z: 12, w: 10, d: 6, h: 15 };
  const desired = { x: 0, y: 4.5, z: 16 };
  const clear = clearCityCruiseCamera(desired, car, [building]);
  assert.ok(
    clear.z > 4.5 && clear.z < 8.3,
    'retract in front of the near wall including the camera body margin',
  );
  assert.ok(clear.y >= 2.5);
  const tight = clearCityCruiseCamera(desired, car, [{ ...building, z: 5 }]);
  assert.equal(tight.x, car.x);
  assert.equal(tight.z, car.z);
  assert.ok(
    tight.y >= 6,
    'an obstructed turn switches above the car rather than putting the eye inside its body',
  );
  const ground = clearCityCruiseCamera({ x: 0, y: -10, z: 8 }, car, []);
  assert.ok(ground.y >= 2.5);
  assert.deepEqual(
    clearCityCruiseCamera(desired, car, [{ ...building, x: 50 }]),
    desired,
  );
  assert.deepEqual(
    clearCityCruiseCamera({ ...desired, y: 30 }, car, [{ ...building, h: 3 }]),
    { ...desired, y: 30 },
    'a clear line above a low roof need not retract',
  );
});
