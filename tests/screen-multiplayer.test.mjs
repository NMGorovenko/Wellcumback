import { levelKeys } from './screen-level-controller.mjs';
import { drillControls } from './screen-drill-controller.mjs';
import assert from 'node:assert/strict';
import {
  freshGame,
  tick,
  springWindow,
  throwTargetPower,
  CONTROLS,
} from '../lib/game/screen/engine.ts';
const signKey = (v, pos, neg, eps = 0.02) =>
  v > eps ? pos : v < -eps ? neg : null;
const at = (w, side) =>
  w.targetSide === side && Math.abs(w.route - side) < 0.025;
function controller(s) {
  const keys = new Set();
  const add = (k) => {
    if (k) keys.add(k);
  };
  const move = (p, side) =>
    add(
      [CONTROLS[p].up, CONTROLS[p].right, CONTROLS[p].down, CONTROLS[p].left][
        side
      ],
    );
  const press = (p) => {
    if (!s.simulation.previousActions[p]) add(CONTROLS[p].action);
  };
  if (s.phase === 'frame') {
    add('Enter');
    if (s.players === 3) add('KeyO');
    if (s.frameStage === 'align') {
      add(signKey(-s.frameFit, 'KeyD', 'KeyA', 0.035));
      add(signKey(-s.frameTwist, 'KeyW', 'KeyS', 0.035));
      if (
        Math.abs(s.frameFit) < 0.05 &&
        Math.abs(s.frameTwist) < 0.05 &&
        s.cooldown === 0
      )
        press(0);
    } else if (Math.abs(s.cursor - 0.5) < 0.08 && s.cooldown === 0) press(0);
  } else if (s.phase === 'rods') {
    const target = s.rods.findIndex((v) => v < 1);
    if (!at(s.workers[0], target)) move(0, target);
    else if (!s.rodJam[target]) {
      add('KeyE');
      add(
        signKey(
          s.rodTarget[target] - s.rodAlignment[target],
          'KeyD',
          'KeyA',
          0.03,
        ),
      );
    }
    // Partner walks to the opposite side, braces and feeds their own sleeve.
    const across = (target + 2) % 4;
    if (!at(s.workers[1], across)) move(1, across);
    else if (!s.rodJam[across]) {
      add('Enter');
      add(
        signKey(
          s.rodTarget[across] - s.rodAlignment[across],
          'ArrowRight',
          'ArrowLeft',
          0.03,
        ),
      );
    }
  } else if (s.phase === 'tension') {
    const t = s.tool;
    let target = s.workers[0].targetSide;
    if (t.owner !== 0 && t.passSuggested && t.status === 'held')
      target = s.recommendedSide;
    if (!at(s.workers[0], target)) move(0, target);
    if (!at(s.workers[1], (target + 2) % 4)) move(1, (target + 2) % 4);
    if (s.players === 3 && !at(s.workers[2], (target + 1) % 4))
      move(2, (target + 1) % 4);
    if (t.status === 'flight') add(CONTROLS[t.target].action);
    if (t.status === 'ground') {
      const p = t.target;
      if (!at(s.workers[p], t.groundSide)) move(p, t.groundSide);
      else press(p);
    }
    if (
      (t.status === 'held' || t.status === 'charging') &&
      at(s.workers[0], target) &&
      at(s.workers[1], (target + 2) % 4)
    ) {
      const p = t.owner,
        c = CONTROLS[p];
      // This controller voluntarily passes to exercise cooperation; humans may keep working.
      if (t.passSuggested) {
        if (t.charge < throwTargetPower(s) || t.status === 'held') add('KeyQ');
      } else if (s.spring.active) {
        const [a, b] = springWindow(s);
        if (s.spring.power < (a + b) / 2) add(c.action);
      } else if (s.cooldown === 0) press(p);
    }
  } else if (s.phase === 'drill') {
    return drillControls(s);
  } else if (s.phase === 'lift') {
    add(
      signKey(
        s.holes[0] - s.liftLeft - s.liftVelocity[0] * 0.22,
        'KeyW',
        'KeyS',
        0.025,
      ),
    );
    add(
      signKey(
        s.holes[1] - s.liftRight - s.liftVelocity[1] * 0.22,
        'ArrowUp',
        'ArrowDown',
        0.025,
      ),
    );
    add(signKey(-s.liftX - s.liftXVelocity * 0.2, 'KeyD', 'KeyA', 0.015));
    add('KeyE');
    add('Enter');
    if (s.players === 3) add('KeyO');
  } else if (s.phase === 'level') {
    for (const key of levelKeys(s)) add(key);
  }
  return keys;
}
for (const players of [2, 3]) {
  const s = freshGame(players);
  let phase = '';
  for (let n = 0; n < 60 * 900 && s.phase !== 'result'; n++) {
    if (s.phase !== phase) {
      phase = s.phase;
      console.log(players, phase, Math.round(s.elapsed));
    }
    tick(s, 1 / 60, controller(s));
  }
  console.log(
    players,
    s.phase,
    s.elapsed,
    s.penalties,
    s.tool.catches,
    s.tool.misses,
    s.clips,
    s.workers.map((w) => w.targetSide),
    s.tool.owner,
    s.tool.status,
    s.message,
  );
  assert.equal(s.phase, 'result');
  assert.equal(s.tool.catches, 15);
  assert.equal(s.tool.misses, 0);
  assert.equal(s.penalties, 0);
  assert.equal(s.falls, 0);
  assert.equal(s.drillOverheats, 0);
  assert.equal(s.holes.length, 2);
  assert.ok(s.dustGenerated > 0);
  assert.ok(s.dustCaptured / s.dustGenerated > 0.98);
}
