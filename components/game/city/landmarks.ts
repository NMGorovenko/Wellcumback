import * as THREE from 'three';
import {
  BRIDGES,
  CITY_PARKING,
  CITY_BOUNDS,
  ROUNDABOUT,
  inCityWater,
  riverBankZ,
  cityBuildings,
  cityRoads,
  cityStops,
  distanceToRoad,
  type CityBuilding,
  type CityPoint,
} from '../../../lib/game/city/layout.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { createWhiteHorse } from './monuments.ts';

const palette = {
  stone: '#d4d2b7',
  cream: '#e4dfd3',
  metal: '#40545a',
  roof: '#68787a',
  glass: '#3c5159',
  wood: '#b79b72',
  green: '#708858',
  gold: '#e8dca7',
};
export type CitySceneryPlacement = CityPoint & {
  kind: 'shelter' | 'parking' | 'quay' | 'monument';
  radius: number;
};

/** Scenery has no new collision rules. Keep its full footprint outside roads,
 * bridge mouths, water, stops and the drift lane using the canonical layout. */
export function citySceneryFits(point: CityPoint, radius: number) {
  return (
    point.x - radius >= CITY_BOUNDS.minX &&
    point.x + radius <= CITY_BOUNDS.maxX &&
    point.z - radius >= CITY_BOUNDS.minZ &&
    point.z + radius <= CITY_BOUNDS.maxZ &&
    !inCityWater(point.x, point.z, radius) &&
    cityRoads.every(
      (road) =>
        distanceToRoad(point.x, point.z, road) >=
        road.width / 2 + radius + 0.25,
    ) &&
    Math.hypot(point.x - ROUNDABOUT.x, point.z - ROUNDABOUT.z) >=
      ROUNDABOUT.outerRadius + radius &&
    cityStops.every(
      (stop) => Math.hypot(point.x - stop.x, point.z - stop.z) >= 3.4 + radius,
    ) &&
    CITY_PARKING.every(
      (p) =>
        Math.abs(point.x - p.x) > p.w / 2 + radius ||
        Math.abs(point.z - p.z) > p.d / 2 + radius,
    ) &&
    cityBuildings.every(
      (building) =>
        Math.abs(point.x - building.x) >= building.w / 2 + radius ||
        Math.abs(point.z - building.z) >= building.d / 2 + radius,
    )
  );
}

function stationDetails(
  kit: RenderKit,
  root: THREE.Group,
  building: CityBuilding,
  lit: THREE.Material,
) {
  const { x, z, w, d, h } = building;
  const front = z + d / 2;
  // A pale civic facade, repeated arched openings and sheltered entrance.
  kit.box(w + 0.35, 0.28, 0.3, palette.cream, x, 0.23, front + 0.12, root, 0);
  kit.box(
    w + 0.45,
    0.25,
    0.44,
    palette.cream,
    x,
    h - 0.3,
    front + 0.16,
    root,
    0,
  );
  for (const offset of [-9, -5, 0, 5, 9]) {
    const arch = new THREE.Shape();
    arch.moveTo(0.78, 0);
    arch.lineTo(0.78, 1.85);
    arch.absarc(0, 1.85, 0.78, 0, Math.PI, false);
    arch.lineTo(-0.78, 0);
    arch.closePath();
    const glass = kit.mesh(
      new THREE.ShapeGeometry(arch, 10),
      kit.material(palette.glass),
      root,
    );
    glass.position.set(x + offset, 0.42, front + 0.18);
    kit.box(
      0.065,
      2.2,
      0.1,
      palette.cream,
      x + offset,
      1.52,
      front + 0.24,
      root,
      0,
    );
    kit.box(
      1.52,
      0.065,
      0.1,
      palette.cream,
      x + offset,
      1.85,
      front + 0.24,
      root,
      0,
    );
  }
  for (const offset of [-11, -7, -2.2, 2.2, 7, 11]) {
    kit.box(
      0.48,
      h - 0.4,
      0.34,
      palette.cream,
      x + offset,
      h / 2,
      front + 0.2,
      root,
      0,
    );
    kit.box(
      0.72,
      0.2,
      0.48,
      palette.cream,
      x + offset,
      h - 0.4,
      front + 0.25,
      root,
      0,
    );
  }
  kit.box(5.9, 0.16, 1.6, palette.roof, x, 3.05, front + 0.82, root, 0);
  for (const side of [-1, 1])
    kit.cylinder(
      0.09,
      0.1,
      2.9,
      palette.metal,
      x + side * 2.6,
      1.5,
      front + 1.35,
      root,
    );
  const pediment = new THREE.Shape();
  pediment.moveTo(-2.8, 0);
  pediment.lineTo(0, 1.3);
  pediment.lineTo(2.8, 0);
  pediment.closePath();
  const top = kit.mesh(
    new THREE.ShapeGeometry(pediment),
    kit.material(palette.cream),
    root,
  );
  top.position.set(x, h + 1.85, front + 0.23);
  const clockRim = kit.torus(
    0.76,
    0.055,
    palette.metal,
    x,
    h + 0.9,
    front + 0.36,
    root,
  );
  clockRim.castShadow = false;
  // Compressed covered platform and rails fit behind the existing station, inside the map.
  const platformZ = z - d / 2 - 2;
  kit.box(w, 0.35, 3.2, palette.stone, x, 0.19, platformZ, root, 0);
  kit.box(w + 0.4, 0.16, 3.5, palette.roof, x, 3, platformZ, root, 0);
  for (const offset of [-10, -5, 0, 5, 10]) {
    kit.cylinder(
      0.09,
      0.09,
      2.8,
      palette.metal,
      x + offset,
      1.6,
      platformZ,
      root,
    );
    const light = kit.box(
      0.9,
      0.07,
      0.22,
      palette.gold,
      x + offset,
      2.86,
      platformZ,
      root,
      0,
    );
    light.material = lit;
  }
  for (const railZ of [z - d / 2 - 4.1, z - d / 2 - 4.9])
    kit.box(w, 0.09, 0.1, palette.metal, x, 0.1, railZ, root, 0);
  for (let offset = -11; offset <= 11; offset += 1.3)
    kit.box(
      0.16,
      0.07,
      1.25,
      palette.wood,
      x + offset,
      0.055,
      z - d / 2 - 4.5,
      root,
      0,
    );
}

function campusDetails(
  kit: RenderKit,
  root: THREE.Group,
  building: CityBuilding,
) {
  const { x, z, w, d, h } = building;
  // Distinguish the existing left-bank academic block from repeated apartments.
  kit.box(w + 0.25, 0.45, d + 0.25, palette.cream, x, h - 0.15, z, root, 0);
  kit.box(w - 0.5, 0.55, 0.15, palette.green, x, 3.2, z + d / 2 + 0.1, root, 0);
  for (const side of [-1, 1])
    kit.box(
      0.55,
      h,
      0.25,
      palette.cream,
      x + side * (w / 2 - 0.5),
      h / 2,
      z + d / 2 + 0.13,
      root,
      0,
    );
  kit.box(3.5, 0.2, 1.3, palette.roof, x, 2.4, z + d / 2 + 0.55, root, 0);
  for (const offset of [-5.5, 5.5]) {
    const treeX = x - w / 2 - 1.8,
      treeZ = z + offset;
    kit.cylinder(0.14, 0.22, 3.2, palette.cream, treeX, 1.6, treeZ, root);
    for (const level of [0.9, 1.7, 2.3])
      kit.box(0.24, 0.08, 0.24, palette.metal, treeX, level, treeZ, root, 0);
    kit.sphere(0.95, 1.7, 0.95, palette.green, treeX, 3.3, treeZ, root, 10);
  }
}
function bench(
  kit: RenderKit,
  root: THREE.Object3D,
  x: number,
  z: number,
  width = 1.6,
) {
  kit.box(width, 0.1, 0.48, palette.wood, x, 0.53, z, root, 0);
  kit.box(width, 0.43, 0.09, palette.wood, x, 0.86, z + 0.2, root, 0);
  for (const side of [-1, 1])
    kit.box(
      0.12,
      0.5,
      0.45,
      palette.metal,
      x + side * width * 0.34,
      0.25,
      z,
      root,
      0,
    );
}
function shelter(
  kit: RenderKit,
  root: THREE.Group,
  p: CityPoint,
  lit: THREE.Material,
) {
  const group = new THREE.Group();
  group.position.set(p.x, 0, p.z);
  group.rotation.y = p.z < 0 ? Math.PI : 0;
  root.add(group);
  kit.box(4.6, 0.14, 1.55, palette.roof, 0, 2.45, 0, group, 0);
  for (const side of [-1, 1])
    kit.box(0.1, 2.35, 0.1, palette.metal, side * 2.1, 1.22, 0.55, group, 0);
  kit.box(4.1, 1.55, 0.065, '#aebec1', 0, 1.4, 0.6, group, 0);
  bench(kit, group, -0.45, 0.12, 2.8);
  kit.box(0.62, 1.12, 0.08, palette.cream, 1.55, 1.3, 0.5, group, 0);
  for (const y of [1.02, 1.22, 1.42])
    kit.box(0.4, 0.035, 0.035, palette.metal, 1.55, y, 0.445, group, 0);
  const light = kit.box(2.6, 0.05, 0.16, palette.gold, 0, 2.34, 0, group, 0);
  light.material = lit;
  // Familiar blue public transport pictogram, kept legible without another text sprite.
  kit.box(0.75, 0.76, 0.1, '#367f9e', -1.45, 2.2, -0.79, group, 0);
  kit.box(0.39, 0.42, 0.11, palette.cream, -1.45, 2.19, -0.85, group, 0);
  kit.box(0.3, 0.16, 0.12, palette.glass, -1.45, 2.26, -0.87, group, 0);
}

/** All opaque geometry joins environment.ts material batching; no new lights,
 * textures, animations or per-window draw calls are allocated. */
export function createCityLandmarks(
  kit: RenderKit,
  root: THREE.Group,
  lit: THREE.Material,
) {
  const placements: CitySceneryPlacement[] = [];
  for (const building of cityBuildings) {
    if (building.kind === 'station') stationDetails(kit, root, building, lit);
    if (building.kind === 'university') campusDetails(kit, root, building);
  }
  for (const point of [
    { x: -27, z: -64 },
    { x: 68, z: 64 },
  ]) {
    if (!citySceneryFits(point, 2.4)) continue;
    shelter(kit, root, point, lit);
    placements.push({ ...point, kind: 'shelter', radius: 2.4 });
  }
  // Flush parking paint never changes collision or fabricates new mission entrances.
  for (const p of [
    { x: -79, z: -62.5 },
    { x: 78, z: 63 },
  ]) {
    const clear = cityRoads.every(
      (road) => distanceToRoad(p.x, p.z, road) >= road.width / 2 + 0.9,
    );
    if (!clear) continue;
    for (let slot = 0; slot < 3; slot++) {
      const x = p.x + slot * 2.2;
      for (const side of [-1, 1])
        kit.box(
          0.06,
          0.012,
          1.4,
          palette.cream,
          x + side * 0.95,
          0.08,
          p.z,
          root,
          0,
        );
      kit.box(1.96, 0.012, 0.06, palette.cream, x, 0.08, p.z + 0.7, root, 0);
    }
    placements.push({ ...p, kind: 'parking', radius: 0 });
  }
  for (const side of [-1, 1])
    for (const x of [-78, -28, 8, 70]) {
      if (BRIDGES.some((bridge) => Math.abs(x - bridge.x) < bridge.w / 2 + 4))
        continue;
      const p = { x, z: riverBankZ(x, side) + side * 2.2 };
      if (!citySceneryFits(p, 1.05)) continue;
      const group = new THREE.Group();
      group.position.set(p.x, 0, p.z);
      group.rotation.y = 0 + (side < 0 ? Math.PI : 0);
      root.add(group);
      bench(kit, group, 0, 0);
      if (x === -78 || x === 70) {
        kit.cylinder(0.075, 0.09, 3.8, palette.metal, 0.65, 1.9, 0.42, group);
        kit.box(0.8, 0.09, 0.35, palette.metal, 0.39, 3.75, 0.42, group, 0);
        const bulb = kit.box(
          0.68,
          0.08,
          0.28,
          palette.gold,
          0.39,
          3.68,
          0.42,
          group,
          0,
        );
        bulb.material = lit;
      }
      placements.push({ ...p, kind: 'quay', radius: 1.05 });
    }
  const horse = createWhiteHorse(kit, root);
  placements.push({ ...horse, kind: 'monument' });
  return placements;
}
