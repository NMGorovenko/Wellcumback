import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  breakableObjects,
  freshCityDamage,
  strikeCityObject,
  isCityObjectBroken,
  validCityDamage,
  cityBreakablesAt,
} from '../lib/game/city/destruction.ts';
import {
  cityBlocked,
  freshCity,
  stepCityCar,
  teleportCityCar,
} from '../lib/game/city/engine.ts';
import { cityBarriers } from '../lib/game/city/barriers.ts';
import { createBridgeRails } from '../components/game/city/bridge-rails.ts';
import { createNeighbourhoodGreenery } from '../components/game/city/neighbourhoods.ts';
import { createCityDestruction } from '../components/game/city/destruction.ts';
import { collectCityFoliage } from '../components/game/city/foliage-occlusion.ts';
import { liftScenery } from '../components/game/city/relief.ts';
import { cityGroundHeight } from '../lib/game/city/surface.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { freshRace } from '../lib/game/race/engine.ts';
import { validRaceState } from '../lib/game/race/validation.ts';
import {
  readPeerPacket,
  NETWORK_VERSION,
} from '../lib/game/network/protocol.ts';

void test('slow and glancing contact preserve rails; a normal impact breaks only that section', () => {
  const damage = freshCityDamage(),
    rail = breakableObjects[0],
    a = rail.angle;
  assert.equal(
    strikeCityObject(damage, 0, Math.cos(a) * 2, -Math.sin(a) * 2, 1),
    false,
  );
  assert.equal(
    strikeCityObject(damage, 0, Math.sin(a) * 45, Math.cos(a) * 45, 1),
    false,
  );
  assert.equal(
    strikeCityObject(damage, 0, Math.cos(a) * 18, -Math.sin(a) * 18, 2),
    true,
  );
  assert.equal(isCityObjectBroken(damage, 0), true);
  assert.equal(isCityObjectBroken(damage, 1), false);
  assert.equal(strikeCityObject(damage, 0, 30, 30, 3), false);
  assert.equal(damage.hits.length, 1);
  assert.equal(
    cityBreakablesAt(rail.x, rail.z, rail.y, damage).includes(0),
    false,
  );
  assert.equal(
    cityBreakablesAt(rail.x, rail.z, rail.y - 15).includes(0),
    false,
    'road beneath a bridge cannot strike its upper rail',
  );
});

void test('real vehicle step hits a tree, slows down and can pass it after it falls', () => {
  const tree = breakableObjects.find(
    (o) =>
      o.kind === 'tree' &&
      !cityBlocked(o.x, o.z + 6, o.y) &&
      !cityBlocked(o.x, o.z + 9, o.y),
  );
  assert.ok(tree);
  const car = Object.assign(freshCity(), {
    x: tree.x,
    z: tree.z + 7,
    vx: 0,
    vz: -18,
    speed: 18,
    heading: 0,
    elevation: tree.y,
    surfaceId: 'ground',
  });
  for (let i = 0; i < 60 && !isCityObjectBroken(car.damage, tree.id); i++) {
    car.elapsed += 1 / 60;
    stepCityCar(car, { throttle: 0, steer: 0, handbrake: false }, 1 / 60);
  }
  assert.ok(isCityObjectBroken(car.damage, tree.id));
  assert.ok(car.speed < 15, 'impact consumes momentum');
  assert.equal(cityBlocked(tree.x, tree.z, tree.y, car.damage), false);
  const marks = car.damage.marks;
  teleportCityCar(car, 'nikita');
  assert.equal(car.damage.marks, marks, 'travel does not repair the city');
});

void test('bounded damage history preserves old wrecks and validates network snapshots', () => {
  const damage = freshCityDamage();
  for (let i = cityBarriers.length; i < cityBarriers.length + 40; i++)
    strikeCityObject(damage, i, 20, 0, i);
  assert.equal(damage.hits.length, 16);
  assert.ok(isCityObjectBroken(damage, cityBarriers.length));
  assert.ok(validCityDamage(JSON.parse(JSON.stringify(damage))));
  assert.ok(JSON.stringify(damage).length < 5000);
  assert.equal(validCityDamage({ marks: 'Z', hits: [] }), false);
  assert.equal(validCityDamage({ marks: 'A', hits: [[0, 0, 0, NaN]] }), false);
  const car = Object.assign(freshCity(), {
    damage,
    players: 1,
    interaction: null,
  });
  const packet = readPeerPacket(
    JSON.stringify({
      type: 'city',
      version: NETWORK_VERSION,
      seq: 1,
      epoch: 1,
      driver: 'host',
      state: car,
    }),
  );
  assert.deepEqual(packet?.state.damage, damage);
  const race = freshRace();
  race.damage = damage;
  assert.equal(validRaceState(JSON.parse(JSON.stringify(race))), true);
  race.damage = { marks: '!', hits: [] };
  assert.equal(validRaceState(race), false);
});

void test('instanced rails and trees animate, settle, restore and reuse all resources', () => {
  const scene = new THREE.Scene(),
    kit = new RenderKit(scene),
    root = new THREE.Group();
  scene.add(root);
  try {
    createBridgeRails(kit, root);
    const trees = new THREE.Group();
    root.add(trees);
    createNeighbourhoodGreenery(kit, trees);
    liftScenery(kit, trees, cityGroundHeight);
    const view = createCityDestruction(kit, root);
    collectCityFoliage(root);
    const trunk = root.getObjectByName('neighbourhood-tree-trunks');
    const base = new THREE.Matrix4();
    trunk.getMatrixAt(0, base);
    const counts = [kit.geometries.size, kit.materials.size];
    const damage = freshCityDamage();
    strikeCityObject(damage, cityBarriers.length, 20, 0, 1);
    view.update(damage, 1.8);
    const falling = new THREE.Matrix4();
    trunk.getMatrixAt(0, falling);
    assert.notDeepEqual(falling.elements, base.elements);
    view.update(damage, 4);
    const settled = new THREE.Matrix4();
    trunk.getMatrixAt(0, settled);
    assert.ok(Math.abs(settled.elements[4]) > 0.5, 'trunk is tilted');
    for (let n = 0; n < 100; n++) view.update(damage, 10 + n);
    assert.deepEqual([kit.geometries.size, kit.materials.size], counts);
    view.update(freshCityDamage(), 0);
    trunk.getMatrixAt(0, falling);
    assert.deepEqual(falling.elements, base.elements);
    // A newly joined renderer reaches the same pose from a serialized snapshot.
    view.update(JSON.parse(JSON.stringify(damage)), 40);
    trunk.getMatrixAt(0, falling);
    assert.deepEqual(falling.elements, settled.elements);
  } finally {
    kit.dispose();
  }
});
