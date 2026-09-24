import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { cityRoads, distanceToRoad } from '../../../lib/game/city/layout.ts';
import {
  CITY_KUBATURA_TERRACE,
  cityGroundHeight,
  cityKubaturaTerraceDistance,
  cityKubaturaRetainingEdges,
  cityKubaturaRetainingCorners,
} from '../../../lib/game/city/surface.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { drapedSurface } from './relief.ts';

/** Owner aerial: a raised parking terrace, rounded retaining wall and lower
 * perimeter drive. The 10 m rise is art direction, not a surveyed height. */
export function createKubaturaTerrace(kit: RenderKit, root: THREE.Group) {
  const g = new THREE.Group();
  g.name = 'parking:kubatura';
  root.add(g);
  const outline = CITY_KUBATURA_TERRACE.outline;
  const pavement = drapedSurface(
    kit,
    g,
    [outline],
    '#68787a',
    cityGroundHeight,
    0.08,
    4,
    [],
    0.025,
  );
  const unindexed = pavement.geometry;
  unindexed.deleteAttribute('normal');
  pavement.geometry = mergeVertices(unindexed, 0.00001);
  pavement.geometry.computeVertexNormals();
  kit.geometries.delete(unindexed);
  kit.geometries.add(pavement.geometry);
  unindexed.dispose();
  pavement.name = 'kubatura:terrace-pavement';
  pavement.userData.reliefPlaced = true;
  const placed = (mesh: THREE.Mesh, name: string) => {
    mesh.name = name;
    mesh.userData.reliefPlaced = true;
    return mesh;
  };
  const entry = CITY_KUBATURA_TERRACE.entry;
  const clear = (x: number, z: number, margin: number) =>
    cityKubaturaTerraceDistance(x, z) < -margin &&
    cityRoads.every((r) => distanceToRoad(x, z, r) > r.width / 2 + margin + 1);
  // Markings stop at the actual clipped edge; no parking bays painted across
  // the public quay or the broad entry ramp. Each piece uses physical heights.
  for (let x = entry.to.x - 39; x <= entry.to.x + 39; x += 2.8) {
    for (const z of [entry.to.z - 22, entry.to.z + 17]) {
      if (!clear(x, z, 3)) continue;
      const stripe = drapedSurface(
        kit,
        g,
        [
          [
            { x: x - 0.045, z: z - 2.25 },
            { x: x + 0.045, z: z - 2.25 },
            { x: x + 0.045, z: z + 2.25 },
            { x: x - 0.045, z: z + 2.25 },
          ],
        ],
        '#e4dfd3',
        cityGroundHeight,
        0.104,
        2,
      );
      placed(stripe, 'kubatura:parking-line');
    }
  }
  // The same segments form vehicle collision, leaving the entry mouth open.
  for (const {
    p,
    q,
    nx,
    nz,
    topA,
    topB,
    lowA,
    lowB,
  } of cityKubaturaRetainingEdges()) {
    const dx = q.x - p.x,
      dz = q.z - p.z,
      length = Math.hypot(dx, dz),
      x = (p.x + q.x) / 2,
      z = (p.z + q.z) / 2;
    // Slightly tilted support follows the same three-metre terrain toe.
    // Horizontal courses preserve the stepped masonry seen in the aerial.
    for (let course = 0; course < 9; course++) {
      const hi = course / 9,
        lo = (course + 1) / 9;
      const vertices = [
        p.x + nx * 3 * hi,
        topA + (lowA - topA) * hi,
        p.z + nz * 3 * hi,
        q.x + nx * 3 * hi,
        topB + (lowB - topB) * hi,
        q.z + nz * 3 * hi,
        q.x + nx * 3 * lo,
        topB + (lowB - topB) * lo,
        q.z + nz * 3 * lo,
        p.x + nx * 3 * lo,
        topA + (lowA - topA) * lo,
        p.z + nz * 3 * lo,
      ];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();
      placed(
        kit.mesh(geometry, kit.material(course % 2 ? '#5d574e' : '#6c655b'), g),
        'kubatura:retaining-wall',
      );
    }
    const top = (topA + topB) / 2,
      cap = placed(
        kit.box(length + 0.05, 0.16, 0.4, '#e4dfd3', x, top + 0.08, z, g, 0),
        'kubatura:terrace-cap',
      );
    cap.rotation.y = -Math.atan2(dz, dx);
    const rail = placed(
      kit.box(length + 0.05, 0.055, 0.06, '#68787a', x, top + 0.92, z, g, 0),
      'kubatura:terrace-railing',
    );
    rail.rotation.y = cap.rotation.y;
    placed(
      kit.box(0.055, 0.83, 0.055, '#68787a', p.x, topA + 0.48, p.z, g, 0),
      'kubatura:terrace-railing',
    );
  }
  for (const { point, top, left, right } of cityKubaturaRetainingCorners()) {
    const at = (toe: typeof left, t: number) => [
      point.x + (toe.x - point.x) * t,
      top + (toe.y - top) * t,
      point.z + (toe.z - point.z) * t,
    ];
    for (let course = 0; course < 9; course++) {
      const hi = course / 9,
        lo = (course + 1) / 9,
        geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [
            ...at(left, hi),
            ...at(right, hi),
            ...at(right, lo),
            ...at(left, lo),
          ],
          3,
        ),
      );
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();
      placed(
        kit.mesh(geometry, kit.material(course % 2 ? '#5d574e' : '#6c655b'), g),
        'kubatura:retaining-corner',
      );
    }
  }
  return g;
}
