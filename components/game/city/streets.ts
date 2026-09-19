import * as THREE from 'three';
import {
  BRIDGES,
  cityRoads,
  riverBankZ,
  CITY_BOUNDS,
} from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { citySceneryFits, type CitySceneryPlacement } from './landmarks.ts';
import { cityCrossings } from '../../../lib/game/city/crossings.ts';

/** Small street furniture uses the same placement clearance as the older quays.
 * Roads stay open, with no new invisible collision boxes. */
export function createStreetDetails(
  kit: RenderKit,
  root: THREE.Group,
  lit: THREE.Material,
  existing: CitySceneryPlacement[],
) {
  const spots: { x: number; z: number; radius: number }[] = [];
  const clear = (x: number, z: number, radius: number) =>
    citySceneryFits({ x, z }, radius) &&
    [...existing, ...spots].every(
      (p) => Math.hypot(p.x - x, p.z - z) > p.radius + radius + 0.6,
    );
  function lamp(x: number, z: number, turn: number) {
    if (!clear(x, z, 0.45)) return;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = turn;
    root.add(g);
    kit.cylinder(0.07, 0.12, 3.2, '#40545a', 0, 1.6, 0, g);
    kit.box(0.9, 0.1, 0.32, '#40545a', 0.3, 3.2, 0, g, 0);
    kit.box(0.66, 0.08, 0.25, '#f3d5a3', 0.3, 3.13, 0, g, 0).material = lit;
    kit.cylinder(0.19, 0.23, 0.22, '#6e7e82', 0, 0.11, 0, g);
    spots.push({ x, z, radius: 0.45 });
  }
  for (const side of [-1, 1])
    for (let x = CITY_BOUNDS.minX + 10; x <= CITY_BOUNDS.maxX - 10; x += 110) {
      if (BRIDGES.some((b) => Math.abs(x - b.x) < b.w / 2 + 4)) continue;
      lamp(x, riverBankZ(x, side) + side * 2.5, 0);
    }
  for (const road of cityRoads) {
    const dx = road.to.x - road.from.x,
      dz = road.to.z - road.from.z,
      len = Math.hypot(dx, dz),
      nx = -dz / len,
      nz = dx / len;
    for (let t = 12; t < len - 5; t += 110)
      for (const side of [-1, 1]) {
        const x =
            road.from.x + (dx * t) / len + nx * side * (road.width / 2 + 1.5),
          z = road.from.z + (dz * t) / len + nz * side * (road.width / 2 + 1.5);
        lamp(x, z, Math.atan2(nx, -nz));
      }
  }
  // Painted zebra crossings are flush with the tarmac and cannot block a car.
  for (const c of cityCrossings) {
    const g = new THREE.Group();
    g.name = `crossing:${c.roadId}:${c.x}:${c.z}`;
    g.position.set(c.x, 0, c.z);
    g.rotation.y = Math.atan2(c.tx, c.tz);
    root.add(g);
    for (let strip = -c.width / 2 + 0.5; strip < c.width / 2; strip++)
      kit.box(0.5, 0.012, c.depth, '#e4dfc0', strip, 0.082, 0, g, 0);
    for (const side of [-1, 1]) {
      const x = side * (c.width / 2 + 0.85);
      kit.cylinder(0.055, 0.075, 2.5, '#68787a', x, 1.25, -side * 1.6, g);
      kit.box(0.8, 0.8, 0.08, '#327398', x, 2.5, -side * 1.6, g, 0);
      for (const facing of [-1, 1]) {
        const triangle = new THREE.Shape();
        triangle.moveTo(-0.33, -0.29);
        triangle.lineTo(0.33, -0.29);
        triangle.lineTo(0, 0.31);
        triangle.closePath();
        const face = kit.mesh(
          new THREE.ShapeGeometry(triangle),
          kit.material('#f1edcd'),
          g,
        );
        face.position.set(x, 2.5, -side * 1.6 + facing * 0.05);
        face.rotation.y = facing < 0 ? Math.PI : 0;
        // The walking person is ink on the sign, not a collection of tiny
        // cylinders and spheres. Flat geometry keeps its silhouette readable
        // while dense neighbourhoods do not multiply hundreds of hidden faces.
        const ink = kit.material('#263b42');
        const head = kit.mesh(new THREE.CircleGeometry(0.055, 8), ink, g);
        head.position.set(x, 2.58, face.position.z + facing * 0.015);
        head.rotation.y = facing < 0 ? Math.PI : 0;
        const person = new THREE.Shape();
        const outline = [
          [-0.01, 0.06],
          [0.08, 0.025],
          [0.14, -0.04],
          [0.12, -0.065],
          [0.05, -0.015],
          [0.04, -0.08],
          [0.14, -0.16],
          [0.1, -0.19],
          [0.015, -0.12],
          [-0.08, -0.19],
          [-0.11, -0.16],
          [-0.04, -0.07],
          [-0.04, 0],
          [-0.12, -0.045],
          [-0.14, -0.02],
          [-0.035, 0.055],
        ];
        outline.forEach(([px, py], i) =>
          i ? person.lineTo(px, py) : person.moveTo(px, py),
        );
        person.closePath();
        const body = kit.mesh(new THREE.ShapeGeometry(person), ink, g);
        body.position.set(x, 2.45, face.position.z + facing * 0.015);
        body.rotation.y = facing < 0 ? Math.PI : 0;
      }
    }
  }
  // Rounded trees fill a few previously empty sidewalk pockets, never mission rings.
  for (const p of [
    { x: 8, z: -65 },
    { x: 52, z: -66 },
    { x: 65, z: 30 },
    { x: -80, z: -37 },
    { x: -28, z: 35 },
    { x: 22, z: -38 },
  ]) {
    if (!clear(p.x, p.z, 1.35)) continue;
    kit.cylinder(0.1, 0.17, 2.5, '#6c6650', p.x, 1.25, p.z, root);
    kit.sphere(1.25, 1.65, 1.25, '#708858', p.x, 3.1, p.z, root, 10);
    kit.cylinder(1.3, 1.3, 0.1, '#d4d2b7', p.x, 0.08, p.z, root);
    spots.push({ ...p, radius: 1.35 });
  }
  return spots;
}
