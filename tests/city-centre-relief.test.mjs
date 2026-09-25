import test from 'node:test';
import assert from 'node:assert/strict';
import { cityBuildings, cityRoads } from '../lib/game/city/layout.ts';
import {
  cityGroundHeight,
  cityRoadHeight,
  citySurfacePose,
} from '../lib/game/city/surface.ts';

const landmark = (kind) => cityBuildings.find((b) => b.kind === kind);

void test('the central ensemble keeps its mapped sides and two distinct river terraces', () => {
  const opera = landmark('theatre'),
    museum = landmark('museum'),
    clock = landmark('city-clock'),
    fountain = landmark('theatre-fountain'),
    apollo = landmark('apollo');
  const approach = cityRoads.find((r) => r.id === 'veynbauma:0');
  assert.ok(opera.x < fountain.x && fountain.x < approach.from.x);
  assert.ok(museum.x > approach.from.x && clock.x > approach.from.x);
  assert.ok(clock.z < museum.z);
  const lower = cityGroundHeight(museum.x, museum.z);
  for (const upper of [opera, fountain, apollo, clock]) {
    const difference = cityGroundHeight(upper.x, upper.z) - lower;
    assert.ok(
      difference > 5.5 && difference < 8,
      `${upper.kind}: ${difference}`,
    );
  }
  assert.ok(
    cityGroundHeight(0, -900) > cityGroundHeight(opera.x, opera.z) + 50,
  );
  assert.ok(cityGroundHeight(600, -600) > cityGroundHeight(600, -166) + 25);
});

void test('the Belinskogo turn descends continuously onto the low Komsomoll apron', () => {
  const roads = cityRoads.filter((r) =>
    r.id.startsWith('komsomoll-forecourt:'),
  );
  let lowest = Infinity;
  for (const road of roads) {
    const dx = road.to.x - road.from.x,
      dz = road.to.z - road.from.z,
      length = Math.hypot(dx, dz),
      heading = Math.atan2(dx, -dz),
      steps = Math.ceil(length / 0.5);
    for (let i = 0; i <= steps; i++) {
      const x = road.from.x + (dx * i) / steps,
        z = road.from.z + (dz * i) / steps,
        height = cityRoadHeight(road, x, z);
      // A sub-millimetre road/parcel blend is harmless. The cumulative minimum
      // still catches the former two-metre climb out of the entry hollow.
      assert.ok(height <= lowest + 0.001, `unexpected climb at ${x},${z}`);
      lowest = Math.min(lowest, height);
      for (const lateral of [-road.width / 2 + 1.5, 0, road.width / 2 - 1.5]) {
        const px = x - (dz * lateral) / length,
          pz = z + (dx * lateral) / length,
          y = cityRoadHeight(road, px, pz),
          next = cityRoadHeight(
            road,
            px + dx / length / 2,
            pz + dz / length / 2,
          );
        assert.ok(
          Math.abs(next - y) / 0.5 < 0.12,
          'both lanes have a continuous grade',
        );
        const pose = citySurfacePose(px, pz, heading, y, `road:${road.id}`);
        assert.ok(
          Math.abs(pose.elevation - y) < 0.12,
          'physics follows the access',
        );
      }
    }
  }
  const entry = roads[0],
    apron = roads.at(-1),
    top = cityRoadHeight(entry, entry.from.x, entry.from.z),
    bottom = cityRoadHeight(apron, apron.to.x, apron.to.z);
  assert.ok(top - bottom > 1 && bottom < 10);
  assert.ok(
    Math.abs(cityRoadHeight(apron, apron.from.x, apron.from.z) - bottom) <
      0.001,
  );
});

void test('local centre grading leaves the three Yenisei bridge landings unchanged', () => {
  for (const [id, expected] of [
    ['bridge-nikolaevsky:0', 27.768761590730406],
    ['bridge-kommunalny:0', 15.095077869008305],
    ['bridge-oktyabrsky:0', 9.735335738253088],
  ]) {
    const road = cityRoads.find((r) => r.id === id);
    assert.ok(
      Math.abs(cityRoadHeight(road, road.from.x, road.from.z) - expected) <
        1e-8,
    );
  }
});
