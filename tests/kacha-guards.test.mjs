import test from 'node:test';
import assert from 'node:assert/strict';
import { cityRoads } from '../lib/game/city/layout.ts';
import { cityRoadHeight } from '../lib/game/city/surface.ts';
import {
  sampleKacha,
  kachaBankRails,
  kachaBridgeRails,
} from '../lib/game/city/kacha.ts';
import {
  CITY_KACHA_CROSSINGS,
  cityKachaRailBlocked,
  onKachaStreetDeck,
} from '../lib/game/city/kacha-decks.ts';

void test('permanent bank guards block at promenade height and do not block a separate level', () => {
  const rails = kachaBankRails(cityRoads);
  assert.ok(rails.length > 20);
  for (const rail of rails) {
    const x = (rail.from.x + rail.to.x) / 2,
      z = (rail.from.z + rail.to.z) / 2;
    const y = (rail.fromHeight + rail.toHeight) / 2;
    assert.equal(cityKachaRailBlocked(x, z, y, 0.85, cityRoadHeight), true);
    assert.equal(
      cityKachaRailBlocked(x, z, y + 10, 0.85, cityRoadHeight),
      false,
    );
  }
});

void test('bridge guards use the injected deck height rather than the channel or bank height', () => {
  const rails = kachaBridgeRails(cityRoads).filter((rail) => {
    const x = (rail.from.x + rail.to.x) / 2,
      z = (rail.from.z + rail.to.z) / 2;
    return sampleKacha(x, z).distance < 4;
  });
  assert.ok(rails.length > 0);
  for (const rail of rails) {
    const x = (rail.from.x + rail.to.x) / 2,
      z = (rail.from.z + rail.to.z) / 2;
    assert.equal(
      cityKachaRailBlocked(x, z, 100, 0.85, () => 100),
      true,
    );
    assert.equal(
      cityKachaRailBlocked(x, z, 10, 0.85, () => 100),
      false,
    );
  }
});

void test('street lanes stay clear through bridge junctions and deck footprints have finite width', () => {
  for (const crossing of CITY_KACHA_CROSSINGS) {
    const road = crossing.road;
    assert.equal(onKachaStreetDeck(road, crossing.x, crossing.z), true);
    assert.equal(
      onKachaStreetDeck(
        road,
        crossing.x + crossing.nx * (road.width + 10),
        crossing.z + crossing.nz * (road.width + 10),
      ),
      false,
    );
    const length = Math.hypot(road.to.x - road.from.x, road.to.z - road.from.z);
    const start = Math.max(-crossing.halfLength - 3, -crossing.roadT * length);
    const end = Math.min(
      crossing.halfLength + 3,
      (1 - crossing.roadT) * length,
    );
    for (let at = start; at <= end; at += 0.5) {
      for (const side of [-1, 0, 1]) {
        const offset = side * (road.width / 2 - 1.5);
        const x = crossing.x + crossing.nz * at + crossing.nx * offset;
        const z = crossing.z - crossing.nx * at + crossing.nz * offset;
        assert.equal(
          cityKachaRailBlocked(
            x,
            z,
            cityRoadHeight(road, x, z),
            0.85,
            cityRoadHeight,
          ),
          false,
          `${road.id}: along ${at}, lateral ${offset}`,
        );
      }
    }
  }
});
