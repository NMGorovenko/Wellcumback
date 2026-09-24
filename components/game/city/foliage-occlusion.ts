import * as THREE from 'three';
import type { CityCameraOccluder } from './camera.ts';

const cellSize = 32;
type Entry = { crown: CityCameraOccluder; visited: number };
const indices = new WeakMap<
  readonly CityCameraOccluder[],
  { cells: Map<string, Entry[]>; revision: number; count: number }
>();

/** Collected crowns stay in their original cells: falling crowns stop blocking
 * the camera, and restoring a tree returns it to its original bounds. */
function indexFoliage(crowns: CityCameraOccluder[]) {
  const cells = new Map<string, Entry[]>();
  for (const crown of crowns) {
    const entry = { crown, visited: 0 };
    for (
      let x = Math.floor(crown.minX / cellSize);
      x <= Math.floor(crown.maxX / cellSize);
      x++
    )
      for (
        let z = Math.floor(crown.minZ / cellSize);
        z <= Math.floor(crown.maxZ / cellSize);
        z++
      ) {
        const key = `${x}:${z}`,
          entries = cells.get(key) ?? [];
        entries.push(entry);
        cells.set(key, entries);
      }
  }
  indices.set(crowns, { cells, revision: 0, count: crowns.length });
}

/** Visit only cells crossed by the camera boom, without allocating a result
 * array or duplicate set on each frame. Plain caller-provided arrays also work. */
export function forEachCityFoliageNear(
  crowns: readonly CityCameraOccluder[],
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  visit: (crown: CityCameraOccluder) => void,
) {
  const index = indices.get(crowns);
  if (!index || index.count !== crowns.length) {
    for (const crown of crowns) if (crown.active !== false) visit(crown);
    return;
  }
  const revision = ++index.revision;
  for (
    let x = Math.floor(minX / cellSize);
    x <= Math.floor(maxX / cellSize);
    x++
  )
    for (
      let z = Math.floor(minZ / cellSize);
      z <= Math.floor(maxZ / cellSize);
      z++
    )
      for (const entry of index.cells.get(`${x}:${z}`) ?? []) {
        if (entry.visited === revision) continue;
        entry.visited = revision;
        if (entry.crown.active !== false) visit(entry.crown);
      }
}

/** Capture the actual lifted crowns before material batching removes their
 * individual meshes. Instanced trees stay instanced; this adds no draw calls. */
export function collectCityFoliage(root: THREE.Object3D): CityCameraOccluder[] {
  const crowns: CityCameraOccluder[] = [];
  const matrix = new THREE.Matrix4(),
    instance = new THREE.Matrix4();
  const bounds = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material))
      return;
    const color = (object.material as THREE.MeshStandardMaterial).color;
    if (
      !color ||
      color.g < color.r * 1.07 ||
      color.g < color.b * 1.04 ||
      !['SphereGeometry', 'IcosahedronGeometry', 'ConeGeometry'].includes(
        object.geometry.type,
      )
    )
      return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    for (let i = 0; i < count; i++) {
      matrix.copy(object.matrixWorld);
      if (object instanceof THREE.InstancedMesh) {
        object.getMatrixAt(i, instance);
        matrix.multiply(instance);
      }
      bounds.copy(object.geometry.boundingBox!).applyMatrix4(matrix);
      const occluder = {
        minX: bounds.min.x,
        minY: bounds.min.y,
        minZ: bounds.min.z,
        maxX: bounds.max.x,
        maxY: bounds.max.y,
        maxZ: bounds.max.z,
      };
      crowns.push(occluder);
      if (object.userData.cityTreeIndices) {
        object.userData.cityTreeOccluders ??= [];
        object.userData.cityTreeOccluders[i] = occluder;
      }
    }
  });
  indexFoliage(crowns);
  return crowns;
}
