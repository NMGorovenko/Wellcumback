import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cleanCrew,
  freshClean,
  cleanTick,
  canStand,
} from '../lib/game/clean/engine.ts';
import { crewSpawn, doorways, obstacles } from '../lib/game/clean/layout.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import {
  createCleaner,
  createSoldier,
  createSupporter,
} from '../components/game/clean/actors-v3.ts';

for (const players of [1, 2, 3]) {
  void test(`cleanup handoff recruits exactly ${players} humans in Roma, Nikita, Yarik order`, () => {
    const s = freshClean(players);
    s.phase = 'response';
    s.responseStage = 'gear';
    s.npcs[1].x = crewSpawn.x - 25;
    s.npcs[1].y = crewSpawn.y;
    s.npcs[2].x = crewSpawn.x + 25;
    s.npcs[2].y = crewSpawn.y;
    s.pantsLoaded = true;
    cleanTick(s, 0.025, new Set());
    assert.equal(s.phase, 'clean');
    assert.equal(s.actorCount, players);
    assert.deepEqual(
      cleanCrew.slice(0, s.actorCount).map((p) => p.id),
      ['roma', 'nikita', 'yaroslav'].slice(0, players),
    );
    assert.deepEqual(
      cleanCrew.map((p) => p.name),
      ['Рома', 'Никита', 'Ярик'],
    );
    const before = [...s.x];
    for (let i = 0; i < 5; i++)
      cleanTick(s, 0.025, new Set(['KeyA', 'ArrowLeft', 'KeyJ']));
    for (let actor = 0; actor < 3; actor++) {
      if (actor < players)
        assert.ok(s.x[actor] < before[actor], `human slot ${actor} moves`);
      else
        assert.equal(
          s.x[actor],
          before[actor],
          `inactive slot ${actor} remains still`,
        );
    }
  });
}

void test('cleaner slots load the right portraits; the anonymous incident soldier loads none', () => {
  const before = globalThis.document;
  const labels = [];
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      createElement: () => ({
        width: 512,
        height: 96,
        getContext: () =>
          new Proxy(
            { fillText: (text) => labels.push(text) },
            { get: (target, key) => target[key] ?? (() => {}) },
          ),
      }),
    },
  });
  const k = new RenderKit(new THREE.Scene()),
    loaded = [];
  k.texture = (url) => {
    loaded.push(url);
    const texture = new THREE.Texture();
    k.textures.add(texture);
    return texture;
  };
  try {
    const soldier = createSoldier(k);
    assert.equal(soldier.rig.root.name, 'anonymous-soldier');
    assert.deepEqual(loaded, []);
    const crew = [0, 1, 2].map((index) => createCleaner(k, index));
    assert.deepEqual(
      crew.map((p) => p.rig.root.name),
      ['cleaner-roma', 'cleaner-nikita', 'cleaner-yaroslav'],
    );
    assert.deepEqual(loaded, [
      '/characters/faces/roma.png',
      '/characters/faces/nikita.jpg',
      '/characters/faces/yaroslav.jpg',
    ]);
    const support = [1, 2].map((index) => createSupporter(k, index));
    assert.deepEqual(
      support.map((actor) => actor.rig.root.name),
      ['support-nikita', 'support-yaroslav'],
    );
    assert.deepEqual(loaded.slice(3), [
      '/characters/faces/nikita.jpg',
      '/characters/faces/yaroslav.jpg',
    ]);
    assert.ok(support.every((actor) => actor.kitBag.visible === false));
    for (const name of ['Рома', 'Никита', 'Ярик'])
      assert.ok(labels.includes(name));
  } finally {
    k.dispose();
    globalThis.document = before;
  }
});

void test('rooms have solid front partitions and walkable door openings', () => {
  for (const wall of obstacles.filter((solid) => solid.kind === 'wall'))
    assert.equal(
      canStand(wall.x + wall.w / 2, wall.y + wall.h / 2),
      false,
      wall.label,
    );
  for (const door of doorways)
    assert.equal(
      canStand((door.left + door.right) / 2, door.y),
      true,
      door.label,
    );
});
