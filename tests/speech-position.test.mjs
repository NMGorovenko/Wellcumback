import test from 'node:test';
import assert from 'node:assert/strict';
import { speechPlacement } from '../components/game/world/speech-position.ts';

const overlaps = (rect, head) => {
  const dx = head.x - Math.max(rect.x, Math.min(rect.x + rect.w, head.x));
  const dy = head.y - Math.max(rect.y, Math.min(rect.y + rect.h + 16, head.y));
  return dx * dx + dy * dy < head.radius * head.radius;
};

void test('a free bubble stays immediately above its speaker with an aligned tail', () => {
  const p = speechPlacement(500, 430, 292, 80, 1280, 720);
  assert.deepEqual(p, { x: 354, y: 320, tail: 138 });
  assert.equal(p.x + p.tail + 8, 500);
});

void test('handoff dialogue moves sideways clear of the elevated partner, keeping its tail on Nikita', () => {
  const yarik = { x: 720, y: 330, radius: 26 };
  const w = 292,
    h = 80,
    ax = 620,
    ay = 430;
  assert.ok(
    overlaps({ x: ax - w / 2, y: ay - h - 30, w, h }, yarik),
    'the previous centered bubble covers Yarik',
  );
  const p = speechPlacement(ax, ay, w, h, 1280, 720, [yarik]);
  assert.equal(overlaps({ ...p, w, h }, yarik), false);
  assert.equal(
    p.y,
    ay - h - 30,
    'a nearby sideways step avoids detaching the bubble vertically',
  );
  assert.equal(p.x + p.tail + 8, ax, 'tail still points at the actual speaker');
});

void test('portrait edges keep the bubble readable and the tail close to its speaker', () => {
  for (const ax of [20, 195, 370]) {
    const p = speechPlacement(ax, 440, 245, 90, 390, 690, [
      { x: 300, y: 300, radius: 26 },
    ]);
    assert.ok(p.x >= 10 && p.x + 245 <= 380);
    assert.ok(p.y >= 82 && p.y + 90 < 690);
    assert.ok(Math.abs(p.x + p.tail + 8 - ax) <= 26);
  }
});

void test('an impossibly dense group uses a bounded local fallback instead of sending dialogue away', () => {
  const p = speechPlacement(
    500,
    430,
    292,
    80,
    1280,
    720,
    [420, 460, 500, 540, 580].map((x) => ({ x, y: 350, radius: 35 })),
  );
  assert.ok(p.y >= 320 - 48 && p.y <= 320);
  assert.equal(p.x + p.tail + 8, 500);
});
