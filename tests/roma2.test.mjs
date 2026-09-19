import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  freshRoma2,
  roma2Action,
  roma2Tick,
  inToiletWindow,
  stallX,
  atToiletRags,
  visitorCanSee,
  toiletHidden,
  visitorPresent,
} from '../lib/game/roma2/engine.ts';
import {
  TOILET_RAGS,
  TOILET_EXIT,
  toiletCanStand,
  toiletSightDistance,
  SIGHT_RANGE,
} from '../lib/game/roma2/layout.ts';
import { PLAYER_BINDINGS } from '../lib/game/input/bindings.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import {
  createToiletVisitor,
  createToiletFloor,
} from '../components/game/roma2/visitor.ts';

const step = (s, keys = [], n = 1) => {
  for (let i = 0; i < n; i++) roma2Tick(s, 1 / 60, new Set(keys));
};
const playable = (players = 1) => {
  const s = freshRoma2(players);
  roma2Action(s);
  step(s);
  return s;
};
function approach(keys, binding, a, target) {
  const dx = target[0] - a.x,
    dz = target[1] - a.z;
  if (Math.abs(dx) > 0.11) keys.add(dx > 0 ? binding.right : binding.left);
  if (Math.abs(dz) > 0.11) keys.add(dz > 0 ? binding.down : binding.up);
  return Math.hypot(dx, dz) < 0.19;
}

for (const players of [1, 2, 3])
  void test(`Roma 2: ${players} players walk out, collect distant rags, return and escape using ordinary controls`, () => {
    const state = playable(players),
      routes = Array.from({ length: players }, () => ({
        stage: '',
        caught: 0,
        index: 0,
        started: false,
      }));
    const visited = Array.from({ length: players }, () => new Set());
    for (let frame = 0; frame < 60 * 240 && state.phase !== 'result'; frame++) {
      const keys = new Set();
      state.actors.forEach((a, i) => {
        const k = PLAYER_BINDINGS[i],
          route = routes[i];
        visited[i].add(a.stage);
        if (route.stage !== a.stage || route.caught !== a.caught)
          Object.assign(route, {
            stage: a.stage,
            caught: a.caught,
            index: 0,
            started: a.stage === 'return',
          });
        if (a.release || a.recovery) return;
        if (a.stage === 'relief') keys.add(k.action);
        if (a.stage === 'paper') keys.add(i % 2 ? k.action : k.secondary);
        if (
          a.stage === 'wipe' &&
          inToiletWindow((a.cycle + 1 / 114) % 1) &&
          !a.previousAction
        )
          keys.add(k.action);
        if (!['rag', 'return', 'escape'].includes(a.stage)) return;
        // Observe the visitor from a closed stall, then use the clear right aisle.
        if (!route.started) {
          if (
            state.visitor.stage !== (a.stage === 'escape' ? 'away' : 'wash') ||
            state.visitor.time > 0.6
          )
            return;
          route.started = true;
        }
        if (a.stage === 'rag' && atToiletRags(a)) {
          keys.add(k.action);
          return;
        }
        const lane = 2.9 + i * 0.6,
          aisle = 0.9 + i * 0.5;
        const waypoints =
          a.stage === 'rag'
            ? [
                [stallX(i), aisle],
                [lane, aisle],
                [lane, 8.2],
              ]
            : a.stage === 'return'
              ? [
                  [lane, aisle],
                  [stallX(i), aisle],
                  [stallX(i), -1.3],
                ]
              : [
                  [stallX(i), 1],
                  [(i - 1) * 0.4, 1],
                  [(i - 1) * 0.4, TOILET_EXIT.z],
                ];
        const target = waypoints[Math.min(route.index, waypoints.length - 1)];
        if (approach(keys, k, a, target)) route.index++;
        if (
          a.stage === 'escape' &&
          a.itch > 28 &&
          inToiletWindow((a.cycle + 1 / 102) % 1) &&
          !a.previousAction
        )
          keys.add(k.action);
      });
      roma2Tick(state, 1 / 60, keys);
      state.actors.forEach((a) =>
        assert.ok(
          toiletCanStand(a.x, a.z),
          `${a.stage}: player must stay outside walls`,
        ),
      );
      if (frame % 120 === 0)
        assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
    }
    assert.equal(
      state.phase,
      'result',
      JSON.stringify({ visitor: state.visitor, actors: state.actors, routes }),
    );
    assert.ok(state.visitor.visits >= 1);
    state.actors.forEach((a, i) => {
      assert.equal(a.strokes, 4);
      assert.equal(a.ragDirt, 1);
      assert.ok(a.scratches > 0);
      for (const stage of ['rag', 'return', 'wipe', 'escape'])
        assert.ok(visited[i].has(stage), stage);
      assert.equal(a.stage, 'done');
      assert.ok(a.stageTime > 2.5);
    });
    assert.equal(state.actors[0].calls, 1);
    if (players > 1)
      assert.equal(state.actors[1].calls, 0, 'calling for help is optional');
  });

void test('Rag cannot be collected remotely or used before returning to the correct stall', () => {
  const s = playable(2),
    a = s.actors[0];
  Object.assign(a, { stage: 'rag', release: false });
  step(s, ['KeyE'], 300);
  assert.equal(a.progress, 0);
  assert.equal(a.carryingRag, false);
  Object.assign(a, { x: TOILET_RAGS.x, z: TOILET_RAGS.z });
  step(s, ['KeyE'], 76);
  assert.equal(a.stage, 'return');
  assert.equal(a.carryingRag, true);
  step(s);
  Object.assign(a, { x: stallX(1), z: -1.3 });
  step(s);
  assert.equal(
    a.stage,
    'return',
    'another player’s stall is only a hiding place',
  );
  Object.assign(a, { x: stallX(0), z: -1.3 });
  step(s);
  assert.equal(a.stage, 'wipe');
  assert.equal(a.release, true);
});
void test('The action release latch prevents holding through retrieval and wiping transitions', () => {
  const s = playable();
  step(s, ['KeyE'], 600);
  assert.equal(s.actors[0].stage, 'paper');
  step(s);
  step(s, ['KeyE']);
  assert.equal(s.actors[0].stage, 'rag');
  Object.assign(s.actors[0], TOILET_RAGS);
  step(s, ['KeyE'], 120);
  assert.equal(s.actors[0].progress, 0);
  step(s);
  step(s, ['KeyE'], 80);
  assert.equal(s.actors[0].stage, 'return');
});
void test('Visitor vision has a front cone, finite range, wall occlusion and closed-stall cover', () => {
  const s = playable(),
    v = s.visitor;
  Object.assign(v, { stage: 'inspect', x: 0, z: 3, gaze: 0 });
  assert.equal(visitorCanSee(v, { x: 0, z: 5 }), true);
  assert.equal(visitorCanSee(v, { x: 0, z: 1 }), false);
  assert.equal(visitorCanSee(v, { x: 0, z: 9.5 }), false);
  Object.assign(v, { x: 0, z: 6.45, gaze: Math.PI / 2 });
  assert.equal(visitorCanSee(v, { x: 3.6, z: 6.45 }), false);
  assert.ok(toiletSightDistance(v, v.gaze) < 2.1);
  Object.assign(s.actors[0], { x: 3.6, z: 6.45 });
  assert.equal(toiletHidden(s, s.actors[0]), true);
  Object.assign(v, { x: 0, z: 2, gaze: Math.PI });
  assert.equal(visitorCanSee(v, { x: 0, z: -1.3 }), false);
  assert.ok(toiletSightDistance(v, Math.PI) <= 2.35 + 1e-8);
});
void test('Detection gives reaction time, catches only the exposed player and preserves completed story progress', () => {
  const s = playable(2),
    a = s.actors[0];
  s.score = 400;
  Object.assign(a, {
    stage: 'return',
    carryingRag: true,
    x: -2,
    z: 3,
    calls: 1,
    mess: 1,
    release: false,
  });
  Object.assign(s.visitor, { stage: 'wash', time: 0, x: 0, z: 3, visits: 1 });
  step(s, [], 30);
  assert.ok(a.exposure > 0.4 && a.exposure < 1);
  assert.equal(a.caught, 0);
  step(s, [], 38);
  assert.equal(a.caught, 1);
  assert.equal(a.stage, 'rag');
  assert.equal(a.x, stallX(0));
  assert.equal(a.calls, 1);
  assert.equal(a.mess, 1);
  assert.equal(a.carryingRag, false);
  assert.equal(s.score, 365);
  assert.ok(a.recovery > 2);
  assert.equal(s.actors[1].caught, 0);
  assert.equal(s.actors[1].stage, 'relief');
  assert.equal(s.phase, 'playing');
  step(s, ['KeyS'], 150);
  assert.equal(
    a.z,
    -1.3,
    'held input after being caught cannot run out automatically',
  );
  step(s);
  step(s, ['KeyS']);
  assert.ok(a.z > -1.3);
});
void test('Patrol warnings precede repeat visits, pause freezes everything and JSON restore stays deterministic', () => {
  const s = playable(3);
  const phases = new Set();
  for (let i = 0; i < 6000; i++) {
    phases.add(s.visitor.stage);
    step(s);
  }
  assert.ok(s.visitor.visits >= 3);
  for (const stage of ['warning', 'enter', 'wash', 'inspect', 'leave', 'away'])
    assert.ok(phases.has(stage));
  s.paused = true;
  const frozen = structuredClone(s);
  step(s, ['KeyE', 'KeyW', 'ShiftLeft'], 200);
  assert.deepEqual(s, frozen);
  const restored = JSON.parse(JSON.stringify(s));
  restored.paused = s.paused = false;
  for (let i = 0; i < 800; i++) {
    const keys = i % 20 < 10 ? ['KeyE', 'Enter', 'KeyO'] : [];
    step(s, keys);
    step(restored, keys);
  }
  assert.deepEqual(s, restored);
});
void test('Walls stop players and hiding removes suspicion without resetting the patrol', () => {
  const s = playable(),
    a = s.actors[0];
  Object.assign(a, { stage: 'rag', release: false });
  step(s, ['KeyD'], 120);
  assert.ok(a.x < -1.8);
  assert.ok(toiletCanStand(a.x, a.z));
  a.exposure = 0.8;
  const time = s.visitor.time;
  step(s, [], 40);
  assert.equal(a.exposure, 0);
  assert.ok(s.visitor.time > time);
  assert.equal(a.caught, 0);
});
void test('Vision rendering shares occlusion with the engine and allocates no geometry each frame', () => {
  const previous = globalThis.document;
  globalThis.document = {
    // oxlint-disable-next-line typescript/no-deprecated -- Canvas-only test double; no deprecated tag is created.
    createElement: () => ({
      width: 512,
      height: 96,
      getContext: () => new Proxy({}, { get: () => () => {} }),
    }),
  };
  const kit = new RenderKit(new THREE.Scene());
  try {
    const v = createToiletVisitor(kit),
      tiles = createToiletFloor(kit),
      s = playable();
    Object.assign(s.visitor, {
      stage: 'inspect',
      x: 0,
      z: 6.45,
      gaze: Math.PI / 2,
    });
    const before = [kit.geometries.size, kit.materials.size, kit.textures.size];
    for (let i = 0; i < 180; i++) {
      s.elapsed = i / 60;
      v.update(s);
    }
    assert.deepEqual(
      [kit.geometries.size, kit.materials.size, kit.textures.size],
      before,
    );
    assert.equal(tiles.length, 2);
    assert.equal(
      tiles.reduce((n, mesh) => n + mesh.count, 0),
      560,
    );
    const vertices = v.cone.geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const dx = vertices.getX(i),
        dz = vertices.getZ(i) - 6.45,
        length = Math.hypot(dx, dz);
      assert.ok(length <= SIGHT_RANGE + 0.001);
      if (length > 0.001)
        assert.ok(
          Math.abs(
            length - toiletSightDistance(s.visitor, Math.atan2(dx, dz)),
          ) < 0.001,
          'every visible ray ends at the engine occluder',
        );
    }
    s.visitor.stage = 'warning';
    v.update(s);
    assert.equal(v.rig.root.visible, false);
    assert.equal(v.footsteps.visible, true);
    assert.equal(visitorPresent(s.visitor), false);
  } finally {
    kit.dispose();
    globalThis.document = previous;
  }
});
