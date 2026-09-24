import test from 'node:test';
import assert from 'node:assert/strict';
import { cityBuildings, cityRoads } from '../lib/game/city/layout.ts';
import { cityCarBlocked } from '../lib/game/city/engine.ts';

function pointSegmentDistance(x, z, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)),
    );
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}

// Minimum distance between a complete building rectangle and a finite road
// centre segment. Subtracting half-width includes rounded junction/end caps;
// checking road centres or a few building corners alone misses edge intrusions.
function roadFootprintGap(building, road) {
  const c = Math.cos(building.angle ?? 0),
    s = Math.sin(building.angle ?? 0),
    local = (p) => ({
      x: (p.x - building.x) * c - (p.z - building.z) * s,
      z: (p.x - building.x) * s + (p.z - building.z) * c,
    }),
    a = local(road.from),
    b = local(road.to),
    w = building.w / 2,
    d = building.d / 2;
  let enter = 0,
    leave = 1;
  for (const [origin, delta, half] of [
    [a.x, b.x - a.x, w],
    [a.z, b.z - a.z, d],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(origin) > half) {
        enter = 2;
        break;
      }
    } else {
      const first = (-half - origin) / delta,
        last = (half - origin) / delta;
      enter = Math.max(enter, Math.min(first, last));
      leave = Math.min(leave, Math.max(first, last));
    }
  }
  if (enter <= leave) return -road.width / 2;
  let distance = Math.min(
    ...[a, b].map((p) =>
      Math.hypot(
        Math.max(0, Math.abs(p.x) - w),
        Math.max(0, Math.abs(p.z) - d),
      ),
    ),
  );
  for (const x of [-w, w])
    for (const z of [-d, d])
      distance = Math.min(distance, pointSegmentDistance(x, z, a, b));
  return distance - road.width / 2;
}

void test('central landmarks clear the complete road width and rounded intersection caps', () => {
  for (const kind of [
    'theatre',
    'museum',
    'city-clock',
    'theatre-fountain',
    'apollo',
    'fresco',
    'pushkin',
    'frank',
  ]) {
    const building = cityBuildings.find((b) => b.kind === kind);
    assert.ok(building, kind);
    for (const road of cityRoads) {
      const gap = roadFootprintGap(building, road);
      assert.ok(
        gap >= 1,
        `${kind} intersects ${road.id} or its car margin: gap ${gap.toFixed(3)}m`,
      );
    }
  }
});

void test('both outer lanes and junction approaches around Mira and Veynbauma admit the full coupe', (t) => {
  const prefixes = [
    'karl-marx',
    'veynbauma',
    'perensona',
    'svobodny-mira-9maya:7',
    'svobodny-mira-9maya:8',
    'svobodny-mira-9maya:9',
    'strelka:0',
  ];
  let samples = 0;
  for (const road of cityRoads.filter((r) =>
    prefixes.some((prefix) => r.id.startsWith(prefix)),
  )) {
    const dx = road.to.x - road.from.x,
      dz = road.to.z - road.from.z,
      length = Math.hypot(dx, dz),
      heading = Math.atan2(dx, -dz);
    for (let along = 3; along < length - 3; along += 2)
      for (const lateral of [
        -road.width / 2 + 2,
        -road.width / 4,
        0,
        road.width / 4,
        road.width / 2 - 2,
      ]) {
        const x = road.from.x + (dx * along) / length - (dz * lateral) / length,
          z = road.from.z + (dz * along) / length + (dx * lateral) / length;
        assert.equal(
          cityCarBlocked(x, z, heading),
          false,
          `${road.id} at ${x.toFixed(2)},${z.toFixed(2)} lateral ${lateral}`,
        );
        samples++;
      }
  }
  assert.ok(samples > 4000);
  t.diagnostic(`${samples} complete-car probes across five lateral positions`);
});
