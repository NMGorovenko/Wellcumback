import { citySurfaceColors } from './helpers/city-surface-colors.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root = process.env.MALL_AUDIT_ROOT ?? process.cwd();
const source = async (p) => import(pathToFileURL(`${root}/${p}`).href);
const THREE = await source('node_modules/three/build/three.module.js');
const { RenderKit } = await source('components/game/world/render-kit.ts');
const { createMallParking } = await source(
  'components/game/city/mall-landmarks.ts',
);
const { createMallNeighbour } = await source(
  'components/game/city/mall-neighbourhoods.ts',
);
const { liftScenery } = await source('components/game/city/relief.ts');
const { cityBuildings, cityRoads, CITY_PARKING, CITY_OPEN_MALL_GROUNDS } =
  await source('lib/game/city/layout.ts');
const { cityGroundHeight, cityRoadHeight, citySurfacePose } = await source(
  'lib/game/city/surface.ts',
);
const { cityCarBlocked, cityTravelArrival } = await source(
  'lib/game/city/engine.ts',
);
const { kachaParcelClear } = await source('lib/game/city/kacha.ts');
const newKinds = [
  'neo-hotel',
  'central-market',
  'belinskogo-office',
  'bus-shelter',
];
const ordinaryLots = CITY_PARKING.filter(
  (p) => !p.id.startsWith('fuel-') && p.id !== 'kubatura',
);
const roadPrefixes = [
  'neo-market-access:',
  'kvant-forecourt:',
  'planeta-forecourt:',
  'planeta-service:',
  'belinskogo-office-access:',
  'komsomoll-forecourt:',
];
function triangles(mesh, each) {
  const p = mesh.geometry.attributes.position,
    ix = mesh.geometry.index;
  for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
    const v = [0, 1, 2].map((j) =>
      new THREE.Vector3()
        .fromBufferAttribute(p, ix ? ix.getX(i + j) : i + j)
        .applyMatrix4(mesh.matrixWorld),
    );
    each(v);
  }
}
function pointSegmentDistance(x, z, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)),
    );
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}
function roadGap(b, r) {
  const c = Math.cos(b.angle ?? 0),
    s = Math.sin(b.angle ?? 0),
    local = (p) => ({
      x: (p.x - b.x) * c - (p.z - b.z) * s,
      z: (p.x - b.x) * s + (p.z - b.z) * c,
    });
  const a = local(r.from),
    p = local(r.to),
    w = b.w / 2,
    d = b.d / 2;
  let enter = 0,
    leave = 1;
  for (const [o, delta, h] of [
    [a.x, p.x - a.x, w],
    [a.z, p.z - a.z, d],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(o) > h) {
        enter = 2;
        break;
      }
    } else {
      const t = (-h - o) / delta,
        u = (h - o) / delta;
      enter = Math.max(enter, Math.min(t, u));
      leave = Math.min(leave, Math.max(t, u));
    }
  }
  if (enter <= leave) return -r.width / 2;
  let distance = Math.min(
    ...[a, p].map((q) =>
      Math.hypot(
        Math.max(0, Math.abs(q.x) - w),
        Math.max(0, Math.abs(q.z) - d),
      ),
    ),
  );
  for (const x of [-w, w])
    for (const z of [-d, d])
      distance = Math.min(distance, pointSegmentDistance(x, z, a, p));
  return distance - r.width / 2;
}
void test('all ordinary parking triangle interiors and paint follow the physical height field', (t) => {
  const kit = new RenderKit(new THREE.Scene()),
    g = new THREE.Group();
  try {
    createMallParking(kit, g);
    liftScenery(kit, g, cityGroundHeight);
    g.updateMatrixWorld(true);
    for (const lot of ordinaryLots) {
      const mesh = g.getObjectByName(`parking:${lot.id}:pavement`);
      assert.ok(mesh?.isMesh, lot.id);
      let max = 0,
        probes = 0,
        worst;
      triangles(mesh, (v) => {
        for (const weights of [
          [1 / 3, 1 / 3, 1 / 3],
          [0.8, 0.1, 0.1],
          [0.1, 0.8, 0.1],
          [0.1, 0.1, 0.8],
        ]) {
          const p = new THREE.Vector3();
          v.forEach((q, i) => p.addScaledVector(q, weights[i]));
          const error = Math.abs(p.y - cityGroundHeight(p.x, p.z) - 0.09);
          if (error > max) {
            max = error;
            worst = { x: p.x, z: p.z };
          }
          probes++;
        }
      });
      t.diagnostic(
        `${lot.id}: ${probes} triangle-interior samples, max error ${max.toFixed(5)} at ${JSON.stringify(worst)}`,
      );
      assert.ok(probes > 100, `complete rendered lot ${lot.id}`);
      assert.ok(
        max < 0.045,
        `${lot.id} floating/buried by ${max} near ${JSON.stringify(worst)}`,
      );
    }
    let paintProbes = 0,
      maxPaint = 0;
    for (const lot of ordinaryLots)
      g.getObjectByName(`parking:${lot.id}`).traverse((mesh) => {
        if (
          !mesh.isMesh ||
          Array.isArray(mesh.material) ||
          mesh.material.color?.getHexString() !== 'e4dfd3' ||
          !mesh.userData.reliefPlaced
        )
          return;
        triangles(mesh, (v) => {
          const p = v[0]
            .clone()
            .add(v[1])
            .add(v[2])
            .multiplyScalar(1 / 3);
          maxPaint = Math.max(
            maxPaint,
            Math.abs(p.y - cityGroundHeight(p.x, p.z) - 0.11),
          );
          paintProbes++;
        });
      });
    t.diagnostic(
      `${paintProbes} marking interiors; maximum height error ${maxPaint}`,
    );
    assert.ok(paintProbes > 100);
    assert.ok(maxPaint < 0.02);
  } finally {
    kit.dispose();
  }
});
void test('private pavements never overlap road lanes and access admits the complete car', (t) => {
  const kit = new RenderKit(new THREE.Scene()),
    g = new THREE.Group();
  try {
    createMallParking(kit, g);
    g.updateMatrixWorld(true);
    const pavement = ordinaryLots.map((p) =>
      g.getObjectByName(`parking:${p.id}:pavement`),
    );
    const ray = new THREE.Raycaster(
      new THREE.Vector3(),
      new THREE.Vector3(0, -1, 0),
    );
    let count = 0,
      maxGrade = 0;
    const failed = [];
    for (const r of cityRoads.filter((r) =>
      roadPrefixes.some((p) => r.id.startsWith(p)),
    )) {
      const dx = r.to.x - r.from.x,
        dz = r.to.z - r.from.z,
        length = Math.hypot(dx, dz),
        heading = Math.atan2(dx, -dz);
      for (let along = 2; along < length - 2; along += 1)
        for (const side of [-r.width / 2 + 2, 0, r.width / 2 - 2]) {
          const x = r.from.x + (dx * along) / length - (dz * side) / length,
            z = r.from.z + (dz * along) / length + (dx * side) / length;
          const y = cityRoadHeight(r, x, z);
          ray.ray.origin.set(x, 200, z);
          assert.equal(
            ray.intersectObjects(pavement).length,
            0,
            `private pavement overlays ${r.id} ${x},${z}`,
          );
          if (cityCarBlocked(x, z, heading, y))
            failed.push({ road: r.id, x, z, side });
          const next = cityRoadHeight(
            r,
            x + (dx / length) * 0.5,
            z + (dz / length) * 0.5,
          );
          maxGrade = Math.max(maxGrade, Math.abs(next - y) / 0.5);
          const pose = citySurfacePose(x, z, heading, y, `road:${r.id}`);
          assert.ok(Math.abs(pose.elevation - y) < 0.12, r.id);
          count++;
        }
    }
    t.diagnostic(
      `${count} car/road samples, max longitudinal grade ${(maxGrade * 100).toFixed(2)}%; failures ${JSON.stringify(failed.slice(0, 8))}`,
    );
    assert.equal(failed.length, 0);
    assert.ok(maxGrade < 0.18);
    assert.ok(count > 600);
    for (const id of ['kvant', 'planeta', 'komsomoll'])
      assert.ok(cityTravelArrival(id), `valid safe arrival ${id}`);
  } finally {
    kit.dispose();
  }
});
void test('new neighbour parcels and rotated shelters clear roads and their models fit collision bounds', (t) => {
  const failures = [];
  const corners = (b) =>
    [-1, 1].flatMap((x) =>
      [-1, 1].map((z) => ({
        x:
          b.x +
          ((x * b.w) / 2) * Math.cos(b.angle ?? 0) +
          ((z * b.d) / 2) * Math.sin(b.angle ?? 0),
        z:
          b.z -
          ((x * b.w) / 2) * Math.sin(b.angle ?? 0) +
          ((z * b.d) / 2) * Math.cos(b.angle ?? 0),
      })),
    );
  const overlaps = (a, b) => {
    const aa = corners(a),
      bb = corners(b);
    return [a.angle ?? 0, b.angle ?? 0]
      .flatMap((angle) => [
        { x: Math.cos(angle), z: -Math.sin(angle) },
        { x: Math.sin(angle), z: Math.cos(angle) },
      ])
      .every((n) => {
        const v = aa.map((p) => p.x * n.x + p.z * n.z),
          w = bb.map((p) => p.x * n.x + p.z * n.z);
        return (
          Math.max(...v) > Math.min(...w) && Math.max(...w) > Math.min(...v)
        );
      });
  };
  for (const b of cityBuildings.filter((b) => newKinds.includes(b.kind))) {
    for (const other of cityBuildings)
      if (other !== b)
        assert.ok(
          !overlaps(b, other),
          `${b.kind} overlaps ${other.kind ?? other.style} at ${other.x},${other.z}`,
        );
    let closest = { gap: Infinity };
    for (const r of cityRoads) {
      const gap = roadGap(b, r);
      if (gap < closest.gap) closest = { gap, road: r.id };
    }
    t.diagnostic(
      `${b.kind}@${b.x},${b.z}: road gap ${JSON.stringify(closest)}`,
    );
    assert.ok(closest.gap >= 1, `${b.kind} touches ${JSON.stringify(closest)}`);
    assert.ok(
      kachaParcelClear(b.x, b.z, b.w, b.d, 0),
      `${b.kind} crosses Kacha`,
    );
    const kit = new RenderKit(new THREE.Scene()),
      g = new THREE.Group();
    try {
      assert.ok(createMallNeighbour(kit, g, b));
      g.updateMatrixWorld(true);
      const inverse = new THREE.Matrix4()
        .copy(g.children[0].matrixWorld)
        .invert();
      let overflow = 0;
      g.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const p = mesh.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const v = new THREE.Vector3()
            .fromBufferAttribute(p, i)
            .applyMatrix4(mesh.matrixWorld)
            .applyMatrix4(inverse);
          overflow = Math.max(
            overflow,
            Math.abs(v.x) - b.w / 2,
            Math.abs(v.z) - b.d / 2,
            v.y - b.h,
            -v.y,
          );
        }
      });
      if (overflow > 0.011) failures.push({ kind: b.kind, overflow });
    } finally {
      kit.dispose();
    }
  }
  t.diagnostic(`model overshoots ${JSON.stringify(failures)}`);
  assert.equal(failures.length, 0);
  assert.ok(!cityRoads.some((r) => r.id.startsWith('planeta-parking:')));
  for (const p of CITY_OPEN_MALL_GROUNDS)
    for (const b of cityBuildings.filter((b) => !b.kind))
      assert.ok(
        Math.abs(b.x - p.x) >= (b.w + p.w) / 2 ||
          Math.abs(b.z - p.z) >= (b.d + p.d) / 2,
        `residential infill inside mall grounds ${JSON.stringify(b)}`,
      );
});
void test('assembled city replaces ground under every lot without leaving holes at street cuts', async (t) => {
  const { createCityEnvironment } = await source(
    'components/game/city/environment.ts',
  );
  const oldDocument = globalThis.document;
  Reflect.set(globalThis, 'document', {
    createElement: () => ({
      width: 1024,
      height: 1024,
      getContext: () => new Proxy({}, { get: () => () => {} }),
    }),
  });
  const kit = new RenderKit(new THREE.Scene());
  try {
    const city = createCityEnvironment(kit);
    city.root.updateMatrixWorld(true);
    const bins = new Map(),
      cell = 16;
    const intersectsLot = (a, b, c) =>
      ordinaryLots.some(
        (p) =>
          Math.max(a.x, b.x, c.x) >= p.x - p.w / 2 &&
          Math.min(a.x, b.x, c.x) <= p.x + p.w / 2 &&
          Math.max(a.z, b.z, c.z) >= p.z - p.d / 2 &&
          Math.min(a.z, b.z, c.z) <= p.z + p.d / 2,
      );
    const decoded = citySurfaceColors(city.root);
    for (const [color, meshes] of decoded.colors)
      meshes.forEach((mesh) => {
        const kind =
          color === '82966d'
            ? 'ground'
            : ['68787a', '535b5e', 'b9b9af'].includes(color)
              ? 'paved'
              : undefined;
        if (!kind) return;
        triangles(mesh, ([a, b, c]) => {
          if (!intersectsLot(a, b, c)) return;
          const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
          if (Math.abs(den) < 1e-8) return;
          const tri = { a, b, c, den, kind };
          for (
            let x = Math.floor(Math.min(a.x, b.x, c.x) / cell);
            x <= Math.floor(Math.max(a.x, b.x, c.x) / cell);
            x++
          )
            for (
              let z = Math.floor(Math.min(a.z, b.z, c.z) / cell);
              z <= Math.floor(Math.max(a.z, b.z, c.z) / cell);
              z++
            ) {
              const key = `${x}:${z}`;
              if (!bins.has(key)) bins.set(key, []);
              bins.get(key).push(tri);
            }
        });
      });
    const probe = (x, z) => {
      const hits = [];
      for (const { a, b, c, den, kind } of bins.get(
        `${Math.floor(x / cell)}:${Math.floor(z / cell)}`,
      ) ?? []) {
        const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / den,
          v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / den;
        if (Math.min(u, v, 1 - u - v) >= -1e-6)
          hits.push({ kind, y: u * a.y + v * b.y + (1 - u - v) * c.y });
      }
      return hits;
    };
    const failures = [];
    let count = 0;
    for (const p of ordinaryLots)
      for (let x = p.x - p.w / 2 + 0.37; x < p.x + p.w / 2; x += 2)
        for (let z = p.z - p.d / 2 + 0.41; z < p.z + p.d / 2; z += 2) {
          const hits = probe(x, z),
            ground = hits.filter((h) => h.kind === 'ground'),
            near = hits.filter(
              (h) =>
                h.kind === 'paved' &&
                Math.abs(h.y - cityGroundHeight(x, z)) < 0.6,
            );
          if (ground.length || !near.length)
            failures.push({
              lot: p.id,
              x,
              z,
              ground: ground.map((h) => h.y),
              paved: hits.filter((h) => h.kind === 'paved').map((h) => h.y),
            });
          count++;
        }
    t.diagnostic(
      `${count} assembled-city lot probes; ${failures.length} failed, first ${JSON.stringify(failures.slice(0, 10))}`,
    );
    decoded.dispose();
    assert.equal(failures.length, 0);
    assert.ok(count > 5000);
  } finally {
    Reflect.set(globalThis, 'document', oldDocument);
    kit.dispose();
  }
});
