import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cleanCrew,
  freshClean,
  cleanTick,
  canStand,
} from '../lib/game/clean/engine.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import {
  createCleaner,
  createSoldier,
} from '../components/game/clean/actors-v3.ts';

for (const players of [1, 2, 3]) {
  void test(`cleanup handoff recruits exactly ${players} humans in Roma, Nikita, Yarik order`, () => {
    const s = freshClean(players);
    s.phase = 'response';
    s.responseStage = 'gear';
    s.npcs[1].x = 710;
    s.npcs[1].y = 505;
    s.npcs[2].x = 760;
    s.npcs[2].y = 505;
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
    for (const name of ['Рома', 'Никита', 'Ярик'])
      assert.ok(labels.includes(name));
  } finally {
    k.dispose();
    globalThis.document = before;
  }
});

void test('rooms have solid front partitions and walkable door openings', () => {
  for (const wall of [
    [90, 543],
    [480, 543],
    [815, 543],
    [1110, 543],
    [500, 288],
  ])
    assert.equal(canStand(...wall), false, `partition ${wall.join(', ')}`);
  for (const door of [
    [220, 543],
    [400, 543],
    [700, 543],
    [980, 543],
    [680, 288],
  ])
    assert.equal(canStand(...door), true, `door ${door.join(', ')}`);
});
