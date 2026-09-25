import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const mod = (p) => import(pathToFileURL(root + '/' + p));
const THREE = await mod('node_modules/three/build/three.module.js');
const { cityBuildings } = await mod('lib/game/city/layout.ts');
const { createBobrovyLog } = await mod('components/game/city/bobrovy-log.ts');
const { createCityArt } = await mod('components/game/city/city-art.ts');
const { cityGroundHeight } = await mod('lib/game/city/surface.ts');
const { RenderKit } = await mod('components/game/world/render-kit.ts');
const { createRightBankLandmark } = await mod(
  'components/game/city/right-bank-landmarks.ts',
);
const { createCentreLandmark } = await mod(
  'components/game/city/centre-landmarks.ts',
);
const { createDistrictLandmark } = await mod(
  'components/game/city/district-landmarks.ts',
);
const { createCivicBuilding, createApartmentDetails, createStationRoof } =
  await mod('components/game/city/krasnoyarsk.ts');
const { createNeighbourhoodBuilding } = await mod(
  'components/game/city/neighbourhoods.ts',
);
// Labels/atlas pixels do not affect geometry. The generator never invokes WebGL.
const ctx = new Proxy(
  { measureText: (t) => ({ width: t.length * 18 }) },
  { get: (t, p) => (p in t ? t[p] : () => {}) },
);
if (typeof globalThis.document === 'undefined')
  Reflect.set(globalThis, 'document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  });
export function buildBuilding(b, index) {
  const scene = new THREE.Scene(),
    kit = new RenderKit(scene),
    group = new THREE.Group();
  scene.add(group);
  const lit = kit.material('#f3d5a3');
  if (b.kind === 'bobrovy-log' || b.kind === 'city-art') {
    const area =
      b.kind === 'bobrovy-log'
        ? createBobrovyLog(kit, group).root
        : createCityArt(kit, group);
    // Those special builders already apply world ground elevation. Select the
    // authored parcel group, excluding terrain, chair lifts and nearby props.
    const part = area.children.find(
      (child) =>
        Math.abs(child.position.x - b.x) < 0.01 &&
        Math.abs(child.position.z - b.z) < 0.01,
    );
    if (part) {
      group.add(part);
      group.remove(area);
      group.position.y = -cityGroundHeight(b.x, b.z);
    } else group.remove(area);
    group.updateMatrixWorld(true);
    return { kit, group };
  }
  if (
    createRightBankLandmark(kit, group, b) ||
    createCentreLandmark(kit, group, b) ||
    createDistrictLandmark(kit, group, b) ||
    createCivicBuilding(kit, group, b, lit) ||
    createNeighbourhoodBuilding(kit, group, b, index)
  ) {
    group.updateMatrixWorld(true);
    return { kit, group };
  }
  createApartmentDetails(kit, group, b, index);
  kit.box(b.w, b.h, b.d, b.color, b.x, b.h / 2, b.z, group, 0);
  kit.box(
    b.w + 0.16,
    0.16,
    b.d + 0.16,
    '#68787a',
    b.x,
    b.h + 0.08,
    b.z,
    group,
    0,
  );
  if (b.kind === 'station') {
    createStationRoof(kit, group, b);
    kit.box(4.6, 2.2, b.d + 0.4, '#e4dfd3', b.x, b.h + 0.8, b.z, group, 0);
  }
  group.updateMatrixWorld(true);
  return { kit, group };
}
/** Fingerprint every relative geometry dependency plus this exporter. The
 * generated data and its runtime query are excluded to avoid self-reference. */
export function roofSourceFingerprint() {
  const sources = new Set();
  function visit(file) {
    file = resolve(file);
    if (
      sources.has(file) ||
      file.endsWith('/roofs.ts') ||
      file.endsWith('/roofs.generated.json')
    )
      return;
    sources.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(
      /(?:from\s*|import\s*\()(['"])(\.[^'"\n]+)\1/g,
    )) {
      const path = resolve(dirname(file), match[2]);
      const dependency = [
        path,
        path + '.ts',
        path + '.tsx',
        path + '.mjs',
      ].find((p) => existsSync(p));
      if (dependency) visit(dependency);
    }
  }
  visit(root + '/components/game/city/environment.ts');
  visit(fileURLToPath(import.meta.url));
  const hash = createHash('sha256');
  for (const file of [...sources].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    hash.update(relative(root, file));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  hash.update(readFileSync(root + '/node_modules/three/package.json'));
  return hash.digest('hex');
}
/** Remove only triangles entirely hidden beneath one larger triangle. Barycentric
 * containment and linear height ordering make this exact across the whole face;
 * uncovered slivers and multi-level roofs are deliberately retained. */
function upperEnvelopeTriangles(values) {
  const triangles = [];
  const unique = new Set();
  for (let i = 0; i < values.length; i += 9) {
    const v = values.slice(i, i + 9),
      key = [v.slice(0, 3), v.slice(3, 6), v.slice(6, 9)]
        .map((p) => p.join(','))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .join(';');
    if (unique.has(key)) continue;
    unique.add(key);
    const den = (v[5] - v[8]) * (v[0] - v[6]) + (v[6] - v[3]) * (v[2] - v[8]);
    if (Math.abs(den) < 1e-8) continue;
    triangles.push({
      v,
      den,
      minX: Math.min(v[0], v[3], v[6]),
      maxX: Math.max(v[0], v[3], v[6]),
      minZ: Math.min(v[2], v[5], v[8]),
      maxZ: Math.max(v[2], v[5], v[8]),
      maxY: Math.max(v[1], v[4], v[7]),
    });
  }
  return triangles
    .filter(
      (t) =>
        !triangles.some((other) => {
          if (
            other === t ||
            Math.abs(other.den) < Math.abs(t.den) ||
            other.maxY < t.maxY + 0.001 ||
            other.minX > t.minX ||
            other.maxX < t.maxX ||
            other.minZ > t.minZ ||
            other.maxZ < t.maxZ
          )
            return false;
          const v = other.v;
          for (let i = 0; i < 9; i += 3) {
            const x = t.v[i],
              z = t.v[i + 2],
              a =
                ((v[5] - v[8]) * (x - v[6]) + (v[6] - v[3]) * (z - v[8])) /
                other.den,
              b =
                ((v[8] - v[2]) * (x - v[6]) + (v[0] - v[6]) * (z - v[8])) /
                other.den;
            if (
              a < -1e-8 ||
              b < -1e-8 ||
              a + b > 1 + 1e-8 ||
              a * v[1] + b * v[4] + (1 - a - b) * v[7] < t.v[i + 1] + 0.001
            )
              return false;
          }
          return true;
        }),
    )
    .flatMap((t) => t.v);
}
export function generateRoofCatalogue() {
  const catalogue = [];
  const a = new THREE.Vector3(),
    bvec = new THREE.Vector3(),
    c = new THREE.Vector3(),
    ab = new THREE.Vector3(),
    ac = new THREE.Vector3(),
    normal = new THREE.Vector3();

  for (const [index, b] of cityBuildings.entries()) {
    const { kit, group } = buildBuilding(b, index),
      faces = [],
      undersides = [];
    group.traverse((mesh) => {
      if (!mesh.isMesh || mesh.isSprite) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      if (materials.every((m) => !m.visible)) return;
      const pos = mesh.geometry.attributes.position,
        idx = mesh.geometry.index;
      if (!pos) return;
      const length = idx ? idx.count : pos.count;
      for (let i = 0; i < length; i += 3) {
        a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(
          mesh.matrixWorld,
        );
        bvec
          .fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1)
          .applyMatrix4(mesh.matrixWorld);
        c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(
          mesh.matrixWorld,
        );
        ab.subVectors(bvec, a);
        ac.subVectors(c, a);
        normal.crossVectors(ab, ac);
        if (
          Math.abs(normal.y) <= 1e-8 ||
          Math.abs(normal.y) / normal.length() < 0.2 ||
          Math.max(a.y, bvec.y, c.y) < 1.5
        )
          continue;
        if (
          Math.min(a.x, bvec.x, c.x) > b.x + b.w / 2 + 1 ||
          Math.max(a.x, bvec.x, c.x) < b.x - b.w / 2 - 1 ||
          Math.min(a.z, bvec.z, c.z) > b.z + b.d / 2 + 1 ||
          Math.max(a.z, bvec.z, c.z) < b.z - b.d / 2 - 1
        )
          continue;
        const vertices = [a, bvec, c].flatMap((v) =>
          [v.x - b.x, v.y, v.z - b.z].map(
            (n) => Math.round(n * 1000) / 1000 || 0,
          ),
        );
        const material =
          materials[
            mesh.geometry.groups.find(
              (g) => i >= g.start && i < g.start + g.count,
            )?.materialIndex ?? 0
          ];
        // A two-sided sheet (e.g. a roof ribbon) is solid from either direction,
        // irrespective of its authored winding. Billboards are vertical or Sprites.
        if (normal.y > 0 || material?.side === THREE.DoubleSide)
          faces.push(...vertices);
        if (normal.y < 0 || material?.side === THREE.DoubleSide)
          undersides.push(...vertices);
      }
    });
    kit.dispose();
    if (faces.length) {
      catalogue.push({
        i: index,
        x: b.x,
        z: b.z,
        kind: b.kind ?? b.style ?? 'cube',
        t: upperEnvelopeTriangles(faces),
        u: undersides,
      });
    }
  }
  return {
    version: 1,
    sourceHash: roofSourceFingerprint(),
    buildings: catalogue,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const started = performance.now(),
    catalogue = generateRoofCatalogue();
  const target = root + '/lib/game/city/roofs.generated.json',
    contents = JSON.stringify(catalogue) + '\n';
  if (process.argv.includes('--check')) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== contents)
      throw new Error(
        'Roof catalogue differs from rendered building geometry; run node --experimental-strip-types scripts/generate-city-roofs.mjs',
      );
  } else writeFileSync(target, contents);
  console.log(
    JSON.stringify({
      buildings: catalogue.buildings.length,
      triangles: catalogue.buildings.reduce((n, b) => n + b.t.length / 9, 0),
      jsonBytes: contents.length,
      milliseconds: performance.now() - started,
    }),
  );
}
