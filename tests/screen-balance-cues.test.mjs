import test from 'node:test';
import assert from 'node:assert/strict';
import { tick } from '../lib/game/screen/engine.ts';
import { createScreenEpisode } from '../lib/game/screen/episodes.ts';
import {
  chairBalanceCue,
  screenPrompts,
  screenPromptInput,
} from '../lib/game/screen/prompts.ts';
const DT = 1 / 60;
const keyboard = { assignments: [] };
function working(chairs = 2, balance = 0.78) {
  const s = createScreenEpisode(2, 'drill');
  Object.assign(s, {
    chairs,
    balance,
    climb: 1,
    drillMode: 'drill',
    drillGear: 'ready',
    phaseTime: 0.8,
    cooldown: 0,
  });
  return s;
}
function advance(s, seconds, keys) {
  for (let n = 0; n < Math.round(seconds / DT); n++)
    tick(s, DT, new Set(typeof keys === 'function' ? keys(s) : keys));
}

void test('Nikita cue names the exact correcting key, and correct feedback requires the real brace input', () => {
  for (const [balance, direction, key, label] of [
    [0.65, 'left', 'KeyA', 'A'],
    [-0.65, 'right', 'KeyD', 'D'],
  ]) {
    const s = working(2, balance);
    advance(s, DT, ['KeyE', key]);
    const [nikita, yarik] = screenPrompts(s),
      cue = nikita.prompts.find((p) => p.control === 'horizontal');
    assert.equal(nikita.worker, 0);
    assert.equal(nikita.player, 0);
    assert.equal(yarik.worker, 1);
    assert.equal(yarik.player, 1);
    assert.equal(cue.direction, direction);
    assert.equal(cue.satisfied, true);
    assert.deepEqual(screenPromptInput(keyboard, 0, cue, s.heldKeys), {
      label,
      held: true,
    });
    assert.equal(
      screenPromptInput(
        { assignments: [{ player: 0, brand: 'xbox' }] },
        0,
        cue,
        s.heldKeys,
      ).label,
      direction === 'left' ? 'стик ←' : 'стик →',
    );
    advance(s, DT, [key]);
    assert.equal(chairBalanceCue(s).held, false);
    assert.equal(chairBalanceCue(s).correcting, false);
    assert.equal(screenPrompts(s)[0].prompts[0].emphasis, 'danger');
    advance(s, DT, ['KeyE', 'KeyA', 'KeyD']);
    assert.equal(
      chairBalanceCue(s).correcting,
      false,
      'opposite directions cancel',
    );
  }
});

void test('correct E+A/D rescues either dangerous lean, while Yarik arrow keys cannot brace for Nikita', () => {
  for (const chairs of [1, 2])
    for (const balance of [-0.78, 0.78]) {
      const s = working(chairs, balance),
        correction = balance > 0 ? 'KeyA' : 'KeyD';
      for (let n = 0; n < 72 && Math.abs(s.balance) > 0.14; n++)
        tick(s, DT, new Set(['KeyE', correction]));
      assert.equal(s.falls, 0);
      assert.ok(
        Math.abs(s.balance) <= 0.14,
        `${chairs} chairs did not recover: ${s.balance}`,
      );
      assert.equal(chairBalanceCue(s).direction, null);
      const idle = working(chairs, balance),
        wrongPlayer = working(chairs, balance);
      advance(idle, 0.35, ['KeyE']);
      advance(wrongPlayer, 0.35, [
        'KeyE',
        balance > 0 ? 'ArrowLeft' : 'ArrowRight',
      ]);
      assert.equal(
        wrongPlayer.balance,
        idle.balance,
        'arrows belong to Yarik, not the assistant',
      );
    }
});

void test('initial climb gives reading time; two chairs retain an earlier fall when the cue is ignored', () => {
  for (const chairs of [1, 2])
    for (let seed = 0; seed < 32; seed++) {
      const s = createScreenEpisode(2, 'drill');
      s.chairs = chairs;
      s.phaseTime = seed * 0.1;
      let cueAt = null;
      for (let n = 0; n < 420; n++) {
        tick(s, DT, new Set(['KeyE', 'Enter']));
        if (n < 96)
          assert.ok(
            Math.abs(s.balance) < 0.24,
            `immediate wobble: ${chairs}/${seed}`,
          );
        if (Math.abs(s.balance) > 0.14 && cueAt === null) cueAt = n * DT;
        if (s.falls) {
          assert.ok(
            cueAt !== null && n * DT - cueAt >= 2,
            'warning must precede fall by a readable interval',
          );
          break;
        }
      }
    }
  const fallTimes = [1, 2].map((chairs) => {
    const s = working(chairs, 0.55);
    for (let n = 0; n < 600; n++) {
      tick(s, DT, new Set(['KeyE']));
      if (s.falls) return n * DT;
    }
    return Infinity;
  });
  assert.ok(
    fallTimes.every(Number.isFinite),
    'holding E alone must not auto-win',
  );
  assert.ok(fallTimes[1] < fallTimes[0], 'a second chair remains harder');
});
