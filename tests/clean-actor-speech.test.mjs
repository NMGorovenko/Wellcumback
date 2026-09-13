import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshClean,
  cleanAction,
  cleanTick,
  stations,
} from '../lib/game/clean/engine.ts';
import { createCleanEpisode } from '../lib/game/clean/episodes.ts';
import { cleanSpeech } from '../lib/game/clean/dialogue.ts';
const run = (s, seconds, keys = []) => {
  for (let t = 0; t < seconds - 1e-8; t += 0.025)
    cleanTick(s, 0.025, new Set(keys));
};
void test('the soldier asks in his own bubble, then the orderly replies without overlapping speech', () => {
  const s = freshClean(2);
  cleanAction(s);
  run(s, 4.1);
  assert.equal(s.phase, 'find');
  assert.equal(cleanSpeech(s).actor, 0);
  assert.equal(cleanSpeech(s).speaker, 'Солдат');
  assert.equal(cleanSpeech(s).text, 'Где тут дневальный?..');
  s.x[0] = stations[0].x;
  s.y[0] = stations[0].y;
  cleanAction(s);
  assert.equal(s.phase, 'accident');
  assert.equal(cleanSpeech(s).text, 'Товарищ дневальный, разрешите…');
  assert.deepEqual(cleanSpeech(JSON.parse(JSON.stringify(s))), cleanSpeech(s));
  s.paused = true;
  assert.equal(cleanSpeech(s), null);
  s.paused = false;
  run(s, 2.65);
  assert.equal(cleanSpeech(s).npc, 0);
  assert.equal(cleanSpeech(s).actor, null);
  assert.equal(cleanSpeech(s).speaker, 'Дневальный');
});
void test('solo Roma speaks once after rinsing; new dialogue is not rearmed on every held frame', () => {
  const s = createCleanEpisode(1, 'clean');
  run(s, 0.05);
  s.valve = 1;
  s.spin = 1;
  s.x[0] = stations[5].x;
  s.y[0] = stations[5].y;
  s.dirt[0] = 0.8;
  run(s, 1.7, ['KeyE']);
  assert.equal(s.dirt[0], 0);
  const line = cleanSpeech(s);
  assert.equal(line.actor, 0);
  assert.equal(line.speaker, 'Рома');
  assert.match(line.text, /Швабра чистая/);
  run(s, 5, ['KeyE']);
  assert.equal(cleanSpeech(s), null);
  // A legacy/new snapshot moving between roles must not give Roma a soldier's line.
  s.actorSpeech = {
    actor: 0,
    text: 'Разрешите…',
    phase: 'accident',
    until: s.elapsed + 9,
  };
  assert.equal(cleanSpeech(s), null);
});
