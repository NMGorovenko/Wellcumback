import { decorateBridgeRail } from './bridge-details.ts';
import * as THREE from 'three';
import { cityBarriers } from '../../../lib/game/city/barriers.ts';
import { cityRoads } from '../../../lib/game/city/layout.ts';
import { cityRoadHeight } from '../../../lib/game/city/surface.ts';
import type { RenderKit } from '../world/render-kit.ts';
import { liftScenery } from './relief.ts';

/** Render exactly the collision footprints, including openings at same-level junctions. */
export function createBridgeRails(kit: RenderKit, parent: THREE.Group) {
  const roads = new Map(cityRoads.map((road) => [road.id, road]));
  const groups: THREE.Group[] = [];
  for (const barrier of cityBarriers) {
    const road = roads.get(barrier.roadId ?? '');
    if (!road) continue;
    const group = new THREE.Group();
    group.userData.barrier = barrier;
    parent.add(group);
    groups.push(group);
    if (decorateBridgeRail(kit, group, barrier, road)) continue;
    const curb = kit.box(
      barrier.w,
      0.24,
      barrier.d,
      '#a8b2ad',
      barrier.x,
      0.12,
      barrier.z,
      group,
      0,
    );
    curb.rotation.y = barrier.angle ?? 0;
    curb.userData.reliefDrape = true;
    liftScenery(kit, group, (x, z) => cityRoadHeight(road, x, z));
    const angle = barrier.angle ?? 0;
    const point = (distance: number, height: number) => {
      const x = barrier.x + Math.sin(angle) * distance;
      const z = barrier.z + Math.cos(angle) * distance;
      return new THREE.Vector3(x, cityRoadHeight(road, x, z) + height, z);
    };
    const end = Math.max(0, barrier.d / 2 - 0.07);
    const parts = Math.max(1, Math.ceil((end * 2) / 3.5));
    for (let i = 0; i < parts; i++) {
      const a = -end + (end * 2 * i) / parts;
      const b = -end + (end * 2 * (i + 1)) / parts;
      for (const y of [0.55, 1.05])
        kit.rod(point(a, y), point(b, y), 0.065, '#b7c1bd', group);
      kit.rod(point(a, 0.24), point(a, 1.08), 0.06, '#657a80', group);
    }
    kit.rod(point(end, 0.24), point(end, 1.08), 0.06, '#657a80', group);
  }
  return groups;
}
