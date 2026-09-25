import * as THREE from 'three';

export type CityLodQuality = 'low' | 'medium' | 'high';
export type CityLodTier = 'silhouette' | 'landmark-detail' | 'house-detail';
export type CityLodRange = { start: number; count: number; tier: CityLodTier };
type Counts = { silhouette: number; landmark: number; full: number };

export const CITY_LOD_DISTANCE = {
  low: { house: 160, landmark: 420 },
  medium: { house: 260, landmark: 680 },
  high: { house: 400, landmark: 950 },
} as const;

const fullCount = (geometry: THREE.BufferGeometry) =>
  geometry.index?.count ?? geometry.attributes.position.count;

/** Explicit house ranges take priority. Unclassified scenery remains intact. */
export function cityLodRanges(mesh: THREE.Mesh): CityLodRange[] {
  const explicit = mesh.geometry.userData.cityLodRanges as
    | CityLodRange[]
    | undefined;
  if (explicit) return explicit;
  let tier: CityLodTier = mesh.userData.cityLodTier ?? 'silhouette';
  let kind: string | undefined;
  for (let owner: THREE.Object3D | null = mesh; owner; owner = owner.parent) {
    // Small aircraft parts and rocket stages are identifying features, not clutter.
    if (owner.userData.cityLodKeep || owner.name === 'aerokos:cosmos-3m')
      return [
        { start: 0, count: fullCount(mesh.geometry), tier: 'silhouette' },
      ];
    kind ??= owner.userData.cityLodBuilding;
  }
  if (kind && kind !== 'fighter' && kind !== 'pushkin-monument') {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const size = mesh.geometry
      .boundingBox!.getSize(new THREE.Vector3())
      .multiply(mesh.scale)
      .toArray()
      .map(Math.abs);
    // Keep roofs, glass fronts, tall columns and all broad facade batches.
    // Only a genuinely small isolated primitive can disappear on a landmark.
    if (Math.max(...size) <= (kind === 'house' ? 4 : 3.2))
      tier = kind === 'house' ? 'house-detail' : 'landmark-detail';
  }
  return [{ start: 0, count: fullCount(mesh.geometry), tier }];
}

/** Reorder indices only. Every original triangle exists once, with the same
 * attributes and winding; a prefix is sufficient for each distance tier. */
export function orderCityLodGeometry(
  geometry: THREE.BufferGeometry,
  ranges: readonly CityLodRange[],
): Counts | undefined {
  const count = fullCount(geometry);
  if (!ranges.some((range) => range.tier !== 'silhouette')) return;
  let covered = 0;
  for (const range of ranges) {
    if (range.start !== covered || range.count < 0 || range.count % 3)
      throw new Error(
        'City LOD ranges must cover whole triangles in source order',
      );
    covered += range.count;
  }
  if (covered !== count)
    throw new Error('City LOD ranges must cover every triangle once');
  const source = geometry.index;
  const Index =
    geometry.attributes.position.count > 65535 ? Uint32Array : Uint16Array;
  const ordered = new Index(count);
  let offset = 0,
    silhouette = 0,
    landmark = 0;
  for (const tier of [
    'silhouette',
    'landmark-detail',
    'house-detail',
  ] as const) {
    for (const range of ranges) {
      if (range.tier !== tier) continue;
      for (let i = range.start; i < range.start + range.count; i++)
        ordered[offset++] = source ? source.getX(i) : i;
    }
    if (tier === 'silhouette') silhouette = offset;
    if (tier === 'landmark-detail') landmark = offset;
  }
  if (offset !== count)
    throw new Error('City LOD ranges must cover every triangle once');
  const counts = { silhouette, landmark, full: count };
  geometry.setIndex(new THREE.BufferAttribute(ordered, 1));
  geometry.userData.cityLod = counts;
  delete geometry.userData.cityLodRanges;
  geometry.setDrawRange(0, count);
  return counts;
}

export type CityLodStats = {
  quality: CityLodQuality;
  fullMeshes: number;
  selectedMeshes: number;
  fullTriangles: number;
  selectedTriangles: number;
  reducedMeshes: number;
  controlledMeshes: number;
  largeBatches: number;
};

/** Call before EACH viewport render. Focus is the car/review target for an
 * orthographic camera, or camera world position for perspective. Counters are
 * selected scene geometry before renderer frustum/occlusion culling. */
export function createCityLod(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const slots: { mesh: THREE.Mesh; counts: Counts; bounds: THREE.Box3 }[] = [];
  const stats: CityLodStats = {
    quality: 'high',
    fullMeshes: 0,
    selectedMeshes: 0,
    fullTriangles: 0,
    selectedTriangles: 0,
    reducedMeshes: 0,
    controlledMeshes: 0,
    largeBatches: 0,
  };
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    stats.fullMeshes++;
    stats.fullTriangles +=
      (fullCount(object.geometry) / 3) *
      (object instanceof THREE.InstancedMesh ? object.count : 1);
    const counts = object.geometry.userData.cityLod as Counts | undefined;
    if (!counts || object instanceof THREE.InstancedMesh) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const bounds = object.geometry
      .boundingBox!.clone()
      .applyMatrix4(object.matrixWorld);
    if (
      Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) > 1280
    )
      stats.largeBatches++;
    slots.push({ mesh: object, counts, bounds });
  });
  stats.controlledMeshes = slots.length;
  stats.selectedMeshes = stats.fullMeshes;
  stats.selectedTriangles = stats.fullTriangles;
  let disposed = false;
  return {
    stats,
    update(
      focus: { x: number; z: number },
      quality: CityLodQuality,
      overview = false,
      worldUnitsPerPixel?: number,
    ): Readonly<CityLodStats> {
      if (disposed) return stats;
      stats.quality = quality;
      stats.selectedMeshes = stats.fullMeshes;
      stats.selectedTriangles = stats.fullTriangles;
      stats.reducedMeshes = 0;
      const limits = CITY_LOD_DISTANCE[quality];
      const projectedScale =
        overview && worldUnitsPerPixel !== undefined
          ? worldUnitsPerPixel *
            (quality === 'low' ? 1.4 : quality === 'high' ? 0.8 : 1)
          : undefined;
      for (const { mesh, counts, bounds } of slots) {
        // Nearest extent keeps a nearby building detailed even at a cell edge.
        const distance = Math.hypot(
          Math.max(bounds.min.x - focus.x, 0, focus.x - bounds.max.x),
          Math.max(bounds.min.z - focus.z, 0, focus.z - bounds.max.z),
        );
        const count =
          projectedScale !== undefined
            ? projectedScale > 1.2
              ? counts.silhouette
              : projectedScale > 0.45
                ? counts.landmark
                : counts.full
            : distance > limits.landmark
              ? counts.silhouette
              : distance > limits.house
                ? counts.landmark
                : counts.full;
        mesh.geometry.setDrawRange(0, count);
        // A zero-prefix batch contains details only; its building body is in a
        // separate permanent material batch. No complete building is hidden.
        mesh.visible = count > 0;
        if (!count) stats.selectedMeshes--;
        if (count < counts.full) stats.reducedMeshes++;
        stats.selectedTriangles -= (counts.full - count) / 3;
      }
      return stats;
    },
    dispose() {
      if (disposed) return;
      for (const { mesh, counts } of slots) {
        mesh.geometry.setDrawRange(0, counts.full);
        mesh.visible = true;
      }
      slots.length = 0;
      stats.selectedMeshes = stats.fullMeshes;
      stats.selectedTriangles = stats.fullTriangles;
      stats.reducedMeshes = 0;
      disposed = true;
    },
  };
}
