import * as THREE from 'three';
import type { CityCameraOccluder } from './camera.ts';

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
    object.geometry.computeBoundingBox();
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
  return crowns;
}
