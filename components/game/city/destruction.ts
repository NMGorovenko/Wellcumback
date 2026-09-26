import * as THREE from 'three';
import {
  breakableObjects,
  brokenDirection,
  type CityDamage,
} from '../../../lib/game/city/destruction.ts';
import { cityBarriers } from '../../../lib/game/city/barriers.ts';
import type { RenderKit } from '../world/render-kit.ts';

type Part = { mesh: THREE.InstancedMesh; index: number; base: THREE.Matrix4 };

/** Rails batch by primitive and material; damage only updates instance transforms. */
export function createCityDestruction(kit: RenderKit, root: THREE.Group) {
  root.updateMatrixWorld(true);
  const parts = new Map<number, Part[]>();
  const add = (id: number, part: Part) => {
    const group = parts.get(id) ?? [];
    group.push(part);
    parts.set(id, group);
  };
  type RailBatch = {
    material: THREE.Material;
    shape: string;
    entries: { mesh: THREE.Mesh; id: number }[];
  };
  const rods = new Map<string, RailBatch>();
  root.traverse((object) => {
    if (
      object instanceof THREE.InstancedMesh &&
      object.userData.cityTreeIndices
    ) {
      (object.userData.cityTreeIndices as number[]).forEach((id, index) => {
        const base = new THREE.Matrix4();
        object.getMatrixAt(index, base);
        add(cityBarriers.length + id, { mesh: object, index, base });
      });
      object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    if (
      !(object instanceof THREE.Mesh) ||
      !['CylinderGeometry', 'BoxGeometry', 'PlaneGeometry'].includes(
        object.geometry.type,
      ) ||
      !object.parent?.userData.barrier ||
      Array.isArray(object.material)
    )
      return;
    const id = cityBarriers.indexOf(object.parent.userData.barrier);
    if (id < 0) return;
    const shape = object.geometry.type,
      key = `${shape}:${object.material.uuid}:${Math.floor(object.matrixWorld.elements[12] / 320)}:${Math.floor(object.matrixWorld.elements[14] / 320)}`;
    const batch: RailBatch = rods.get(key) ?? {
      material: object.material,
      shape,
      entries: [],
    };
    batch.entries.push({ mesh: object, id });
    rods.set(key, batch);
  });
  const unitGeometry = new Map<string, THREE.BufferGeometry>();
  const discarded = new Set<THREE.BufferGeometry>();
  for (const { material, shape, entries } of rods.values()) {
    let geometry = unitGeometry.get(shape);
    if (!geometry) {
      geometry =
        shape === 'CylinderGeometry'
          ? new THREE.CylinderGeometry(1, 1, 1, 8)
          : shape === 'BoxGeometry'
            ? new THREE.BoxGeometry(1, 1, 1)
            : new THREE.PlaneGeometry(1, 1);
      unitGeometry.set(shape, geometry);
      kit.geometries.add(geometry);
    }
    const batch = new THREE.InstancedMesh(geometry, material, entries.length);
    batch.name = 'breakable-city-rails';
    batch.userData.cityBarrierIndices = entries.map((entry) => entry.id);
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    entries.forEach(({ mesh, id }, index) => {
      const p = (
        mesh.geometry as THREE.CylinderGeometry &
          THREE.BoxGeometry &
          THREE.PlaneGeometry
      ).parameters;
      const scale =
        shape === 'CylinderGeometry'
          ? [p.radiusTop, p.height, p.radiusTop]
          : [p.width, p.height, shape === 'BoxGeometry' ? p.depth : 1];
      const base = mesh.matrixWorld
        .clone()
        .multiply(new THREE.Matrix4().makeScale(scale[0], scale[1], scale[2]));
      batch.setMatrixAt(index, base);
      add(id, { mesh: batch, index, base });
      discarded.add(mesh.geometry);
      mesh.removeFromParent();
    });
    batch.castShadow = true;
    batch.receiveShadow = true;
    batch.computeBoundingSphere();
    root.add(batch);
  }
  // Some decorative rails share a unit plane. Dispose it only after all source
  // instances have been consumed; the replacement batches own separate geometry.
  for (const geometry of discarded) {
    kit.geometries.delete(geometry);
    geometry.dispose();
  }
  // All transforms are in world coordinates after liftScenery. Reserve a small
  // margin once, instead of recomputing bounds for thousands of instances per hit.
  for (const list of parts.values())
    for (const { mesh } of list) {
      if (!mesh.userData.destructionBounds) {
        mesh.computeBoundingSphere();
        mesh.boundingSphere!.radius += 10;
        mesh.userData.destructionBounds = true;
      }
    }
  let previous = '';
  const active = new Set<number>();
  const pivot = new THREE.Vector3(),
    axis = new THREE.Vector3(),
    rotation = new THREE.Quaternion();
  const transform = new THREE.Matrix4(),
    matrix = new THREE.Matrix4(),
    bounds = new THREE.Box3();
  const dirty = new Set<THREE.InstancedMesh>();
  return {
    update(damage: CityDamage | undefined, time: number) {
      const marks = damage?.marks ?? '';
      if (marks !== previous) {
        for (let id = 0; id < Math.max(marks.length, previous.length); id++)
          // Padding an initial/high-index hit with '.' does not repair every
          // preceding rail and tree or dirty all their instance buffers.
          if ((marks[id] ?? '.') !== (previous[id] ?? '.')) active.add(id);
        previous = marks;
      }
      if (!active.size) return;
      dirty.clear();
      for (const id of active) {
        const object = breakableObjects[id],
          entries = parts.get(id);
        if (!object || !entries) {
          active.delete(id);
          continue;
        }
        const direction = brokenDirection(damage, id);
        const hit = damage?.hits.find((h) => h[0] === id);
        const age = hit ? Math.max(0, time - hit[1]) : 10;
        const tree = object.kind === 'tree',
          duration = tree ? 1.6 : 0.75;
        const t = Math.min(1, age / duration);
        const fall = tree ? t * t * (2 - t) : 1 - Math.pow(1 - t, 3);
        if (direction !== null) {
          axis.set(Math.cos(direction), 0, -Math.sin(direction));
          // A brief elastic tremble ends in a stable fallen pose.
          const bounce =
            t < 1
              ? Math.sin(t * Math.PI * 4) * Math.sin(t * Math.PI) * 0.035
              : 0;
          rotation.setFromAxisAngle(axis, (tree ? 1.32 : 1.52) * fall + bounce);
          pivot.set(object.x, object.y + (tree ? 0.15 : 0.24), object.z);
          transform.makeRotationFromQuaternion(rotation);
          const e = transform.elements;
          e[12] = pivot.x - (e[0] * pivot.x + e[4] * pivot.y + e[8] * pivot.z);
          e[13] = pivot.y - (e[1] * pivot.x + e[5] * pivot.y + e[9] * pivot.z);
          e[14] = pivot.z - (e[2] * pivot.x + e[6] * pivot.y + e[10] * pivot.z);
          if (!tree) {
            transform.elements[12] += Math.sin(direction) * fall * 0.6;
            transform.elements[14] += Math.cos(direction) * fall * 0.6;
          }
        } else transform.identity();
        for (const part of entries) {
          matrix.multiplyMatrices(transform, part.base);
          part.mesh.setMatrixAt(part.index, matrix);
          // A struck tree changes one transform in a city-wide instance buffer.
          // Retain pending ranges when a batch is culled; Three clears them only
          // after uploading, so a later visible frame still receives every edit.
          const attribute = part.mesh.instanceMatrix,
            start = part.index * 16;
          if (
            !attribute.updateRanges.some(
              (range) =>
                range.start <= start && range.start + range.count >= start + 16,
            )
          )
            attribute.addUpdateRange(start, 16);
          dirty.add(part.mesh);
          const occluder = part.mesh.userData.cityTreeOccluders?.[part.index];
          if (occluder) {
            occluder.active = direction === null;
            if (!part.mesh.geometry.boundingBox)
              part.mesh.geometry.computeBoundingBox();
            bounds.copy(part.mesh.geometry.boundingBox!).applyMatrix4(matrix);
            occluder.minX = bounds.min.x;
            occluder.minY = bounds.min.y;
            occluder.minZ = bounds.min.z;
            occluder.maxX = bounds.max.x;
            occluder.maxY = bounds.max.y;
            occluder.maxZ = bounds.max.z;
          }
        }
        if (t >= 1 || direction === null) active.delete(id);
      }
      dirty.forEach((mesh) => {
        mesh.instanceMatrix.needsUpdate = true;
      });
    },
  };
}
