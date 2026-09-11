import test from 'node:test';
import assert from 'node:assert/strict';
import { freshClean, cleanTick, canStand } from '../lib/game/clean/engine.ts';

function cleanupWithFootprint(start, target) {
  const s = freshClean(1);
  s.phase = 'clean';
  s.actorCount = 2;
  s.timer = 160;
  s.x = [607.4928622977809, start.x, 755];
  s.y = [661.6050622977828, start.y, 505];
  s.dirt[1] = 0.3747;
  s.spin = 1;
  s.valve = 1;
  s.machineClean = 1;
  s.pantsLoaded = true;
  s.spots = [
    {
      id: 1,
      ...target,
      weight: 0.1,
      size: 6,
      progress: 0,
      kind: 'footprint',
      foam: false,
      rotation: 0,
      createdAt: 0,
    },
  ];
  return s;
}

function finishWithoutHumanInput(s, dt) {
  for (let elapsed = 0; elapsed < 2 && s.phase !== 'result'; elapsed += dt) {
    const before = { x: s.x[1], y: s.y[1] };
    cleanTick(s, dt, new Set());
    assert.ok(
      Math.hypot(s.x[1] - before.x, s.y[1] - before.y) <= 151 * dt + 1e-7,
      'final waypoint is reached by ordinary bounded movement, not a teleport',
    );
    assert.ok(canStand(s.x[1], s.y[1]), 'helper remains outside furniture');
  }
  assert.equal(
    s.spots[0].progress,
    1,
    'helper cleans the arbitrary-position footprint',
  );
  assert.equal(
    s.phase,
    'result',
    'last footprint never strands solo completion',
  );
}

test('solo helper reaches the final 2.9 units of the exact browser-reported route', () => {
  for (const dt of [0.025, 1 / 60, 0.01]) {
    const s = cleanupWithFootprint(
      { x: 882.9126469713698, y: 500.0000245531383 },
      { x: 834.0421609316672, y: 495.1684011672984 },
    );
    s.navigation[1] = { goal: '83,50,49/30,33', path: [] };
    assert.ok(Math.hypot(s.x[1] - s.spots[0].x, s.y[1] - s.spots[0].y) > 49);
    finishWithoutHumanInput(s, dt);
  }
});

test('sub-three-unit final legs reach cleanup radius around fractional traces in every direction', () => {
  for (let i = 0; i < 24; i++) {
    const angle = (i * Math.PI) / 12,
      dx = Math.cos(angle),
      dy = Math.sin(angle);
    // The nearest walkable grid point is (880, 500), within the interaction
    // radius, but the actor starts outside it and less than 3 units away.
    const start = { x: 880 + dx * 2.85, y: 500 + dy * 2.85 };
    const target = { x: 880 - dx * 47.15, y: 500 - dy * 47.15 };
    finishWithoutHumanInput(cleanupWithFootprint(start, target), 0.025);
  }
});
