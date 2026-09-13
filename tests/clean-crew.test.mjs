import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cleanCast,
  freshClean,
  cleanTick,
  canStand,
} from '../lib/game/clean/engine.ts';
import { crewSpawn, doorways, obstacles } from '../lib/game/clean/layout.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import {
  createCleaner,
  createNpc,
  createSoldier,
  createSupporter,
} from '../components/game/clean/actors-v3.ts';

for (const players of [1, 2, 3]) {
  void test(`cleanup handoff keeps one Roma and exactly ${players} human slots`, () => {
    const s = freshClean(players);
    const beforeHandoff = cleanCast(s);
    assert.deepEqual(
      beforeHandoff.map((person) => person.id),
      ['soldier', 'roma', 'orderly'].slice(0, players),
    );
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
      cleanCast(s).map((person) => person.id),
      players === 1
        ? ['roma']
        : ['relief', 'roma', 'orderly'].slice(0, players),
    );
    assert.equal(
      cleanCast(s).filter((person) => person.id === 'roma').length,
      1,
    );
    if (players > 1)
      assert.deepEqual(
        cleanCast(s).slice(1),
        beforeHandoff.slice(1),
        'partners retain their identities and slots',
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

for (const players of [1, 2, 3])
  void test(`all active and hidden barracks factories permit only Roma's portrait for ${players} players`, () => {
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
    const createChecked = (factory, portrait, label) => {
      const from = loaded.length;
      const actor = factory();
      assert.deepEqual(
        loaded.slice(from),
        portrait ? ['/characters/faces/roma.png'] : [],
        label,
      );
      return actor;
    };
    try {
      const soldier = createChecked(
        () => createSoldier(k),
        false,
        'incident soldier',
      );
      assert.equal(soldier.rig.root.name, 'anonymous-soldier');
      const npcs = [0, 1, 2].map((index) =>
        createChecked(
          () => createNpc(k, index, players),
          players === 1 && index === 1,
          `NPC ${index}`,
        ),
      );
      assert.deepEqual(
        npcs.map((actor) => actor.rig.root.name),
        ['npc-0', players === 1 ? 'witness-roma' : 'npc-1', 'npc-2'],
      );
      // The scene constructs every slot, including models hidden in this mode or phase.
      const crew = [0, 1, 2].map((index) =>
        createChecked(
          () => createCleaner(k, index, players),
          index === 1 || (players === 1 && index === 0),
          `cleaner ${index}`,
        ),
      );
      assert.deepEqual(
        crew.slice(0, players).map((actor) => actor.rig.root.name),
        cleanCast({ phase: 'clean', players }).map(
          (person) => `cleaner-${person.id}`,
        ),
      );
      const support = [1, 2].map((index) =>
        createChecked(
          () => createSupporter(k, index),
          index === 1,
          `supporter ${index}`,
        ),
      );
      assert.deepEqual(
        support.map((actor) => actor.rig.root.name),
        ['support-roma', 'support-orderly'],
      );
      assert.ok(loaded.every((url) => url === '/characters/faces/roma.png'));
      assert.ok(support.every((actor) => actor.kitBag.visible === false));
      assert.ok(labels.includes('Рома'));
      assert.ok(labels.includes('Боец'));
      assert.ok(labels.every((label) => !/Никит|Ярик|Ярослав/.test(label)));
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
