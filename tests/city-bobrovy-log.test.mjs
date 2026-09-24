import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import {
  BOBROVY_TERRAIN_FOOTPRINTS,
  createBobrovyLog,
} from '../components/game/city/bobrovy-log.ts';
import {
  cityBuildings,
  CITY_BOBROVY_LOG,
  pointInPolygon,
} from '../lib/game/city/layout.ts';
import { drapedGeometry } from '../components/game/city/relief.ts';
import { cityGroundHeight } from '../lib/game/city/surface.ts';
import { cityCarBlocked } from '../lib/game/city/engine.ts';

function model() {
  const root = new THREE.Group();
  const kit = new RenderKit(new THREE.Scene());
  const landmark = createBobrovyLog(kit, root);
  root.updateMatrixWorld(true);
  return { kit, root, landmark };
}

void test('Bobrovy Log service buildings fit their ground-level collision parcels and leave the arrival open', () => {
  const { kit, root } = model();
  try {
    for (const name of ['oasis', 'mirage']) {
      const group = root.getObjectByName(`bobrovy-log:${name}`);
      const parcel = cityBuildings.find(
        (b) => b.kind === 'bobrovy-log' && b.x === group.position.x,
      );
      assert.ok(parcel, `${name} has a canonical parcel`);
      const bounds = new THREE.Box3().setFromObject(group);
      assert.ok(bounds.min.x >= parcel.x - parcel.w / 2 - 0.01);
      assert.ok(bounds.max.x <= parcel.x + parcel.w / 2 + 0.01);
      assert.ok(bounds.min.z >= parcel.z - parcel.d / 2 - 0.01);
      assert.ok(bounds.max.z <= parcel.z + parcel.d / 2 + 0.01);
      assert.ok(bounds.max.y <= group.position.y + parcel.h + 0.01);
      assert.ok(
        Math.abs(bounds.min.y - cityGroundHeight(parcel.x, parcel.z)) < 0.03,
      );
    }
    const { base } = CITY_BOBROVY_LOG;
    for (let z = base.z; z <= 1248; z += 2)
      assert.equal(
        cityCarBlocked(base.x, z, 0),
        false,
        `clear forecourt at ${z}`,
      );
    const front = root.getObjectByName('bobrovy-log:forecourt');
    const positions = front.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++)
      assert.ok(
        Math.abs(
          positions.getY(i) -
            cityGroundHeight(positions.getX(i), positions.getZ(i)) -
            0.08,
        ) < 0.003,
      );
  } finally {
    kit.dispose();
  }
});

void test('Oasis has a high sloping glass bay and a recessed entry between its low rounded wings', () => {
  const { kit, root } = model();
  try {
    const oasis = root.getObjectByName('bobrovy-log:oasis');
    const wedge = new THREE.Box3().setFromObject(
      root.getObjectByName('bobrovy-log:oasis-glass-wedge'),
    );
    const wing = new THREE.Box3().setFromObject(
      root.getObjectByName('bobrovy-log:oasis-round-wing'),
    );
    assert.ok(wedge.max.y > wing.max.y + 4);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(
        oasis.position.x + 0.5,
        oasis.position.y + 1.8,
        oasis.position.z - 30,
      ),
      new THREE.Vector3(0, 0, 1),
    );
    const hit = ray.intersectObject(oasis, true)[0];
    assert.equal(hit?.object.name, 'bobrovy-log:oasis-recessed-entry');
    assert.ok(
      hit.point.z > wedge.min.z + 3.5,
      'doors are behind the projecting glazed bay',
    );
  } finally {
    kit.dispose();
  }
});

void test('two complete lifts stay separate from Oasis and animate above the hillside within a bounded scene', () => {
  const { kit, root, landmark } = model();
  try {
    const oasis = root.getObjectByName('bobrovy-log:oasis');
    const k1 = root.getObjectByName('bobrovy-log:lift-1:lower-station');
    const k2 = root.getObjectByName('bobrovy-log:lift-2:lower-station');
    const mirage = root.getObjectByName('bobrovy-log:mirage');
    assert.ok(k1.position.x < oasis.position.x - 36);
    assert.ok(k2.position.x > oasis.position.x + 36);
    assert.ok(mirage.position.x > k2.position.x + 20);
    const chairs = root.getObjectByName('bobrovy-log:chairs');
    const forest = root.getObjectByName('bobrovy-log:forest');
    assert.ok(chairs instanceof THREE.InstancedMesh);
    assert.equal(chairs.count, 32);
    assert.ok(forest instanceof THREE.InstancedMesh && forest.count <= 340);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    for (let time = 0; time <= 160; time += 10) {
      landmark.update(time);
      for (let i = 0; i < chairs.count; i++) {
        chairs.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        assert.ok(
          position.y > cityGroundHeight(position.x, position.z) + 4,
          `chair ${i} clears ground at ${time}`,
        );
      }
    }
    assert.ok(root.getObjectByName('bobrovy-log:rodelbahn'));
    assert.equal(
      kit.textures.size,
      0,
      'no photographic textures or DOM-only labels required to construct the landmark',
    );
  } finally {
    kit.dispose();
  }
});

void test('lift animation survives first-frame clock skew, cycle boundaries and absent clock snapshots', () => {
  const { kit, root, landmark } = model();
  try {
    const chairs = root.getObjectByName('bobrovy-log:chairs');
    const initial = chairs.instanceMatrix.array.slice();
    for (const invalid of [undefined, NaN, Infinity, -Infinity]) {
      assert.doesNotThrow(() => landmark.update(invalid));
      assert.deepEqual(chairs.instanceMatrix.array, initial);
    }
    const matrix = new THREE.Matrix4();
    const point = new THREE.Vector3();
    // requestAnimationFrame reports the frame-start timestamp. It can be just
    // before performance.now() sampled when the ready effect starts its clock.
    const initializedAt = 1000.35,
      firstFrameAt = 1000;
    const firstElapsed = (firstFrameAt - initializedAt) / 1000;
    for (const time of [
      firstElapsed,
      -160.001,
      -160,
      -0.016,
      0,
      0.016,
      159.999,
      160,
      160.001,
      1e8,
    ]) {
      assert.doesNotThrow(() => landmark.update(time), `clock ${time}`);
      assert.ok(chairs.instanceMatrix.array.every(Number.isFinite));
      for (let i = 0; i < chairs.count; i++) {
        chairs.getMatrixAt(i, matrix);
        point.setFromMatrixPosition(matrix);
        assert.ok(
          point.z >= 1281 && point.z <= 1591,
          `chair ${i} stays on lift at ${time}`,
        );
        assert.ok(point.y > cityGroundHeight(point.x, point.z) + 4);
      }
    }
    landmark.update(firstElapsed);
    const beforeZero = chairs.instanceMatrix.array.slice();
    landmark.update(firstElapsed + 160);
    for (let i = 0; i < beforeZero.length; i++)
      assert.ok(
        Math.abs(beforeZero[i] - chairs.instanceMatrix.array[i]) < 1e-5,
        'negative time wraps onto the same closed lift cycle',
      );
  } finally {
    kit.dispose();
  }
});

void test('coarse grass terrain is absent under both the forecourt and every piste while surrounding hills remain', () => {
  const { kit, root } = model();
  try {
    const outline = [
      { x: -1080, z: 1220 },
      { x: -670, z: 1220 },
      { x: -670, z: 1630 },
      { x: -1080, z: 1630 },
    ];
    const geometry = drapedGeometry(
      [outline],
      cityGroundHeight,
      0,
      8,
      BOBROVY_TERRAIN_FOOTPRINTS,
    );
    const grass = kit.mesh(geometry, kit.material('#82966d'));
    const plaza = root.getObjectByName('bobrovy-log:forecourt');
    const piste = root.getObjectByName('bobrovy-log:piste');
    const ray = new THREE.Raycaster(
      new THREE.Vector3(),
      new THREE.Vector3(0, -1, 0),
    );
    const covered = [];
    for (const polygon of BOBROVY_TERRAIN_FOOTPRINTS) {
      let signedArea = 0;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length],
          c = polygon[(i + 2) % polygon.length];
        assert.ok(
          (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x) >= -1e-7,
          'terrain clipping requires convex footprints',
        );
        signedArea += a.x * b.z - b.x * a.z;
      }
      assert.ok(signedArea > 0, 'holes must have counter-clockwise winding');
      covered.push({
        x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length,
        z: polygon.reduce((sum, p) => sum + p.z, 0) / polygon.length,
      });
    }
    for (let x = -913; x < -720; x += 4)
      for (let z = 1240; z < 1295; z += 4)
        if (pointInPolygon(x, z, BOBROVY_TERRAIN_FOOTPRINTS[0]))
          covered.push({ x, z });
    assert.ok(covered.length > 800);
    for (const p of covered) {
      ray.ray.origin.set(p.x, 1000, p.z);
      assert.equal(
        ray.intersectObject(grass).length,
        0,
        `no green triangle beneath visible surface at ${p.x},${p.z}`,
      );
      assert.ok(
        ray.intersectObjects([plaza, piste]).length > 0,
        'every terrain hole is replaced by visible paving or piste',
      );
    }
    for (const p of [
      { x: -1070, z: 1350 },
      { x: -685, z: 1500 },
      { x: -850, z: 1620 },
    ]) {
      ray.ray.origin.set(p.x, 1000, p.z);
      const hit = ray.intersectObject(grass)[0];
      assert.ok(
        hit,
        'untouched hillside remains beside the local surface holes',
      );
      assert.ok(Math.abs(hit.point.y - cityGroundHeight(p.x, p.z)) < 0.1);
    }
    assert.ok(
      geometry.attributes.position.count / 3 < 40000,
      'local footprint cuts retain a bounded triangle count',
    );
  } finally {
    kit.dispose();
  }
});
