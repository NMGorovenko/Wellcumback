// Call assertCityViewBudgets(city, t.diagnostic.bind(t)) inside the existing full
// city geometry test, AFTER distant-LOD assertions and BEFORE animated updates.
// This reuses its scene; do not add another expensive createCityEnvironment test.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cityCruiseCamera,
  cityDriveCamera,
  cityOverviewCamera,
} from '../../components/game/city/camera.ts';
import { CITY_SPAWN, cityStops } from '../../lib/game/city/layout.ts';
import { cityGroundHeight } from '../../lib/game/city/surface.ts';

const limits = {
  spawn: {
    drive: { triangles: 400000, draws: 85 },
    cruise: { triangles: 850000, draws: 275 },
  },
  planeta: {
    drive: { triangles: 600000, draws: 85 },
    cruise: { triangles: 550000, draws: 115 },
  },
  komsomoll: {
    drive: { triangles: 650000, draws: 120 },
    cruise: { triangles: 1000000, draws: 320 },
  },
};

/** Deterministic CPU count of geometry submitted after Three's ordinary frustum
 * culling. Counts instances, LOD and parent visibility. It makes no FPS/GPU claim.
 */
export function cityViewSubmission(root, camera) {
  camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    ),
  );
  let draws = 0,
    triangles = 0;
  root.traverseVisible((object) => {
    if (!object.isMesh || !object.layers.test(camera.layers)) return;
    if (object.material.visible === false) return;
    if (object.frustumCulled && !frustum.intersectsObject(object)) return;
    const geometry = object.geometry;
    const size = geometry.index?.count ?? geometry.attributes.position.count;
    const start = geometry.drawRange.start;
    const end = Math.min(size, start + geometry.drawRange.count);
    if (end <= start) return;
    draws++;
    triangles +=
      ((end - start) / 3) * (object.isInstancedMesh ? object.count : 1);
  });
  return { draws, triangles };
}

export function assertCityViewBudgets(city, diagnostic = () => {}) {
  const aspect = 16 / 9;
  const overview = cityOverviewCamera(1);
  const points = [
    { id: 'spawn', ...CITY_SPAWN },
    ...['planeta', 'komsomoll'].map((id) =>
      cityStops.find((stop) => stop.id === id),
    ),
  ];
  city.root.updateMatrixWorld(true);
  const results = [];
  for (const point of points) {
    assert.ok(point, 'required camera probe destination exists');
    const state = {
      ...point,
      heading: point.heading ?? 0,
      speed: 20,
      vx: 0,
      vz: -20,
      elevation: cityGroundHeight(point.x, point.z),
    };
    const drive = cityDriveCamera(state, aspect);
    const driveCamera = new THREE.OrthographicCamera(
      -drive.halfHeight * aspect,
      drive.halfHeight * aspect,
      drive.halfHeight,
      -drive.halfHeight,
      0.1,
      overview.far,
    );
    driveCamera.position.set(
      drive.look.x + drive.outward.x * overview.distance,
      drive.look.y + drive.outward.y * overview.distance,
      drive.look.z + drive.outward.z * overview.distance,
    );
    driveCamera.lookAt(drive.look.x, drive.look.y, drive.look.z);
    const cruise = cityCruiseCamera(state, aspect);
    const cruiseCamera = new THREE.PerspectiveCamera(
      cruise.fov,
      aspect,
      0.12,
      Math.max(2000, Math.min(5200, overview.distance * 0.65)),
    );
    cruiseCamera.position.set(
      cruise.position.x,
      cruise.position.y,
      cruise.position.z,
    );
    cruiseCamera.lookAt(cruise.look.x, cruise.look.y, cruise.look.z);
    /** @type {['drive' | 'cruise', THREE.Camera][]} */
    const cameraModes = [
      ['drive', driveCamera],
      ['cruise', cruiseCamera],
    ];
    for (const [mode, camera] of cameraModes) {
      city.lod.update(mode === 'cruise' ? camera.position : state, 'high');
      const actual = cityViewSubmission(city.root, camera);
      const cap = limits[point.id][mode];
      diagnostic(
        JSON.stringify({ probe: `${point.id}/${mode}`, ...actual, cap }),
      );
      assert.ok(
        actual.triangles > 0 && actual.draws > 0,
        'the probe must actually see the city',
      );
      assert.ok(
        actual.triangles <= cap.triangles,
        `${point.id}/${mode} submits ${actual.triangles} triangles, budget ${cap.triangles}`,
      );
      assert.ok(
        actual.draws <= cap.draws,
        `${point.id}/${mode} submits ${actual.draws} mesh calls, budget ${cap.draws}`,
      );
      results.push({ id: point.id, mode, ...actual });
    }
  }
  return results;
}
