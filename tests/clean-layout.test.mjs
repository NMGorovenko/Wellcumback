import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { barracksOverview } from '../lib/game/clean/camera.ts';
import {
  bounds,
  mapSize,
  MAP_UNITS_PER_METRE,
  doorways,
  crewSpawn,
  stations,
  furniture,
} from '../lib/game/clean/layout.ts';
import {
  freshClean,
  cleanTick,
  canStand,
  planRoute,
} from '../lib/game/clean/engine.ts';
import { createCleanEpisode } from '../lib/game/clean/episodes.ts';

void test('three cleaners walk abreast through every room doorway at ordinary body scale', () => {
  assert.equal(MAP_UNITS_PER_METRE, 70);
  for (const door of doorways) {
    const s = freshClean(3),
      center = (door.left + door.right) / 2;
    s.phase = 'clean';
    s.actorCount = 3;
    s.x = [center - 44, center, center + 44];
    s.y = Array(3).fill(door.y - 48);
    s.timer = 160;
    for (let frame = 0; frame < 39; frame++) {
      const before = s.x.map((x, i) => ({ x, y: s.y[i] }));
      cleanTick(s, 1 / 60, new Set(['KeyS', 'ArrowDown', 'KeyK']));
      for (let i = 0; i < 3; i++) {
        assert.ok(
          canStand(s.x[i], s.y[i]),
          `${door.label}: actor ${i} stays off fixtures`,
        );
        assert.ok(
          Math.hypot(s.x[i] - before[i].x, s.y[i] - before[i].y) <=
            166 / 60 + 1e-7,
        );
        for (let j = i + 1; j < 3; j++)
          assert.ok(Math.hypot(s.x[i] - s.x[j], s.y[i] - s.y[j]) >= 31.8);
      }
    }
    assert.ok(
      s.y.every((y) => y > door.y + 50),
      `${door.label}: all three cross into the room`,
    );
  }
});

void test('every station and generated foam patch has a fixture-free reachable interaction position', () => {
  const s = createCleanEpisode(3, 'clean');
  const foam = s.spots.filter((spot) => spot.foam);
  assert.ok(foam.length > 0, 'exercise the actual washer spill');
  const start = { x: crewSpawn.x, y: crewSpawn.y };
  for (const target of [...stations, ...foam]) {
    const route = planRoute(start, target, 52);
    const endpoint = route.at(-1) ?? start;
    assert.ok(
      Math.hypot(endpoint.x - target.x, endpoint.y - target.y) <= 52,
      `${target.id}: reaches interaction range`,
    );
    let previous = start;
    for (const next of route) {
      const samples = Math.max(
        1,
        Math.ceil(Math.hypot(next.x - previous.x, next.y - previous.y) / 3),
      );
      for (let n = 0; n <= samples; n++)
        assert.ok(
          canStand(
            previous.x + ((next.x - previous.x) * n) / samples,
            previous.y + ((next.y - previous.y) * n) / samples,
          ),
          `${target.id}: route cannot cut through a fixture`,
        );
      previous = next;
    }
    assert.ok(
      !furniture.some(
        (rect) =>
          endpoint.x > rect.x &&
          endpoint.x < rect.x + rect.w &&
          endpoint.y > rect.y &&
          endpoint.y < rect.y + rect.h,
      ),
    );
  }
});

for (const { name, aspect } of [
  { name: '16:9', aspect: 16 / 9 },
  { name: '4:3', aspect: 4 / 3 },
  { name: 'portrait', aspect: 9 / 16 },
])
  void test(`fixed overview at ${name} keeps all room corners and standing heads in frame`, () => {
    const overview = barracksOverview(aspect);
    const camera = new THREE.PerspectiveCamera(43, aspect, 0.1, overview.far);
    camera.position.copy(overview.position);
    camera.lookAt(new THREE.Vector3().copy(overview.look));
    camera.updateMatrixWorld(true);
    for (const x of [bounds.minX, bounds.maxX])
      for (const y of [bounds.minY, bounds.maxY])
        for (const height of [0, 1.9, 3.2]) {
          const projected = new THREE.Vector3(
            (x - mapSize.width / 2) / MAP_UNITS_PER_METRE,
            height,
            (y - mapSize.height / 2) / MAP_UNITS_PER_METRE,
          ).project(camera);
          assert.ok(
            Math.abs(projected.x) <= 0.91 && Math.abs(projected.y) <= 0.91,
            `${name}: corner ${x},${y},${height} is clipped`,
          );
          assert.ok(
            projected.z > -1 && projected.z < 1,
            `${name}: corner is inside clipping planes`,
          );
        }
    assert.deepEqual(
      barracksOverview(aspect),
      overview,
      'story-independent fixed framing',
    );
  });
