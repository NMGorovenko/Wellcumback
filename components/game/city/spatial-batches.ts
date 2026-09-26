import * as THREE from 'three';
import type { RenderKit } from '../world/render-kit.ts';

type LodCounts = { silhouette: number; landmark: number; full: number };
type LodRange = { start: number; count: number; tier: string };
type Cell = {
  sourceVertices: number[];
  vertexMap: Map<number, number>;
  indices: number[];
  silhouette: number;
  landmark: number;
  drawStart: number;
  drawCount: number;
  ranges: LodRange[];
};

/** Partition whole original triangles; positions, attributes and winding do not
 * change. Crossing triangles retain their full extents in conservative bounds.
 * Compact vertex buffers avoid retaining/re-uploading an entire city per cell.
 * Existing ordered LOD prefixes and arbitrary source draw ranges remain valid.
 */
export function partitionCityGeometry(
  source: THREE.BufferGeometry,
  worldMatrix: THREE.Matrix4,
  cellSize = 320,
): THREE.BufferGeometry[] {
  const position = source.getAttribute('position');
  const sourceCount = source.index?.count ?? position.count;
  if (sourceCount % 3 || Object.keys(source.morphAttributes).length) return [];
  const lod = source.userData.cityLod as LodCounts | undefined;
  const ranges = source.userData.cityLodRanges as LodRange[] | undefined;
  const cells = new Map<string, Cell>();
  const point = new THREE.Vector3();
  const start = source.drawRange.start;
  const end = Math.min(sourceCount, start + source.drawRange.count);
  if (start % 3 || end % 3) return [];
  let rangeIndex = 0;
  for (let offset = 0; offset < sourceCount; offset += 3) {
    const a = source.index?.getX(offset) ?? offset;
    const b = source.index?.getX(offset + 1) ?? offset + 1;
    const c = source.index?.getX(offset + 2) ?? offset + 2;
    point
      .set(
        (position.getX(a) + position.getX(b) + position.getX(c)) / 3,
        (position.getY(a) + position.getY(b) + position.getY(c)) / 3,
        (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3,
      )
      .applyMatrix4(worldMatrix);
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.z / cellSize)}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        sourceVertices: [],
        vertexMap: new Map(),
        indices: [],
        silhouette: 0,
        landmark: 0,
        drawStart: 0,
        drawCount: 0,
        ranges: [],
      };
      cells.set(key, cell);
    }
    if (lod) {
      if (offset < lod.silhouette) cell.silhouette += 3;
      if (offset < lod.landmark) cell.landmark += 3;
    }
    if (ranges) {
      while (
        rangeIndex < ranges.length - 1 &&
        offset >= ranges[rangeIndex].start + ranges[rangeIndex].count
      )
        rangeIndex++;
      const tier = ranges[rangeIndex].tier;
      const last = cell.ranges.at(-1);
      if (last?.tier === tier) last.count += 3;
      else cell.ranges.push({ start: cell.indices.length, count: 3, tier });
    }
    if (offset < start) cell.drawStart += 3;
    if (offset >= start && offset < end) cell.drawCount += 3;
    for (const original of [a, b, c]) {
      let index = cell.vertexMap.get(original);
      if (index === undefined) {
        index = cell.sourceVertices.length;
        cell.sourceVertices.push(original);
        cell.vertexMap.set(original, index);
      }
      cell.indices.push(index);
    }
  }
  if (cells.size < 2) return [];
  return [...cells.values()].map((cell) => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) {
      // Preserve integer/normalized attributes in their raw representation.
      const interleaved = attribute instanceof THREE.InterleavedBufferAttribute;
      const raw = interleaved ? attribute.data.array : attribute.array;
      const ArrayType = raw.constructor as new (length: number) => typeof raw;
      const copied = new ArrayType(
        cell.sourceVertices.length * attribute.itemSize,
      );
      const stride = interleaved ? attribute.data.stride : attribute.itemSize;
      const base = interleaved ? attribute.offset : 0;
      cell.sourceVertices.forEach((original, index) => {
        for (let k = 0; k < attribute.itemSize; k++)
          copied[index * attribute.itemSize + k] =
            raw[original * stride + base + k];
      });
      const result = new THREE.BufferAttribute(
        copied,
        attribute.itemSize,
        attribute.normalized,
      );
      result.name = attribute.name;
      result.setUsage(interleaved ? attribute.data.usage : attribute.usage);
      if (!interleaved) result.gpuType = attribute.gpuType;
      geometry.setAttribute(name, result);
    }
    geometry.setIndex(cell.indices);
    geometry.userData = { ...source.userData };
    if (lod)
      geometry.userData.cityLod = {
        silhouette: cell.silhouette,
        landmark: cell.landmark,
        full: cell.indices.length,
      } satisfies LodCounts;
    if (ranges) geometry.userData.cityLodRanges = cell.ranges;
    geometry.setDrawRange(cell.drawStart, cell.drawCount);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  });
}

/** Run AFTER batchCity and BEFORE createCityLod. Never touch instanced/moving
 * objects. Default targets genuinely oversized, dense static batches only.
 */
export function splitOversizedCityGeometry(
  kit: RenderKit,
  root: THREE.Object3D,
  cellSize = 320,
) {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  const references = new Map<THREE.BufferGeometry, number>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    references.set(object.geometry, (references.get(object.geometry) ?? 0) + 1);
    if (
      object instanceof THREE.InstancedMesh ||
      object instanceof THREE.SkinnedMesh ||
      object.userData.noCityBatch ||
      Array.isArray(object.material) ||
      object.material.transparent
    )
      return;
    const geometry = object.geometry;
    if ((geometry.index?.count ?? geometry.attributes.position.count) < 3000)
      return;
    geometry.computeBoundingBox();
    const bounds = geometry
      .boundingBox!.clone()
      .applyMatrix4(object.matrixWorld);
    if (
      Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) > 640
    )
      meshes.push(object);
  });
  let splitSources = 0,
    splitBatches = 0;
  for (const mesh of meshes) {
    const original = mesh.geometry;
    const pieces = partitionCityGeometry(original, mesh.matrixWorld, cellSize);
    if (!pieces.length) continue;
    pieces.forEach((geometry, index) => {
      kit.geometries.add(geometry);
      const part = index === 0 ? mesh : mesh.clone(false);
      part.geometry = geometry;
      // Preserve source identity for the first piece and mark every piece.
      if (index) part.name = mesh.name ? `${mesh.name}:cell-${index}` : '';
      part.userData.citySpatialBatch = true;
      if (index) mesh.parent!.add(part);
    });
    const remaining = references.get(original)! - 1;
    references.set(original, remaining);
    if (!remaining) {
      kit.geometries.delete(original);
      original.dispose();
    }
    splitSources++;
    splitBatches += pieces.length;
  }
  return { splitSources, splitBatches };
}

/** batchCity removes source meshes but used to leave ~13,500 unnamed empty
 * transform nodes alive. Named landmark anchors and groups with children stay.
 */
export function pruneEmptyCityGroups(root: THREE.Object3D) {
  let removed = 0;
  const visit = (owner: THREE.Object3D) => {
    for (let i = owner.children.length - 1; i >= 0; i--) {
      const child = owner.children[i];
      visit(child);
      if (
        child instanceof THREE.Group &&
        !child.name &&
        !child.children.length
      ) {
        owner.remove(child);
        removed++;
      }
    }
  };
  visit(root);
  return removed;
}

/** Partition before lift/destruction capture references. Geometry/material stay
 * shared, while instance IDs and colours follow their transforms into each cell.
 */
export function partitionCityInstances(
  source: THREE.InstancedMesh,
  cellSize = 320,
) {
  if (!source.parent || source.morphTexture) return [];
  source.updateWorldMatrix(true, false);
  const matrix = new THREE.Matrix4(),
    point = new THREE.Vector3();
  const cells = new Map<string, number[]>();
  for (let i = 0; i < source.count; i++) {
    source.getMatrixAt(i, matrix);
    point.setFromMatrixPosition(matrix).applyMatrix4(source.matrixWorld);
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.z / cellSize)}`;
    const ids = cells.get(key) ?? [];
    ids.push(i);
    cells.set(key, ids);
  }
  if (cells.size < 2) return [source];
  const treeIds = source.userData.cityTreeIndices as number[] | undefined;
  const color = new THREE.Color();
  const parts = [...cells.values()].map((ids, cell) => {
    const part = new THREE.InstancedMesh(
      source.geometry,
      source.material,
      ids.length,
    );
    part.position.copy(source.position);
    part.quaternion.copy(source.quaternion);
    part.scale.copy(source.scale);
    part.name = cell ? `${source.name}:cell-${cell}` : source.name;
    part.castShadow = source.castShadow;
    part.receiveShadow = source.receiveShadow;
    part.visible = source.visible;
    part.layers.mask = source.layers.mask;
    part.userData = { ...source.userData };
    if (treeIds) part.userData.cityTreeIndices = ids.map((i) => treeIds[i]);
    ids.forEach((i, j) => {
      source.getMatrixAt(i, matrix);
      part.setMatrixAt(j, matrix);
      if (source.instanceColor) {
        source.getColorAt(i, color);
        part.setColorAt(j, color);
      }
    });
    part.instanceMatrix.setUsage(source.instanceMatrix.usage);
    part.computeBoundingBox();
    part.computeBoundingSphere();
    source.parent!.add(part);
    return part;
  });
  source.removeFromParent();
  source.dispose();
  return parts;
}
