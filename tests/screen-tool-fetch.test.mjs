import test from 'node:test';
import assert from 'node:assert/strict';
import { freshGame, tick, setPaused } from '../lib/game/screen/engine.ts';
import { drillStaging } from '../lib/game/screen/staging.ts';
import {
  DRILL_SHELF,
  drillPointIsClear,
  drillDistance,
  drillPath,
  bracePoint,
  nearChairs,
} from '../lib/game/screen/drill-space.ts';
import { screenPrompts, chairBalanceCue } from '../lib/game/screen/prompts.ts';
import { drillControls, equipDriller } from './screen-drill-controller.mjs';
const DT = 1 / 60;
const start = (players) => {
  const s = freshGame(players);
  s.phase = 'drill';
  return s;
};
function run(s, until, keys = drillControls, limit = 120, observe = () => {}) {
  for (let n = 0; n < limit * 60 && !until(s); n++) {
    const before = { ...s.drillAssistant };
    tick(s, DT, keys(s));
    observe(s, before);
  }
  assert.ok(
    until(s),
    `stalled ${s.drillMode}/${s.drillGear} at ${s.elapsed}: ${JSON.stringify(s.drillAssistant)}`,
  );
}
const frames = (s, seconds, keys = () => new Set()) => {
  for (let n = 0; n < seconds * 60; n++) tick(s, DT, keys(s));
};
void test('both real tools stay on shelf until Yarik has completed the first climb', () => {
  const s = start(2),
    positions = structuredClone(s.drillTools);
  frames(s, 0.5, () => new Set(['KeyE']));
  assert.equal(s.toolsRemembered, false);
  assert.deepEqual(s.drillTools, positions);
  run(s, (s) => s.drillMode === 'climb');
  frames(s, 0.8, () => new Set(['KeyE', 'Enter']));
  assert.ok(s.climb > 0 && s.climb < 1);
  assert.equal(s.toolsRemembered, false);
  run(s, (s) => s.drillMode === 'handoff');
  assert.equal(s.toolsRemembered, true);
  assert.equal(s.messageSpeaker, 1);
  assert.match(s.message, /на полке/);
  assert.deepEqual(s.drillTools, positions);
});
void test('solo visibly walks the long collision-safe route, picks both tools, and supplies each separately', () => {
  const s = start(1);
  let walked = 0,
    picked = 0,
    received = 0;
  const last = { drill: 'shelf', vacuum: 'shelf' };
  run(
    s,
    (s) => s.drillMode === 'drill',
    drillControls,
    50,
    (state, before) => {
      const delta = drillDistance(before, state.drillAssistant);
      walked += delta;
      assert.ok(delta <= 1.65 * DT + 0.00001, 'no actor teleport');
      assert.ok(
        drillPointIsClear(state, state.drillAssistant),
        `body clips ${JSON.stringify(state.drillAssistant)}`,
      );
      for (const kind of ['drill', 'vacuum']) {
        const tool = state.drillTools[kind];
        if (tool.location !== last[kind]) {
          if (tool.location === 'assistant') {
            picked++;
            assert.ok(
              drillDistance(state.drillAssistant, DRILL_SHELF.approach) < 0.3,
            );
          }
          if (tool.location === 'climber') {
            received++;
            assert.equal(last[kind], 'assistant');
            assert.ok(nearChairs(state));
          }
          last[kind] = tool.location;
        }
      }
    },
  );
  assert.ok(
    walked > 20,
    'outbound and return route must actually traverse room',
  );
  assert.equal(picked, 2);
  assert.equal(received, 2);
  assert.equal(s.drillGear, 'ready');
  assert.equal(s.falls, 0);
});
void test('manual E away from the chair never remotely braces or hands over a tool', () => {
  const s = start(2);
  run(s, (s) => s.drillMode === 'handoff');
  s.drillAssistant.x = DRILL_SHELF.approach.x;
  s.drillAssistant.z = DRILL_SHELF.approach.z;
  frames(s, 1.2, () => new Set(['KeyE', 'Enter']));
  assert.equal(s.braceHeld, false);
  assert.equal(s.drillGear, 'none');
  assert.equal(s.handoffProgress, 0);
  assert.equal(s.drillTools.drill.location, 'assistant');
  assert.equal(s.drillTools.vacuum.location, 'assistant');
  const before = { ...s.drillAssistant };
  frames(s, 0.2, () => new Set(['KeyA']));
  assert.ok(
    drillDistance(before, s.drillAssistant) > 0.25,
    'release E restores movement',
  );
});
void test('Yarik corrects either lean while Nikita is away, using his own horizontal controls', () => {
  for (const players of [1, 2])
    for (const sign of [-1, 1]) {
      const s = start(players);
      s.drillMode = 'handoff';
      s.climb = 1;
      s.toolsRemembered = true;
      s.balance = 0.65 * sign;
      s.drillAssistant.x = 3;
      s.drillAssistant.z = -0.5;
      const key =
        players === 1
          ? sign > 0
            ? 'KeyA'
            : 'KeyD'
          : sign > 0
            ? 'ArrowLeft'
            : 'ArrowRight';
      frames(s, 0.4, () => new Set([key]));
      assert.equal(s.braceHeld, false);
      assert.equal(s.falls, 0);
      assert.ok(Math.abs(s.balance) < 0.2);
      assert.ok(
        screenPrompts(s)[1].prompts.some((p) => p.control === 'horizontal'),
      );
      assert.equal(chairBalanceCue(s).held, false);
    }
});
void test('falling between deliveries drops only the received drill; the vacuum stays with Nikita', () => {
  const s = start(2);
  run(s, (s) => s.drillGear === 'drill');
  assert.equal(s.drillTools.vacuum.location, 'assistant');
  s.balance = 1.4;
  tick(s, DT, new Set());
  assert.equal(s.drillMode, 'fallen');
  assert.equal(s.drillTools.drill.location, 'falling');
  assert.equal(s.drillTools.vacuum.location, 'assistant');
  assert.equal(s.drillGear, 'none');
  const initial = { ...s.drillTools.drill.position };
  frames(s, 0.35);
  assert.notDeepEqual(s.drillTools.drill.position, initial);
  assert.equal(s.drillTools.drill.location, 'falling');
  frames(s, 1.1);
  assert.equal(s.drillTools.drill.location, 'ground');
  const landing = { ...s.drillTools.drill.position };
  frames(s, 3);
  assert.deepEqual(
    s.drillTools.drill.position,
    landing,
    'floor location persists without pickup',
  );
  assert.ok(drillPointIsClear(s, landing, 0.255, false));
  assert.equal(s.drillTools.vacuum.location, 'assistant');
  run(s, (s) => s.phase === 'lift', drillControls, 120);
  assert.equal(s.holes.length, 2);
  assert.equal(s.falls, 1);
});
void test('solo recovers real dropped tools and finishes after a fall at either wall', () => {
  for (const hole of [0, 1]) {
    const s = start(1);
    run(
      s,
      (s) => s.drillMode === 'drill' && s.holes.length === hole,
      drillControls,
      80,
    );
    s.balance = 1.4;
    tick(s, DT, new Set());
    assert.equal(s.drillTools.drill.location, 'falling');
    assert.equal(s.drillTools.vacuum.location, 'falling');
    let groundSeen = false;
    run(
      s,
      (s) => s.phase === 'lift',
      drillControls,
      160,
      (state) => {
        groundSeen ||= Object.values(state.drillTools).some(
          (t) => t.location === 'ground',
        );
      },
    );
    assert.ok(groundSeen);
    assert.equal(s.falls, 1);
    assert.equal(s.holes.length, 2);
  }
});
void test('pause freezes pickup, navigation, motor work and falling positions', () => {
  const s = start(1);
  run(s, (s) => s.drillAssistant.activity === 'pickup');
  setPaused(s, true);
  const snapshot = JSON.stringify(s);
  frames(s, 4, () => new Set(['KeyE']));
  assert.equal(JSON.stringify(s), snapshot);
  setPaused(s, false);
  run(s, (s) => s.drillMode === 'drill');
  s.balance = 1.4;
  tick(s, DT, new Set());
  setPaused(s, true);
  const fallen = JSON.stringify(s);
  frames(s, 3);
  assert.equal(JSON.stringify(s), fallen);
});
void test('arbitrary manual movement cannot cross cloth or furniture, and all three-player delivery routes exist', () => {
  const s = start(3);
  s.drillMode = 'handoff';
  s.climb = 1;
  s.toolsRemembered = true;
  assert.ok(drillPath(s, s.drillAssistant, DRILL_SHELF.approach).length);
  for (const point of [
    DRILL_SHELF.approach,
    { x: 2.8, z: 1.15 },
    { x: -2.83, z: 1.15 },
    bracePoint(s),
  ]) {
    assert.ok(drillPointIsClear(s, point));
    s.drillAssistant.x = point.x;
    s.drillAssistant.z = point.z;
    for (const keys of [
      ['KeyW'],
      ['KeyA'],
      ['KeyS'],
      ['KeyD'],
      ['KeyD', 'KeyS'],
    ]) {
      for (let n = 0; n < 70; n++) {
        tick(s, DT, new Set(keys));
        assert.ok(drillPointIsClear(s, s.drillAssistant));
      }
    }
  }
});
void test('physical ownership, not a gear label, gates the motors and does not duplicate tools', () => {
  const s = start(1);
  s.drillMode = 'drill';
  s.climb = 1;
  s.drillGear = 'ready';
  tick(s, DT, new Set(['KeyE', 'ShiftLeft']));
  assert.equal(s.drillRunning, false);
  assert.equal(s.drillGear, 'none');
  equipDriller(s);
  tick(s, DT, new Set(['KeyE', 'ShiftLeft']));
  assert.equal(s.drillRunning, true);
  assert.deepEqual(Object.keys(s.drillTools), ['drill', 'vacuum']);
});
for (const players of [1, 2, 3])
  void test(`${players}-player complete drilling keeps bodies on valid floors and preserves carried tools between holes`, () => {
    const s = start(players);
    let retained = false;
    run(
      s,
      (s) => s.phase === 'lift',
      drillControls,
      100,
      (state) => {
        assert.ok(drillPointIsClear(state, state.drillAssistant, 0.255, false));
        const stage = drillStaging(state);
        assert.equal(stage.workers[0].x, state.drillAssistant.x);
        if (state.holes.length === 1 && state.drillMode === 'position') {
          retained = true;
          assert.equal(state.drillGear, 'ready');
        }
      },
    );
    assert.ok(retained);
    assert.equal(s.falls, 0);
    assert.equal(s.holes.length, 2);
  });
