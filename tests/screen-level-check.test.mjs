import test from 'node:test';
import assert from 'node:assert/strict';
import { tick, freshGame } from '../lib/game/screen/engine.ts';
import { createScreenEpisode } from '../lib/game/screen/episodes.ts';
import {
  freshLevelCheck,
  levelCheckStage,
} from '../lib/game/screen/level-check.ts';
import { screenPrompts } from '../lib/game/screen/prompts.ts';
import { levelKeys } from './screen-level-controller.mjs';

for (const players of [1, 2, 3])
  void test(`physical level finale completes with ${players} players and readable Yarik speech`, () => {
    const s = createScreenEpisode(players, 'level');
    const modes = [],
      checkpoints = new Map();
    let spokenAt;
    for (let i = 0; i < 45 * 60 && s.phase !== 'result'; i++) {
      tick(s, 1 / 60, levelKeys(s));
      const c = s.levelCheck;
      if (modes.at(-1) !== c.mode) modes.push(c.mode);
      if (
        ['pickup', 'position', 'climb', 'place', 'celebrate'].includes(
          c.mode,
        ) &&
        !checkpoints.has(c.mode)
      )
        checkpoints.set(c.mode, structuredClone(s));
      const stage = levelCheckStage(s);
      assert.ok(stage.workers[1].y >= 0);
      if (c.mode === 'celebrate' && spokenAt === undefined) {
        spokenAt = s.elapsed;
        assert.equal(s.speechText, 'нихуя с первого раза и по уровню вышло xD');
        assert.equal(s.messageSpeaker, 1);
        assert.equal(s.phase, 'level');
        assert.ok(s.messageUntil - s.elapsed >= 5.4);
      }
    }
    assert.equal(s.phase, 'result');
    assert.deepEqual(modes, [
      'fetch',
      'pickup',
      'chairs',
      'position',
      'climb',
      'place',
      'settle',
      'celebrate',
    ]);
    assert.ok(s.elapsed - spokenAt >= 5.49);
    assert.equal(s.score, 0, 'practice cannot earn points');
    for (const saved of checkpoints.values()) {
      const restored = JSON.parse(JSON.stringify(saved));
      for (let i = 0; i < 100; i++) {
        const input = levelKeys(saved);
        tick(saved, 1 / 60, input);
        tick(restored, 1 / 60, input);
      }
      assert.deepEqual(
        saved,
        restored,
        'snapshot resumes without a skipped action or repeated event',
      );
    }
  });
void test('level cannot finish before fetching and placing the prop; pause freezes pickup', () => {
  const s = createScreenEpisode(1, 'level');
  s.angle = 0;
  s.bubble = 0;
  for (let i = 0; i < 120; i++) tick(s, 1 / 60, new Set(i % 2 ? ['KeyE'] : []));
  assert.equal(s.levelCheck.mode, 'fetch');
  assert.equal(s.phase, 'level');
  s.levelCheck.mode = 'pickup';
  s.levelCheck.progress = 0.3;
  s.paused = true;
  const before = structuredClone(s);
  tick(s, 2, new Set(['KeyE']));
  assert.deepEqual(s, before);
  const prompts = screenPrompts(s);
  assert.equal(prompts[0].player, null);
  assert.equal(prompts[1].player, 0);
  assert.equal(prompts[1].prompts[0].control, 'action');
});
void test('legacy level snapshot initializes a safe physical finale', () => {
  const s = freshGame();
  s.phase = 'level';
  delete s.levelCheck;
  assert.ok(
    levelCheckStage(s).stools.every((stool) => Number.isFinite(stool.x)),
  );
  tick(s, 1 / 60, new Set());
  assert.deepEqual(s.levelCheck, freshLevelCheck());
});
void test('mounting keeps the actual hole angle without inventing a crooked first attempt', () => {
  const s = createScreenEpisode(2, 'lift');
  s.holes = [5.9, 5.9];
  s.latched = [true, true];
  tick(s, 1 / 60, new Set());
  assert.equal(s.phase, 'level');
  assert.equal(s.angle, 0);
});
