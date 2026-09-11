import assert from 'node:assert/strict';
import {
  freshGame,
  tick,
  springWindow,
  throwTargetPower,
} from '../lib/game/screen/engine.ts';
const dirs = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
const s = freshGame(1);
const phases = [];
const signKey = (value, positive, negative, eps = 0.02) =>
  value > eps ? positive : value < -eps ? negative : null;
function keysFor(s) {
  const keys = new Set();
  const add = (k) => {
    if (k) keys.add(k);
  };
  const w = s.workers[0];
  if (s.phase === 'frame') {
    if (s.frameStage === 'align') {
      add(signKey(-s.frameFit, 'KeyD', 'KeyA', 0.035));
      add(signKey(-s.frameTwist, 'KeyW', 'KeyS', 0.035));
      if (
        Math.abs(s.frameFit) < 0.05 &&
        Math.abs(s.frameTwist) < 0.05 &&
        s.cooldown === 0 &&
        !s.simulation.previousActions[0]
      )
        add('KeyE');
    } else if (
      Math.abs(s.cursor - 0.5) < 0.08 &&
      s.cooldown === 0 &&
      !s.simulation.previousActions[0]
    )
      add('KeyE');
  } else if (s.phase === 'rods') {
    const side = s.rods.findIndex((v) => v < 1);
    if (w.targetSide !== side || Math.abs(w.route - side) > 0.025)
      add(dirs[side]);
    else if (!s.rodJam[side]) {
      add('KeyE');
      add(
        signKey(s.rodTarget[side] - s.rodAlignment[side], 'KeyD', 'KeyA', 0.03),
      );
    }
  } else if (s.phase === 'tension') {
    const t = s.tool;
    // After AI has fixed the opposite spring, rotate the pair together.
    if (
      t.owner === 1 &&
      t.needsPass &&
      t.status === 'held' &&
      w.targetSide !== s.recommendedSide
    )
      add(dirs[s.recommendedSide]);
    if (t.status === 'ground') {
      if (
        w.targetSide !== t.groundSide ||
        Math.abs(w.route - t.groundSide) > 0.025
      )
        add(dirs[t.groundSide]);
      else if (!s.simulation.previousActions[0]) add('KeyE');
    } else if (t.status === 'flight' && t.target === 0) add('KeyE');
    else if (
      t.owner === 0 &&
      (t.status === 'held' || t.status === 'charging')
    ) {
      if (t.needsPass) {
        if (t.charge < throwTargetPower(s) || t.status === 'held') add('KeyQ');
      } else if (s.spring.active) {
        const [a, b] = springWindow(s);
        if (s.spring.power < (a + b) / 2) add('KeyE');
      } else if (s.cooldown === 0) {
        const side = s.clips.findIndex((v) => v === Math.min(...s.clips));
        if (s.clips[w.side] > Math.min(...s.clips) || s.clips[w.side] === 4) {
          if (w.targetSide !== side || Math.abs(w.route - side) > 0.025)
            add(dirs[side]);
        } else if (
          Math.abs(w.route - w.targetSide) < 0.025 &&
          !s.simulation.previousActions[0]
        )
          add('KeyE');
      }
    }
  } else if (s.phase === 'drill') {
    if (s.drillMode === 'position') {
      const target = s.holes.length === 0 ? -4.4 : 4.4;
      add(signKey(target - s.chairX, 'KeyD', 'KeyA', 0.04));
      if (
        Math.abs(s.chairX - target) < 0.08 &&
        !s.simulation.previousActions[0]
      )
        add('KeyE');
    } else if (s.drillMode === 'drill') {
      add(signKey(5.9 - s.aim, 'KeyW', 'KeyS', 0.01));
      if (
        s.drillHeat < 0.73 &&
        (!s.simulation.previousActions[0] ? s.drillHeat < 0.25 : true)
      )
        add('KeyE');
    }
  } else if (s.phase === 'lift') {
    add(
      signKey(
        s.holes[0] - s.liftLeft - s.liftVelocity[0] * 0.22,
        'KeyW',
        'KeyS',
        0.025,
      ),
    );
    add(signKey(-s.liftX - s.liftXVelocity * 0.2, 'KeyD', 'KeyA', 0.015));
    add('KeyE');
  } else if (s.phase === 'level') {
    add(signKey(-s.angle, 'KeyD', 'KeyA', 0.005));
    if (s.levelStable >= 1 && !s.simulation.previousActions[0]) add('KeyE');
  }
  return keys;
}
for (let n = 0; n < 60 * 900 && s.phase !== 'result'; n++) {
  if (phases.at(-1) !== s.phase) {
    phases.push(s.phase);
    console.log('PHASE', s.phase, Math.round(s.elapsed), s.score);
  }
  const keys = keysFor(s);
  tick(s, 1 / 60, keys);
  if (n % 600 === 0 && s.phase === 'tension')
    console.log(
      'TENSION',
      s.clips,
      s.tool.owner,
      s.tool.status,
      s.tool.needsPass,
      s.workers.map((w) => w.targetSide),
      s.spring,
    );
}
assert.equal(s.phase, 'result');
assert.equal(s.tool.catches, 15);
assert.equal(s.tool.misses, 0);
assert.equal(s.penalties, 0);
