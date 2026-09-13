import test from 'node:test';
import assert from 'node:assert/strict';
import { freshGame, tick, PHYSICAL_LAYOUT } from '../lib/game/screen/engine.ts';
import {
  createSpringFlight,
  advanceSpringFlights,
  springFlightPose,
  springReaction,
  MAX_SPRING_FLIGHTS,
} from '../lib/game/screen/spring-feedback.ts';
const advance = (s, seconds, keys = [], rate = 60) => {
  for (let i = 0; i < Math.round(seconds * rate); i++)
    tick(s, 1 / rate, new Set(keys));
};
function unevenPull(support = false) {
  const s = freshGame(2);
  s.phase = 'tension';
  s.clips = [1, 0, 1, 0];
  advance(s, 4);
  advance(s, 1.2, support ? ['KeyE', 'Enter'] : ['KeyE']);
  tick(s, 1 / 60, new Set(support ? ['Enter'] : []));
  return s;
}
void test('uneven pull launches the actual detached opposite coil; contact, comic and flinch happen later without extra penalties', () => {
  const s = unevenPull();
  const flight = s.springFlights[0];
  assert.deepEqual(s.clips, [0, 0, 1, 0]);
  assert.equal(flight.side, 0);
  assert.equal(flight.clip, 0);
  assert.ok(Math.abs(flight.from.x + 1.6125) < 1e-9);
  assert.ok(Math.abs(flight.from.z + 1.775) < 1e-9);
  assert.equal(flight.hit, null);
  assert.equal(s.events.at(-1).kind, 'pop');
  assert.doesNotMatch(s.speechText, /в глаз/);
  const score = s.score,
    penalties = s.penalties;
  advance(s, 0.1);
  assert.equal(
    flight.hit,
    null,
    'cannot bonk before travelling to the other person',
  );
  advance(s, 0.3);
  assert.equal(flight.hit.worker, 1, 'Yarik is physically in this flight path');
  assert.ok(flight.hit.at - flight.at > 0.2 && flight.hit.at - flight.at < 0.4);
  assert.ok(
    flight.hit.point.y > 1.5,
    'standing face contact is visibly above the floor',
  );
  const hit = s.events.findLast((e) => e.kind === 'spring-hit');
  assert.equal(hit.worker, 1);
  assert.ok(hit.at > flight.at);
  assert.equal(s.speechText, 'Ай, блять, в глаз!');
  assert.equal(s.messageSpeaker, 1);
  assert.ok(springReaction(s.springFlights, 1, s.elapsed) > 0.9);
  assert.equal(springReaction(s.springFlights, 0, s.elapsed), 0);
  assert.equal(s.penalties, penalties);
  assert.equal(s.score, score, 'face gag cannot change scoring or recovery');
  assert.equal(s.tool.status, 'held');
  assert.equal(s.tool.passSuggested, true);
});
void test('a crouching helper is contacted at the lowered face instead of empty standing head space', () => {
  const s = unevenPull(true);
  advance(s, 0.3, ['Enter']);
  const hit = s.springFlights[0].hit;
  assert.equal(hit.worker, 1);
  assert.ok(hit.point.y > 0.8 && hit.point.y < 1.3);
  assert.equal(
    s.workers[1].animation,
    'hold',
    'flinch never locks the helper controls',
  );
});
void test('a teammate who moves away avoids the spring; the launcher and absent third player cannot become arbitrary victims', () => {
  const flight = createSpringFlight(1, 0, 0, 0, 0, 0.636, PHYSICAL_LAYOUT);
  const actors = [
    { x: -4.25, z: -3.58, animation: 'idle' },
    { x: -4.25, z: -3.58, animation: 'idle' },
  ];
  const flights = [flight];
  advanceSpringFlights(flights, 0.1, 0.1, actors, PHYSICAL_LAYOUT);
  actors[1].x = 3;
  const hits = [];
  for (let i = 7; i <= 100; i++)
    hits.push(
      ...advanceSpringFlights(flights, i / 60, 1 / 60, actors, PHYSICAL_LAYOUT),
    );
  assert.equal(hits.length, 0);
  assert.equal(flight.hit, null, 'no homing toward somebody who left the path');
  assert.equal(springReaction(flights, 2, 1), 0);
  assert.ok(
    springFlightPose(flight, 1.5).position.y < 0.1,
    'miss ends on the floor',
  );
});
void test('all sides and coil indices have distinct fixed sources and outward launch directions', () => {
  for (let side = 0; side < 4; side++) {
    const origins = [];
    for (let clip = 0; clip < 4; clip++) {
      const flight = createSpringFlight(
        9,
        side,
        clip,
        0,
        3,
        0.7,
        PHYSICAL_LAYOUT,
      );
      const twin = createSpringFlight(
        9,
        side,
        clip,
        0,
        3,
        0.7,
        PHYSICAL_LAYOUT,
      );
      assert.deepEqual(flight, twin, 'no wall-clock/random state in launch');
      origins.push(flight.from);
      const direction =
        side === 0
          ? -flight.velocity.z
          : side === 1
            ? flight.velocity.x
            : side === 2
              ? flight.velocity.z
              : -flight.velocity.x;
      assert.ok(direction > 1);
    }
    assert.equal(new Set(origins.map((p) => JSON.stringify(p))).size, 4);
  }
});
void test('an empty opposite edge cannot emit a phantom installed spring', () => {
  const s = freshGame(2);
  s.phase = 'tension';
  s.clips = [0, 0, 1, 0];
  advance(s, 4);
  advance(s, 1.2, ['KeyE']);
  tick(s, 1 / 60, new Set());
  assert.deepEqual(s.clips, [0, 0, 1, 0]);
  assert.equal(
    s.springFlights[0].side,
    2,
    'the failed attachment flies when there was no opposite coil',
  );
  assert.equal(s.springFlights[0].clip, 1);
  assert.equal(s.penalties, 1);
});
void test('pause freezes flight; a JSON reconnect resumes the same delayed hit exactly once at 30/60/144Hz', () => {
  const seed = unevenPull();
  advance(seed, 0.1);
  seed.paused = true;
  const before = JSON.stringify(seed);
  tick(seed, 20, new Set());
  assert.equal(JSON.stringify(seed), before);
  const endings = [];
  for (const rate of [30, 60, 144]) {
    const s = JSON.parse(before);
    s.paused = false;
    advance(s, 1, [], rate);
    assert.equal(s.events.filter((e) => e.kind === 'spring-hit').length, 1);
    endings.push(s.springFlights[0].hit);
    const seen = s.messageSeq;
    const returned = JSON.parse(JSON.stringify(s));
    advance(returned, 0.3, [], rate);
    assert.equal(
      returned.messageSeq,
      seen,
      'reconnecting after contact cannot replay the comic',
    );
    assert.equal(
      returned.events.filter((e) => e.kind === 'spring-hit').length,
      1,
    );
  }
  assert.deepEqual(endings[0], endings[1]);
  assert.deepEqual(endings[1], endings[2]);
});
void test('flight feedback stays bounded, expires, settles on the floor and supports old snapshots/output reuse', () => {
  const s = freshGame(2);
  s.phase = 'tension';
  delete s.springFlights;
  tick(s, 1 / 60, new Set());
  assert.deepEqual(s.springFlights, []);
  assert.equal(springReaction(undefined, 1, 0), 0);
  const flights = Array.from({ length: 30 }, (_, i) =>
    createSpringFlight(i, 0, i % 4, 0, 0, 0.6, PHYSICAL_LAYOUT),
  );
  advanceSpringFlights(flights, 0.01, 0.01, [], PHYSICAL_LAYOUT);
  assert.equal(flights.length, MAX_SPRING_FLIGHTS);
  const f = flights[0],
    out = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      visible: false,
      opacity: 0,
    };
  assert.equal(springFlightPose(f, 1.5, out), out);
  const settled = structuredClone(out);
  springFlightPose(f, 1.8, out);
  assert.deepEqual(out.position, settled.position);
  assert.deepEqual(
    out.rotation,
    settled.rotation,
    'settled metal does not spin through the floor',
  );
  assert.ok(springFlightPose(f, 2.3).opacity < 1);
  assert.equal(springFlightPose(f, 2.5).visible, false);
  advanceSpringFlights(flights, 2.5, 0.01, [], PHYSICAL_LAYOUT);
  assert.equal(flights.length, 0);
});
