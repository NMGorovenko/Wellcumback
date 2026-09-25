import * as THREE from 'three';
import type { CityPoint } from '../../../lib/game/city/layout.ts';
import { createRoadPolygonSubtractor } from '../../../lib/game/city/road-surfaces.ts';
import type { RenderKit } from '../world/render-kit.ts';

type HeightAt = (x: number, z: number) => number;
type Polygon = readonly CityPoint[];

// Clip against a half-plane. Shared grid edges produce identical samples on
// adjoining asphalt patches, including thin remnants at curved junctions.
function clip(points: Polygon, axis: 'x' | 'z', bound: number, above: boolean) {
  const result: CityPoint[] = [];
  if (!points.length) return result;
  let previous = points.at(-1)!;
  let a = (previous[axis] - bound) * (above ? 1 : -1);
  for (const point of points) {
    const b = (point[axis] - bound) * (above ? 1 : -1);
    if (a < 0 !== b < 0) {
      const t = a / (a - b);
      result.push({
        x: previous.x + (point.x - previous.x) * t,
        z: previous.z + (point.z - previous.z) * t,
      });
    }
    if (b >= 0) result.push(point);
    previous = point;
    a = b;
  }
  return result;
}

/** Subdivide in world space before lifting: a kilometre-long triangle cannot
 * approximate a hill, and simply lifting its corners buries the middle road. */
export function drapedGeometry(
  polygons: readonly Polygon[],
  heightAt: HeightAt,
  offset = 0,
  cell = 12,
  holes: readonly Polygon[] = [],
  maxHeightError = Infinity,
) {
  const vertices: number[] = [],
    uv: number[] = [];
  const heights = new Map<string, number>();
  const subtract = holes.length
    ? createRoadPolygonSubtractor(holes)
    : undefined;
  function height(p: CityPoint) {
    const key = `${p.x.toFixed(6)}:${p.z.toFixed(6)}`;
    let height = heights.get(key);
    if (height === undefined) {
      height = heightAt(p.x, p.z);
      heights.set(key, height);
    }
    return height;
  }
  function emit(p: CityPoint) {
    vertices.push(p.x, height(p) + offset, p.z);
    uv.push(p.x / 10, p.z / 10);
  }
  function triangle(a: CityPoint, b: CityPoint, c: CityPoint, depth = 0) {
    const area = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    if (Math.abs(area) < 1e-7) return;
    if (Number.isFinite(maxHeightError) && depth < 3) {
      const points = [a, b, c];
      const center = { x: (a.x + b.x + c.x) / 3, z: (a.z + b.z + c.z) / 3 };
      const edge: CityPoint[] = [];
      let refine =
        Math.abs(height(center) - (height(a) + height(b) + height(c)) / 3) >
        maxHeightError;
      for (let i = 0; i < 3; i++) {
        const p = points[i],
          q = points[(i + 1) % 3];
        edge.push(p);
        const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
        // Both triangles sharing a curved edge make the same midpoint choice.
        if (
          Math.abs(height(mid) - (height(p) + height(q)) / 2) > maxHeightError
        ) {
          edge.push(mid);
          refine = true;
        }
      }
      if (refine) {
        for (let i = 0; i < edge.length; i++)
          triangle(center, edge[i], edge[(i + 1) % edge.length], depth + 1);
        return;
      }
    }
    emit(a);
    emit(area > 0 ? c : b);
    emit(area > 0 ? b : c);
  }
  for (const polygon of polygons) {
    const minX = Math.floor(Math.min(...polygon.map((p) => p.x)) / cell),
      maxX = Math.floor(Math.max(...polygon.map((p) => p.x)) / cell),
      minZ = Math.floor(Math.min(...polygon.map((p) => p.z)) / cell),
      maxZ = Math.floor(Math.max(...polygon.map((p) => p.z)) / cell);
    for (let gx = minX; gx <= maxX; gx++) {
      const column = clip(
        clip(polygon, 'x', gx * cell, true),
        'x',
        (gx + 1) * cell,
        false,
      );
      if (column.length < 3) continue;
      for (let gz = minZ; gz <= maxZ; gz++) {
        const points = clip(
          clip(column, 'z', gz * cell, true),
          'z',
          (gz + 1) * cell,
          false,
        );
        if (points.length < 3) continue;
        const pieces = subtract ? subtract(points) : [points];
        for (const piece of pieces)
          for (let i = 1; i < piece.length - 1; i++) {
            triangle(piece[0], piece[i], piece[i + 1]);
          }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function convexPieces(points: Polygon): CityPoint[][] {
  const contour = points.map((p) => new THREE.Vector2(p.x, p.z));
  return THREE.ShapeUtils.triangulateShape(contour, []).map((triangle) =>
    triangle.map((i) => points[i]),
  );
}

/** Shared world-grid boundaries allow independent terrain tiles to be culled
 * without cracks. Clip before tessellation so construction can yield per tile. */
export function* terrainTiles(polygons: readonly Polygon[], size = 240) {
  const all = polygons.flat();
  const minX = Math.floor(Math.min(...all.map((p) => p.x)) / size);
  const maxX = Math.floor(Math.max(...all.map((p) => p.x)) / size);
  const minZ = Math.floor(Math.min(...all.map((p) => p.z)) / size);
  const maxZ = Math.floor(Math.max(...all.map((p) => p.z)) / size);
  for (let x = minX; x <= maxX; x++)
    for (let z = minZ; z <= maxZ; z++) {
      const pieces = polygons
        .map((p) =>
          clip(
            clip(
              clip(clip(p, 'x', x * size, true), 'x', (x + 1) * size, false),
              'z',
              z * size,
              true,
            ),
            'z',
            (z + 1) * size,
            false,
          ),
        )
        .filter((p) => p.length >= 3);
      if (pieces.length) yield pieces;
    }
}

export function drapedSurface(
  kit: RenderKit,
  parent: THREE.Object3D,
  polygons: readonly Polygon[],
  color: string,
  heightAt: HeightAt,
  offset = 0,
  cell = 12,
  holes: readonly Polygon[] = [],
  maxHeightError = Infinity,
) {
  const mesh = kit.mesh(
    drapedGeometry(polygons, heightAt, offset, cell, holes, maxHeightError),
    kit.material(color),
    parent,
  );
  mesh.castShadow = false;
  return mesh;
}

type SurfaceEdge = {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
};

/** Seam vertices already carry the neighbouring ground's natural normal.
 * A back-facing vertical join must keep that normal instead of turning the
 * upward terrain lighting downward when Three renders its second side. */
export function createTerrainSeamMaterial(terrain: THREE.MeshStandardMaterial) {
  const material = terrain.clone();
  material.side = THREE.DoubleSide;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace(
        'normal *= faceDirection;',
        '// Keep the shared terrain normal on either side of a seam.',
      ),
    );
  };
  material.customProgramCacheKey = () => 'city-terrain-seam-natural-normal-v1';
  return material;
}

function surfaceBoundary(geometry: THREE.BufferGeometry) {
  const positions = geometry.attributes.position;
  const index = geometry.index;
  const edges = new Map<string, { edge: SurfaceEdge; count: number }>();
  for (let i = 0; i < (index?.count ?? positions.count); i += 3)
    for (let side = 0; side < 3; side++) {
      const a = index ? index.getX(i + side) : i + side;
      const b = index ? index.getX(i + ((side + 1) % 3)) : i + ((side + 1) % 3);
      const edge = {
        ax: positions.getX(a),
        ay: positions.getY(a),
        az: positions.getZ(a),
        bx: positions.getX(b),
        by: positions.getY(b),
        bz: positions.getZ(b),
      };
      const ka = `${edge.ax}:${edge.az}`,
        kb = `${edge.bx}:${edge.bz}`;
      const key = ka < kb ? `${ka}/${kb}` : `${kb}/${ka}`;
      const existing = edges.get(key);
      if (existing) existing.count++;
      else edges.set(key, { edge, count: 1 });
    }
  return [...edges.values()]
    .filter(({ count }) => count === 1)
    .map(({ edge }) => edge);
}

/** Join coincident footprints with their actual rendered boundary heights.
 * Different grids, or a cutout adding a vertex to only one side of a terrain
 * grid edge, leave unmatched linear triangle edges in 3D. These narrow vertical
 * faces seal the tessellation gap and curb rise without moving either mesh. */
export function createDrapedEdgeStitcher() {
  const cell = 16;
  const bins = new Map<string, SurfaceEdge[]>();
  function visit(edge: SurfaceEdge, callback: (key: string) => void) {
    for (
      let x = Math.floor((Math.min(edge.ax, edge.bx) - 0.001) / cell);
      x <= Math.floor((Math.max(edge.ax, edge.bx) + 0.001) / cell);
      x++
    )
      for (
        let z = Math.floor((Math.min(edge.az, edge.bz) - 0.001) / cell);
        z <= Math.floor((Math.max(edge.az, edge.bz) + 0.001) / cell);
        z++
      )
        callback(`${x}:${z}`);
  }
  return {
    add(geometry: THREE.BufferGeometry) {
      for (const edge of surfaceBoundary(geometry))
        visit(edge, (key) => {
          const entries = bins.get(key) ?? [];
          entries.push(edge);
          bins.set(key, entries);
        });
    },
    stitch(geometry: THREE.BufferGeometry) {
      const vertices: number[] = [];
      const joined = new Set<string>();
      const identity = (edge: SurfaceEdge) =>
        [`${edge.ax}:${edge.ay}:${edge.az}`, `${edge.bx}:${edge.by}:${edge.bz}`]
          .sort()
          .join('/');
      for (const edge of surfaceBoundary(geometry)) {
        const candidates = new Set<SurfaceEdge>();
        visit(edge, (key) => {
          for (const other of bins.get(key) ?? []) candidates.add(other);
        });
        const dx = edge.bx - edge.ax,
          dz = edge.bz - edge.az;
        const length = Math.hypot(dx, dz);
        if (length < 0.0001) continue;
        for (const other of candidates) {
          const crossA = (other.ax - edge.ax) * dz - (other.az - edge.az) * dx;
          const crossB = (other.bx - edge.ax) * dz - (other.bz - edge.az) * dx;
          // Float32 world coordinates can differ by a fraction of a millimetre.
          if (Math.max(Math.abs(crossA), Math.abs(crossB)) > length * 0.001)
            continue;
          const ta =
            ((other.ax - edge.ax) * dx + (other.az - edge.az) * dz) /
            length ** 2;
          const tb =
            ((other.bx - edge.ax) * dx + (other.bz - edge.az) * dz) /
            length ** 2;
          if (Math.abs(tb - ta) < 1e-8) continue;
          const from = Math.max(0, Math.min(ta, tb));
          const to = Math.min(1, Math.max(ta, tb));
          if ((to - from) * length < 0.0001) continue;
          const point = (t: number, terrain: boolean) => [
            edge.ax + dx * t,
            terrain
              ? other.ay + (other.by - other.ay) * ((t - ta) / (tb - ta))
              : edge.ay + (edge.by - edge.ay) * t,
            edge.az + dz * t,
          ];
          const a = point(from, false),
            b = point(to, false);
          const c = point(to, true),
            d = point(from, true);
          if (Math.max(Math.abs(a[1] - d[1]), Math.abs(b[1] - c[1])) < 0.0001)
            continue;
          const pair = [identity(edge), identity(other)].sort().join('|');
          if (joined.has(pair)) continue;
          joined.add(pair);
          const span = (to - from) * length;
          if (Math.abs(b[1] - c[1]) * span > 2e-8)
            vertices.push(...a, ...b, ...c);
          if (Math.abs(a[1] - d[1]) * span > 2e-8)
            vertices.push(...a, ...c, ...d);
        }
      }
      const result = new THREE.BufferGeometry();
      result.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      const uv: number[] = [];
      for (let i = 0; i < vertices.length; i += 3)
        uv.push(vertices[i] / 10, vertices[i + 2] / 10);
      result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      result.computeVertexNormals();
      result.computeBoundingBox();
      result.computeBoundingSphere();
      return result;
    },
  };
}

/** Close internal T-junctions in a bounded part of a draped surface. Adaptive
 * triangles can sample the same footprint edge at different heights. Keep the
 * original surface intact and supply narrow faces with its lighting and UVs. */
export function drapedRegionSeams(
  geometry: THREE.BufferGeometry,
  heightAt: HeightAt,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
) {
  const source = geometry.attributes.position;
  const index = geometry.index;
  const local: number[] = [];
  for (let i = 0; i < (index?.count ?? source.count); i += 3) {
    const points = [0, 1, 2].map((offset) => {
      const j = index ? index.getX(i + offset) : i + offset;
      return [source.getX(j), source.getY(j), source.getZ(j)];
    });
    if (
      Math.max(...points.map((p) => p[0])) < bounds.minX - 6 ||
      Math.min(...points.map((p) => p[0])) > bounds.maxX + 6 ||
      Math.max(...points.map((p) => p[2])) < bounds.minZ - 6 ||
      Math.min(...points.map((p) => p[2])) > bounds.maxZ + 6
    )
      continue;
    local.push(...points.flat());
  }
  const subset = new THREE.BufferGeometry();
  subset.setAttribute('position', new THREE.Float32BufferAttribute(local, 3));
  const stitcher = createDrapedEdgeStitcher();
  stitcher.add(subset);
  const joined = stitcher.stitch(subset);
  const positions: number[] = [],
    normals: number[] = [],
    uv: number[] = [];
  const sourceJoins = joined.attributes.position;
  const normal = new THREE.Vector3();
  for (let i = 0; i < sourceJoins.count; i += 3) {
    const x =
      (sourceJoins.getX(i) +
        sourceJoins.getX(i + 1) +
        sourceJoins.getX(i + 2)) /
      3;
    const z =
      (sourceJoins.getZ(i) +
        sourceJoins.getZ(i + 1) +
        sourceJoins.getZ(i + 2)) /
      3;
    if (
      x < bounds.minX ||
      x > bounds.maxX ||
      z < bounds.minZ ||
      z > bounds.maxZ
    )
      continue;
    normal
      .set(
        heightAt(x - 0.3, z) - heightAt(x + 0.3, z),
        0.6,
        heightAt(x, z - 0.3) - heightAt(x, z + 0.3),
      )
      .normalize();
    // Both windings retain the existing FrontSide material without creating a
    // material group or flipping the road's supplied shading normal.
    for (const offset of [0, 1, 2, 2, 1, 0]) {
      const j = i + offset;
      positions.push(
        sourceJoins.getX(j),
        sourceJoins.getY(j),
        sourceJoins.getZ(j),
      );
      normals.push(normal.x, normal.y, normal.z);
      uv.push(sourceJoins.getX(j) / 10, sourceJoins.getZ(j) / 10);
    }
  }
  subset.dispose();
  joined.dispose();
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** Lift scenery before material batching. Rigid objects keep vertical walls;
 * paint and wide ground slabs follow the same height field as their ground. */
export function liftScenery(
  kit: RenderKit,
  root: THREE.Group,
  heightAt: HeightAt,
) {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const matrix = new THREE.Matrix4(),
    point = new THREE.Vector3();
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  for (const mesh of meshes) {
    if (mesh.userData.reliefPlaced) continue;
    if (mesh instanceof THREE.InstancedMesh) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        point.setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);
        matrix.elements[13] += heightAt(point.x, point.z);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      continue;
    }
    const bounds = new THREE.Box3().setFromObject(mesh);
    const center = bounds.getCenter(new THREE.Vector3());
    const span = bounds.getSize(new THREE.Vector3());
    // Ordinary props move as a whole. Their mesh is baked into root coordinates
    // so a rotated parent's local Y cannot turn the offset into a sideways move.
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    kit.geometries.add(geometry);
    const positions = geometry.attributes.position;
    const flat =
      mesh.userData.reliefDrape ||
      (span.y < 0.22 && Math.max(span.x, span.z) > 2);
    const lift = heightAt(center.x, center.z);
    for (let i = 0; i < positions.count; i++)
      positions.setY(
        i,
        positions.getY(i) +
          (flat ? heightAt(positions.getX(i), positions.getZ(i)) : lift),
      );
    geometry.applyMatrix4(inverse);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const old = mesh.geometry;
    mesh.geometry = geometry;
    root.attach(mesh);
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    kit.geometries.delete(old);
    old.dispose();
  }
}

/** Sample one shared surface normal at triangle seams. Thin adaptive fans
 * should not acquire unrelated flat-face lighting at clipped road edges. */
export function smoothDrapedNormals(
  geometry: THREE.BufferGeometry,
  heightAt: (x: number, z: number) => number,
) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const cache = new Map<string, THREE.Vector3>();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      z = positions.getZ(i);
    const key = `${x}:${z}`;
    let normal = cache.get(key);
    if (!normal) {
      normal = new THREE.Vector3(
        heightAt(x - 0.3, z) - heightAt(x + 0.3, z),
        0.6,
        heightAt(x, z - 0.3) - heightAt(x, z + 0.3),
      ).normalize();
      cache.set(key, normal);
    }
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  normals.needsUpdate = true;
}
