import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshGame,
  tick,
  transition,
  setPaused,
} from '../lib/game/screen/engine.ts';
import {
  createScreenEpisode,
  screenEpisodes,
} from '../lib/game/screen/episodes.ts';
import { SCREEN_DIALOGUE } from '../lib/game/screen/dialogue.ts';
import { drillSay } from '../lib/game/screen/drill-tools.ts';
void test('every story stage has a short attributed comic independent of action instructions', () => {
  const s = freshGame(1);
  assert.equal(s.speechText, SCREEN_DIALOGUE.frame.text);
  for (const [phase, line] of Object.entries(SCREEN_DIALOGUE)) {
    const seq = s.messageSeq;
    transition(s, phase, 'Подсказка о следующем действии');
    assert.equal(s.speechText, line.text);
    assert.equal(s.messageSpeaker, line.speaker);
    assert.equal(s.message, 'Подсказка о следующем действии');
    assert.equal(s.messageSeq, seq + 1);
    assert.ok(s.messageUntil > s.elapsed && s.messageUntil <= s.elapsed + 6);
  }
});
void test('ordinary frame action hints cannot overwrite, refresh, or resurrect the current comic', () => {
  const s = freshGame(1),
    text = s.speechText,
    seq = s.messageSeq,
    until = s.messageUntil;
  s.frameFit = 0;
  s.frameTwist = 0;
  tick(s, 1 / 60, new Set(['KeyE']));
  assert.equal(s.frameStage, 'lock');
  assert.match(s.message, /Профиль/);
  assert.equal(s.speechText, text);
  assert.equal(s.messageSeq, seq);
  assert.equal(s.messageUntil, until);
  for (let n = 0; n < 7 * 60; n++) tick(s, 1 / 60, new Set());
  assert.ok(s.elapsed > s.messageUntil);
  assert.equal(s.messageSeq, seq);
});
void test('practice entry gets its own stage comic, and drill statements use the same fields', () => {
  for (const episode of screenEpisodes) {
    const s = createScreenEpisode(2, episode.id);
    assert.equal(s.speechText, SCREEN_DIALOGUE[episode.id].text);
    assert.equal(s.messageSpeaker, SCREEN_DIALOGUE[episode.id].speaker);
  }
  const s = createScreenEpisode(1, 'drill');
  drillSay(s, 'Я уже иду!', 0);
  assert.equal(s.speechText, 'Я уже иду!');
  assert.equal(s.messageSpeaker, 0);
  setPaused(s, true);
  const snapshot = JSON.stringify(s);
  tick(s, 0.2, new Set(['KeyE']));
  assert.equal(JSON.stringify(s), snapshot);
});
