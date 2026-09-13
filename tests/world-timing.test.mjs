import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cleanTick, stations } from '../lib/game/clean/engine.ts';
import { createCleanEpisode } from '../lib/game/clean/episodes.ts';
import { cleanTimingCue } from '../lib/game/clean/timing.ts';
import {
  freshGame,
  springWindow,
  throwTargetPower,
} from '../lib/game/screen/engine.ts';
import { screenTimingCue } from '../lib/game/screen/timing.ts';
import { timingDial } from '../lib/game/input/timing-cue.ts';
import { barracksFollow, barracksOverview } from '../lib/game/clean/camera.ts';
import { placeActionCues } from '../components/game/world/action-cues.ts';

void test('head clock reports actual Q/E timing and engine feedback, with no independent animation', () => {
  const s = createCleanEpisode(3, 'find');
  for (const code of ['KeyQ', 'KeyE']) {
    s.rhythm.expected = code;
    s.rhythm.clock = s.rhythm.period;
    const cue = cleanTimingCue(s, 0);
    assert.equal(cue.control, code === 'KeyQ' ? 'throw' : 'action');
    assert.equal(timingDial(cue).ready, true);
    const hits = s.rhythm.hits;
    cleanTick(s, 0.01, new Set([code]));
    assert.equal(s.rhythm.hits, hits + 1);
    assert.equal(cleanTimingCue(s, 0).feedback, 'good');
    cleanTick(s, 0.01, new Set());
  }
  assert.equal(
    cleanTimingCue(s, 1),
    null,
    'observers do not receive timing actions',
  );
  const before = structuredClone(s);
  s.paused = true;
  cleanTick(s, 5, new Set(['KeyE']));
  assert.deepEqual(s.rhythm, before.rhythm);
  assert.equal(cleanTimingCue(s, 0), null);
  s.paused = false;
  s.x[0] = stations[0].x;
  s.y[0] = stations[0].y;
  assert.equal(
    cleanTimingCue(s, 0),
    null,
    'at the post E belongs to asking permission',
  );
});

void test('screen clocks use each live tolerance and only the human holding the tool', () => {
  const s = freshGame(3);
  s.frameStage = 'lock';
  s.cursor = 0.5;
  s.frameBrace = 0.5;
  const cue = screenTimingCue(s, 2);
  assert.deepEqual(cue.target, [0.5 - 0.115, 0.5 + 0.115]);
  assert.ok(timingDial(cue).ready);
  assert.equal(timingDial({ ...cue, value: cue.target[0] }).ready, false);
  s.phase = 'tension';
  s.tool.owner = 1;
  s.tool.status = 'charging';
  s.tool.charge = throwTargetPower(s);
  assert.equal(screenTimingCue(s, 0), null);
  assert.equal(screenTimingCue(s, 1).mode, 'release');
  assert.equal(screenTimingCue(s, 1).control, 'throw');
  assert.ok(timingDial(screenTimingCue(s, 1)).ready);
  s.tool.status = 'held';
  s.spring.active = true;
  s.spring.worker = 1;
  s.spring.power = (springWindow(s)[0] + springWindow(s)[1]) / 2;
  assert.deepEqual(screenTimingCue(s, 1).target, springWindow(s));
  assert.ok(timingDial(screenTimingCue(s, 1)).ready);
  s.players = 1;
  assert.equal(
    screenTimingCue(s, 1),
    null,
    'the solo AI cannot display a human action',
  );
});

for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
  [390, 844],
])
  void test(`follow camera and timing cue keep the soldier visible at ${width}x${height}`, () => {
    const fit = barracksFollow(0, 0, width / height);
    const camera = new THREE.PerspectiveCamera(
      43,
      width / height,
      0.1,
      fit.far,
    );
    camera.position.copy(fit.position);
    camera.lookAt(fit.look.x, fit.look.y, fit.look.z);
    camera.updateMatrixWorld();
    const head = new THREE.Object3D();
    head.position.set(0, 1.8, 0);
    for (const point of [head.position, new THREE.Vector3(0, 0, 0)]) {
      const projected = point.clone().project(camera);
      assert.ok(Math.abs(projected.x) < 0.7 && Math.abs(projected.y) < 0.7);
    }
    const badge = {
      style: {},
      dataset: { timing: 'true' },
      offsetWidth: 88,
      offsetHeight: 111,
    };
    const host = { clientWidth: width, clientHeight: height };
    placeActionCues({ current: [badge] }, [head], camera, host, true);
    assert.equal(badge.style.visibility, 'visible');
    const x = parseInt(badge.style.left),
      y = parseInt(badge.style.top);
    assert.ok(
      x >= 8 && x + 88 <= width - 8 && y >= 10 && y + 111 <= height - 10,
    );
    const hp = head.position.clone().project(camera),
      headY = ((1 - hp.y) * height) / 2;
    assert.ok(y + 111 < headY - 20, 'clock is above, not on the face');
    const overview = barracksOverview(width / height);
    assert.ok(
      camera.position.distanceTo(new THREE.Vector3().copy(fit.look)) <
        new THREE.Vector3()
          .copy(overview.position)
          .distanceTo(new THREE.Vector3().copy(overview.look)) /
          2,
    );
    placeActionCues({ current: [badge] }, [head], camera, host, false);
    assert.equal(badge.style.visibility, 'hidden');
  });

void test('face camera follows speaking Nikita, but never hides an active local timing cue', async () => {
  const { screenFaceActor } = await import('../lib/game/screen/camera.ts');
  const s = freshGame(3);
  assert.equal(screenFaceActor(s, 2), 0, 'opening speaker is visible');
  s.frameStage = 'lock';
  assert.equal(
    screenFaceActor(s, 2),
    2,
    'Roma keeps his own lock clock in view',
  );
  s.phase = 'level';
  s.levelCheck.mode = 'celebrate';
  s.messageSpeaker = 1;
  assert.equal(screenFaceActor(s, 0), 1);
  s.messageSpeaker = 0;
  assert.equal(
    screenFaceActor(s, 1),
    0,
    'Nikita is visible during his final reply',
  );
  s.elapsed = s.messageUntil + 1;
  assert.equal(screenFaceActor(s, 1), 1, 'camera returns to the local actor');
});
