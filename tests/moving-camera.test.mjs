import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { movingCameraSide, movingOverview } from '../lib/game/moving/camera.ts';
import { mapMovingCameraKeys } from '../lib/game/moving/camera-input.ts';
import { PLAYER_BINDINGS } from '../lib/game/input/bindings.ts';
import {
  mapSize,
  bounds,
  MAP_UNITS_PER_METRE,
} from '../lib/game/moving/layout.ts';

const cameraFor = (aspect, fov = 43) => {
  const framing = movingOverview(aspect, fov);
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.08, framing.far);
  camera.position.copy(framing.position);
  camera.lookAt(framing.look.x, framing.look.y, framing.look.z);
  camera.updateMatrixWorld();
  return { camera, framing };
};
const world = (x, y, h) =>
  new THREE.Vector3(
    (x - mapSize.width / 2) / MAP_UNITS_PER_METRE,
    h,
    (y - mapSize.height / 2) / MAP_UNITS_PER_METRE,
  );
const movement = (keys, binding) =>
  new THREE.Vector3(
    Number(keys.has(binding.right)) - Number(keys.has(binding.left)),
    0,
    Number(keys.has(binding.down)) - Number(keys.has(binding.up)),
  );

void test('responsive overview fits complete room corners, floor and headroom on both sides of the breakpoint', () => {
  for (const aspect of [0.5, 9 / 16, 1, 1.199, 1.2, 4 / 3, 16 / 9, 21 / 9, 3])
    for (const fov of [35, 43, 60]) {
      const { camera, framing } = cameraFor(aspect, fov);
      assert.equal(framing.side, aspect >= 1.2 ? 'x' : 'z');
      for (const x of [0, bounds.minX, bounds.maxX, mapSize.width])
        for (const y of [0, bounds.minY, bounds.maxY, mapSize.height])
          for (const h of [-0.2, 0, 2.2, 2.7]) {
            const p = world(x, y, h).project(camera);
            assert.ok(
              Math.abs(p.x) <= 0.901 &&
                Math.abs(p.y) <= 0.901 &&
                Math.abs(p.z) < 1,
              `full room visible at ${aspect}/${fov}: ${x},${y},${h}`,
            );
          }
    }
});

void test('desktop framing uses screen width for the long room while portrait retains its vertical layout', () => {
  const wide = cameraFor(16 / 9),
    portrait = cameraFor(9 / 16);
  const wideEnds = [0, mapSize.height].map((y) =>
    world(mapSize.width / 2, y, 0).project(wide.camera),
  );
  const portraitEnds = [0, mapSize.height].map((y) =>
    world(mapSize.width / 2, y, 0).project(portrait.camera),
  );
  assert.ok(
    Math.abs(wideEnds[1].x - wideEnds[0].x) > 1.25,
    'room length spans more than 62% of desktop width',
  );
  assert.ok(
    Math.abs(wideEnds[1].y - wideEnds[0].y) < 1e-8,
    'the long centre aisle is horizontal',
  );
  assert.ok(Math.abs(portraitEnds[1].x - portraitEnds[0].x) < 1e-8);
  assert.ok(Math.abs(portraitEnds[1].y - portraitEnds[0].y) > 1.1);
  assert.equal(movingCameraSide(1.199), 'z');
  assert.equal(movingCameraSide(1.2), 'x');
});

void test('every player direction follows the actual projected camera axes in portrait and landscape', () => {
  for (const aspect of [9 / 16, 1.199, 1.2, 16 / 9]) {
    const { camera } = cameraFor(aspect);
    const centre = new THREE.Vector3().project(camera);
    for (const binding of PLAYER_BINDINGS)
      for (const [direction, screenX, screenY] of [
        ['up', 0, 1],
        ['right', 1, 0],
        ['down', 0, -1],
        ['left', -1, 0],
      ]) {
        const keys = mapMovingCameraKeys(new Set([binding[direction]]), aspect);
        const delta = movement(keys, binding).project(camera).sub(centre);
        assert.ok(
          screenX ? delta.x * screenX > 0.01 : Math.abs(delta.x) < 1e-8,
        );
        assert.ok(
          screenY ? delta.y * screenY > 0.01 : Math.abs(delta.y) < 1e-8,
        );
      }
  }
  assert.deepEqual(
    [...mapMovingCameraKeys(new Set(['KeyW', 'ArrowRight', 'KeyK']), 16 / 9)],
    ['KeyA', 'ArrowUp', 'KeyL'],
  );
});

void test('camera mapping preserves three simultaneous players, diagonals, cancelling opposites and every nonmovement command', () => {
  const actions = PLAYER_BINDINGS.flatMap((binding) => [
    binding.action,
    binding.secondary,
  ]);
  const extras = ['Space', 'Escape', 'KeyQ', 'F2', ...actions];
  const all = new Set([
    ...extras,
    'KeyW',
    'KeyD',
    'ArrowUp',
    'ArrowDown',
    'KeyJ',
    'KeyL',
  ]);
  const before = [...all];
  const mapped = mapMovingCameraKeys(all, 16 / 9);
  assert.deepEqual(
    [...all],
    before,
    'source-owned keyboard/gamepad input is unchanged',
  );
  assert.deepEqual(movement(mapped, PLAYER_BINDINGS[0]).toArray(), [-1, 0, -1]);
  assert.deepEqual(movement(mapped, PLAYER_BINDINGS[1]).toArray(), [0, 0, 0]);
  assert.deepEqual(movement(mapped, PLAYER_BINDINGS[2]).toArray(), [0, 0, 0]);
  for (const command of extras)
    assert.ok(mapped.has(command), `${command} is untouched`);
  const portrait = mapMovingCameraKeys(all, 9 / 16);
  assert.deepEqual([...portrait], before);
  assert.notEqual(portrait, all);
  for (const binding of PLAYER_BINDINGS)
    for (let mask = 0; mask < 16; mask++) {
      const keys = new Set(
        ['up', 'right', 'down', 'left']
          .filter((_, i) => mask & (1 << i))
          .map((direction) => binding[direction]),
      );
      const input = movement(keys, binding),
        output = movement(mapMovingCameraKeys(keys, 2), binding);
      assert.equal(output.x, input.z);
      assert.equal(output.z, -input.x || 0);
      assert.equal(
        output.lengthSq(),
        input.lengthSq(),
        'rotation preserves speed and diagonal normalization',
      );
    }
});
