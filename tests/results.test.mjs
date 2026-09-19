import test from 'node:test';
import assert from 'node:assert/strict';
import { appendResult } from '../lib/game/results.ts';

void test('restoring an online result does not award it again; replaying gets a new run', () => {
  for (const story of ['screen', 'clean', 'moving', 'roma2']) {
    const first = {
      story,
      score: 400,
      seconds: 120,
      players: 3,
      details: 'Done',
      date: '2026-09-13',
      runId: `ABCD2345:${story}:7`,
    };
    const saved = appendResult([], first);
    const restored = JSON.parse(JSON.stringify(saved));
    assert.equal(
      appendResult(restored, { ...first, date: '2026-09-14' }),
      restored,
    );
    const replay = appendResult(restored, {
      ...first,
      runId: `ABCD2345:${story}:8`,
    });
    assert.equal(replay.length, 2);
    assert.equal(
      replay.reduce((sum, r) => sum + r.score, 0),
      800,
    );
  }
});

void test('legacy local attempts still count independently within the history limit', () => {
  const result = {
    story: 'moving',
    score: 50,
    seconds: 60,
    players: 1,
    date: '2026-09-13',
    details: 'Done',
  };
  let history = [];
  for (let i = 0; i < 35; i++) history = appendResult(history, result);
  assert.equal(history.length, 30);
});
