import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createCityEnvironment } from '../components/game/city/environment.ts';
import {
  cityCruiseCamera,
  cityCameraFocus,
  clearCityCruiseCamera,
  followCityHeading,
} from '../components/game/city/camera.ts';
import {
  freshCity,
  teleportCityCar,
  tickCity,
} from '../lib/game/city/engine.ts';
import { presentedVehicle } from '../lib/game/city/vehicle-presentation.ts';

function crownProbe(crowns) {
  const boxes = crowns.map(
    (b) =>
      new THREE.Box3(
        new THREE.Vector3(b.minX, b.minY, b.minZ),
        new THREE.Vector3(b.maxX, b.maxY, b.maxZ),
      ),
  );
  const ray = new THREE.Ray(),
    hit = new THREE.Vector3();
  return (car, eye) => {
    ray.origin.set(car.x, car.elevation + 1.25, car.z);
    ray.direction.set(eye.x - car.x, eye.y - ray.origin.y, eye.z - car.z);
    const length = ray.direction.length();
    ray.direction.normalize();
    return boxes.some(
      (box) =>
        ray.intersectBox(box, hit) && hit.distanceTo(ray.origin) < length,
    );
  };
}

function assertCoupeVisible(car, desired, clear, look) {
  const focus = cityCameraFocus(look, desired, clear, car);
  const camera = new THREE.PerspectiveCamera(60, 608 / 900, 0.12, 2000);
  camera.position.set(clear.x, clear.y, clear.z);
  camera.lookAt(focus.x, focus.y, focus.z);
  camera.updateMatrixWorld(true);
  const centre = new THREE.Vector3(car.x, car.elevation + 0.9, car.z).project(
    camera,
  );
  assert.ok(
    Math.abs(centre.x) < 0.95 &&
      Math.abs(centre.y) < 0.95 &&
      Math.abs(centre.z) < 1,
    'coupe remains visible after crown clearance',
  );
}

void test('entering close branches retains a rear street view without a discontinuous overhead fallback', () => {
  const car = { x: 0, z: 0, elevation: 0 };
  const desired = { x: 0, y: 4.5, z: 16 };
  const surface = {
    heightAt: () => 0,
    ceilingAt: () => null,
    buildingBaseAt: () => 0,
  };
  let previous;
  for (let z = 9; z >= -2; z -= 0.05) {
    const crown = {
      minX: -1.4,
      maxX: 1.4,
      minY: 1.4,
      maxY: 6,
      minZ: z,
      maxZ: z + 2.8,
    };
    const clear = clearCityCruiseCamera(desired, car, [], surface, [crown]);
    assert.ok(
      clear.z >= 4.5 && clear.y <= desired.y,
      'a branch never selects the above-car wall fallback',
    );
    if (previous)
      assert.ok(
        Math.hypot(clear.y - previous.y, clear.z - previous.z) < 0.4,
        'camera clearance eases continuously as the car enters the branches',
      );
    previous = clear;
  }
});

void test('a fixed crown crossing the portrait boom retracts the eye even when its endpoint is outside foliage', () => {
  // Preserve the reported pose and a representative obstruction independently of
  // generated tree placement. A clear eye alone does not imply a clear boom.
  const car = {
    x: -91.49,
    z: -90.66,
    heading: -4.984,
    speed: 16,
    elevation: 9.1,
    pitch: 0,
  };
  car.vx = Math.sin(car.heading) * car.speed;
  car.vz = -Math.cos(car.heading) * car.speed;
  const surface = {
    heightAt: () => 9.1,
    ceilingAt: () => null,
    buildingBaseAt: () => 9.1,
  };
  const crown = {
    minX: -102.5,
    maxX: -98.2,
    minY: 11,
    maxY: 18,
    minZ: -91,
    maxZ: -85.5,
  };
  const bounds = new THREE.Box3(
    new THREE.Vector3(crown.minX, crown.minY, crown.minZ),
    new THREE.Vector3(crown.maxX, crown.maxY, crown.maxZ),
  );
  const blocked = crownProbe([crown]);
  const view = cityCruiseCamera(car, 608 / 900);
  const withoutFoliage = clearCityCruiseCamera(view.position, car, [], surface);
  assert.equal(
    bounds.containsPoint(
      new THREE.Vector3(withoutFoliage.x, withoutFoliage.y, withoutFoliage.z),
    ),
    false,
    'the old endpoint-only check would miss this crown',
  );
  assert.ok(
    blocked(car, withoutFoliage),
    'the fixed crown must cross the complete camera-to-car segment',
  );
  const clear = clearCityCruiseCamera(view.position, car, [], surface, [crown]);
  assert.equal(
    blocked(car, clear),
    false,
    'the corrected complete boom stays in front of the crown',
  );
  assert.ok(
    Math.hypot(clear.x - car.x, clear.z - car.z) < 8,
    'camera retracts in front of the offending crown',
  );
  assert.ok(
    bounds.distanceToPoint(new THREE.Vector3(clear.x, clear.y, clear.z)) > 0.3,
    'post-clearance eye retains a gap to the crown',
  );
  assertCoupeVisible(car, view.position, clear, view.look);
});

void test('Kvant portrait replay retracts the complete camera boom before actual batched tree crowns', (t) => {
  const previousDocument = globalThis.document;
  const mockDocument = {
    createElement: () => ({
      width: 1024,
      height: 1024,
      getContext: () => new Proxy({}, { get: () => () => {} }),
    }),
  };
  Reflect.set(globalThis, 'document', mockDocument);
  const kit = new RenderKit(new THREE.Scene());
  try {
    const city = createCityEnvironment(kit);
    const resources = [
      kit.geometries.size,
      kit.materials.size,
      kit.textures.size,
    ];
    assert.ok(
      city.cameraOccluders.length > 1000,
      'individual instanced crowns survive material batching as bounds',
    );
    const blocked = crownProbe(city.cameraOccluders);
    let before = 0,
      after = 0,
      clearanceMs = 0,
      samples = 0;
    const check = (car, desired, look) => {
      const old = clearCityCruiseCamera(desired, car);
      if (blocked(car, old)) before++;
      const started = performance.now();
      const clear = clearCityCruiseCamera(
        desired,
        car,
        undefined,
        undefined,
        city.cameraOccluders,
      );
      clearanceMs += performance.now() - started;
      samples++;
      if (blocked(car, clear)) after++;
      assertCoupeVisible(car, desired, clear, look);
      return clear;
    };
    const car = freshCity();
    teleportCityCar(car, 'kvant');
    let heading = car.heading;
    const initial = cityCruiseCamera(car, 608 / 900);
    check(car, initial.position, initial.look);
    const eye = new THREE.Vector3(
        initial.position.x,
        initial.position.y,
        initial.position.z,
      ),
      look = new THREE.Vector3(initial.look.x, initial.look.y, initial.look.z);
    for (let frame = 0; frame < 180; frame++) {
      tickCity(car, 1 / 60, new Set(frame < 138 ? ['KeyW', 'KeyA'] : []));
      const visual = presentedVehicle(car).car;
      heading = followCityHeading(heading, visual.heading, 1 / 60);
      const target = cityCruiseCamera({ ...visual, heading }, 608 / 900);
      eye.lerp(
        new THREE.Vector3(
          target.position.x,
          target.position.y,
          target.position.z,
        ),
        1 - Math.exp(-8 / 60),
      );
      look.lerp(
        new THREE.Vector3(target.look.x, target.look.y, target.look.z),
        1 - Math.exp(-8 / 60),
      );
      check(visual, eye, look);
    }
    assert.equal(
      after,
      0,
      'no tested camera-to-car segment passes through foliage',
    );
    assert.equal(
      samples,
      181,
      'the real scene replay includes arrival and every one of 180 driven frames',
    );
    assert.deepEqual(
      [kit.geometries.size, kit.materials.size, kit.textures.size],
      resources,
      'clearance creates no renderer resources',
    );
    t.diagnostic(
      JSON.stringify({
        samples,
        crowns: city.cameraOccluders.length,
        blockedBefore: before,
        blockedAfter: after,
        meanClearanceMs: clearanceMs / samples,
      }),
    );
  } finally {
    kit.dispose();
    Reflect.set(globalThis, 'document', previousDocument);
  }
});
