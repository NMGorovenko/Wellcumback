import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cityBuildings,
  cityRoads,
  distanceToRoad,
} from '../lib/game/city/layout.ts';
import {
  CITY_KUBATURA_TERRACE,
  cityGroundHeight,
  cityKubaturaTerraceDistance,
  cityKubaturaRetainingEdges,
  cityRoadHeight,
  citySurfacePose,
} from '../lib/game/city/surface.ts';
import { freshCity, stepCityCar } from '../lib/game/city/engine.ts';
import {
  cityNavigationRoute,
  cityRouteLength,
} from '../lib/game/city/navigation.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createKubaturaTerrace } from '../components/game/city/kubatura-terrace.ts';
import { liftScenery } from '../components/game/city/relief.ts';

const terrace = CITY_KUBATURA_TERRACE,
  entry = terrace.entry;
const dx = entry.to.x - entry.from.x,
  dz = entry.to.z - entry.from.z;
const length = Math.hypot(dx, dz),
  heading = Math.atan2(dx, -dz);
const at = (distance, lateral = 0) => ({
  x: entry.from.x + (dx * distance) / length + (dz * lateral) / length,
  z: entry.from.z + (dz * distance) / length - (dx * lateral) / length,
});

void test('Kubatura building and arrival sit on a level terrace above the lower approach', () => {
  const b = cityBuildings.find((b) => b.kind === 'kubatura');
  const rise = terrace.height - cityGroundHeight(entry.from.x, entry.from.z);
  assert.ok(rise >= 4 && rise <= 6, 'a modest artistic terrace, not a cliff');
  assert.equal(cityGroundHeight(entry.to.x, entry.to.z), terrace.height);
  assert.equal(
    cityGroundHeight(terrace.arrival.x, terrace.arrival.z),
    terrace.height,
  );
  for (let x = b.x - b.w / 2; x <= b.x + b.w / 2; x += 2)
    for (let z = b.z - b.d / 2; z <= b.z + b.d / 2; z += 2)
      assert.ok(Math.abs(cityGroundHeight(x, z) - terrace.height) < 1e-9);
  for (let lateral = -entry.width / 2; lateral <= entry.width / 2; lateral++) {
    let previous;
    for (let distance = 0; distance <= length; distance += 0.25) {
      const p = at(distance, lateral),
        y = cityRoadHeight(entry, p.x, p.z);
      assert.ok(Number.isFinite(y));
      if (previous !== undefined)
        assert.ok(
          Math.abs(y - previous) / 0.25 < 0.16,
          'full-width continuous entry',
        );
      const pose = citySurfacePose(p.x, p.z, heading, y, `road:${entry.id}`);
      assert.ok(
        Math.abs(pose.elevation - y) < 0.12,
        'physical road selects this ramp',
      );
      previous = y;
    }
  }
});

void test('fixed-step driving reaches and leaves the upper arrival without wall contact or a height jump', () => {
  for (const [from, to] of [
    [entry.from, entry.to],
    [entry.to, terrace.arrival],
  ])
    for (const direction of [1, -1]) {
      const h =
        Math.atan2(to.x - from.x, from.z - to.z) +
        (direction < 0 ? Math.PI : 0);
      const start = direction > 0 ? from : to;
      const tripLength = Math.hypot(to.x - from.x, to.z - from.z);
      const car = {
        ...freshCity(),
        ...start,
        heading: h,
        vx: Math.sin(h) * 8,
        vz: -Math.cos(h) * 8,
        speed: 8,
        ...citySurfacePose(
          start.x,
          start.z,
          h,
          cityRoadHeight(entry, start.x, start.z),
          `road:${entry.id}`,
        ),
      };
      let traveled = 0;
      for (let frame = 0; frame < 900 && traveled < tripLength - 1; frame++) {
        const previous = car.elevation;
        const result = stepCityCar(
          car,
          { throttle: car.speed < 8 ? 0.25 : 0, steer: 0, handbrake: false },
          1 / 60,
        );
        assert.equal(
          result.worldContact,
          false,
          `blocked at ${car.x},${car.z}`,
        );
        assert.ok(
          Math.abs(car.elevation - previous) < 0.025,
          'no terrace edge teleport',
        );
        assert.ok(
          Math.abs(car.elevation - cityRoadHeight(entry, car.x, car.z)) < 0.12,
        );
        traveled =
          (car.x - start.x) * Math.sin(h) - (car.z - start.z) * Math.cos(h);
      }
      assert.ok(
        traveled >= tripLength - 1,
        'arrives within one metre of the far end',
      );
    }
});

void test('the actual retaining face stops a car from either level before it can sink or pass through', () => {
  const edge = cityKubaturaRetainingEdges().find(
    (e) =>
      e.nx > 0.5 &&
      e.nz > 0.5 &&
      Math.hypot(
        (e.p.x + e.q.x) / 2 - terrace.arrival.x,
        (e.p.z + e.q.z) / 2 - terrace.arrival.z,
      ) > 18,
  );
  assert.ok(edge, 'an exposed curved front-right wall exists');
  const x = (edge.p.x + edge.q.x) / 2,
    z = (edge.p.z + edge.q.z) / 2;
  for (const side of [1, -1]) {
    const outset = side > 0 ? 9 : -7,
      h = Math.atan2(-edge.nx * side, edge.nz * side);
    const start = { x: x + edge.nx * outset, z: z + edge.nz * outset };
    const car = {
      ...freshCity(),
      ...start,
      heading: h,
      vx: Math.sin(h) * 5,
      vz: -Math.cos(h) * 5,
      speed: 5,
      ...citySurfacePose(start.x, start.z, h),
    };
    let contacted = false;
    for (let frame = 0; frame < 360; frame++) {
      const previous = car.elevation;
      const result = stepCityCar(
        car,
        { throttle: 0.35, steer: 0, handbrake: false },
        1 / 60,
      );
      contacted ||= result.worldContact;
      assert.ok(
        Math.abs(car.elevation - previous) < 0.025,
        'car stays on its own side of the wall',
      );
    }
    assert.equal(contacted, true);
    const distance = (car.x - x) * edge.nx + (car.z - z) * edge.nz;
    assert.ok(
      side > 0 ? distance > 3 : distance < 0,
      'solid retaining geometry prevents crossing',
    );
  }
});

void test('navigation uses the terrace mouth from October approach and from the lower quay', () => {
  const approach = cityRoads.find((r) => r.id === 'oktyabrsky-left:0');
  const quay = cityRoads.find((r) => r.id === 'left-quay:10');
  for (const start of [
    approach.to,
    {
      x: quay.from.x + (quay.to.x - quay.from.x) * 0.4,
      z: quay.from.z + (quay.to.z - quay.from.z) * 0.4,
    },
  ]) {
    const route = cityNavigationRoute(start, terrace.arrival);
    assert.ok(
      route.some(
        (p) => Math.hypot(p.x - entry.from.x, p.z - entry.from.z) < 0.25,
      ),
    );
    assert.ok(
      cityRouteLength(route) > length,
      'lower quay cannot shortcut through the retaining face',
    );
    assert.deepEqual(route.at(-1), terrace.arrival);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1],
        b = route[i];
      for (let t = 0; t <= 1; t += 0.1) {
        const x = a.x + (b.x - a.x) * t,
          z = a.z + (b.z - a.z) * t;
        assert.ok(
          cityRoads.some((r) => distanceToRoad(x, z, r) < r.width / 2 - 1) ||
            (cityKubaturaTerraceDistance(x, z) < -1 &&
              Math.abs(cityGroundHeight(x, z) - terrace.height) < 0.01),
        );
      }
    }
  }
});

void test('rendered terrace matches physical height, clears complete road lanes and remains bounded', () => {
  const kit = new RenderKit(new THREE.Scene()),
    root = new THREE.Group();
  try {
    createKubaturaTerrace(kit, root);
    root.updateMatrixWorld(true);
    const pavement = root.getObjectByName('kubatura:terrace-pavement');
    const before = new THREE.Box3().setFromObject(root);
    liftScenery(kit, root, cityGroundHeight);
    root.updateMatrixWorld(true);
    assert.ok(
      before.equals(new THREE.Box3().setFromObject(root)),
      'world-space terrace is never lifted twice',
    );
    let vertices = 0,
      walls = 0,
      rails = 0;
    const v = new THREE.Vector3();
    root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const p = mesh.geometry.attributes.position;
      vertices += p.count;
      const wall = mesh.name === 'kubatura:retaining-wall';
      const raised =
        wall ||
        mesh.name === 'kubatura:terrace-cap' ||
        mesh.name === 'kubatura:terrace-railing';
      if (wall) walls++;
      if (mesh.name === 'kubatura:terrace-railing') rails++;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
        assert.ok(Number.isFinite(v.y));
        if (raised) {
          for (const road of cityRoads)
            assert.ok(
              distanceToRoad(v.x, v.z, road) >= road.width / 2 + 0.45,
              `${mesh.name} blocks ${road.id}`,
            );
          assert.ok(
            distanceToRoad(v.x, v.z, entry) >= entry.width / 2 + 6,
            'entry throat stays open',
          );
        }
        if (mesh === pavement) {
          assert.ok(
            cityKubaturaTerraceDistance(v.x, v.z) < 0.0001,
            'pavement stops at clipped boundary',
          );
          assert.ok(Math.abs(v.y - cityGroundHeight(v.x, v.z) - 0.08) < 0.0001);
        }
        if (wall)
          assert.ok(terrace.height - v.y < 6, 'bounded retaining height');
      }
    });
    assert.ok(
      walls > 10 && rails > 10,
      'curved masonry edge and railing are visible geometry',
    );
    assert.ok(vertices < 12000, `bounded local detail: ${vertices} vertices`);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(),
      new THREE.Vector3(0, -1, 0),
    );
    for (let distance = 18; distance <= length; distance += 2)
      for (const lateral of [-5, 0, 5]) {
        const p = at(distance, lateral);
        if (cityKubaturaTerraceDistance(p.x, p.z) > -0.2) continue;
        ray.ray.origin.set(p.x, 40, p.z);
        const hit = ray.intersectObject(pavement)[0];
        assert.ok(hit, 'paved ramp reaches the upper parking');
        assert.ok(
          Math.abs(hit.point.y - cityGroundHeight(p.x, p.z) - 0.08) < 0.05,
          'rendered triangles agree between samples',
        );
      }
  } finally {
    kit.dispose();
  }
});
