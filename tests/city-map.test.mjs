import { CITY_TOP_SPEED } from '../lib/game/city/powertrain.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  freshCity,
  tickCity,
  cityCarBlocked,
  cityBlocked,
} from '../lib/game/city/engine.ts';
import {
  BRIDGES,
  CITY_BOUNDS,
  CITY_SCENERY_BOUNDS,
  CITY_SPAWN,
  ROUNDABOUT,
  cityStops,
  cityBuildings,
  riverDistance,
  riverZ,
} from '../lib/game/city/layout.ts';
import { readPeerPacket } from '../lib/game/network/protocol.ts';
import {
  cityOverviewCamera,
  cityDriveCamera,
} from '../components/game/city/camera.ts';
import { createCityEnvironment } from '../components/game/city/environment.ts';
import { citySceneryFits } from '../components/game/city/landmarks.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
// Controller follows drivable road centres through actual fixed-step physics.
// It changes only inputs: no teleporting, velocity assignment or bypassing blockers.
function driveRoute(s, points, handbrake = false) {
  let waypoint = 0;
  for (let frame = 0; frame < 12000 && waypoint < points.length; frame++) {
    const [x, z] = points[waypoint],
      dx = x - s.x,
      dz = z - s.z;
    const distance = Math.hypot(dx, dz);
    if (distance < (waypoint === points.length - 1 ? 1.4 : 3)) {
      waypoint++;
      continue;
    }
    const angle = wrap(Math.atan2(dx, -dz) - s.heading);
    const forward = s.vx * Math.sin(s.heading) - s.vz * Math.cos(s.heading);
    const desired =
      Math.min(6, Math.sqrt(10 * distance)) * Math.max(0.28, Math.cos(angle));
    tickCity(s, 1 / 60, new Set(handbrake ? ['ShiftLeft'] : []), {
      throttle: clamp((desired - forward) * 0.3, -1, 1),
      steer: clamp(angle * 2, -1, 1),
    });
    assert.equal(cityCarBlocked(s.x, s.z, s.heading), false);
  }
  assert.equal(
    waypoint,
    points.length,
    'route completes under normal steering and pedal inputs',
  );
}
function stop(s) {
  for (let frame = 0; frame < 120 && s.speed > 0.15; frame++) {
    const forward = s.vx * Math.sin(s.heading) - s.vz * Math.cos(s.heading);
    tickCity(s, 1 / 60, new Set(), {
      throttle: -Math.sign(forward) * Math.min(1, Math.abs(forward) * 1.5),
      steer: 0,
    });
  }
  assert.ok(s.speed < 0.2);
}
void test('city is four times wider and deeper, with address markers on the right banks and no fabricated Aprelskaya number', () => {
  assert.equal(CITY_BOUNDS.maxX - CITY_BOUNDS.minX, 58 * 4);
  assert.equal(CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ, 40 * 4);
  assert.ok(cityBuildings.length >= 20);
  const [nikita, yarik, station] = cityStops;
  assert.ok(
    riverDistance(nikita.x, nikita.z) < 0 &&
      riverDistance(station.x, station.z) < 0,
  );
  assert.ok(riverDistance(yarik.x, yarik.z) > 0);
  assert.ok(station.x > nikita.x && station.z < nikita.z);
  assert.ok(yarik.x - nikita.x > 150 && Math.abs(yarik.z - nikita.z) < 10);
  assert.match(nikita.subtitle, /Борисова, 30/);
  assert.match(yarik.subtitle, /Апрельская, 8.*правый берег/);
  assert.match(station.title, /Главный ЖД вокзал/);
});
void test('three missions can be reached from spawn by driving, stopping and deliberately pressing E', () => {
  const nikita = freshCity();
  while (nikita.z < cityStops[0].z - 1.1)
    tickCity(nikita, 1 / 60, new Set(), { throttle: -0.3, steer: 0 });
  const station = freshCity();
  driveRoute(station, [
    [-92, -54],
    [-66, -54],
  ]);
  const yarik = freshCity();
  driveRoute(yarik, [
    [-92, -54],
    [-48, -54],
    [-48, riverZ(-48) + 21],
    [94, riverZ(94) + 21],
    [94, 8],
  ]);
  for (const [state, expected] of [
    [nikita, 'screen'],
    [station, 'clean'],
    [yarik, 'moving'],
  ]) {
    assert.equal(state.interaction, null);
    stop(state);
    assert.equal(
      state.bumps,
      0,
      'the real route does not depend on bouncing off walls',
    );
    tickCity(state, 1 / 60, new Set(['KeyE']));
    assert.equal(state.interaction, expected);
  }
});
void test('both bridges are traversable in either direction at full speed, while the water and rails remain solid', () => {
  for (const bridge of BRIDGES)
    for (const direction of [-1, 1]) {
      const state = {
        ...freshCity(),
        x: bridge.x,
        z: bridge.z - direction * 24,
        heading: direction > 0 ? Math.PI : 0,
        vz: direction * CITY_TOP_SPEED,
        speed: CITY_TOP_SPEED,
      };
      for (
        let frame = 0;
        frame < 160 && (state.z - bridge.z) * direction < 21;
        frame++
      ) {
        tickCity(state, 1 / 60, new Set(['KeyW']));
        assert.equal(cityCarBlocked(state.x, state.z, state.heading), false);
      }
      assert.ok((state.z - bridge.z) * direction > 20);
      assert.equal(state.bumps, 0);
      assert.ok(cityBlocked(bridge.x + bridge.w / 2 + 0.16, bridge.z));
    }
  for (const x of [-100, -20, 0, 80, 110]) assert.ok(cityBlocked(x, riverZ(x)));
});
void test('the roundabout is reachable and supports a complete sustained drift around its solid island', () => {
  const state = freshCity();
  driveRoute(state, [
    [-92, -54],
    [-48, -54],
    [-48, riverZ(-48) + 21],
    [38, riverZ(38) + 21],
    [38, 29],
  ]);
  const lap = Array.from({ length: 33 }, (_, i) => {
    const angle = ((i + 1) * Math.PI * 2) / 32;
    return [
      ROUNDABOUT.x + Math.sin(angle) * 18,
      ROUNDABOUT.z - Math.cos(angle) * 18,
    ];
  });
  driveRoute(state, lap, true);
  assert.ok(
    state.driftDistance > 90,
    'recorded sideways motion covers the circular track',
  );
  assert.equal(state.bumps, 0);
  assert.ok(cityBlocked(ROUNDABOUT.x, ROUNDABOUT.z));
  for (let i = 0; i < 64; i++) {
    const a = (i * Math.PI) / 32;
    assert.equal(
      cityCarBlocked(
        ROUNDABOUT.x + Math.sin(a) * 18,
        ROUNDABOUT.z - Math.cos(a) * 18,
        a + Math.PI / 2,
      ),
      false,
    );
  }
});
void test('network snapshots accept the expanded map and reject positions outside its canonical bounds', () => {
  const packet = (state) =>
    JSON.stringify({
      type: 'city',
      version: 2,
      seq: 1,
      epoch: 0,
      driver: 'host',
      state,
    });
  for (const point of [
    ...cityStops,
    CITY_SPAWN,
    { x: -115, z: -79 },
    { x: 115, z: 79 },
  ]) {
    const parsed = readPeerPacket(
      packet({ ...freshCity(), x: point.x, z: point.z }),
    );
    assert.equal(parsed?.state.x, point.x);
    assert.equal(parsed?.state.z, point.z);
  }
  for (const [axis, value] of [
    ['x', CITY_BOUNDS.minX - 0.01],
    ['x', CITY_BOUNDS.maxX + 0.01],
    ['z', CITY_BOUNDS.minZ - 0.01],
    ['z', CITY_BOUNDS.maxZ + 0.01],
  ])
    assert.equal(
      readPeerPacket(packet({ ...freshCity(), [axis]: value })),
      null,
    );
});
void test('overview fits both banks and tall landmarks without changing close camera face scale', () => {
  for (const aspect of [9 / 16, 4 / 3, 16 / 9, 21 / 9]) {
    const view = cityOverviewCamera(aspect),
      h = view.halfHeight;
    const camera = new THREE.OrthographicCamera(
      -h * aspect,
      h * aspect,
      h,
      -h,
      0.1,
      view.far,
    );
    const target = new THREE.Vector3(view.look.x, view.look.y, view.look.z);
    camera.position
      .copy(target)
      .addScaledVector(
        new THREE.Vector3(view.outward.x, view.outward.y, view.outward.z),
        view.distance,
      );
    camera.lookAt(target);
    camera.updateMatrixWorld();
    for (const x of [CITY_SCENERY_BOUNDS.minX, CITY_SCENERY_BOUNDS.maxX])
      for (const z of [CITY_SCENERY_BOUNDS.minZ, CITY_SCENERY_BOUNDS.maxZ])
        for (const y of [0, CITY_SCENERY_BOUNDS.maxY]) {
          const projected = new THREE.Vector3(x, y, z).project(camera);
          assert.ok(
            Math.abs(projected.x) < 1 &&
              Math.abs(projected.y) < 1 &&
              Math.abs(projected.z) < 1,
          );
        }
    assert.ok(cityDriveCamera(freshCity(), aspect).halfHeight < h / 5);
  }
});
void test('larger city statics are batched and repeated driving updates allocate no new render resources', () => {
  const previous = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      createElement: () => ({
        width: 512,
        height: 96,
        getContext: () => new Proxy({}, { get: () => () => {} }),
      }),
    },
  });
  const kit = new RenderKit(new THREE.Scene());
  try {
    const city = createCityEnvironment(kit);
    let staticMeshes = 0;
    city.root.traverse((object) => {
      if (object.isMesh) staticMeshes++;
    });
    assert.ok(
      staticMeshes < 55,
      `${staticMeshes} static meshes should be a few material batches, not one per window`,
    );
    assert.ok(kit.geometries.size < 70, 'baked source geometry is released');
    assert.ok(
      city.streetFurniture.length >= 20,
      'visible street detail is actually built',
    );
    for (const p of city.streetFurniture)
      assert.ok(
        citySceneryFits(p, p.radius),
        'street details leave road and stop clearance',
      );
    const before = [kit.geometries.size, kit.materials.size, kit.textures.size];
    for (let i = 0; i < 180; i++)
      city.update(i / 60, i % cityStops.length, -1, i % 2 === 0);
    assert.deepEqual(
      [kit.geometries.size, kit.materials.size, kit.textures.size],
      before,
    );
  } finally {
    kit.dispose();
    globalThis.document = previous;
  }
});

void test('network preserves high-speed gearbox state and rejects forged gear or velocity values', () => {
  const state = { ...freshCity(), x: -104, z: -63, heading: Math.PI / 2 };
  for (let i = 0; i < 240; i++) tickCity(state, 1 / 60, new Set(['KeyW']));
  const packet = (next) =>
    JSON.stringify({
      type: 'city',
      version: 2,
      seq: 1,
      epoch: 0,
      driver: 'host',
      state: next,
    });
  const parsed = readPeerPacket(packet(state));
  assert.equal(parsed.state.speed, CITY_TOP_SPEED);
  assert.deepEqual(parsed.state.powertrain, state.powertrain);
  assert.equal(parsed.state.throttle, 1);
  for (const invalid of [
    { speed: CITY_TOP_SPEED + 1 },
    { vx: CITY_TOP_SPEED + 1 },
    { powertrain: { ...state.powertrain, gear: 7 } },
    { powertrain: { ...state.powertrain, rpm: 9000 } },
    { powertrain: { ...state.powertrain, load: 2 } },
  ])
    assert.equal(readPeerPacket(packet({ ...state, ...invalid })), null);
});
