import test from 'node:test';
import assert from 'node:assert/strict';
import { freshGame, tick, moveToSide } from '../lib/game/screen/engine.ts';
import { screenPrompts } from '../lib/game/screen/prompts.ts';

const advance = (s, seconds, keys = []) => {
  for (let n = 0; n < Math.round(seconds * 60); n++)
    tick(s, 1 / 60, new Set(keys));
};
const freshTension = () => {
  const s = freshGame(2);
  s.phase = 'tension';
  advance(s, 4);
  return s;
};
const pull = (s) => {
  advance(s, 1.2, ['KeyE']);
  // Let the character take the short step to the next attachment.
  advance(s, 0.85);
};

void test('one owner can install successive springs on balanced edges without throwing', () => {
  const s = freshTension();
  pull(s);
  assert.equal(s.clips[2], 1);
  const cues = screenPrompts(s)[0].prompts;
  assert.ok(cues.some((p) => p.control === 'action'));
  assert.ok(cues.some((p) => p.control === 'throw'));
  moveToSide(s, 0, 1);
  advance(s, 12);
  assert.equal(s.workers[0].side, 1);
  pull(s);
  assert.deepEqual(s.clips, [0, 1, 1, 0]);
  assert.equal(s.tool.owner, 0);
  assert.equal(s.tool.catches, 0);
  assert.equal(s.penalties, 0);
  assert.equal(s.score, 130);
});

void test('a repeated pull on the same edge is playable and still pops from uneven tension', () => {
  const s = freshTension();
  pull(s);
  advance(s, 0.1, ['KeyE']);
  assert.ok(s.spring.active, 'the second press must start another spring');
  advance(s, 1.1, ['KeyE']);
  advance(s, 0.5);
  assert.equal(s.penalties, 1);
  assert.equal(s.score, 25);
  assert.equal(s.events.findLast((e) => e.kind === 'pop').side, 2);
  assert.ok(s.springFlights.length > 0);
  advance(s, 0.1, ['KeyE']);
  assert.ok(s.spring.active, 'a popped spring cannot force a pass either');
});

void test('owner may elect a normal throw and catch immediately after installing a spring', () => {
  const s = freshTension();
  pull(s);
  advance(s, 0.85, ['KeyQ']);
  assert.equal(s.tool.status, 'charging');
  assert.deepEqual(
    screenPrompts(s)[0].prompts.map((p) => p.control),
    ['throw'],
  );
  advance(s, 2, ['Enter']);
  assert.equal(s.tool.status, 'held');
  assert.equal(s.tool.owner, 1);
  assert.equal(s.tool.catches, 1);
  assert.equal(s.tool.misses, 0);
});

void test('original owner can retrieve a missed throw and resume pulling without a forced handoff', () => {
  const s = freshTension();
  pull(s);
  advance(s, 0.15, ['KeyQ']);
  advance(s, 2);
  assert.equal(s.tool.status, 'ground');
  moveToSide(s, 0, s.tool.groundSide);
  advance(s, 12);
  advance(s, 0.1, ['KeyE']);
  advance(s, 0.5);
  assert.equal(s.tool.status, 'held');
  assert.equal(s.tool.owner, 0);
  const before = [...s.clips];
  pull(s);
  assert.equal(s.clips[s.workers[0].side], before[s.workers[0].side] + 1);
});

void test('restored legacy forced-pass flags never hide or block either player choice', () => {
  const original = freshTension();
  pull(original);
  const s = JSON.parse(JSON.stringify(original));
  delete s.tool.passSuggested;
  s.tool.needsPass = true;
  const cues = screenPrompts(s)[0].prompts;
  assert.ok(cues.some((p) => p.control === 'action'));
  assert.ok(cues.some((p) => p.control === 'throw'));
  advance(s, 0.1, ['KeyE']);
  assert.ok(s.spring.active);
});
