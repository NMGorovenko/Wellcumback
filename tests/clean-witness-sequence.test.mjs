import test from 'node:test';
import assert from 'node:assert/strict';
import { createCleanEpisode } from '../lib/game/clean/episodes.ts';
import { cleanTick } from '../lib/game/clean/engine.ts';
import {
  cleanNpcVisible,
  ROMA_WASHER_LINE,
  WASHER_ORDER_LINE,
} from '../lib/game/clean/cast.ts';
import { cleanSpeech } from '../lib/game/clean/dialogue.ts';

for (const players of [1, 2, 3])
  void test(`Roma and the commander enter and speak sequentially, then ${players} cleaners need fresh input`, () => {
    const s = createCleanEpisode(players, 'laundry');
    assert.equal(cleanNpcVisible(s, 1), false);
    assert.equal(cleanNpcVisible(s, 2), false);
    const loaded = createCleanEpisode(players, 'spin');
    assert.equal(cleanNpcVisible(loaded, 1), true);
    assert.equal(cleanNpcVisible(loaded, 2), false);
    const heard = [],
      duration = new Map();
    let count = 0,
      snapshot;
    for (; count < 60 * 60 && loaded.phase !== 'clean'; count++) {
      cleanTick(loaded, 1 / 60, new Set());
      const line = cleanSpeech(loaded);
      if (line) {
        if (heard.at(-1) !== line.text) heard.push(line.text);
        duration.set(line.text, (duration.get(line.text) ?? 0) + 1 / 60);
        assert.ok(cleanNpcVisible(loaded, line.npc));
        if (line.npc === 1 && !snapshot) {
          snapshot = JSON.parse(JSON.stringify(loaded));
          loaded.paused = true;
          const before = structuredClone(loaded);
          cleanTick(loaded, 10, new Set());
          assert.deepEqual(loaded, before);
          loaded.paused = false;
        }
      }
      if (snapshot && snapshot.elapsed < loaded.elapsed)
        cleanTick(snapshot, 1 / 60, new Set());
    }
    assert.equal(loaded.phase, 'clean');
    assert.deepEqual(heard, [ROMA_WASHER_LINE, WASHER_ORDER_LINE]);
    assert.ok(Math.abs(duration.get(ROMA_WASHER_LINE) - 7) < 0.04);
    assert.ok(Math.abs(duration.get(WASHER_ORDER_LINE) - 8) < 0.04);
    assert.deepEqual(
      snapshot,
      loaded,
      'JSON reconnect cannot repeat or skip a speech',
    );
    assert.equal(loaded.actorCount, players);
    assert.ok(loaded.spin < 1, 'the washer still runs when players arrive');
    assert.equal(
      cleanNpcVisible(loaded, 1),
      false,
      'only the playable Roma remains',
    );
    const positions = [...loaded.x];
    cleanTick(loaded, 0.05, new Set(['KeyA', 'ArrowLeft', 'KeyJ']));
    assert.deepEqual(
      loaded.x,
      positions,
      'held observer input cannot move newly playable characters',
    );
    cleanTick(loaded, 0.025, new Set());
    cleanTick(loaded, 0.05, new Set(['KeyA', 'ArrowLeft', 'KeyJ']));
    for (let i = 0; i < players; i++) assert.ok(loaded.x[i] < positions[i]);
  });
