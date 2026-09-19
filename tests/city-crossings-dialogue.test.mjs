import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cityCrossings,
  crossingContains,
  roadDashClear,
} from '../lib/game/city/crossings.ts';
import { cityRoads, ROUNDABOUT, BRIDGES } from '../lib/game/city/layout.ts';
import { freshCity, tickCity } from '../lib/game/city/engine.ts';
import {
  advanceCityConversation,
  BRIDGE_QUIP,
  RARE_QUIP,
} from '../lib/game/city/dialogue.ts';

void test('zebras cross actual road widths, clear the ring and suppress the centre dashes', () => {
  assert.ok(cityCrossings.length >= 14);
  for (const c of cityCrossings) {
    const road = cityRoads.find((r) => r.id === c.roadId);
    assert.equal(c.width, road.width);
    for (const along of [-c.depth / 2, c.depth / 2])
      for (const across of [-c.width / 2, c.width / 2]) {
        const x = c.x + along * c.tx - across * c.tz;
        const z = c.z + along * c.tz + across * c.tx;
        const distance = Math.hypot(
          road.to.x - road.from.x,
          road.to.z - road.from.z,
        );
        const travel = (x - road.from.x) * c.tx + (z - road.from.z) * c.tz;
        assert.ok(
          travel >= 0 && travel <= distance,
          'paint is on the road segment',
        );
        assert.ok(
          Math.hypot(x - ROUNDABOUT.x, z - ROUNDABOUT.z) >
            ROUNDABOUT.outerRadius,
        );
        assert.ok(crossingContains(c, x, z, 1e-8));
      }
    assert.equal(roadDashClear(c.roadId, c.x, c.z), false);
    assert.equal(crossingContains(c, c.x + c.tx * 2, c.z + c.tz * 2), false);
  }
});

void test('driving onto each bridge triggers Yarik once per entry, with hysteresis and saved cooldown', () => {
  for (const bridge of BRIDGES)
    for (const direction of [-1, 1]) {
      const points =
        direction === 1 ? bridge.points : [...bridge.points].reverse();
      const [a, b] = points;
      const length = Math.hypot(b.x - a.x, b.z - a.z),
        fx = (b.x - a.x) / length,
        fz = (b.z - a.z) / length;
      const outside = bridge.w / 2 + 2;
      const s = freshCity();
      Object.assign(s, {
        x: a.x - fx * outside,
        z: a.z - fz * outside,
        heading: Math.atan2(fx, -fz),
        vx: fx * 8,
        vz: fz * 8,
        elapsed: 20,
      });
      for (let i = 0; i < 40; i++) tickCity(s, 1 / 60, new Set(['KeyW']));
      assert.equal(s.radio, BRIDGE_QUIP);
      const deadline = s.radioUntil,
        restored = JSON.parse(JSON.stringify(s));
      for (let i = 0; i < 60; i++) {
        tickCity(s, 1 / 60, new Set());
        tickCity(restored, 1 / 60, new Set());
      }
      assert.deepEqual(s, restored);
      assert.equal(
        s.radioUntil,
        deadline,
        'being on the bridge cannot continually repeat the comic',
      );
      s.x = a.x - fx * (bridge.w / 2 + 1);
      s.z = a.z - fz * (bridge.w / 2 + 1);
      advanceCityConversation(s);
      s.x += fx * 2;
      s.z += fz * 2;
      advanceCityConversation(s);
      assert.equal(s.radioUntil, deadline, 'boundary jitter is not a new trip');
    }
});

void test('rare city joke needs motion, leaves other dialogue readable and is deterministic after reconnect', () => {
  const s = freshCity();
  s.elapsed = 80;
  s.speed = 0;
  advanceCityConversation(s);
  assert.notEqual(s.radio, RARE_QUIP);
  s.speed = 12;
  s.radioUntil = 85;
  const initial = structuredClone(s.conversation);
  advanceCityConversation(s);
  assert.deepEqual(s.conversation, initial);
  s.elapsed = 86;
  const restored = JSON.parse(JSON.stringify(s));
  let said = false;
  for (let i = 0; i < 50; i++) {
    s.elapsed = Math.max(s.elapsed, s.conversation.nextQuip + 0.01);
    restored.elapsed = s.elapsed;
    advanceCityConversation(s);
    advanceCityConversation(restored);
    assert.deepEqual(s, restored);
    assert.ok(s.conversation.nextQuip >= s.elapsed + 60);
    if (s.radio === RARE_QUIP && s.radioUntil > s.elapsed) {
      said = true;
      break;
    }
  }
  assert.ok(said);
  s.paused = true;
  const before = structuredClone(s);
  tickCity(s, 0.1, new Set(['KeyW']));
  assert.deepEqual(s, before);
});
