import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Runs from /private/tmp, or unchanged after copying into the project's tests/.
// Optional: FRIENDSLOP_CITY_CHECKOUT=/absolute/checkout node --experimental-strip-types --test this-file.mjs
const adjacent = new URL('../', import.meta.url);
const checkout = process.env.FRIENDSLOP_CITY_CHECKOUT
  ? pathToFileURL(`${process.env.FRIENDSLOP_CITY_CHECKOUT.replace(/\/$/, '')}/`)
  : existsSync(new URL('lib/game/city/layout.ts', adjacent))
    ? adjacent
    : pathToFileURL('/private/tmp/friendslop-stud-019/');
const load = (path) => import(new URL(path, checkout));
const THREE = await load('node_modules/three/build/three.module.js');
const {
  cityBuildings,
  cityStops,
  cityRoads,
  CITY_SPAWN,
  CITY_PARKING,
  inCityWater,
  distanceToRoad,
} = await load('lib/game/city/layout.ts');
const { CITY_FUEL_STOPS } = await load('lib/game/city/right-bank.ts');
const { cityCarBlocked } = await load('lib/game/city/engine.ts');
const { cityNavigationRoute, cityRouteLength } = await load(
  'lib/game/city/navigation.ts',
);
const { citySurfacePose } = await load('lib/game/city/surface.ts');
const { RenderKit } = await load('components/game/world/render-kit.ts');
const { createRightBankLandmark } = await load(
  'components/game/city/right-bank-landmarks.ts',
);

const kinds = ['aerokos', 'fighter', 'zori', 'fuel'];
const buildings = cityBuildings.filter((b) => kinds.includes(b.kind));
const fuel = buildings.filter((b) => b.kind === 'fuel');
const expectedFuelIds = [
  'fuel-stud',
  'fuel-svobodny',
  'fuel-bograda',
  'fuel-vzletka',
  'fuel-sverdlovsk',
  'fuel-michurina',
];
const idOf = (b) => `${b.kind} at ${b.x},${b.z}`;
const localToWorld = (b, x, z) => {
  const c = Math.cos(b.angle ?? 0),
    s = Math.sin(b.angle ?? 0);
  return { x: b.x + x * c + z * s, z: b.z - x * s + z * c };
};
const worldToLocal = (b, p) => {
  const c = Math.cos(b.angle ?? 0),
    s = Math.sin(b.angle ?? 0);
  return {
    x: (p.x - b.x) * c - (p.z - b.z) * s,
    z: (p.x - b.x) * s + (p.z - b.z) * c,
  };
};
const contains = (b, p, margin = 0) => {
  const local = worldToLocal(b, p);
  return (
    Math.abs(local.x) <= b.w / 2 + margin &&
    Math.abs(local.z) <= b.d / 2 + margin
  );
};
const corners = (b) =>
  [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => localToWorld(b, (sx * b.w) / 2, (sz * b.d) / 2)),
  );
function parcelsOverlap(a, b) {
  const ac = corners(a),
    bc = corners(b);
  for (const rectangle of [a, b]) {
    const angle = rectangle.angle ?? 0;
    for (const axis of [
      { x: Math.cos(angle), z: -Math.sin(angle) },
      { x: Math.sin(angle), z: Math.cos(angle) },
    ]) {
      const project = (p) => p.x * axis.x + p.z * axis.z;
      const ap = ac.map(project),
        bp = bc.map(project);
      if (
        Math.max(...ap) <= Math.min(...bp) + 0.001 ||
        Math.max(...bp) <= Math.min(...ap) + 0.001
      )
        return false;
    }
  }
  return true;
}
function pointSegmentDistance(x, z, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)),
  );
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}
// Exact footprint-vs-road gap, including rounded road end caps. Matches the
// existing centre-clearance regression, but supports each parcel's rotation.
function roadFootprintGap(building, road) {
  const a = worldToLocal(building, road.from),
    b = worldToLocal(building, road.to);
  const w = building.w / 2,
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
  let gap = Math.min(
    ...[a, b].map((p) =>
      Math.hypot(
        Math.max(0, Math.abs(p.x) - w),
        Math.max(0, Math.abs(p.z) - d),
      ),
    ),
  );
  for (const x of [-w, w])
    for (const z of [-d, d])
      gap = Math.min(gap, pointSegmentDistance(x, z, a, b));
  return gap - road.width / 2;
}
const stationFor = (b) => CITY_FUEL_STOPS?.find((s) => contains(b, s));

void test('six dispersed generic gas stations and the requested right-bank landmarks are present', () => {
  assert.equal(fuel.length, 6);
  assert.equal(buildings.filter((b) => b.kind === 'zori').length, 6);
  for (const kind of ['aerokos', 'fighter'])
    assert.equal(buildings.filter((b) => b.kind === kind).length, 1, kind);
  assert.deepEqual(
    CITY_FUEL_STOPS.map((s) => s.id).sort(),
    [...expectedFuelIds].sort(),
  );
  const linked = new Set();
  for (const b of fuel) {
    const stop = stationFor(b);
    assert.ok(stop, `${idOf(b)} has a map/GPS destination on its forecourt`);
    linked.add(stop.id);
    assert.equal(
      cityStops.find((s) => s.id === stop.id)?.title,
      'ЗАПРАВКА',
      stop.id,
    );
  }
  assert.equal(linked.size, 6, 'one distinct destination for every station');
  for (let i = 0; i < fuel.length; i++)
    for (let j = i + 1; j < fuel.length; j++)
      assert.ok(
        Math.hypot(fuel[i].x - fuel[j].x, fuel[i].z - fuel[j].z) > 150,
        'stations remain spread across several city districts',
      );
  assert.ok(fuel.some((b) => b.x < -900) && fuel.some((b) => b.x > 1200));
  assert.ok(fuel.some((b) => b.z < -400) && fuel.some((b) => b.z > 600));
});

void test('new landmark parcels are dry and clear of unrelated roads and every other building', () => {
  assert.equal(buildings.length, 14, 'prevents vacuous clearance checks');
  for (const b of buildings) {
    for (let ix = 0; ix <= Math.ceil(b.w / 6); ix++)
      for (let iz = 0; iz <= Math.ceil(b.d / 6); iz++) {
        const p = localToWorld(
          b,
          -b.w / 2 + (b.w * ix) / Math.ceil(b.w / 6),
          -b.d / 2 + (b.d * iz) / Math.ceil(b.d / 6),
        );
        assert.equal(
          inCityWater(p.x, p.z, 1),
          false,
          `${idOf(b)} water at ${p.x},${p.z}`,
        );
      }
    const ownStop = b.kind === 'fuel' ? stationFor(b) : undefined;
    for (const r of cityRoads) {
      // A station's driveway is intentionally allowed to reach its pavement.
      if (ownStop && r.id.startsWith(`${ownStop.id}-`)) continue;
      const gap = roadFootprintGap(b, r);
      assert.ok(
        gap >= -0.001,
        `${idOf(b)} overlaps ${r.id} by ${(-gap).toFixed(3)}m`,
      );
    }
    for (const other of cityBuildings)
      if (b !== other)
        assert.equal(
          parcelsOverlap(b, other),
          false,
          `${idOf(b)} overlaps ${idOf(other)}`,
        );
  }
});

void test('fuel forecourts admit the coupe while pumps and operator buildings remain solid', (t) => {
  let probes = 0;
  for (const b of fuel) {
    const heading = -(b.angle ?? 0);
    for (let z = -b.d * 0.43; z <= b.d * 0.43; z += 0.5) {
      // Sweep three lines through the real lane, exercising the full coupe body.
      for (const lateral of [-0.8, 0, 0.8]) {
        const p = localToWorld(b, -b.w * 0.1 + lateral, z);
        assert.equal(
          cityCarBlocked(p.x, p.z, heading),
          false,
          `${idOf(b)} forecourt is blocked at local ${(-b.w * 0.1 + lateral).toFixed(2)},${z.toFixed(2)}`,
        );
        probes++;
      }
    }
    for (const [name, x, z] of [
      ['operator', b.w * 0.34, -b.d * 0.1],
      ['left pump', -b.w * 0.29, -b.d * 0.05],
      ['right pump', b.w * 0.075, b.d * 0.25],
    ]) {
      const p = localToWorld(b, x, z);
      assert.equal(
        cityCarBlocked(p.x, p.z, heading),
        true,
        `${idOf(b)} ${name} is solid`,
      );
    }
    const stop = stationFor(b);
    assert.ok(stop, idOf(b));
    assert.equal(
      cityCarBlocked(stop.x, stop.z, heading),
      false,
      `${stop.id} destination is driveable`,
    );
    const access = cityRoads.filter((r) => r.id.startsWith(`${stop.id}-`));
    assert.ok(access.length, `${stop.id} has a road access`);
    for (const r of access) {
      const length = Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z);
      const direction = Math.atan2(r.to.x - r.from.x, r.from.z - r.to.z);
      for (let d = 0; d <= length; d += 1) {
        const p = {
          x: r.from.x + ((r.to.x - r.from.x) * d) / length,
          z: r.from.z + ((r.to.z - r.from.z) * d) / length,
        };
        assert.equal(
          cityCarBlocked(p.x, p.z, direction),
          false,
          `${r.id} blocks the coupe at ${p.x.toFixed(2)},${p.z.toFixed(2)}`,
        );
        probes++;
      }
    }
  }
  assert.ok(probes > 900, `${probes} forecourt/access probes`);
  t.diagnostic(`${probes} full-car forecourt and access probes`);
});

void test('GPS reaches all six fuel stations from the Studgorodok spawn on connected roads', (t) => {
  assert.equal(CITY_FUEL_STOPS.length, 6);
  for (const stop of CITY_FUEL_STOPS) {
    const destination = cityStops.find((s) => s.id === stop.id);
    const parcel = fuel.find((b) => contains(b, stop));
    assert.ok(destination && parcel, stop.id);
    const route = cityNavigationRoute(CITY_SPAWN, destination);
    assert.ok(route.length > 1, `${stop.id}: disconnected route`);
    assert.deepEqual(route[0], CITY_SPAWN);
    assert.deepEqual([route.at(-1).x, route.at(-1).z], [stop.x, stop.z]);
    assert.ok(Number.isFinite(cityRouteLength(route)), stop.id);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1],
        b = route[i];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const heading = Math.atan2(b.x - a.x, a.z - b.z);
      // Tight probes near the destination catch narrow pylons and canopy columns.
      const spacing =
        contains(parcel, a, 30) || contains(parcel, b, 30) ? 0.25 : 3;
      for (let d = 0; d <= length; d += spacing) {
        const p = {
          x: a.x + ((b.x - a.x) * d) / length,
          z: a.z + ((b.z - a.z) * d) / length,
        };
        assert.ok(
          cityRoads.some(
            (r) => distanceToRoad(p.x, p.z, r) <= r.width / 2 + 1,
          ) ||
            CITY_PARKING.some((lot) => contains(lot, p, 1)) ||
            contains(parcel, p, 1),
          `${stop.id}: route cuts across a block at ${p.x.toFixed(2)},${p.z.toFixed(2)}`,
        );
        // The final GPS leg must enter usable pavement, rather than a pump.
        if (contains(parcel, p)) {
          const pose = citySurfacePose(p.x, p.z, heading);
          assert.equal(
            cityCarBlocked(p.x, p.z, heading, pose.elevation),
            false,
            `${stop.id}: GPS drives into forecourt furniture at ${p.x.toFixed(2)},${p.z.toFixed(2)}`,
          );
        }
      }
    }
    t.diagnostic(
      `${stop.id}: ${cityRouteLength(route).toFixed(1)}m / ${route.length} GPS points`,
    );
  }
});

void test('fourteen landmark models stay local, finite and below 35k triangles with generic station lettering', (t) => {
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const labels = [];
  // CanvasTexture needs only a canvas-like image until WebGL upload. This
  // records actual facade text, including both signs, without a browser/DOM.
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (name) => {
        assert.equal(name, 'canvas');
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            fillText: (text) => labels.push(text),
          }),
        };
      },
    },
  });
  const kit = new RenderKit(new THREE.Scene());
  let triangles = 0;
  try {
    assert.equal(buildings.length, 14);
    for (const b of buildings) {
      labels.length = 0;
      const root = new THREE.Group();
      assert.equal(createRightBankLandmark(kit, root, b), true, idOf(b));
      const model = root.getObjectByName(`landmark:${b.kind}`);
      assert.ok(model, idOf(b));
      assert.equal(
        model.position.y,
        0,
        `${idOf(b)} terrain lift belongs to the caller`,
      );
      assert.deepEqual([model.position.x, model.position.z], [b.x, b.z]);
      if (b.kind === 'fuel') {
        assert.deepEqual(
          labels,
          ['ЗАПРАВКА', 'ЗАПРАВКА'],
          'both station signs use the requested generic text',
        );
        assert.equal(model.userData.landmarkName, 'Заправка');
      }
      root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(root);
      assert.ok(bounds.min.y >= -0.01, `${idOf(b)} starts at ground`);
      assert.ok(
        bounds.max.y <= b.h + 1.6,
        `${idOf(b)} roof equipment fits its vertical envelope`,
      );
      const footprint = corners(b);
      assert.ok(
        bounds.min.x >= Math.min(...footprint.map((p) => p.x)) - 0.01 &&
          bounds.max.x <= Math.max(...footprint.map((p) => p.x)) + 0.01,
        `${idOf(b)} fits width`,
      );
      assert.ok(
        bounds.min.z >= Math.min(...footprint.map((p) => p.z)) - 0.01 &&
          bounds.max.z <= Math.max(...footprint.map((p) => p.z)) + 0.01,
        `${idOf(b)} fits depth`,
      );
      root.traverse((o) => {
        if (!o.isMesh) return;
        const positions = o.geometry.attributes.position;
        assert.ok(positions && positions.count > 0, `${idOf(b)} has geometry`);
        assert.ok(
          Array.from(positions.array).every(Number.isFinite),
          `${idOf(b)} has finite vertices`,
        );
        triangles += (o.geometry.index?.count ?? positions.count) / 3;
      });
    }
    assert.ok(
      triangles > 15000 && triangles < 35000,
      `${triangles} triangles for all fourteen landmarks including text`,
    );
    t.diagnostic(
      `${triangles} triangles across 1 Aerokos, 1 fighter, 6 Zori houses and 6 gas stations`,
    );
  } finally {
    kit.dispose();
    if (priorDocument)
      Object.defineProperty(globalThis, 'document', priorDocument);
    else delete globalThis.document;
  }
});
