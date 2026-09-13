import test from 'node:test';
import assert from 'node:assert/strict';
import { freshClean, addTrace, cleanTick } from '../lib/game/clean/engine.ts';
import { washerLeaks } from '../lib/game/clean/layout.ts';
import { MAX_TRACES } from '../lib/game/clean/traces.ts';

const total = (s, field) => s.spots.reduce((sum, p) => sum + field(p), 0);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function filled() {
  const s = freshClean(3);
  for (let i = 0; i < MAX_TRACES; i++)
    addTrace(
      s,
      'footprint',
      { x: 100 + (i % 30) * 8, y: 100 + Math.floor(i / 30) * 8 },
      8,
      0.16,
    );
  s.spots.forEach((p, i) => {
    p.progress = (i % 3) / 2;
  });
  return s;
}
void test('long sessions keep new foam at its actual location and preserve dirt and cleaning work', () => {
  const s = filled(),
    initial = total(s, (p) => p.weight),
    cleaned = total(s, (p) => p.weight * p.progress);
  for (let i = 0; i < 30; i++) {
    const point = washerLeaks[i % washerLeaks.length];
    addTrace(s, 'foam', point, 24, 0.75);
    assert.equal(s.spots.length, MAX_TRACES);
    const newest = s.spots.at(-1);
    assert.equal(newest.kind, 'foam');
    assert.equal(newest.foam, true);
    assert.deepEqual({ x: newest.x, y: newest.y }, point);
    assert.equal(newest.progress, 0);
    close(
      total(s, (p) => p.weight),
      initial + (i + 1) * 0.75,
    );
    close(
      total(s, (p) => p.weight * p.progress),
      cleaned,
    );
  }
  const snapshot = JSON.stringify(s);
  assert.ok(Buffer.byteLength(snapshot) < 96 * 1024);
  assert.deepEqual(JSON.parse(snapshot).spots, s.spots);
});
void test('a real overloaded wash cycle still spawns slippery foam with a full trace pool', () => {
  const s = filled();
  Object.assign(s, {
    phase: 'spin',
    paused: false,
    pantsLoaded: true,
    balance: 1,
    machine: 0,
    spin: 0,
    valve: 0,
    leaks: 0,
    leakClock: 0,
  });
  for (let i = 0; i < 35 * 60; i++) cleanTick(s, 1 / 60, new Set());
  assert.equal(s.leaks, 6);
  assert.equal(s.spots.filter((p) => p.foam && p.kind === 'foam').length, 6);
  assert.equal(s.spots.length, MAX_TRACES);
});
