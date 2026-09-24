import * as THREE from 'three';
import {
  cityRoads,
  distanceToRoad,
  inCityWater,
  type CityRoad,
} from '../../../lib/game/city/layout.ts';
import {
  cityGroundHeight,
  cityRoadHeight,
} from '../../../lib/game/city/surface.ts';
import type { RenderKit } from '../world/render-kit.ts';

type BridgeDetailsOptions = {
  roads?: readonly CityRoad[];
  roadHeight?: (road: CityRoad, x: number, z: number) => number;
  groundHeight?: (x: number, z: number) => number;
  isWater?: (x: number, z: number) => boolean;
};

/** World-height geometry: attach outside any ground-draped scenery group.
 * Replaces generic Nikolaevsky beams/piers and street lamps, not its road/rails.
 */
export function createNikolaevskyDetails(
  kit: RenderKit,
  parent: THREE.Group,
  options: BridgeDetailsOptions = {},
) {
  const roads = options.roads ?? cityRoads;
  const roadHeight = options.roadHeight ?? cityRoadHeight;
  const groundHeight = options.groundHeight ?? cityGroundHeight;
  const isWater = options.isWater ?? inCityWater;
  let total = 0;
  const path = roads
    .filter((r) => r.bridge === 'nikolaevsky')
    .map((road) => {
      const dx = road.to.x - road.from.x,
        dz = road.to.z - road.from.z;
      const length = Math.hypot(dx, dz);
      const segment = { road, start: total, length, dx, dz };
      total += length;
      return segment;
    })
    .filter((segment) => segment.length > 0);
  const group = new THREE.Group();
  group.name = 'nikolaevsky:structure-and-lamps';
  parent.add(group);
  if (!path.length) return group;
  const sample = (along: number, lateral = 0, below = 0) => {
    const s =
      path.find((part) => along <= part.start + part.length) ?? path.at(-1)!;
    const t = THREE.MathUtils.clamp((along - s.start) / s.length, 0, 1);
    const nx = -s.dz / s.length,
      nz = s.dx / s.length;
    const x = s.road.from.x + s.dx * t + nx * lateral;
    const z = s.road.from.z + s.dz * t + nz * lateral;
    return {
      point: new THREE.Vector3(x, roadHeight(s.road, x, z) - below, z),
      width: s.road.width,
      nx,
      nz,
      angle: Math.atan2(s.dx, s.dz),
    };
  };
  // One inexpensive eight-sided cylinder per member; batchCity merges materials.
  const member = (
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number,
    color: string,
  ) => {
    const delta = to.clone().sub(from);
    if (delta.lengthSq() < 0.0001) return;
    const mesh = kit.mesh(
      new THREE.CylinderGeometry(radius, radius, delta.length(), 8),
      kit.material(color),
      group,
    );
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return mesh;
  };
  const steel = '#68787a',
    concrete = '#aab0a6';
  let waterStart = total,
    waterEnd = 0;
  for (let along = 0; along <= total; along += 2) {
    const { point } = sample(along);
    if (isWater(point.x, point.z)) {
      waterStart = Math.min(waterStart, along);
      waterEnd = Math.max(waterEnd, along);
    }
  }
  const riverLength = Math.max(0, waterEnd - waterStart);
  const scale = THREE.MathUtils.clamp(riverLength / 776.68, 0.35, 1);
  const girderDepth = 3.16 * scale;
  const supportDepth = 12 * scale;
  // The beams stay continuous across road-segment boundaries.
  for (let along = 0; along < total; along += 8) {
    const next = Math.min(total, along + 8),
      width = sample(along).width;
    for (const side of [-1, 1]) {
      const a = sample(along, side * width * 0.33, 0.8 + girderDepth / 2).point;
      const b = sample(next, side * width * 0.33, 0.8 + girderDepth / 2).point;
      const beam = kit.box(
        0.7,
        girderDepth,
        a.distanceTo(b),
        steel,
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        (a.z + b.z) / 2,
        group,
        0,
      );
      beam.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        b.clone().sub(a).normalize(),
      );
      beam.name = 'nikolaevsky:girder';
    }
  }
  const pier = (along: number, river: boolean) => {
    const s = sample(along),
      p = s.point;
    if (
      roads.some(
        (road) =>
          road.layer === 'lower' &&
          distanceToRoad(p.x, p.z, road) < road.width / 2 + 5,
      )
    )
      return;
    const bottom = groundHeight(p.x, p.z) - 0.45;
    const top = p.y - (river ? supportDepth : 0.8 + girderDepth);
    const height = top - bottom;
    if (height < 1) return;
    const g = new THREE.Group();
    g.name = river ? 'nikolaevsky:river-pier' : 'nikolaevsky:approach-pier';
    g.position.set(p.x, bottom, p.z);
    g.rotation.y = s.angle;
    group.add(g);
    const width = river ? s.width * 0.15 : s.width * 0.085;
    const depth = river ? s.width * 0.21 : s.width * 0.14;
    for (const side of [-1, 1]) {
      const x = side * s.width * 0.3;
      // Eight-corner footprint softens the large concrete mass in side view.
      const c = width * 0.16;
      const shape = new THREE.Shape();
      shape.moveTo(-width / 2 + c, -depth / 2);
      for (const [sx, sz] of [
        [width / 2 - c, -depth / 2],
        [width / 2, -depth / 2 + c],
        [width / 2, depth / 2 - c],
        [width / 2 - c, depth / 2],
        [-width / 2 + c, depth / 2],
        [-width / 2, depth / 2 - c],
        [-width / 2, -depth / 2 + c],
      ])
        shape.lineTo(sx, sz);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: false,
        steps: 1,
      });
      geometry.rotateX(-Math.PI / 2);
      const column = kit.mesh(geometry, kit.material(concrete), g);
      column.position.x = x;
      if (!river) {
        const shoulder = new THREE.Shape();
        shoulder.moveTo(-width / 2, height - Math.min(3, height * 0.3));
        shoulder.lineTo(width / 2, height - Math.min(3, height * 0.3));
        shoulder.lineTo(width, height);
        shoulder.lineTo(-width, height);
        shoulder.closePath();
        const cap = kit.mesh(
          new THREE.ExtrudeGeometry(shoulder, {
            depth,
            bevelEnabled: false,
            steps: 1,
          }),
          kit.material(concrete),
          g,
        );
        cap.position.set(x, 0, -depth / 2);
      }
    }
    if (river)
      kit.box(
        s.width * 0.73,
        Math.min(3.5, height * 0.3),
        depth,
        concrete,
        0,
        Math.min(3.5, height * 0.3) / 2,
        0,
        g,
        0,
      );
  };
  if (riverLength > 60) {
    const weights = [92.69, 147, 147, 147, 147, 92.69];
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    let start = waterStart;
    pier(start, true);
    for (const weight of weights) {
      const length = (riverLength * weight) / weightTotal;
      const end = start + length;
      const width = sample((start + end) / 2).width;
      for (const side of [-1, 1]) {
        const arc = (u: number) =>
          sample(
            start + length * u,
            side * width * 0.33,
            0.8 +
              girderDepth +
              (supportDepth - 0.8 - girderDepth) * (2 * u - 1) ** 2,
          ).point;
        for (let i = 0; i < 14; i++) {
          const mesh = member(arc(i / 14), arc((i + 1) / 14), 0.28, steel);
          if (mesh) mesh.name = 'nikolaevsky:curved-strut';
        }
        for (const u of [0.1, 0.2, 0.3, 0.7, 0.8, 0.9])
          member(
            arc(u),
            sample(start + length * u, side * width * 0.33, 0.8 + girderDepth)
              .point,
            0.1,
            steel,
          );
      }
      pier(end, true);
      start = end;
    }
  }
  for (let along = 15; along < total - 8; along += 38)
    if (riverLength <= 60 || along < waterStart - 9 || along > waterEnd + 9)
      pier(along, false);
  const glow = kit.material('#e7ddbf');
  glow.emissive.set('#b8a775');
  glow.emissiveIntensity = 0.22;
  for (let along = 8; along < total - 4; along += 29)
    for (const side of [-1, 1]) {
      const width = sample(along).width;
      const s = sample(along, side * (width / 2 - 0.55));
      const bottom = s.point.clone().add(new THREE.Vector3(0, 0.2, 0));
      const top = s.point.clone().add(new THREE.Vector3(0, 9, 0));
      const tip = top
        .clone()
        .add(new THREE.Vector3(-side * s.nx * 1.5, 0.45, -side * s.nz * 1.5));
      const mast = member(bottom, top, 0.105, '#68787a');
      if (mast) mast.name = 'nikolaevsky:deck-lamp';
      member(top, tip, 0.06, '#68787a');
      const head = kit.box(
        0.82,
        0.12,
        0.25,
        '#e7ddbf',
        tip.x,
        tip.y,
        tip.z,
        group,
        0,
      );
      head.material = glow;
      head.rotation.y = s.angle;
    }
  // The downstream railway is a separate, lower, dark through-truss silhouette.
  // Keep its shared axis tied to the road bridge, but its track level independent
  // of road ramps. Restrict it to its own water crossing, clear of bank roads.
  const railwayOffsetX = 48;
  const railwayWidth = 8;
  const railwayPoint = (along: number, lateral = 0) => {
    const s = sample(along);
    return new THREE.Vector3(
      s.point.x + railwayOffsetX + s.nx * lateral,
      0,
      s.point.z + s.nz * lateral,
    );
  };
  const railwayClear = (along: number) => {
    const p = railwayPoint(along);
    return roads.every(
      (road) =>
        distanceToRoad(p.x, p.z, road) > road.width / 2 + railwayWidth / 2 + 2,
    );
  };
  let railwayStart = total,
    railwayEnd = 0;
  let runStart: number | undefined;
  for (let along = 0; along <= total; along += 2) {
    const p = railwayPoint(along);
    if (isWater(p.x, p.z) && railwayClear(along)) {
      runStart ??= along;
      if (along - runStart > railwayEnd - railwayStart) {
        railwayStart = runStart;
        railwayEnd = along;
      }
    } else runStart = undefined;
  }
  if (railwayEnd - railwayStart > 35) {
    const railway = new THREE.Group();
    railway.name = 'nikolaevsky:railway-bridge';
    railway.userData.offsetX = railwayOffsetX;
    group.add(railway);
    const railwayLength = railwayEnd - railwayStart;
    const spans = 4;
    const spanLength = railwayLength / spans;
    const trackLevel = Math.max(
      8,
      Math.min(sample(railwayStart).point.y, sample(railwayEnd).point.y) - 1.8,
    );
    const trussHeight = 5;
    railway.userData.trackLevel = trackLevel;
    railway.userData.spanCount = spans;
    const trackPoint = (along: number, lateral = 0, y = trackLevel) => {
      const p = railwayPoint(along, lateral);
      p.y = y;
      return p;
    };
    const railMember = (
      from: THREE.Vector3,
      to: THREE.Vector3,
      width: number,
      height: number,
      name: string,
      color = '#384b50',
    ) => {
      const delta = to.clone().sub(from);
      const beam = kit.box(
        width,
        height,
        delta.length(),
        color,
        (from.x + to.x) / 2,
        (from.y + to.y) / 2,
        (from.z + to.z) / 2,
        railway,
        0,
      );
      beam.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        delta.normalize(),
      );
      beam.name = name;
      return beam;
    };
    for (let i = 0; i < spans; i++) {
      const a = railwayStart + spanLength * i,
        b = a + spanLength;
      railMember(
        trackPoint(a, 0, trackLevel - 0.55),
        trackPoint(b, 0, trackLevel - 0.55),
        railwayWidth,
        0.7,
        'railway:deck',
        '#556064',
      );
      for (const side of [-1, 1]) {
        const lateral = side * (railwayWidth / 2 - 0.2);
        for (const y of [trackLevel, trackLevel + trussHeight])
          railMember(
            trackPoint(a, lateral, y),
            trackPoint(b, lateral, y),
            0.28,
            0.3,
            'railway:chord',
          );
        for (let panel = 0; panel <= 4; panel++) {
          const start = a + (spanLength * panel) / 4;
          railMember(
            trackPoint(start, lateral),
            trackPoint(start, lateral, trackLevel + trussHeight),
            0.2,
            0.2,
            'railway:vertical',
          );
          if (panel < 4) {
            const end = a + (spanLength * (panel + 1)) / 4;
            railMember(
              trackPoint(
                start,
                lateral,
                trackLevel + (panel % 2 ? trussHeight : 0),
              ),
              trackPoint(
                end,
                lateral,
                trackLevel + (panel % 2 ? 0 : trussHeight),
              ),
              0.16,
              0.18,
              'railway:diagonal',
            );
          }
        }
      }
      for (let panel = 0; panel <= 4; panel++) {
        const along = a + (spanLength * panel) / 4;
        railMember(
          trackPoint(along, -3.8, trackLevel + trussHeight),
          trackPoint(along, 3.8, trackLevel + trussHeight),
          0.16,
          0.2,
          'railway:crossbeam',
        );
      }
      for (const lateral of [-2.25, -1.15, 1.15, 2.25])
        railMember(
          trackPoint(a, lateral, trackLevel + 0.12),
          trackPoint(b, lateral, trackLevel + 0.12),
          0.075,
          0.11,
          'railway:rail',
          '#919b98',
        );
    }
    for (let along = railwayStart; along <= railwayEnd; along += 2)
      railMember(
        trackPoint(along, -3.1, trackLevel - 0.015),
        trackPoint(along, 3.1, trackLevel - 0.015),
        0.22,
        0.16,
        'railway:sleeper',
        '#625e50',
      );
    for (let i = 0; i <= spans; i++) {
      const along = railwayStart + spanLength * i;
      const p = trackPoint(along);
      const bottom = groundHeight(p.x, p.z) - 0.3;
      const height = trackLevel - 0.9 - bottom;
      if (height <= 0 || !railwayClear(along)) continue;
      const support = kit.box(
        5.4,
        height,
        2.4,
        '#8d968e',
        p.x,
        bottom + height / 2,
        p.z,
        railway,
        0,
      );
      support.name = 'railway:pier';
      support.rotation.y = sample(along).angle;
    }
  }
  return group;
}
