import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cityCruiseCamera,
  cityDriveCamera,
  cityFaceCamera,
  clearCityCruiseCamera,
  cityCameraFocus,
} from '../components/game/city/camera.ts';
import {
  vehiclePose,
  rememberVehicleStep,
  setVehicleRemainder,
  presentedVehicle,
} from '../lib/game/city/vehicle-presentation.ts';
import { freshCity } from '../lib/game/city/engine.ts';
import { createRaceEffects } from '../components/game/race/effects.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { cityRoads } from '../lib/game/city/layout.ts';
import {
  CITY_DECK_THICKNESS,
  cityRoadHeight,
  citySurfacePose,
  cityOverpassClearance,
} from '../lib/game/city/surface.ts';

void test('one, two and three views preserve framing when the road rises by 60m', () => {
  for (const count of [1, 2, 3])
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const aspect = 16 / (9 * count);
      const car = {
        x: 0,
        z: 0,
        elevation: 60,
        pitch: 0.14,
        heading,
        speed: 12,
        vx: Math.sin(heading) * 12,
        vz: -Math.cos(heading) * 12,
      };
      for (const mode of [cityCruiseCamera, cityDriveCamera, cityFaceCamera]) {
        const flat = mode({ ...car, elevation: 0 }, aspect),
          elevated = mode(car, aspect);
        assert.ok(Math.abs(elevated.look.y - flat.look.y - 60) < 1e-8);
        const camera =
          mode === cityCruiseCamera
            ? new THREE.PerspectiveCamera(elevated.fov, aspect, 0.12, 1000)
            : new THREE.OrthographicCamera(
                -elevated.halfHeight * aspect,
                elevated.halfHeight * aspect,
                elevated.halfHeight,
                -elevated.halfHeight,
                0.1,
                300,
              );
        const target = new THREE.Vector3(
          elevated.look.x,
          elevated.look.y,
          elevated.look.z,
        );
        if (elevated.position)
          camera.position.set(
            elevated.position.x,
            elevated.position.y,
            elevated.position.z,
          );
        else
          camera.position
            .copy(target)
            .addScaledVector(
              new THREE.Vector3(
                elevated.outward.x,
                elevated.outward.y,
                elevated.outward.z,
              ),
              90,
            );
        camera.lookAt(target);
        camera.updateMatrixWorld(true);
        const rotation = new THREE.Euler(car.pitch, -heading, 0, 'YXZ');
        for (const x of [-1.1, 1.1])
          for (const y of [0, 1.8])
            for (const z of [-2.5, 2.5]) {
              const corner = new THREE.Vector3(x, y, z)
                .applyEuler(rotation)
                .add(new THREE.Vector3(0, 60, 0))
                .project(camera);
              assert.ok(
                Math.abs(corner.x) < 0.99 &&
                  Math.abs(corner.y) < 0.99 &&
                  Math.abs(corner.z) < 1,
                `${mode.name}: ${count} views at heading ${heading}`,
              );
            }
      }
    }
});

void test('camera clears a hill and raised building base while a low route stays below the bridge deck', () => {
  const car = { x: 0, z: 0, elevation: 40, surfaceId: 'ground' };
  const hill = {
    heightAt: (_x, z) => 40 + Math.max(0, 4 - Math.abs(z - 8) / 2),
    ceilingAt: () => null,
    buildingBaseAt: () => 40,
  };
  const clear = clearCityCruiseCamera({ x: 0, y: 44.5, z: 20 }, car, [], hill);
  for (let i = 1; i <= 40; i++) {
    const t = i / 40;
    assert.ok(
      41.25 + (clear.y - 41.25) * t >= hill.heightAt(0, clear.z * t) + 0.3,
    );
  }
  const flat = {
    heightAt: () => 40,
    ceilingAt: () => null,
    buildingBaseAt: () => 40,
  };
  const wall = clearCityCruiseCamera(
    { x: 0, y: 44.5, z: 16 },
    car,
    [{ x: 0, z: 12, w: 10, d: 6, h: 15 }],
    flat,
  );
  assert.ok(
    wall.z > 4.5 && wall.z < 8.3,
    'a facade starts at terrain height, not sea level',
  );
  const bridge = {
    ...flat,
    heightAt: (_x, _z, c) => (c.surfaceId === 'upper' ? 49 : 40),
    ceilingAt: () => 49,
  };
  const below = clearCityCruiseCamera({ x: 0, y: 56, z: 20 }, car, [], bridge);
  assert.ok(
    below.y < 48 && below.y >= 42.5,
    'camera remains below the deck instead of snapping upward',
  );
  const above = clearCityCruiseCamera(
    { x: 0, y: 54, z: 20 },
    { ...car, elevation: 49, surfaceId: 'upper' },
    [],
    bridge,
  );
  assert.ok(
    above.y > 50,
    'the top route does not inherit the lower route ceiling',
  );
});

void test('height and pitch interpolate from authoritative state and JSON restores do not retain the old bridge layer', () => {
  const car = {
    ...freshCity(),
    x: 0,
    z: 0,
    elevation: 40,
    pitch: 0,
    surfaceId: 'ground',
    elapsed: 0,
  };
  const previous = vehiclePose(car);
  Object.assign(car, {
    x: 0.1,
    elevation: 40.08,
    pitch: 0.08,
    elapsed: 1 / 60,
  });
  rememberVehicleStep(car, previous, vehiclePose(car), 1 / 60);
  setVehicleRemainder(car, 1 / 120);
  const displayed = presentedVehicle(car);
  assert.ok(Math.abs(displayed.elevation - 40.04) < 1e-8);
  assert.ok(Math.abs(displayed.pitch - 0.04) < 1e-8);
  const restored = JSON.parse(
    JSON.stringify({ ...car, elevation: 49, surfaceId: 'upper' }),
  );
  assert.equal(presentedVehicle(restored).elevation, 49);
  assert.equal(presentedVehicle(restored).car.surfaceId, 'upper');
});

void test('real Nikolaevsky crossing keeps all three views on the chosen bridge layer', () => {
  const lower = cityRoads.find((r) => r.id === 'left-quay:3');
  const upper = cityRoads.find((r) => r.id === 'bridge-nikolaevsky:0');
  const ax = lower.to.x - lower.from.x,
    az = lower.to.z - lower.from.z,
    bx = upper.to.x - upper.from.x,
    bz = upper.to.z - upper.from.z;
  const t =
    ((upper.from.x - lower.from.x) * bz - (upper.from.z - lower.from.z) * bx) /
    (ax * bz - az * bx);
  assert.ok(t > 0 && t < 1, 'the routes physically cross');
  const point = { x: lower.from.x + t * ax, z: lower.from.z + t * az };
  assert.ok(
    cityRoadHeight(upper, point.x, point.z) -
      cityRoadHeight(lower, point.x, point.z) >
      7,
    'the test covers the actual separated decks',
  );
  for (const road of [lower, upper])
    for (const direction of [0, Math.PI])
      for (const count of [1, 2, 3])
        for (const speed of [0, 45, 83.33])
          for (const mode of [
            cityCruiseCamera,
            cityDriveCamera,
            cityFaceCamera,
          ]) {
            const heading =
              Math.atan2(road.to.x - road.from.x, road.from.z - road.to.z) +
              direction;
            const pose = citySurfacePose(
              point.x,
              point.z,
              heading,
              cityRoadHeight(road, point.x, point.z),
              `road:${road.id}`,
            );
            const car = {
              ...point,
              ...pose,
              heading,
              speed,
              vx: Math.sin(heading) * speed,
              vz: -Math.cos(heading) * speed,
            };
            const view = mode(car, 16 / (9 * count));
            const distance = view.position
              ? 0
              : Math.max(24, view.halfHeight * 3);
            const desired = view.position ?? {
              x: view.look.x + view.outward.x * distance,
              y: view.look.y + view.outward.y * distance,
              z: view.look.z + view.outward.z * distance,
            };
            const clear = clearCityCruiseCamera(desired, car);
            const focus = cityCameraFocus(view.look, desired, clear, car);
            const aspect = 16 / (9 * count);
            const camera = view.position
              ? new THREE.PerspectiveCamera(view.fov, aspect, 0.12, 1000)
              : new THREE.OrthographicCamera(
                  -view.halfHeight * aspect,
                  view.halfHeight * aspect,
                  view.halfHeight,
                  -view.halfHeight,
                  0.1,
                  1000,
                );
            camera.position.set(clear.x, clear.y, clear.z);
            camera.lookAt(focus.x, focus.y, focus.z);
            camera.updateMatrixWorld(true);
            for (const x of [-1.1, 1.1])
              for (const y of [0, 1.8])
                for (const z of [-2.5, 2.5]) {
                  const corner = new THREE.Vector3(x, y, z)
                    .applyEuler(new THREE.Euler(pose.pitch, -heading, 0, 'YXZ'))
                    .add(new THREE.Vector3(point.x, pose.elevation, point.z))
                    .project(camera);
                  assert.ok(
                    Math.abs(corner.x) < 0.99 &&
                      Math.abs(corner.y) < 0.99 &&
                      Math.abs(corner.z) < 1,
                    `${road.id}: ${mode.name}, ${count} views, ${speed}, ${direction}: corner ${JSON.stringify(corner)}, eye ${JSON.stringify(clear)}, target ${JSON.stringify(focus)} keeps the coupe visible after camera clearance`,
                  );
                }
            for (let step = 1; step <= 50; step++) {
              const alpha = step / 50,
                x = point.x + (clear.x - point.x) * alpha,
                z = point.z + (clear.z - point.z) * alpha,
                y =
                  pose.elevation +
                  1.25 +
                  (clear.y - pose.elevation - 1.25) * alpha;
              const floor = citySurfacePose(
                x,
                z,
                heading,
                pose.elevation,
                pose.surfaceId,
              ).elevation;
              assert.ok(y >= floor + 0.28, `${road.id}: camera clears road`);
              const deck = cityOverpassClearance(x, z);
              if (deck !== null && floor < deck - 2.5)
                assert.ok(
                  y < deck - CITY_DECK_THICKNESS - 0.45,
                  `${road.id}, ${mode.name}, ${count} views, ${speed} m/s, direction ${direction}, at ${alpha}: y ${y}, deck ${deck}, floor ${floor}, clear ${JSON.stringify(clear)}: lower camera stays below concrete deck`,
                );
            }
          }
});

void test('Nordschleife skid marks follow the rear wheel height and pitch without allocating per frame', () => {
  const kit = new RenderKit(new THREE.Scene());
  try {
    const update = createRaceEffects(kit);
    const state = {
      phase: 'racing',
      paused: false,
      trackId: 'nordschleife',
      racers: [
        {
          id: '0:0',
          elevation: 55,
          pitch: 0.1,
          car: {
            ...freshCity(),
            x: 0,
            z: 0,
            heading: 0,
            speed: 12,
            drifting: true,
          },
        },
      ],
    };
    const resources = [
      kit.geometries.size,
      kit.materials.size,
      kit.textures.size,
    ];
    update(state, 1 / 60);
    const marks = kit.scene.children.find(
      (o) => o.isInstancedMesh && o.count === 1600,
    );
    const matrix = new THREE.Matrix4();
    marks.getMatrixAt(0, matrix);
    const expected = 55 - Math.tan(0.1) * 1.25 + 0.05;
    assert.ok(Math.abs(matrix.elements[13] - expected) < 1e-5);
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(matrix);
    assert.ok(
      normal.z > 0.09 && normal.y > 0.99,
      'decal follows the rising road plane',
    );
    for (let i = 0; i < 120; i++) update(state, 1 / 60);
    assert.deepEqual(
      [kit.geometries.size, kit.materials.size, kit.textures.size],
      resources,
    );
  } finally {
    kit.dispose();
  }
});

void test('city drift effects sample the same upper or lower deck as their racer', () => {
  for (const id of ['left-quay:3', 'bridge-nikolaevsky:0']) {
    const road = cityRoads.find((r) => r.id === id),
      x = -716.6666666666666,
      z = 448.8333333333333,
      heading = Math.atan2(road.to.x - road.from.x, road.from.z - road.to.z);
    const pose = citySurfacePose(
      x,
      z,
      heading,
      cityRoadHeight(road, x, z),
      `road:${id}`,
    );
    const car = {
      ...freshCity(),
      ...pose,
      x,
      z,
      heading,
      speed: 15,
      drifting: true,
    };
    const kit = new RenderKit(new THREE.Scene());
    try {
      createRaceEffects(kit)(
        {
          phase: 'racing',
          paused: false,
          trackId: 'krasnoyarsk',
          racers: [{ id: '0:0', car, ...pose }],
        },
        1 / 60,
      );
      const marks = kit.scene.children.find(
        (o) => o.isInstancedMesh && o.count === 1600,
      );
      const matrix = new THREE.Matrix4();
      marks.getMatrixAt(0, matrix);
      const expected = citySurfacePose(
        matrix.elements[12],
        matrix.elements[14],
        heading,
        pose.elevation,
        pose.surfaceId,
      );
      assert.ok(
        Math.abs(matrix.elements[13] - expected.elevation - 0.105) < 1e-4,
      );
      assert.ok(
        matrix.elements[13] > 30,
        'drift marks are not left at sea level',
      );
    } finally {
      kit.dispose();
    }
  }
});
