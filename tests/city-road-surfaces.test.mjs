import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  buildRoadSurfaces,
  roadPolygonArea,
} from '../lib/game/city/road-surfaces.ts';
import {
  buildRoadJunctions,
  buildCityCrossings,
  cityCrossings,
} from '../lib/game/city/crossings.ts';
import {
  cityRoads,
  cityStops,
  ROUNDABOUT,
  distanceToRoad,
} from '../lib/game/city/layout.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import {
  createStreetDetails,
  createStreetSignalLight,
} from '../components/game/city/streets.ts';
import { citySceneryFits } from '../components/game/city/landmarks.ts';
import { createCityEnvironment } from '../components/game/city/environment.ts';

const road = (id, from, to, width = 16) => ({
  id,
  from: { x: from[0], z: from[1] },
  to: { x: to[0], z: to[1] },
  width,
});
function polygonIndex(polygons) {
  return polygons.map((points) => ({
    points,
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxZ: Math.max(...points.map((p) => p.z)),
  }));
}
function covering(index, x, z, tolerance = 1e-6) {
  return index.filter(
    (p) =>
      x >= p.minX - tolerance &&
      x <= p.maxX + tolerance &&
      z >= p.minZ - tolerance &&
      z <= p.maxZ + tolerance &&
      p.points.every((a, i) => {
        const b = p.points[(i + 1) % p.points.length];
        return (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x) >= -tolerance;
      }),
  ).length;
}

void test('joined asphalt closes angled bends and T junctions without double surfaces or internal curbs', () => {
  const roads = [
    road('west', [-60, 0], [0, 0], 20),
    road('bend', [0, 0], [50, 40], 20),
    road('branch', [0, 0], [0, -65], 14),
  ];
  const surface = buildRoadSurfaces(roads);
  const asphalt = polygonIndex(surface.asphalt),
    curbs = polygonIndex(surface.curbs);
  for (let x = -65.173; x < 60; x += 1.37)
    for (let z = -72.391; z < 52; z += 1.61) {
      const onRoad = roads.some(
        (r) => distanceToRoad(x, z, r) < r.width / 2 - 0.12,
      );
      const layers = covering(asphalt, x, z, 1e-9);
      assert.ok(layers <= 1, `coplanar overlap at ${x},${z}`);
      if (onRoad) {
        assert.equal(layers, 1, `asphalt gap at ${x},${z}`);
        assert.equal(
          covering(curbs, x, z),
          0,
          `curb in carriageway at ${x},${z}`,
        );
      }
    }
  // The outer quadrant of a sharp turn was missing from the old rectangles.
  assert.equal(covering(asphalt, 2, -8), 1);
  const one = buildRoadSurfaces([roads[0]]);
  const duplicate = buildRoadSurfaces([
    roads[0],
    { ...roads[0], id: 'duplicate' },
  ]);
  assert.ok(
    Math.abs(
      one.asphalt.reduce((n, p) => n + roadPolygonArea(p), 0) -
        duplicate.asphalt.reduce((n, p) => n + roadPolygonArea(p), 0),
    ) < 1e-6,
  );
});

void test('the complete city road footprint and ring entrances have continuous asphalt with no curb across a lane', () => {
  const surface = buildRoadSurfaces(cityRoads, ROUNDABOUT);
  const asphalt = polygonIndex(surface.asphalt),
    curbs = polygonIndex(surface.curbs);
  const triangles = [...surface.asphalt, ...surface.curbs].reduce(
    (n, p) => n + p.length - 2,
    0,
  );
  assert.ok(triangles < 100000, `road surface budget: ${triangles}`);
  for (const r of cityRoads) {
    const dx = r.to.x - r.from.x,
      dz = r.to.z - r.from.z,
      length = Math.hypot(dx, dz);
    for (const t of [0, 0.23, 0.51, 0.79, 1])
      for (const side of [-0.9, 0, 0.9]) {
        const x = r.from.x + dx * t - (((dz / length) * r.width) / 2) * side;
        const z = r.from.z + dz * t + (((dx / length) * r.width) / 2) * side;
        assert.ok(
          covering(asphalt, x, z) >= 1,
          `${r.id}: missing road at ${t}/${side}`,
        );
        assert.equal(
          covering(curbs, x, z),
          0,
          `${r.id}: internal curb at ${t}/${side}`,
        );
      }
  }
});

void test('X junctions and every roundabout approach have only one asphalt layer and no raised strip', () => {
  const fixtures = [
    {
      roads: [
        road('west-east', [-100, 0], [100, 0], 20),
        road('north-south', [0, -100], [0, 100], 16),
      ],
    },
    {
      roads: [
        road('west', [-100, 0], [-37, 0], 20),
        road('east', [37, 0], [100, 0], 20),
        road('north', [0, -100], [0, -37], 16),
        road('south', [0, 37], [0, 100], 16),
        road('diagonal', [26, 26], [85, 85], 18),
      ],
      ring: { x: 0, z: 0, outerRadius: 48 },
    },
  ];
  for (const { roads, ring } of fixtures) {
    const surface = buildRoadSurfaces(roads, ring);
    const asphalt = polygonIndex(surface.asphalt),
      curbs = polygonIndex(surface.curbs);
    for (let x = -107.321; x <= 108; x += 2.17)
      for (let z = -108.173; z <= 109; z += 2.39) {
        const inside =
          roads.some((r) => distanceToRoad(x, z, r) < r.width / 2 - 0.12) ||
          (ring && Math.hypot(x, z) < ring.outerRadius - 0.12);
        const layers = covering(asphalt, x, z, 1e-9);
        assert.ok(layers <= 1, `overlapping road at ${x},${z}`);
        if (inside) {
          assert.equal(layers, 1, `missing junction surface at ${x},${z}`);
          assert.equal(
            covering(curbs, x, z),
            0,
            `curb across junction at ${x},${z}`,
          );
        }
      }
  }
});

void test('crossings belong to T/X approaches, never a bend, parallel overlap or bridge', () => {
  const through = road('main', [-100, 0], [100, 0], 20);
  const branch = road('branch', [0, 0], [0, 100], 16);
  assert.equal(buildCityCrossings([through, branch]).length, 3);
  assert.equal(
    buildCityCrossings([through, road('cross', [0, -100], [0, 100], 16)])
      .length,
    4,
  );
  assert.equal(
    buildCityCrossings([
      road('a', [-100, 0], [0, 0]),
      road('b', [0, 0], [60, 80]),
    ]).length,
    0,
  );
  assert.equal(
    buildCityCrossings([through, { ...through, id: 'parallel' }]).length,
    0,
  );
  assert.equal(
    buildCityCrossings([through, { ...branch, bridge: 'kommunalny' }]).length,
    0,
  );
  const nodes = buildRoadJunctions(cityRoads);
  for (const crossing of cityCrossings) {
    const junction = nodes.find((j) => j.id === crossing.junctionId);
    assert.ok(junction && junction.arms.length >= 3);
    assert.ok(
      Math.hypot(crossing.x - junction.x, crossing.z - junction.z) <= 37,
    );
  }
});

void test('every visible street post stays outside all carriageways, water, parking and buildings', () => {
  const kit = new RenderKit(new THREE.Scene());
  try {
    const placements = createStreetDetails(
      kit,
      kit.scene,
      kit.material('#f3d5a3'),
      [],
    );
    assert.ok(placements.length > 30);
    for (const p of placements) {
      assert.equal(
        citySceneryFits(p, p.radius),
        true,
        `invalid furniture at ${p.x},${p.z}`,
      );
      assert.ok(
        cityRoads.every(
          (r) => distanceToRoad(p.x, p.z, r) >= r.width / 2 + p.radius,
        ),
      );
    }
  } finally {
    kit.dispose();
  }
});

void test('unregulated signals flash amber from scene time without a permanent stop or frame allocations', () => {
  const kit = new RenderKit(new THREE.Scene());
  try {
    const signals = createStreetSignalLight(kit);
    createStreetDetails(
      kit,
      kit.scene,
      kit.material('#f3d5a3'),
      [],
      signals.material,
    );
    assert.ok(cityCrossings.some((c) => c.signal === 'caution'));
    assert.ok(
      cityCrossings.every((c) => c.signal === null || c.signal === 'caution'),
    );
    let amberLenses = 0;
    kit.scene.traverse((object) => {
      if (object.isMesh && object.material === signals.material) amberLenses++;
    });
    assert.ok(
      amberLenses > 0,
      'the shared caution material reaches the visible heads',
    );
    signals.update(0.25);
    assert.ok(signals.material.emissiveIntensity > 0);
    signals.update(0.85);
    assert.equal(signals.material.emissiveIntensity, 0);
    signals.update(1.45);
    assert.ok(signals.material.emissiveIntensity > 0);
    const resources = [
      kit.geometries.size,
      kit.materials.size,
      kit.textures.size,
    ];
    for (let frame = 0; frame < 180; frame++) signals.update(frame / 60);
    assert.deepEqual(
      [kit.geometries.size, kit.materials.size, kit.textures.size],
      resources,
    );
  } finally {
    kit.dispose();
  }
});

void test('departing a selected destination keeps its world billboard outside the nearby car camera', () => {
  const previousDocument = globalThis.document;
  const mockDocument = {
    createElement: () => ({
      width: 1024,
      height: 1024,
      getContext: () => new Proxy({}, { get: () => () => {} }),
    }),
  };
  Reflect.set(globalThis, 'document', mockDocument);
  const kit = new RenderKit(new THREE.Scene());
  try {
    const city = createCityEnvironment(kit);
    const index = cityStops.findIndex((s) => s.id === 'planeta');
    assert.ok(index >= 0);
    const target = cityStops[index],
      marker = city.stops[index];
    const car = { x: target.x, z: target.z };
    city.update(0, index, index, false, 32, car);
    assert.equal(
      marker.label.visible,
      false,
      'the near-stop panel already identifies this place',
    );
    for (const distance of [4, 40, 79.9, 80]) {
      car.x = target.x + distance;
      city.update(0.25, index, -1, false, 32, car);
      assert.equal(
        marker.label.visible,
        false,
        `departure at ${distance}m must not restore a giant billboard`,
      );
    }
    car.x = target.x + 81;
    city.update(0.85, index, -1, false, 32, car);
    assert.equal(
      marker.label.visible,
      true,
      'a distant selected destination remains readable',
    );
    car.x = target.x + 4;
    city.update(1.25, index, -1, true, 32, car);
    assert.equal(marker.label.visible, false);
    assert.equal(
      marker.overviewLabel.visible,
      true,
      'the map destination label remains available',
    );
    // The race uses the same default update signature without a city target.
    const caution = [...kit.materials].find(
      (m) => m.name === 'city-caution-signals',
    );
    assert.ok(caution);
    city.update(0.25);
    assert.ok(caution.emissiveIntensity > 0);
    city.update(0.85);
    assert.equal(caution.emissiveIntensity, 0);
    assert.ok(city.stops.every((s) => !s.label.visible));
  } finally {
    kit.dispose();
    globalThis.document = previousDocument;
  }
});
