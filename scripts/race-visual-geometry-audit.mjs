#!/usr/bin/env node
/** Read-only audit of the checkout's actual Three.js Nordschleife geometry.
 * Usage: node scripts/race-visual-geometry-audit.mjs [checkout] [--step 2]
 * Optional: --camera path/to/module.ts#exportName
 * Camera export signature: ({course,sample,speed,aspect,heightAt}) =>
 *   {position:{x,y,z}, target?:{x,y,z}}. It must be the runtime's pure helper.
 * Exit 1 means geometry defects; --report-only retains exit 0 for comparison.
 * Bundling is in memory; this script never writes to the checkout.
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2);
const root = resolve(
  args[0] && !args[0].startsWith('--') ? args.shift() : process.cwd(),
);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
};
const spacing = Number(option('--step', '2'));
if (!(spacing > 0 && spacing <= 20))
  throw new Error('--step must be >0 and <=20 metres');
const cameraSpec = option('--camera', null),
  reportOnly = args.includes('--report-only');
const require = createRequire(resolve(root, 'package.json'));
const { build } = require('esbuild');
const cameraFile = cameraSpec?.split('#')[0],
  cameraName = cameraSpec?.split('#')[1] ?? 'raceCameraPose';
const hasClearCamera = existsSync(resolve(root, 'lib/game/race/camera.ts'));
const paths = [
  'components/game/race/nordschleife.ts',
  'lib/game/race/course.ts',
  'components/game/race/scene.tsx',
];
for (const file of [
  'lib/game/race/terrain.ts',
  'lib/game/race/camera.ts',
  'lib/game/race/nordschleife-arcade.ts',
])
  if (existsSync(resolve(root, file))) paths.push(file);
if (cameraFile) paths.push(cameraFile);
const sources = Object.fromEntries(
  paths.map((file) => [
    file,
    createHash('sha256')
      .update(readFileSync(resolve(root, file)))
      .digest('hex'),
  ]),
);
const entry = `
import * as THREE from 'three';
export {THREE};
export {RenderKit} from './components/game/world/render-kit.ts';
export {createNordschleife} from './components/game/race/nordschleife.ts';
export {nordschleifeCourse as course} from './lib/game/race/course.ts';
${hasClearCamera ? "export {clearRaceCamera,raceCameraFraming} from './lib/game/race/camera.ts';" : ''}
${cameraSpec ? `export {${cameraName} as cameraPose} from ${JSON.stringify(isAbsolute(cameraFile) ? cameraFile : './' + cameraFile)};` : ''}
`;
const compiled = await build({
  stdin: {
    contents: entry,
    resolveDir: root,
    loader: 'ts',
    sourcefile: 'nord-audit-entry.ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const runtime = await import(
  'data:text/javascript;base64,' +
    Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const { THREE, RenderKit, createNordschleife, course } = runtime;
const scene = new THREE.Scene(),
  kit = new RenderKit(scene);
const memoryBefore = process.memoryUsage(),
  generateStarted = performance.now();
const generated = createNordschleife(kit, course);
const generationMs = performance.now() - generateStarted,
  memoryAfter = process.memoryUsage();
scene.updateMatrixWorld(true);
const named = (prefix) => {
  const result = [];
  scene.traverse((o) => {
    if (
      o.isMesh &&
      !o.isInstancedMesh &&
      (o.name === prefix || o.name.startsWith(prefix + '-'))
    )
      result.push(o);
  });
  return result;
};
let terrain = named('nord-terrain'),
  asphalt = named('nord-asphalt');
const namingFallback = !terrain.length || !asphalt.length;
if (namingFallback) {
  terrain = terrain.length ? terrain : [scene.children[0]];
  asphalt = asphalt.length ? asphalt : [scene.children[1]];
}
if ([...terrain, ...asphalt].some((m) => !m?.isMesh))
  throw new Error('Cannot identify nord-terrain/nord-asphalt actual meshes');
const heightAt = generated?.heightAt;
const cacheMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
/** Index exact transformed render triangles. Raycaster sees the same triangles,
 * with a spatial broad phase instead of re-scanning the full circuit per ray.
 * DoubleSide also catches hidden underside/fold geometry, independent of color.
 */
function indexMeshes(meshes) {
  const triangles = [],
    grid = new Map(),
    cell = 20,
    cache = new Map();
  let up = 0,
    down = 0,
    degenerate = 0;
  const vector = new THREE.Vector3();
  for (const mesh of meshes) {
    const geometry = mesh.geometry,
      p = geometry.attributes.position,
      index = geometry.index,
      count = index?.count ?? p.count;
    for (let offset = 0; offset < count; offset += 3) {
      const v = [];
      for (let k = 0; k < 3; k++) {
        const id = index ? index.getX(offset + k) : offset + k;
        vector.fromBufferAttribute(p, id).applyMatrix4(mesh.matrixWorld);
        v.push(vector.clone());
      }
      const normalY =
        (v[1].z - v[0].z) * (v[2].x - v[0].x) -
        (v[1].x - v[0].x) * (v[2].z - v[0].z);
      if (Math.abs(normalY) < 1e-7) degenerate++;
      else if (normalY > 0) up++;
      else down++;
      const id = triangles.length;
      triangles.push({ v, name: mesh.name, face: offset / 3 });
      for (
        let x = Math.floor(Math.min(...v.map((p) => p.x)) / cell);
        x <= Math.floor(Math.max(...v.map((p) => p.x)) / cell);
        x++
      )
        for (
          let z = Math.floor(Math.min(...v.map((p) => p.z)) / cell);
          z <= Math.floor(Math.max(...v.map((p) => p.z)) / cell);
          z++
        ) {
          const key = `${x},${z}`,
            bucket = grid.get(key) ?? [];
          bucket.push(id);
          grid.set(key, bucket);
        }
    }
  }
  const candidateMesh = (minX, maxX, minZ, maxZ) => {
    const x0 = Math.floor(minX / cell),
      x1 = Math.floor(maxX / cell),
      z0 = Math.floor(minZ / cell),
      z1 = Math.floor(maxZ / cell),
      key = `${x0},${x1},${z0},${z1}`;
    if (cache.has(key)) return cache.get(key);
    const ids = new Set();
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        for (const id of grid.get(`${x},${z}`) ?? []) ids.add(id);
    const vertices = [];
    for (const id of ids)
      for (const v of triangles[id].v) vertices.push(v.x, v.y, v.z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, cacheMaterial);
    mesh.userData.sourceIds = [...ids];
    mesh.updateMatrixWorld();
    cache.set(key, mesh);
    return mesh;
  };
  const cast = (origin, end) => {
    const dir = end.clone().sub(origin),
      length = dir.length();
    if (length < 1e-8) return [];
    const mesh = candidateMesh(
      Math.min(origin.x, end.x),
      Math.max(origin.x, end.x),
      Math.min(origin.z, end.z),
      Math.max(origin.z, end.z),
    );
    return new THREE.Raycaster(origin, dir.divideScalar(length), 0, length)
      .intersectObject(mesh, false)
      .map((hit) => ({
        ...hit,
        source: triangles[mesh.userData.sourceIds[hit.faceIndex]],
      }));
  };
  let top = -Infinity,
    bottom = Infinity;
  for (const triangle of triangles)
    for (const vertex of triangle.v) {
      top = Math.max(top, vertex.y);
      bottom = Math.min(bottom, vertex.y);
    }
  top += 100;
  bottom -= 100;
  return {
    triangles: triangles.length,
    up,
    down,
    degenerate,
    cast,
    vertical: (x, z) =>
      cast(new THREE.Vector3(x, top, z), new THREE.Vector3(x, bottom, z)),
    dispose: () => {
      for (const mesh of cache.values()) mesh.geometry.dispose();
    },
  };
}
const embankments = named('nord-embankment');
const roadIndex = indexMeshes(asphalt),
  heightfieldIndex = indexMeshes(terrain),
  groundIndex = embankments.length
    ? indexMeshes([...terrain, ...embankments])
    : heightfieldIndex;
const round = (n) => Number(n.toFixed(4));
const evidence = (p, other = {}) => ({
  d: round(p.distance),
  name: p.name,
  x: round(p.x),
  z: round(p.z),
  ...other,
});
const topFew = (items, key, count = 8) =>
  items.sort((a, b) => b[key] - a[key]).slice(0, count);
const coverage = [];
for (const lateralFactor of [-0.98, -0.75, 0, 0.75, 0.98]) {
  let total = 0,
    missing = 0,
    covered = 0,
    nearCoincident = 0,
    minClearance = Infinity,
    maxRoadHeightError = 0,
    maxSamplerError = 0;
  const examples = [];
  for (let d = 0; d < course.length; d += spacing) {
    const p = course.sample(d),
      lateral = course.halfWidth * lateralFactor,
      x = p.x - p.dz * lateral,
      z = p.z + p.dx * lateral,
      expected = course.closest(x, z).y;
    const roadHits = roadIndex.vertical(x, z),
      roadHit = roadHits.sort(
        (a, b) =>
          Math.abs(a.point.y - expected) - Math.abs(b.point.y - expected),
      )[0];
    total++;
    if (!roadHit || Math.abs(roadHit.point.y - expected) > 0.35) {
      missing++;
      if (examples.length < 8)
        examples.push(
          evidence(p, {
            kind: 'missing-asphalt',
            lateral,
            expectedY: round(expected),
            actualY: roadHit ? round(roadHit.point.y) : null,
          }),
        );
      continue;
    }
    maxRoadHeightError = Math.max(
      maxRoadHeightError,
      Math.abs(roadHit.point.y - expected),
    );
    const ground = groundIndex.vertical(x, z)[0];
    if (ground) {
      const gap = roadHit.point.y - ground.point.y;
      minClearance = Math.min(minClearance, gap);
      if (gap < 0.02) nearCoincident++;
      if (gap < -0.02) {
        covered++;
        examples.push(
          evidence(p, {
            kind: 'terrain-over-road',
            over: round(-gap),
            lateral,
            roadY: round(roadHit.point.y),
            terrainY: round(ground.point.y),
            face: ground.source.face,
          }),
        );
      }
      if (heightAt) {
        const h = heightAt(x, z),
          field = heightfieldIndex.vertical(x, z)[0];
        if (Number.isFinite(h) && field)
          maxSamplerError = Math.max(
            maxSamplerError,
            Math.abs(h - field.point.y),
          );
        else maxSamplerError = Infinity;
      }
    }
  }
  coverage.push({
    lateralFactor,
    total,
    missingAsphalt: missing,
    terrainOverRoad: covered,
    nearCoincident,
    minClearance: Number.isFinite(minClearance) ? round(minClearance) : null,
    maxRoadHeightError: round(maxRoadHeightError),
    heightSamplerVsMeshMaxError: heightAt ? round(maxSamplerError) : null,
    examples: topFew(examples, 'over'),
  });
}
function legacyCamera({ sample: p, speed, aspect }) {
  const framing = runtime.raceCameraFraming?.(speed, aspect) ?? {
    lead: 4 + speed * 0.35,
    distance: (12 + speed * 0.32) * Math.max(1, 0.9 / aspect),
    height: 7 + speed * 0.12,
  };
  const { lead, distance: back, height } = framing;
  return {
    position: {
      x: p.x + p.dx * (lead - back),
      y: p.y + 0.8 + height,
      z: p.z + p.dz * (lead - back),
    },
    target: { x: p.x + p.dx * lead, y: p.y + 0.8, z: p.z + p.dz * lead },
  };
}
function clearedSteadyCamera(options) {
  const pose = legacyCamera(options);
  if (runtime.clearRaceCamera && heightAt)
    pose.position = runtime.clearRaceCamera(
      pose.position,
      { x: options.sample.x, y: options.sample.y + 0.04, z: options.sample.z },
      heightAt,
    );
  return pose;
}
const cameraPose = runtime.cameraPose ?? clearedSteadyCamera,
  cameras = [];
for (const [view, aspect] of [
  ['solo', 16 / 9],
  ['split', 8 / 9],
])
  for (const speed of [0, 15, 30, 50]) {
    let total = 0,
      buried = 0,
      occluded = 0,
      maxDepth = 0,
      carClipped = 0,
      minCarScreenY = Infinity,
      maxCarScreenY = -Infinity,
      maxCarAbsX = 0;
    const examples = [];
    for (let d = 0; d < course.length; d += spacing) {
      const p = course.sample(d),
        pose = cameraPose({ course, sample: p, speed, aspect, heightAt });
      const from = new THREE.Vector3(
          pose.position.x,
          pose.position.y,
          pose.position.z,
        ),
        car = new THREE.Vector3(p.x, p.y + 0.04, p.z);
      total++;
      if (![from.x, from.y, from.z].every(Number.isFinite))
        throw new Error('Camera helper returned non-finite position');
      const ground = groundIndex.vertical(from.x, from.z)[0],
        depth = ground ? ground.point.y - from.y : -Infinity;
      if (depth > 0) {
        buried++;
        maxDepth = Math.max(maxDepth, depth);
        examples.push(
          evidence(p, {
            kind: 'camera-under-terrain',
            depth: round(depth),
            camera: from.toArray().map(round),
          }),
        );
      }
      // Conservative combined Mustang/AMG body box (2.4m wide, 5.2m long, 1.7m high),
      // yaw along the path and pitch matching the engine's front/rear axle sampling.
      const target = pose.target ?? {
        x: p.x + p.dx * 4,
        y: p.y + 0.8,
        z: p.z + p.dz * 4,
      };
      const camera = new THREE.PerspectiveCamera(57, aspect, 0.15, 600);
      camera.position.copy(from);
      camera.lookAt(target.x, target.y, target.z);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      const pitch = Math.atan2(
        course.closest(p.x + p.dx * 1.35, p.z + p.dz * 1.35).y -
          course.closest(p.x - p.dx * 1.35, p.z - p.dz * 1.35).y,
        2.7,
      );
      const rotation = new THREE.Euler(
        pitch,
        -Math.atan2(p.dx, -p.dz),
        0,
        'YXZ',
      );
      let clipped = false;
      for (const x of [-1.2, 1.2])
        for (const y of [0, 1.7])
          for (const z of [-2.6, 2.6]) {
            const ndc = new THREE.Vector3(x, y, z)
              .applyEuler(rotation)
              .add(car)
              .project(camera);
            minCarScreenY = Math.min(minCarScreenY, ndc.y);
            maxCarScreenY = Math.max(maxCarScreenY, ndc.y);
            maxCarAbsX = Math.max(maxCarAbsX, Math.abs(ndc.x));
            if (
              Math.abs(ndc.x) > 1 ||
              Math.abs(ndc.y) > 1 ||
              ndc.z < -1 ||
              ndc.z > 1
            )
              clipped = true;
          }
      if (clipped) {
        carClipped++;
        if (examples.length < 8)
          examples.push(
            evidence(p, { kind: 'car-envelope-clipped', depth: 0 }),
          );
      }
      const hit = groundIndex
        .cast(from, car)
        .find(
          (h) => h.distance > 0.15 && h.distance < from.distanceTo(car) - 0.15,
        );
      if (hit) {
        occluded++;
        if (examples.length < 8)
          examples.push(
            evidence(p, {
              kind: 'terrain-between-camera-and-car',
              depth: 0,
              distance: round(hit.distance),
              point: hit.point.toArray().map(round),
            }),
          );
      }
    }
    cameras.push({
      view,
      aspect,
      speed,
      total,
      buried,
      occluded,
      maxDepth: round(maxDepth),
      carProjection: {
        envelope:
          'conservative 2.4x1.7x5.2m box, pitch+yaw, no steering/body-roll animation',
        clipped: carClipped,
        minNdcY: round(minCarScreenY),
        maxNdcY: round(maxCarScreenY),
        maxAbsNdcX: round(maxCarAbsX),
      },
      examples: topFew(examples, 'depth'),
    });
  }
const arrays = new Set();
let geometryBytes = 0,
  renderTriangles = 0,
  drawMeshes = 0;
scene.traverse((o) => {
  if (!o.isMesh) return;
  drawMeshes++;
  const g = o.geometry;
  renderTriangles +=
    ((g.index?.count ?? g.attributes.position.count) / 3) *
    (o.isInstancedMesh ? o.count : 1);
  for (const attribute of [
    ...Object.values(g.attributes),
    g.index,
    o.instanceMatrix,
    o.instanceColor,
  ])
    if (attribute && !arrays.has(attribute.array)) {
      arrays.add(attribute.array);
      geometryBytes += attribute.array.byteLength;
    }
});
const geometryStats = {
  generationMs: round(generationMs),
  drawMeshes,
  renderTriangles,
  geometryMiB: round(geometryBytes / 1024 ** 2),
  terrainVertices: terrain.reduce(
    (n, m) => n + m.geometry.attributes.position.count,
    0,
  ),
  terrainTriangles: heightfieldIndex.triangles,
  netHeapDeltaMiB: round(
    (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 ** 2,
  ),
  netArrayBufferDeltaMiB: round(
    (memoryAfter.arrayBuffers - memoryBefore.arrayBuffers) / 1024 ** 2,
  ),
  note: 'CPU construction only; memory deltas are net, not peak; no browser/GPU render benchmark',
};
const defects =
  roadIndex.down +
  roadIndex.degenerate +
  coverage.reduce((n, c) => n + c.missingAsphalt + c.terrainOverRoad, 0) +
  cameras.reduce(
    (n, c) => n + c.buried + c.occluded + c.carProjection.clipped,
    0,
  );
console.log(
  JSON.stringify(
    {
      root,
      sources,
      course: {
        length: course.length,
        points: course.points.length,
        halfWidth: course.halfWidth,
      },
      samplingMetres: spacing,
      geometryStats,
      actualMeshes: {
        terrain: terrain.map((m) => m.name || '(legacy first mesh)'),
        embankments: embankments.map((m) => m.name),
        asphalt: asphalt.map((m) => m.name || '(legacy second mesh)'),
        namingFallback,
      },
      raycast:
        'actual transformed render triangles, Three.Raycaster, double-sided safety check',
      cameraModel:
        cameraSpec ??
        (runtime.clearRaceCamera
          ? 'actual raceCameraFraming + clearRaceCamera(desired, model root y=sample.y+.04, heightAt); temporal heading/target lag not simulated'
          : 'legacy steady chase equations from scene.tsx; no terrain correction or temporal heading/target lag simulated'),
      heightSampler: typeof heightAt === 'function',
      asphaltTriangles: {
        total: roadIndex.triangles,
        up: roadIndex.up,
        inverted: roadIndex.down,
        degenerate: roadIndex.degenerate,
      },
      coverage,
      cameras,
      defects,
      pass: defects === 0,
    },
    null,
    2,
  ),
);
roadIndex.dispose();
groundIndex.dispose();
if (groundIndex !== heightfieldIndex) heightfieldIndex.dispose();
cacheMaterial.dispose();
kit.dispose();
if (defects && !reportOnly) process.exitCode = 1;
