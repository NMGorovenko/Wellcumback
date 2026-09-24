import * as THREE from 'three';
import {
  BRIDGES,
  CITY_NAMED_STREETS,
  cityRoads,
  riverBankZ,
  CITY_BOUNDS,
  compactCityPoint,
} from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { citySceneryFits, type CitySceneryPlacement } from './landmarks.ts';
import { facadeText } from './facade-text.ts';
import { cityCrossings } from '../../../lib/game/city/crossings.ts';

/** One shared lens material keeps all scenic signals in caution mode. Scene
 * time drives the blink, so pausing/rejoining never waits on a hidden timer. */
export function createStreetSignalLight(kit: RenderKit) {
  const material = kit.material('#6a5229', 0.66);
  material.name = 'city-caution-signals';
  material.emissive.set('#ffb83f');
  const update = (time: number) => {
    material.emissiveIntensity = ((time % 1.2) + 1.2) % 1.2 < 0.6 ? 1.8 : 0;
  };
  update(0);
  return { material, update };
}

/** Small street furniture uses the same placement clearance as the older quays.
 * Roads stay open, with no new invisible collision boxes. */
export function createStreetDetails(
  kit: RenderKit,
  root: THREE.Group,
  lit: THREE.Material,
  existing: CitySceneryPlacement[],
  signalLight: THREE.Material = createStreetSignalLight(kit).material,
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
      // The western bank is an unpaved cliff; lights belong to its roads,
      // not to a waterfront promenade embedded in the steep earth face.
      if (side === -1 && x < -450) continue;
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
        lamp(x, z, Math.atan2(side * nz, -side * nx));
      }
  }
  for (const street of CITY_NAMED_STREETS) {
    const road = cityRoads.find(
      (r) =>
        street.roadIds.includes(r.id) &&
        !r.bridge &&
        Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z) > 55,
    );
    if (!road) continue;
    const dx = road.to.x - road.from.x,
      dz = road.to.z - road.from.z;
    const length = Math.hypot(dx, dz),
      nx = -dz / length,
      nz = dx / length;
    for (const t of [0.22, 0.7]) {
      const x = road.from.x + dx * t + nx * (road.width / 2 + 4.5);
      const z = road.from.z + dz * t + nz * (road.width / 2 + 4.5);
      if (!clear(x, z, 3.5)) continue;
      const sign = new THREE.Group();
      sign.position.set(x, 0, z);
      sign.rotation.y = Math.atan2(-nx, -nz);
      sign.name = `street-name:${street.name}`;
      root.add(sign);
      kit.box(6.4, 1.1, 0.16, '#244e69', 0, 3.8, 0, sign, 0.03);
      for (const side of [-1, 1])
        kit.box(0.12, 4.3, 0.12, '#8b9795', side * 2.4, 2.15, 0, sign, 0);
      facadeText(kit, sign, street.name, '#f2f2e2', 6, 0, 3.8, 0.09);
      spots.push({ x, z, radius: 3.5 });
      break;
    }
  }
  // Painted zebra crossings are flush with the tarmac and cannot block a car.
  for (const c of cityCrossings) {
    const g = new THREE.Group();
    g.name = `crossing:${c.roadId}:${c.x}:${c.z}`;
    g.position.set(c.x, 0, c.z);
    g.rotation.y = Math.atan2(c.tx, c.tz);
    root.add(g);
    function paint(width: number, depth: number, x: number, z: number) {
      const mesh = kit.mesh(
        new THREE.PlaneGeometry(width, depth),
        kit.material('#e7e6dc'),
        g,
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.103, z);
      mesh.castShadow = false;
    }
    for (let strip = -c.width / 2 + 0.65; strip < c.width / 2 - 0.3; strip++)
      paint(0.5, c.depth, strip, 0);
    if (c.signal)
      paint(
        c.width / 2 - 0.5,
        0.3,
        (c.direction * c.width) / 4,
        c.direction * (c.depth / 2 + 2),
      );
    for (const side of [-1, 1]) {
      const x = side * (c.width / 2 + 1.7),
        z = -side * 1.6;
      const worldX = c.x + x * c.tz + z * c.tx,
        worldZ = c.z - x * c.tx + z * c.tz;
      // Check the whole sign footprint against every road, parking area and
      // building. A safe distance from its own lane alone is not sufficient.
      if (!clear(worldX, worldZ, 0.65)) continue;
      spots.push({ x: worldX, z: worldZ, radius: 0.65 });
      const signal = c.signal && side === c.direction;
      kit.cylinder(
        0.055,
        0.075,
        signal ? 3.95 : 2.7,
        '#68787a',
        x,
        signal ? 1.975 : 1.35,
        z,
        g,
      );
      kit.box(0.96, 0.96, 0.08, '#bfc15d', x, 2.5, z, g, 0);
      kit.box(0.8, 0.8, 0.1, '#327398', x, 2.5, z, g, 0);
      if (signal) {
        kit.box(0.46, 1.15, 0.35, '#263b42', x, 3.52, z, g, 0);
        for (const [index, color] of [
          '#563e39',
          '#6a5229',
          '#344e44',
        ].entries()) {
          const light = kit.mesh(
            new THREE.CircleGeometry(0.12, 10),
            index === 1 ? signalLight : kit.material(color),
            g,
          );
          light.castShadow = false;
          light.position.set(x, 3.87 - index * 0.35, z + c.direction * 0.18);
          light.rotation.y = c.direction < 0 ? Math.PI : 0;
        }
      }
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
        face.position.set(x, 2.5, z + facing * 0.06);
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
  ].map(compactCityPoint)) {
    if (!clear(p.x, p.z, 1.35)) continue;
    kit.cylinder(0.1, 0.17, 2.5, '#6c6650', p.x, 1.25, p.z, root);
    kit.sphere(1.25, 1.65, 1.25, '#708858', p.x, 3.1, p.z, root, 10);
    kit.cylinder(1.3, 1.3, 0.1, '#d4d2b7', p.x, 0.08, p.z, root);
    spots.push({ ...p, radius: 1.35 });
  }
  return spots;
}
