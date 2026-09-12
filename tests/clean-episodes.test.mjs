import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanEpisodes,
  createCleanEpisode,
} from '../lib/game/clean/episodes.ts';
import {
  cleanCrew,
  cleanTick,
  cleanAction,
  canStand,
  planRoute,
  stations,
  obstacles,
  furniture,
  cleanBindings,
} from '../lib/game/clean/engine.ts';

function run(s, seconds, keys = []) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 0.025)
    cleanTick(s, Math.min(0.025, seconds - elapsed), new Set(keys));
}
function approach(s, actor, target) {
  const initialPhase = s.phase;
  const others = () =>
    s.phase === 'clean'
      ? Array.from({ length: s.actorCount }, (_, i) => i)
          .filter((i) => i !== actor)
          .map((i) => ({ x: s.x[i], y: s.y[i] }))
      : [];
  const routeToTarget = () =>
    planRoute({ x: s.x[actor], y: s.y[actor] }, target, 48, others());
  let route = routeToTarget(),
    cursor = 0;
  for (let step = 0; step < 12000; step++) {
    if (
      s.phase !== initialPhase ||
      Math.hypot(s.x[actor] - target.x, s.y[actor] - target.y) < 53
    )
      return;
    if (step > 0 && step % 100 === 0) {
      route = routeToTarget();
      cursor = 0;
    }
    const waypoint = route[cursor];
    assert.ok(waypoint, `checkpoint route to ${target.x},${target.y}`);
    if (Math.hypot(s.x[actor] - waypoint.x, s.y[actor] - waypoint.y) < 3) {
      cursor++;
      continue;
    }
    const keys = [],
      dx = waypoint.x - s.x[actor],
      dy = waypoint.y - s.y[actor];
    if (Math.abs(dx) > 1.2) keys.push(cleanBindings[actor][dx > 0 ? 1 : 0]);
    if (Math.abs(dy) > 1.2) keys.push(cleanBindings[actor][dy > 0 ? 3 : 2]);
    if (s.rhythm.active && s.rhythm.clock >= s.rhythm.period - 0.04)
      keys.push(s.rhythm.expected);
    cleanTick(s, 0.01, new Set(keys));
    assert.ok(canStand(s.x[actor], s.y[actor]));
  }
  assert.fail('checkpoint movement stalled');
}

for (const players of [1, 2, 3])
  for (const episode of cleanEpisodes)
    void test(`${episode.id}, ${players} players: practice state has valid actors, live prerequisites and reachable work`, () => {
      const s = createCleanEpisode(players, episode.id);
      assert.equal(s.phase, episode.id);
      assert.equal(s.practice, true);
      assert.equal(s.score, 0);
      assert.equal(s.paused, false);
      assert.equal(s.players, players);
      assert.equal(s.actorCount, episode.id === 'clean' ? players : 1);
      for (let actor = 0; actor < s.actorCount; actor++)
        assert.ok(canStand(s.x[actor], s.y[actor]), `actor ${actor}`);
      assert.ok(
        s.npcs.every((n) => canStand(n.x, n.y)),
        'NPCs start outside partition collision margins',
      );
      const from = { x: s.x[0], y: s.y[0] };
      for (const target of [...stations, ...s.spots])
        assert.ok(
          Math.hypot(from.x - target.x, from.y - target.y) < 53 ||
            planRoute(from, target, 52).length > 0,
          'work has a reachable interaction position',
        );
      assert.ok(
        s.spots.every(
          (p) =>
            ![...obstacles, ...furniture].some(
              (o) =>
                p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h,
            ),
        ),
        'all trace centers are on visible floor',
      );
      if (['duty', 'find'].includes(s.phase)) {
        assert.equal(s.pants, 'worn');
        assert.equal(s.soiled, false);
        assert.equal(s.spots.length, 0);
        assert.equal(s.rhythm.active, s.phase === 'find');
      } else {
        assert.ok(s.accidentSeverity > 0);
        assert.ok(s.spots.length > 0);
        assert.equal(s.simulation.incidentAtDesk, true);
        assert.equal(s.rhythm.active, false);
      }
      if (['accident', 'toilet'].includes(s.phase)) {
        assert.equal(s.soiled, true);
        assert.equal(s.pants, 'soiled');
        assert.equal(s.relief, 0);
        assert.equal(s.spillActive, true);
      }
      if (s.phase === 'shower') {
        assert.equal(s.relief, 1);
        assert.equal(s.shower, 0);
        assert.equal(s.pants, 'soiled');
        assert.equal(s.spillActive, false);
      }
      if (['laundry', 'spin', 'response', 'clean'].includes(s.phase)) {
        assert.equal(s.relief, 1);
        assert.equal(s.shower, 1);
        assert.equal(s.washed, true);
        assert.equal(s.soiled, false);
        assert.equal(s.pants, s.phase === 'laundry' ? 'bagged' : 'loaded');
      }
      if (['spin', 'response', 'clean'].includes(s.phase)) {
        assert.equal(s.pantsLoaded, true);
        assert.equal(s.laundryProgress, 1);
        assert.equal(s.machineClean, 0);
        assert.ok(s.spin > 0 && s.spin < 1);
        assert.equal(s.valve, 0);
      }
      if (s.phase === 'clean') {
        assert.equal(s.responseStage, 'ready');
        assert.ok(s.npcs.slice(1).every((n) => n.suited));
        assert.deepEqual(
          cleanCrew.slice(0, s.actorCount).map((p) => p.id),
          ['roma', 'nikita', 'yaroslav'].slice(0, players),
        );
      }
    });

void test('every non-cleanup checkpoint proceeds through its next normal chapter without stage edits', () => {
  for (const ep of cleanEpisodes.filter((ep) => ep.id !== 'clean')) {
    const s = createCleanEpisode(2, ep.id);
    if (ep.id === 'duty') run(s, 4.1);
    if (ep.id === 'find') {
      approach(s, 0, stations[0]);
      cleanAction(s);
    }
    if (ep.id === 'accident') run(s, 25);
    if (ep.id === 'toilet') {
      approach(s, 0, stations[1]);
      run(s, 3.2, ['KeyE']);
    }
    if (ep.id === 'shower') {
      approach(s, 0, stations[2]);
      run(s, 3.7, ['KeyE']);
    }
    if (ep.id === 'laundry') {
      approach(s, 0, stations[3]);
      run(s, 2.7, ['KeyE']);
    }
    if (ep.id === 'spin') run(s, 4.1);
    if (ep.id === 'response') run(s, 35);
    const next = {
      duty: 'find',
      find: 'accident',
      accident: 'toilet',
      toilet: 'shower',
      shower: 'laundry',
      laundry: 'spin',
      spin: 'response',
      response: 'clean',
    }[ep.id];
    assert.equal(s.phase, next, ep.id);
    assert.equal(s.practice, true);
    assert.equal(s.score, 0);
  }
});

for (const players of [1, 2, 3])
  void test(`cleanup checkpoint completes with ${players} players while retaining practice flag`, () => {
    const s = createCleanEpisode(players, 'clean');
    for (
      let iterations = 0;
      s.phase === 'clean' && iterations < 200;
      iterations++
    ) {
      const actor = iterations % players,
        action = cleanBindings[actor][4];
      if (s.dirt[actor] >= 0.98 - 1e-8) {
        approach(s, actor, stations[5]);
        run(s, 1.6, [action]);
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
      const target = s.spots.find((p) => p.progress < 1);
      if (!target) break;
      approach(s, actor, target);
      run(s, 3.5, [action]);
    }
    assert.equal(s.phase, 'result');
    assert.equal(s.score, 0);
    assert.equal(s.practice, true);
    assert.equal(s.actorCount, players);
    assert.ok(s.spots.every((p) => p.progress === 1));
    assert.equal(s.machineClean, 1);
    assert.equal(s.valve, 1);
    if (players === 1) assert.equal(s.teamwork, 0, 'no hidden solo helper');
  });

void test('checkpoint creation is deterministic, isolated and rejects unknown IDs', () => {
  const a = createCleanEpisode(3, 'clean'),
    b = createCleanEpisode(3, 'clean');
  assert.deepEqual(a, b);
  a.spots[0].progress = 1;
  assert.equal(b.spots[0].progress, 0);
  assert.throws(() => createCleanEpisode(1, 'result'), RangeError);
});

void test('practice earns no rhythm or direct cleanAction points', () => {
  const s = createCleanEpisode(1, 'find');
  while (s.rhythm.clock < s.rhythm.period - 0.04) run(s, 0.025);
  run(s, 0.025, ['KeyQ']);
  assert.equal(s.rhythm.hits, 1);
  assert.equal(s.score, 0);
  approach(s, 0, stations[0]);
  if (s.phase === 'find') cleanAction(s);
  assert.equal(s.phase, 'accident');
  assert.equal(s.score, 0);
});
