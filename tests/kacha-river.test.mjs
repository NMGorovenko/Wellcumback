import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createKachaRiver } from '../components/game/city/kacha-river.ts';
import {
  KACHA_POINTS,
  KACHA_HALF_WIDTH,
  KACHA_BANK_WIDTH,
  KACHA_LENGTH,
  KACHA_CHANNEL_OUTLINE,
  KACHA_BANK_END_ALONG,
  KACHA_TERRAIN_HOLES,
  sampleKachaAlong,
  sampleKacha,
  inKachaWater,
  kachaParcelClear,
  kachaRoadCrossings,
  kachaBankRails,
} from '../lib/game/city/kacha.ts';
import {
  riverBankZ,
  onCityIsland,
  cityRoads,
  cityBuildings,
} from '../lib/game/city/layout.ts';

void test('terrain holes stop with the built banks while the open mouth removes water alone', () => {
  const contains = (point, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i],
        b = polygon[j];
      if (
        a.z > point.z !== b.z > point.z &&
        point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x
      )
        inside = !inside;
    }
    return inside;
  };
  const holeAt = (p) => KACHA_TERRAIN_HOLES.some((hole) => contains(p, hole));
  const bank = sampleKachaAlong(KACHA_BANK_END_ALONG - 2),
    mouth = sampleKachaAlong(KACHA_LENGTH - 5);
  assert.equal(
    holeAt({ x: bank.x + bank.nx * 8, z: bank.z + bank.nz * 8 }),
    true,
  );
  assert.equal(holeAt(mouth), true);
  for (const side of [-1, 1]) {
    assert.equal(
      holeAt({
        x: mouth.x + mouth.nx * 8 * side,
        z: mouth.z + mouth.nz * 8 * side,
      }),
      false,
    );
  }
  assert.ok(KACHA_LENGTH - KACHA_BANK_END_ALONG >= 16);
  assert.ok(KACHA_LENGTH - KACHA_BANK_END_ALONG < 28);
});

void test('Kacha descends continuously along a narrow channel into the Yenisei west of Tatyshev', () => {
  assert.ok(KACHA_HALF_WIDTH * 2 >= 8 && KACHA_HALF_WIDTH * 2 <= 20);
  let previous = Infinity;
  for (let at = 0; at <= KACHA_LENGTH; at += 5) {
    const p = sampleKachaAlong(at);
    assert.ok(
      (p.waterHeight <= previous && previous - p.waterHeight < 0.02) ||
        !Number.isFinite(previous),
    );
    assert.ok(inKachaWater(p.x, p.z));
    assert.ok(
      Math.abs(sampleKacha(p.x, p.z).waterHeight - p.waterHeight) < 0.0001,
    );
    assert.ok(p.bedHeight < p.waterHeight && p.bankHeight > p.waterHeight + 2);
    previous = p.waterHeight;
  }
  const mouth = KACHA_POINTS.at(-1);
  assert.ok(mouth.z > riverBankZ(mouth.x, -1));
  assert.ok(mouth.z < riverBankZ(mouth.x, 1));
  assert.equal(onCityIsland(mouth.x, mouth.z), false);
  assert.ok(KACHA_CHANNEL_OUTLINE.length > 20);
});

void test('the entire promenade corridor is reserved even when all five parcel samples miss the water', () => {
  const parcel = { x: -400, z: -340, w: 240, d: 20 };
  for (const [dx, dz] of [
    [0, 0],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ])
    assert.equal(
      inKachaWater(
        parcel.x + (dx * parcel.w) / 2,
        parcel.z + (dz * parcel.d) / 2,
      ),
      false,
    );
  assert.equal(kachaParcelClear(parcel.x, parcel.z, parcel.w, parcel.d), false);
  assert.equal(kachaParcelClear(parcel.x, -600, parcel.w, parcel.d), true);
  for (const b of cityBuildings)
    assert.ok(kachaParcelClear(b.x, b.z, b.w, b.d), b.kind ?? b.district);
});

void test('finite road crossings are deduplicated at bends and bank rail gaps clear complete road widths', () => {
  const road = {
    id: 'test-crossing',
    from: { x: 80, z: -330 },
    to: { x: 80, z: -210 },
    width: 14,
  };
  const crossings = kachaRoadCrossings([road]);
  assert.equal(crossings.length, 1);
  assert.ok(Math.abs(crossings[0].z + 274) < 0.001);
  assert.ok(crossings[0].halfLength > KACHA_HALF_WIDTH + KACHA_BANK_WIDTH);
  assert.equal(
    kachaRoadCrossings([
      { ...road, from: { x: 80, z: -240 }, to: { x: 80, z: -210 } },
    ]).length,
    0,
  );
  assert.ok(kachaBankRails([]).length > kachaBankRails([road]).length);
  for (const rail of kachaBankRails([road]))
    for (const p of [rail.from, rail.to])
      if (p.z >= road.from.z && p.z <= road.to.z)
        assert.ok(Math.abs(p.x - 80) > road.width / 2 + 7);
});

void test('Kacha water faces upward and road under-slabs stay below the existing asphalt in a small spatial mesh budget', () => {
  const road = {
    id: 'test-crossing',
    from: { x: 80, z: -330 },
    to: { x: 80, z: -210 },
    width: 14,
  };
  const deck = kachaRoadCrossings([road])[0].deckHeight;
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  try {
    createKachaRiver(kit, root, { roads: [road], roadHeight: () => deck });
    root.updateMatrixWorld(true);
    let meshes = 0,
      triangles = 0;
    root.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      triangles += o.geometry.attributes.position.count / 3;
      const bounds = new THREE.Box3().setFromObject(o);
      assert.ok(
        bounds.max.x - bounds.min.x < 700 && bounds.max.z - bounds.min.z < 700,
      );
      if (o.name !== 'kacha:water') return;
      for (let i = 0; i < o.geometry.attributes.normal.count; i++)
        assert.ok(o.geometry.attributes.normal.getY(i) > 0.99);
    });
    assert.ok(meshes <= 16, `${meshes} spatial meshes`);
    assert.ok(triangles < 20000, `${triangles} triangles`);
    assert.ok(kit.materials.size <= 2);
    const hit = new THREE.Raycaster(
      new THREE.Vector3(80, 20, -274),
      new THREE.Vector3(0, -1, 0),
    ).intersectObject(root, true)[0];
    assert.equal(hit.object.name, 'kacha:embankment');
    assert.ok(
      Math.abs(hit.point.y - (deck - 0.1)) < 0.001,
      'the slab never z-fights with the normal road surface',
    );
    assert.ok(kachaRoadCrossings(cityRoads).length >= 3);
  } finally {
    kit.dispose();
  }
});
