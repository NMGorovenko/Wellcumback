import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshClean,
  cleanTick,
  cleanAction,
  planRoute,
  canStand,
  stations,
  getDrops,
  getFootprints,
  dutyReprimand,
} from '../lib/game/clean/engine.ts';
import { crewSpawn, doorways } from '../lib/game/clean/layout.ts';
const bindings = [
  ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyE'],
  ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'],
  ['KeyJ', 'KeyL', 'KeyI', 'KeyK', 'KeyO'],
];
function run(s, seconds, keys = []) {
  for (let t = 0; t < seconds - 1e-8; t += 0.025)
    cleanTick(s, Math.min(0.025, seconds - t), new Set(keys));
}
function pulse(s, key) {
  cleanTick(s, 0.025, new Set([key]));
  cleanTick(s, 0.025, new Set());
}
function withRhythm(s, keys) {
  if (s.rhythm.active && s.rhythm.clock >= s.rhythm.period - 0.04)
    keys.push(s.rhythm.expected);
  return keys;
}
function approach(s, actor, target, radius = 53, rhythm = false) {
  const startPhase = s.phase;
  const others = () =>
    s.phase === 'clean'
      ? Array.from({ length: s.actorCount }, (_, i) => i)
          .filter((i) => i !== actor)
          .map((i) => ({ x: s.x[i], y: s.y[i] }))
      : [];
  let route = planRoute(
    { x: s.x[actor], y: s.y[actor] },
    target,
    radius - 5,
    others(),
  );
  assert.ok(
    route.length ||
      Math.hypot(s.x[actor] - target.x, s.y[actor] - target.y) < radius,
    `route exists to ${target.x},${target.y}; actor=${actor} positions=${JSON.stringify(s.x.map((x, i) => [x, s.y[i]]))}`,
  );
  let cursor = 0;
  for (let step = 0; step < 20000; step++) {
    if (s.phase !== startPhase) return;
    if (Math.hypot(s.x[actor] - target.x, s.y[actor] - target.y) < radius)
      return;
    if (step > 0 && step % 100 === 0) {
      route = planRoute(
        { x: s.x[actor], y: s.y[actor] },
        target,
        radius - 5,
        others(),
      );
      cursor = 0;
    }
    const waypoint = route[cursor];
    assert.ok(
      waypoint,
      `path exhausted before ${target.x},${target.y}: ${s.x[actor]},${s.y[actor]}`,
    );
    if (Math.hypot(s.x[actor] - waypoint.x, s.y[actor] - waypoint.y) < 3) {
      cursor++;
      continue;
    }
    const keys = [],
      dx = waypoint.x - s.x[actor],
      dy = waypoint.y - s.y[actor];
    if (Math.abs(dx) > 1.2) keys.push(bindings[actor][dx > 0 ? 1 : 0]);
    if (Math.abs(dy) > 1.2) keys.push(bindings[actor][dy > 0 ? 3 : 2]);
    cleanTick(s, 0.01, new Set(rhythm ? withRhythm(s, keys) : keys));
    assert.ok(
      canStand(s.x[actor], s.y[actor]),
      'walking never enters furniture',
    );
  }
  assert.fail(
    `navigation stalled ${s.x[actor]},${s.y[actor]} → ${target.x},${target.y}`,
  );
}
function throughLaundry(players = 1, rhythm = true) {
  const s = freshClean(players);
  cleanAction(s);
  run(s, 4.1);
  assert.equal(s.phase, 'find');
  approach(s, 0, stations[0], 53, rhythm);
  if (s.phase === 'find') pulse(s, 'KeyE');
  assert.equal(s.phase, 'accident');
  run(s, 12);
  assert.equal(s.phase, 'toilet');
  approach(s, 0, stations[1]);
  run(s, 3.2, ['KeyE']);
  assert.equal(s.phase, 'shower');
  approach(s, 0, stations[2]);
  run(s, 3.7, ['KeyE']);
  assert.equal(s.phase, 'laundry');
  approach(s, 0, stations[3]);
  run(s, 2.7, ['KeyE']);
  assert.equal(s.phase, 'spin');
  return s;
}

void test('Q/E restraint accepts timed alternating presses, rejects mashing and does not repeat held keys', () => {
  const s = freshClean();
  cleanAction(s);
  run(s, 4.1);
  while (s.rhythm.clock < s.rhythm.period - 0.04) run(s, 0.025);
  pulse(s, 'KeyQ');
  assert.equal(s.rhythm.hits, 1);
  assert.equal(s.rhythm.expected, 'KeyE');
  const hits = s.rhythm.hits;
  pulse(s, 'KeyQ');
  assert.equal(s.rhythm.hits, hits);
  assert.ok(s.rhythm.misses > 0);
  const misses = s.rhythm.misses;
  run(s, 0.15, ['KeyQ']);
  assert.ok(s.rhythm.misses <= misses + 1, 'holding is not a repeat tap');
});

void test('perfect restraint cannot defeat the rising baseline indefinitely; duty NPC intercepts timeout', () => {
  const s = freshClean();
  cleanAction(s);
  for (let t = 0; t < 90 && ['duty', 'find'].includes(s.phase); t += 0.025)
    cleanTick(s, 0.025, new Set(withRhythm(s, [])));
  assert.equal(s.phase, 'accident');
  assert.ok(s.rhythm.hits > 30);
  assert.equal(s.simulation.incidentAtDesk, false);
  const from = { x: s.npcs[0].x, y: s.npcs[0].y };
  run(s, 20);
  assert.equal(s.phase, 'toilet');
  assert.ok(Math.hypot(s.npcs[0].x - from.x, s.npcs[0].y - from.y) > 300);
  assert.equal(s.npcs[0].line, dutyReprimand);
});

void test('asking at the desk triggers the actual accident; traces follow movement and shower stops new footprints', () => {
  const s = throughLaundry();
  assert.equal(s.simulation.incidentAtDesk, true);
  assert.ok(getDrops(s).some((p) => p.kind === 'spill'));
  assert.ok(getDrops(s).some((p) => p.kind === 'trail'));
  assert.ok(getFootprints(s).length > 12);
  assert.ok(
    getFootprints(s).some(
      (p) => Math.hypot(p.x - stations[1].x, p.y - stations[1].y) < 70,
    ),
    'footprints reach the toilet interaction area',
  );
  assert.ok(
    getFootprints(s).some(
      (p) => Math.hypot(p.x - stations[0].x, p.y - stations[0].y) < 100,
    ),
    'footprints begin near the duty desk',
  );
  assert.equal(s.soiled, false);
  assert.equal(s.spillActive, false);
  assert.equal(s.relief, 1);
  assert.equal(s.shower, 1);
  assert.equal(s.pants, 'loaded');
  assert.equal(s.pantsLoaded, true);
  const footprints = getFootprints(s).length;
  run(s, 1, ['KeyA']);
  assert.equal(getFootprints(s).length, footprints);
});

void test('successful rhythm leaves less contamination for the identical route', () => {
  const careful = throughLaundry(1, true),
    careless = throughLaundry(1, false);
  assert.ok(careful.rhythm.hits > careless.rhythm.hits);
  assert.ok(careful.accidentSeverity < careless.accidentSeverity);
  assert.ok(
    careful.spots
      .filter((p) => p.kind === 'spill')
      .reduce((a, p) => a + p.weight, 0) <
      careless.spots
        .filter((p) => p.kind === 'spill')
        .reduce((a, p) => a + p.weight, 0),
  );
});

void test('witnesses physically approach the spinning washer, react, collect suits and hand over to crew', () => {
  const s = throughLaundry(3);
  const start = s.npcs.slice(1).map((p) => ({ x: p.x, y: p.y }));
  run(s, 1);
  assert.ok(s.machine > 0 && s.spin > 0);
  assert.ok(
    s.npcs
      .slice(1)
      .some((p, i) => Math.hypot(p.x - start[i].x, p.y - start[i].y) > 20),
  );
  let reacted = false;
  for (let t = 0; t < 45 && s.phase !== 'clean'; t += 0.025) {
    cleanTick(s, 0.025, new Set());
    if (s.responseStage === 'react') reacted = true;
  }
  assert.equal(s.phase, 'clean');
  assert.equal(s.actorCount, 3);
  assert.ok(reacted);
  assert.ok(s.npcs.slice(1).every((p) => p.suited));
  assert.ok(s.spots.some((p) => p.foam));
  assert.equal(s.machineClean, 0);
});

for (const players of [1, 2, 3])
  void test(`complete v3 with ${players} players using real movement/actions, all traces, machine and rinsing`, () => {
    const s = throughLaundry(players);
    run(s, 35);
    assert.equal(s.phase, 'clean');
    let actor = 0,
      rinses = 0,
      iterations = 0;
    while (s.phase === 'clean' && iterations++ < 200) {
      actor = (iterations - 1) % players;
      const action = bindings[actor][4];
      if (s.dirt[actor] >= 0.98 - 1e-8) {
        approach(s, actor, stations[5]);
        run(s, 1.6, [action]);
        rinses++;
        assert.ok(
          s.dirt[actor] === 0 || s.phase === 'result',
          `rinse failed in ${s.phase}: player ${s.x[actor]},${s.y[actor]} helper ${s.x[1]},${s.y[1]} dirt ${s.dirt[actor]}`,
        );
      }
      if (s.valve < 1) {
        approach(s, actor, stations[4]);
        run(s, 2.1, [action]);
        continue;
      }
      if (s.spin < 1 || s.machineClean < 1) {
        approach(s, actor, stations[3]);
        run(s, 5, [action]);
        continue;
      }
      const spot = s.spots.find((p) => p.progress < 1);
      if (!spot) break;
      approach(s, actor, spot, 52);
      run(s, 3.5, [action]);
    }
    assert.equal(
      s.phase,
      'result',
      `unfinished traces ${s.spots.filter((p) => p.progress < 1).length}, machine ${s.machineClean}`,
    );
    assert.ok(s.spots.every((p) => p.progress === 1));
    assert.equal(s.machineClean, 1);
    assert.equal(s.valve, 1);
    assert.equal(s.spin, 1);
    assert.ok(rinses > 0);
    assert.ok(s.score > 1000);
    assert.ok(s.elapsed > 60);
    const score = s.score;
    run(s, 3, ['KeyE']);
    assert.equal(s.score, score);
  });

void test('pause freezes pressure, NPC paths, trails, water and interaction holds', () => {
  const s = throughLaundry();
  s.paused = true;
  const before = JSON.stringify(s);
  run(s, 4, ['KeyE', 'KeyQ', 'KeyD']);
  cleanAction(s);
  assert.equal(JSON.stringify(s), before);
});

void test('all public station goals are reachable from the duty post without entering any obstacle', () => {
  for (const target of stations) {
    const route = planRoute(stations[7], target, 52);
    assert.ok(route.length || target === stations[7], target.id);
    assert.ok(route.every((p) => canStand(p.x, p.y)));
  }
});

void test('holding a station action keeps the actor anchored during toilet/shower/load animation', () => {
  const s = freshClean();
  cleanAction(s);
  run(s, 4.1);
  approach(s, 0, stations[0], 53, true);
  if (s.phase === 'find') pulse(s, 'KeyE');
  run(s, 12);
  approach(s, 0, stations[1]);
  const start = { x: s.x[0], y: s.y[0] };
  run(s, 1, ['KeyE', 'KeyD']);
  assert.ok(s.relief > 0);
  assert.equal(s.x[0], start.x);
  assert.equal(s.y[0], start.y);
  run(s, 0.2, ['KeyD']);
  assert.ok(s.x[0] > start.x, 'releasing action restores walking');
});

void test('after the accident Q temporarily stops the stream, reduces real traces, then exhausts', () => {
  const base = freshClean();
  cleanAction(base);
  run(base, 4.1);
  approach(base, 0, stations[0], 53, true);
  if (base.phase === 'find') pulse(base, 'KeyE');
  run(base, 12);
  assert.equal(base.phase, 'toilet');
  const clenched = structuredClone(base),
    loose = structuredClone(base);
  run(clenched, 2, ['KeyQ', 'KeyA']);
  run(loose, 2, ['KeyA']);
  assert.equal(clenched.spillActive, false);
  assert.equal(clenched.containment.suppressed, true);
  assert.ok(
    clenched.spots.reduce((sum, p) => sum + p.weight, 0) <
      loose.spots.reduce((sum, p) => sum + p.weight, 0),
  );
  run(clenched, 5, ['KeyQ']);
  assert.equal(clenched.containment.stamina, 0);
  assert.equal(clenched.spillActive, true);
  run(clenched, 2);
  assert.ok(
    clenched.containment.stamina > 0,
    'rest gradually restores a short clench',
  );
});

void test('three colliding cleaners separate without entering walls or furniture', () => {
  const s = freshClean(3);
  s.phase = 'clean';
  s.actorCount = 3;
  s.x = Array(3).fill(crewSpawn.x);
  s.y = Array(3).fill(crewSpawn.y);
  run(s, 0.2);
  for (let i = 0; i < 3; i++) {
    assert.ok(canStand(s.x[i], s.y[i]));
    for (let j = i + 1; j < 3; j++)
      assert.ok(Math.hypot(s.x[i] - s.x[j], s.y[i] - s.y[j]) >= 31.8);
  }
});

void test('cleaners walking head-on through the toilet doorway yield sideways and can pass', () => {
  const s = freshClean(2);
  s.phase = 'clean';
  s.actorCount = 2;
  s.x = [
    (doorways[0].left + doorways[0].right) / 2,
    (doorways[0].left + doorways[0].right) / 2,
    crewSpawn.x,
  ];
  s.y = [doorways[0].y - 45, doorways[0].y + 45, crewSpawn.y];
  run(s, 2, ['KeyS', 'ArrowUp']);
  assert.ok(
    s.y[0] > s.y[1],
    `must pass each other: ${s.x[0]},${s.y[0]} versus ${s.x[1]},${s.y[1]}`,
  );
  assert.ok(canStand(s.x[0], s.y[0]) && canStand(s.x[1], s.y[1]));
  assert.ok(Math.hypot(s.x[0] - s.x[1], s.y[0] - s.y[1]) >= 31.8);
});
