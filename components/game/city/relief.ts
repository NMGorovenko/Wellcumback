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
) {
  const vertices: number[] = [],
    uv: number[] = [];
  const heights = new Map<string, number>();
  const subtract = holes.length
    ? createRoadPolygonSubtractor(holes)
    : undefined;
  function emit(p: CityPoint) {
    const key = `${p.x.toFixed(6)}:${p.z.toFixed(6)}`;
    let height = heights.get(key);
    if (height === undefined) {
      height = heightAt(p.x, p.z);
      heights.set(key, height);
    }
    vertices.push(p.x, height + offset, p.z);
    uv.push(p.x / 10, p.z / 10);
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
            const a = piece[0],
              b = piece[i],
              c = piece[i + 1];
            const area = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
            if (Math.abs(area) < 1e-7) continue;
            emit(a);
            emit(area > 0 ? c : b);
            emit(area > 0 ? b : c);
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
) {
  const mesh = kit.mesh(
    drapedGeometry(polygons, heightAt, offset, cell, holes),
    kit.material(color),
    parent,
  );
  mesh.castShadow = false;
  return mesh;
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
