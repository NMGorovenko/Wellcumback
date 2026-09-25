import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  buildBuilding,
  generateRoofCatalogue,
  roofSourceFingerprint,
} from '../scripts/generate-city-roofs.mjs';
import { cityBuildings } from '../lib/game/city/layout.ts';
import {
  freshCity,
  stepCityCar,
  cityCarBlocked,
  cityBlocked,
  recoverCityCar,
} from '../lib/game/city/engine.ts';
import {
  citySurfacePose,
  cityGroundHeight,
  cityCeilingHit,
} from '../lib/game/city/surface.ts';
import {
  cityRoofForBuilding,
  cityRoofQueryStats,
  validCityRoofSurfaceId,
} from '../lib/game/city/roofs.ts';
import {
  NETWORK_VERSION,
  readPeerPacket,
} from '../lib/game/network/protocol.ts';
import {
  vehiclePose,
  rememberVehicleStep,
  setVehicleRemainder,
  presentedVehicle,
} from '../lib/game/city/vehicle-presentation.ts';
const dt = 1 / 60,
  neutral = { throttle: 0, steer: 0, handbrake: false };
const kinds = [
  'university',
  'panel',
  'cottage',
  'planeta',
  'komsomoll',
  'kubatura',
  'ikit',
  'fuel',
  'karaulnaya-chapel',
  'monastery',
  'monastery-wing',
  'bobrovy-log',
  'city-art',
];
const close = (a, b, message, tolerance = 0.004) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} versus ${b}`);
function fixture(kind) {
  const index = cityBuildings.findIndex((b) => (b.kind ?? b.style) === kind);
  assert.ok(index >= 0, kind);
  const b = cityBuildings[index];
  return { index, b, x: b.x + (kind === 'cottage' ? b.w * 0.2 : 0), z: b.z };
}
function step(car, input = neutral) {
  car.elapsed += dt;
  return stepCityCar(car, input, dt);
}
function fromPeer(car) {
  return readPeerPacket(
    JSON.stringify({
      type: 'city',
      version: NETWORK_VERSION,
      seq: 1,
      epoch: 1,
      driver: 'host',
      state: car,
    }),
  )?.state;
}
function meshRoof(group, x, z) {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, 1000, z),
    new THREE.Vector3(0, -1, 0),
  );
  const hits = ray.intersectObject(group, true).filter((hit) => {
    if (!hit.object.isMesh || !hit.face) return false;
    const normal = hit.face.normal
      .clone()
      .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
      .normalize().y;
    const material = Array.isArray(hit.object.material)
      ? hit.object.material[hit.face.materialIndex]
      : hit.object.material;
    return (
      normal >= 0.2 || (material.side === THREE.DoubleSide && normal <= -0.2)
    );
  });
  return hits[0]?.point.y;
}
function roofCar(kind, heading = 0) {
  const f = fixture(kind),
    roof = cityRoofForBuilding(f.index, f.x, f.z, cityGroundHeight);
  assert.ok(roof);
  const pose = citySurfacePose(f.x, f.z, heading, roof.elevation + 20);
  return Object.assign(
    freshCity(),
    { x: f.x, z: f.z, heading, vx: 0, vz: 0, speed: 0 },
    pose,
  );
}

void test('roof catalogue exactly regenerates from current renderer sources and records their fingerprint', () => {
  const recorded = JSON.parse(
    readFileSync(
      new URL('../lib/game/city/roofs.generated.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(recorded.sourceHash, roofSourceFingerprint());
  assert.deepEqual(generateRoofCatalogue(), recorded);
  assert.ok(recorded.buildings.some((b) => b.kind === 'karaulnaya-chapel'));
  assert.ok(recorded.buildings.some((b) => b.kind === 'monastery'));
});
for (const kind of kinds)
  void test(`rendered ${kind} roof catches a fall, supports the whole car and survives reconnect`, () => {
    const { index, b, x, z } = fixture(kind),
      { kit, group } = buildBuilding(b, index);
    try {
      const rawY = meshRoof(group, x, z),
        base = cityGroundHeight(b.x, b.z);
      assert.ok(rawY !== undefined, kind);
      const roof = cityRoofForBuilding(index, x, z, cityGroundHeight);
      close(roof.elevation, rawY + base, 'physics meets visible mesh');
      const car = Object.assign(freshCity(), {
        x,
        z,
        heading: 0,
        vx: 0,
        vz: 0,
        speed: 0,
        elevation: rawY + base + 20,
        pitch: 0,
        surfaceId: 'ground',
      });
      Object.assign(car.flight, { airborne: true, vy: -4 });
      let landings = 0;
      for (let frame = 0; frame < 150; frame++) {
        const air = car.flight.airborne;
        step(car);
        if (air && !car.flight.airborne) landings++;
        assert.ok(
          car.elevation >= rawY + base - 0.005,
          `${kind} passed through the roof`,
        );
      }
      assert.equal(landings, 1);
      assert.equal(car.flight.airborne, false);
      assert.equal(car.surfaceId, `roof:${index}`);
      assert.equal(
        cityCarBlocked(
          car.x,
          car.z,
          car.heading,
          car.elevation,
          car.damage,
          true,
        ),
        false,
      );
      const normal = new THREE.Vector3(0, 1, 0).applyEuler(
        new THREE.Euler(car.pitch, car.heading, car.roll, 'YXZ'),
      );
      for (const side of [-1, 0, 1])
        for (const forward of [-2.35, 0, 2.35]) {
          const dx =
              side * Math.cos(car.heading) + forward * Math.sin(car.heading),
            dz = side * Math.sin(car.heading) - forward * Math.cos(car.heading);
          const y = meshRoof(group, x + dx, z + dz);
          if (y === undefined) continue;
          const plane =
            car.elevation - (normal.x * dx + normal.z * dz) / normal.y;
          assert.ok(
            plane >= y + base - 0.005,
            `${kind} roof pierces the chassis footprint`,
          );
        }
      const peer = fromPeer(car);
      assert.ok(peer);
      close(peer.roll, car.roll, 'roll retained', 1e-12);
      for (let frame = 0; frame < 30; frame++) {
        step(car);
        step(peer);
      }
      assert.equal(peer.elevation, car.elevation);
      assert.equal(peer.surfaceId, car.surfaceId);
      assert.equal(peer.roll, car.roll);
    } finally {
      kit.dispose();
    }
  });

void test('pitched cottage support rolls sideways and pitches uphill using the same YXZ plane', () => {
  const side = roofCar('cottage', 0),
    uphill = roofCar('cottage', Math.PI / 2);
  assert.ok(Math.abs(side.roll) > 0.05);
  assert.ok(Math.abs(uphill.pitch) > 0.05);
  assert.ok(Math.abs(side.pitch) < 0.005);
  assert.ok(Math.abs(uphill.roll) < 0.005);
  const previous = vehiclePose(side);
  side.roll += 0.2;
  side.elapsed += dt;
  const current = vehiclePose(side);
  rememberVehicleStep(side, previous, current, dt);
  setVehicleRemainder(side, dt / 2);
  close(
    presentedVehicle(side, side.elevation, side.pitch, false).roll,
    (previous.roll + current.roll) / 2,
    'presentation interpolates roll',
    1e-12,
  );
});

void test('all six fuel canopies stop rising cars and leave the ground-level forecourt open', () => {
  const fuel = cityBuildings.filter((b) => b.kind === 'fuel');
  assert.equal(fuel.length, 6);
  for (const b of fuel) {
    const base = cityGroundHeight(b.x, b.z),
      index = cityBuildings.indexOf(b),
      { kit, group } = buildBuilding(b, index);
    try {
      const underside = new THREE.Raycaster(
        new THREE.Vector3(b.x, 2.5, b.z),
        new THREE.Vector3(0, 1, 0),
      )
        .intersectObject(group, true)
        .find(
          (h) =>
            h.object.isMesh &&
            h.face.normal
              .clone()
              .applyMatrix3(
                new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld),
              )
              .normalize().y < -0.2,
        )?.point.y;
      assert.ok(underside > 3);
      close(
        cityCeilingHit(b.x, b.z, base + 2, base + 4),
        base + underside - 1.45,
        'real canopy underside',
      );
      assert.equal(
        cityCeilingHit(b.x, b.z, base + 6, base + 7),
        null,
        'car above roof remains above it',
      );
      assert.equal(
        cityCarBlocked(b.x, b.z, 0, base),
        false,
        'forecourt remains open',
      );
      assert.equal(
        cityBlocked(b.x, b.z, base + underside - 0.5),
        true,
        'sideways entry into slab is blocked',
      );
      const car = Object.assign(freshCity(), {
        x: b.x,
        z: b.z,
        elevation: base + 2.7,
        vx: 0,
        vz: 0,
        speed: 0,
        pitch: 0,
        roll: 0,
      });
      Object.assign(car.flight, { airborne: true, vy: 9 });
      let bounced = false;
      for (let i = 0; i < 15; i++) {
        step(car);
        assert.ok(car.elevation + 1.45 <= base + underside + 0.005);
        bounced ||= car.flight.vy < 0;
      }
      assert.equal(bounced, true);
    } finally {
      kit.dispose();
    }
  }
});

void test('a bonnet under the canopy edge hits its underside before the car centre enters', () => {
  const b = fixture('fuel').b,
    base = cityGroundHeight(b.x, b.z);
  const edge = b.z + b.d * 0.09 + (b.d * 0.57) / 2;
  const x = b.x,
    z = edge + 1;
  assert.equal(
    cityRoofForBuilding(cityBuildings.indexOf(b), x, z, cityGroundHeight),
    null,
    'centre lies outside canopy',
  );
  assert.ok(
    cityCeilingHit(x, z, base + 2, base + 4, 0) !== null,
    'front of the car already overlaps the slab',
  );
});

void test('ground lookups do not jump onto roofs and a low flight cannot enter building walls', () => {
  for (const kind of kinds) {
    const { index, x, z } = fixture(kind),
      ground = cityGroundHeight(x, z),
      roof = cityRoofForBuilding(index, x, z, cityGroundHeight);
    const pose = citySurfacePose(x, z, 0, ground, 'ground', ground + 0.3);
    assert.ok(!pose.surfaceId.startsWith('roof:'));
    assert.ok(pose.elevation <= ground + 0.35);
    if (kind !== 'fuel')
      assert.equal(cityBlocked(x, z, roof.elevation - 1), true, kind);
  }
  const car = roofCar('university');
  Object.assign(car, { heading: Math.PI / 2, vx: 25, vz: 0, speed: 25 });
  let takeoffs = 0;
  for (let i = 0; i < 150; i++) {
    const air = car.flight.airborne;
    step(car);
    if (!air && car.flight.airborne) takeoffs++;
    if (car.flight.airborne) {
      assert.ok(car.flight.vy <= 5.5);
      break;
    }
  }
  assert.equal(
    takeoffs,
    1,
    'a driven roof edge releases the car rather than gluing it to the facade',
  );
});

void test('roof ids and roll are allowlisted; legacy snapshots and road recovery remain compatible', () => {
  const car = roofCar('cottage');
  assert.ok(fromPeer(car));
  for (const id of [
    'roof:-1',
    'roof:01',
    'roof:1e2',
    'roof:999999',
    'roof:1:2',
  ]) {
    assert.equal(validCityRoofSurfaceId(id), false);
    assert.equal(fromPeer({ ...car, surfaceId: id }), undefined);
  }
  for (const roll of [null, Math.PI / 2, '0'])
    assert.equal(fromPeer({ ...car, roll }), undefined);
  const legacy = { ...freshCity() };
  delete legacy.roll;
  assert.ok(fromPeer(legacy));
  step(legacy);
  assert.equal(legacy.roll, 0);
  const safe = { ...freshCity() };
  car.flight.safe = {
    x: safe.x,
    z: safe.z,
    heading: safe.heading,
    elevation: safe.elevation,
    surfaceId: safe.surfaceId,
  };
  recoverCityCar(car);
  assert.equal(car.roll, 0);
  assert.ok(!car.surfaceId.startsWith('roof:'));
});

void test('roof queries stay local with bounded candidates and no runtime renderer', (t) => {
  assert.ok(cityRoofQueryStats.maximumTopCandidates < 2000);
  assert.ok(cityRoofQueryStats.maximumUndersideCandidates < 2000);
  const begin = performance.now();
  for (let j = 0; j < 10; j++)
    for (const [i, b] of cityBuildings.entries())
      cityRoofForBuilding(i, b.x, b.z, cityGroundHeight);
  t.diagnostic(
    JSON.stringify({
      ...cityRoofQueryStats,
      queryMilliseconds: performance.now() - begin,
    }),
  );
  assert.ok(performance.now() - begin < 1500);
  const source = readFileSync(
    new URL('../lib/game/city/roofs.ts', import.meta.url),
    'utf8',
  );
  assert.ok(!/from ['"]three/.test(source));
});

void test('a higher mall roof tier blocks the bonnet instead of pulling the car through its wall', () => {
  const { b, index, x, z } = fixture('planeta'),
    { kit, group } = buildBuilding(b, index);
  try {
    const ground = cityGroundHeight(b.x, b.z),
      low = meshRoof(group, x, z) + ground;
    assert.ok(
      [-2, 2].some((front) => meshRoof(group, x, z + front) + ground > low + 1),
      'fixture bonnet reaches a real higher roof',
    );
    assert.equal(
      cityCarBlocked(x, z, 0, low),
      true,
      'whole chassis must stop at the higher roof wall',
    );
    const pose = citySurfacePose(x, z, 0, low, `roof:${index}`);
    assert.ok(
      pose.elevation <= low + 0.35,
      'contact cannot teleport upward through the rooflight',
    );
  } finally {
    kit.dispose();
  }
});

void test('landing on ground after a pitched roof clears the remaining airborne roll', () => {
  const car = roofCar('cottage');
  assert.ok(Math.abs(car.roll) > 0.05);
  const road = freshCity();
  Object.assign(car, {
    x: road.x,
    z: road.z,
    elevation: road.elevation + 0.8,
    vx: 0,
    vz: 0,
    speed: 0,
  });
  Object.assign(car.flight, { airborne: true, vy: -3 });
  for (let i = 0; i < 60; i++) step(car);
  assert.equal(car.flight.airborne, false);
  assert.ok(!car.surfaceId.startsWith('roof:'));
  assert.equal(car.roll, 0);
});
