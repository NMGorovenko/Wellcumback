import * as THREE from 'three';
import {
  BRIDGES,
  cityRoads,
  distanceToRoad,
  inCityWater,
  type CityRect,
  type CityRoad,
} from '../../../lib/game/city/layout.ts';
import {
  CITY_DECK_THICKNESS,
  cityGroundHeight,
  cityRoadHeight,
} from '../../../lib/game/city/surface.ts';
import type { RenderKit } from '../world/render-kit.ts';

const isDetailed = (road: CityRoad) =>
  road.bridge === 'kommunalny' ||
  road.bridge === 'oktyabrsky' ||
  road.id === 'veynbauma:0' ||
  road.id === 'veynbauma:1';

// Two-sided flat ironwork owns a per-kit material variant. Never change side
// on kit.material(), which is shared with walls, roads and other city props.
const ironMaterials = new WeakMap<
  RenderKit,
  Map<string, THREE.MeshStandardMaterial>
>();
function ironMaterial(kit: RenderKit, color: string) {
  let materials = ironMaterials.get(kit);
  if (!materials) {
    materials = new Map();
    ironMaterials.set(kit, materials);
  }
  let material = materials.get(color);
  if (!material) {
    material = kit.material(color).clone();
    material.name = `bridge-iron:${color}`;
    material.side = THREE.DoubleSide;
    materials.set(color, material);
    kit.materials.add(material);
  }
  return material;
}

const ironGeometries = new WeakMap<RenderKit, THREE.PlaneGeometry>();
function ironGeometry(kit: RenderKit) {
  let geometry = ironGeometries.get(kit);
  if (!geometry) {
    geometry = new THREE.PlaneGeometry(1, 1);
    // Keep the original diagonal; only the vertex storage becomes local/unit.
    geometry.setIndex([3, 1, 0, 3, 0, 2]);
    ironGeometries.set(kit, geometry);
  }
  return geometry;
}

function primitives(kit: RenderKit, group: THREE.Group) {
  const mesh = (geometry: THREE.BufferGeometry, color: string) => {
    const result = kit.mesh(geometry, kit.material(color), group);
    result.userData.reliefPlaced = true;
    return result;
  };
  const bar = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    width: number,
    height: number,
    color: string,
  ) => {
    const delta = b.clone().sub(a);
    if (delta.lengthSq() < 0.000001) return;
    const result = mesh(
      new THREE.BoxGeometry(width, height, delta.length()),
      color,
    );
    result.position.copy(a).add(b).multiplyScalar(0.5);
    const forward = delta.normalize();
    const right = new THREE.Vector3().crossVectors(
      new THREE.Vector3(0, 1, 0),
      forward,
    );
    if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
    else right.normalize();
    const up = new THREE.Vector3().crossVectors(forward, right).normalize();
    result.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, forward),
    );
    return result;
  };
  // Flat ironwork is deliberately two-sided. Its silhouette needs many pickets,
  // but each picket costs two triangles rather than a cylinder or rounded box.
  const iron = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    width: number,
    normal: THREE.Vector3,
    color: string,
  ) => {
    const along = b.clone().sub(a);
    const length = along.length();
    if (length < 0.000001) return;
    const up = along.multiplyScalar(1 / length);
    const right = new THREE.Vector3().crossVectors(up, normal).normalize();
    const forward = new THREE.Vector3().crossVectors(right, up).normalize();
    // The same four world-space corners, held as a unit plane plus transform.
    // UVs and PlaneGeometry type also support the shared destruction instances.
    const result = kit.mesh(ironGeometry(kit), ironMaterial(kit, color), group);
    result.position.copy(a).add(b).multiplyScalar(0.5);
    result.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, forward),
    );
    result.scale.set(width, length, 1);
    result.userData.reliefPlaced = true;
    return result;
  };
  return { mesh, bar, iron };
}

/** Called INSIDE createBridgeRails' original group, retaining userData.barrier
 * and its destructible children. Return false to keep the generic rail.
 * All meshes already contain world heights; do not ground-lift them again.
 */
export function decorateBridgeRail(
  kit: RenderKit,
  group: THREE.Group,
  barrier: CityRect,
  road: CityRoad,
): boolean {
  if (!isDetailed(road)) return false;
  const { bar, iron } = primitives(kit, group);
  const angle = barrier.angle ?? 0;
  const normal = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
  const end = Math.max(0, barrier.d / 2 - 0.12);
  if (end < 0.02) return true;
  const point = (along: number, height: number) => {
    const x = barrier.x + Math.sin(angle) * along;
    const z = barrier.z + Math.cos(angle) * along;
    return new THREE.Vector3(x, cityRoadHeight(road, x, z) + height, z);
  };
  const communal =
    road.bridge === 'kommunalny' || road.id.startsWith('veynbauma:');
  const baseHeight = communal ? 0.3 : 0.36;
  bar(
    point(-end, baseHeight / 2),
    point(end, baseHeight / 2),
    barrier.w,
    baseHeight,
    communal ? '#805e51' : '#b6c1c0',
  );
  if (communal) {
    const metal = '#40545a';
    for (const height of [0.4, 1.29])
      bar(point(-end, height), point(end, height), 0.09, 0.08, metal);
    const pickets = Math.max(1, Math.ceil((2 * end) / 0.46));
    for (let i = 0; i <= pickets; i++) {
      const at = -end + (2 * end * i) / pickets;
      iron(point(at, 0.39), point(at, 1.26), 0.045, normal, metal);
    }
    for (const at of [-end + 0.06, end - 0.06])
      bar(point(at, 0.32), point(at, 1.35), 0.16, 0.16, metal);
    // A shallow garland/wreath, not a full circular ring. The reference shows
    // repeated hanging U-shaped cast-iron motifs between dense vertical bars.
    if (2 * end > 2.4) {
      const half = Math.min(1.05, end - 0.32);
      const garland = (t: number) =>
        point(-half + 2 * half * t, 1.1 - 0.4 * Math.sin(Math.PI * t));
      for (let i = 0; i < 10; i++) {
        iron(garland(i / 10), garland((i + 1) / 10), 0.105, normal, metal);
        if (i > 0 && i < 9) {
          const a = garland(i / 10);
          const b = a
            .clone()
            .add(
              new THREE.Vector3(
                Math.sin(angle) * 0.13,
                0.14,
                Math.cos(angle) * 0.13,
              ),
            );
          iron(a, b, 0.06, normal, metal);
        }
      }
    }
  } else {
    const aqua = '#8baca6';
    bar(point(-end, 1.2), point(end, 1.2), 0.13, 0.12, '#b6c1c0');
    for (const height of [0.6, 0.92])
      bar(point(-end, height), point(end, height), 0.075, 0.075, aqua);
    const panels = Math.max(1, Math.ceil((2 * end) / 3.6));
    for (let i = 0; i <= panels; i++) {
      const at = -end + (2 * end * i) / panels;
      iron(point(at, 0.39), point(at, 1.18), 0.06, normal, aqua);
    }
    for (let i = 0; i < panels; i++) {
      const center = -end + (2 * end * (i + 0.5)) / panels;
      const half = Math.min(0.42, (end / panels) * 0.6);
      iron(point(center - half, 1.02), point(center, 0.7), 0.11, normal, aqua);
      iron(point(center, 0.7), point(center + half, 1.02), 0.11, normal, aqua);
    }
  }
  return true;
}

/** Code-native bridge structures and road-level furniture. No road, collider,
 * navigation or terrain mutation. Place beside createNikolaevskyDetails.
 * Median is opt-in until lane-aware navigation can avoid its centreline.
 */
export function createBridgeDetails(
  kit: RenderKit,
  root: THREE.Group,
  options: { includeMedian?: boolean } = {},
) {
  const group = new THREE.Group();
  group.name = 'krasnoyarsk:bridge-details';
  group.userData.reliefPlaced = true;
  root.add(group);
  const { mesh, bar } = primitives(kit, group);
  for (const bridge of BRIDGES.filter(
    (b) => b.id === 'kommunalny' || b.id === 'oktyabrsky',
  )) {
    const communal = bridge.id === 'kommunalny';
    const roads = [
      ...(communal
        ? ['veynbauma:1', 'veynbauma:0'].map((id) => {
            const r = cityRoads.find((r) => r.id === id)!;
            return { ...r, from: r.to, to: r.from };
          })
        : []),
      ...cityRoads.filter((road) => road.bridge === bridge.id),
    ];
    let total = 0;
    const path = roads
      .map((road) => {
        const length = Math.hypot(
          road.to.x - road.from.x,
          road.to.z - road.from.z,
        );
        const part = { road, length, start: total };
        total += length;
        return part;
      })
      .filter((part) => part.length > 0.001);
    if (!path.length) continue;
    const sample = (along: number, lateral = 0, offset = 0) => {
      const part =
        path.find((p) => along <= p.start + p.length) ?? path.at(-1)!;
      const t = THREE.MathUtils.clamp((along - part.start) / part.length, 0, 1);
      const tx = (part.road.to.x - part.road.from.x) / part.length;
      const tz = (part.road.to.z - part.road.from.z) / part.length;
      const x = part.road.from.x + tx * part.length * t - tz * lateral;
      const z = part.road.from.z + tz * part.length * t + tx * lateral;
      return {
        point: new THREE.Vector3(
          x,
          cityRoadHeight(part.road, x, z) + offset,
          z,
        ),
        tx,
        tz,
        width: part.road.width,
      };
    };
    const water: { start: number; end: number }[] = [];
    for (let along = 0; along < total; along += 1) {
      const p = sample(along + 0.5).point;
      if (!inCityWater(p.x, p.z)) continue;
      const previous = water.at(-1);
      if (previous && Math.abs(previous.end - along) < 0.01)
        previous.end = Math.min(total, along + 1);
      else water.push({ start: along, end: Math.min(total, along + 1) });
    }
    const lowerRoadAt = (p: THREE.Vector3) =>
      cityRoads.some(
        (road) =>
          road.bridge !== bridge.id &&
          distanceToRoad(p.x, p.z, road) < road.width / 2 + 3 &&
          cityRoadHeight(road, p.x, p.z) < p.y - 1.8,
      );
    const pier = (along: number, arch = false) => {
      const s = sample(along);
      if (lowerRoadAt(s.point)) return;
      const bottom = cityGroundHeight(s.point.x, s.point.z) - 0.7;
      const top = s.point.y - CITY_DECK_THICKNESS - 0.25;
      if (top - bottom < 1.5) return;
      const width = communal ? s.width * 0.74 : s.width * 0.36;
      for (const side of communal ? [0] : [-1, 1]) {
        const p = sample(along, side * s.width * 0.25).point;
        const column = mesh(
          new THREE.BoxGeometry(width, top - bottom, arch ? 2.6 : 3.6),
          communal ? '#c8bdad' : '#b6c1c0',
        );
        column.position.set(p.x, (bottom + top) / 2, p.z);
        column.rotation.y = Math.atan2(s.tx, s.tz);
        column.name = `${bridge.id}:broad-pier`;
      }
    };
    // Use global arc length. Road subdivision must not restart spans/piers.
    water.forEach((run, runIndex) => {
      const start = Math.max(1, run.start - 1);
      const finish = Math.min(total - 1, run.end + 1);
      const length = finish - start;
      if (length < 5) return;
      const arch = communal && runIndex === 0;
      const bays = Math.max(
        1,
        Math.min(arch ? 5 : 8, Math.round(length / (arch ? 42 : 25))),
      );
      for (let bay = 0; bay < bays; bay++) {
        const a = start + (length * bay) / bays;
        const b = start + (length * (bay + 1)) / bays;
        const width = sample((a + b) / 2).width;
        if (arch) {
          const rise = Math.min(6.5, (b - a) * 0.16);
          for (const side of [-1, 1]) {
            const arc = (u: number) =>
              sample(
                a + (b - a) * u,
                side * width * 0.36,
                -CITY_DECK_THICKNESS - 0.8 - rise * (2 * u - 1) ** 2,
              ).point;
            for (let i = 0; i < 18; i++) {
              const rib = bar(
                arc(i / 18),
                arc((i + 1) / 18),
                0.95,
                0.85,
                '#c8bdad',
              );
              if (rib) rib.name = 'kommunalny:concrete-arch';
            }
            for (const u of [0.1, 0.22, 0.34, 0.66, 0.78, 0.9])
              bar(
                arc(u),
                sample(
                  a + (b - a) * u,
                  side * width * 0.36,
                  -CITY_DECK_THICKNESS,
                ).point,
                0.32,
                0.32,
                '#c8bdad',
              );
          }
        } else {
          for (const side of [-1, 1]) {
            for (let at = a; at < b; at += 4) {
              const next = Math.min(b, at + 4);
              const lateral = side * width * 0.33;
              bar(
                sample(at, lateral, -1.65).point,
                sample(next, lateral, -1.65).point,
                0.72,
                1.6,
                communal ? '#c8bdad' : '#68787a',
              );
              if (!communal)
                bar(
                  sample(at, lateral, -0.9).point,
                  sample(at, lateral, -2.35).point,
                  0.88,
                  0.1,
                  '#68787a',
                );
            }
          }
        }
        pier(a, arch);
        if (bay === bays - 1) pier(b, arch);
      }
    });
    // Tall, slender edge masts and bridge wiring dominate a driver's view.
    const lamps = Math.max(1, Math.ceil((total - 12) / 30));
    for (const side of [-1, 1]) {
      let previousWire: THREE.Vector3 | undefined;
      for (let i = 0; i <= lamps; i++) {
        const along = 6 + ((total - 12) * i) / lamps;
        const s = sample(along, side * (bridge.w / 2 - 0.4));
        const base = s.point.clone().add(new THREE.Vector3(0, 0.27, 0));
        const top = s.point
          .clone()
          .add(new THREE.Vector3(0, communal ? 7.6 : 8.3, 0));
        const mast = bar(base, top, 0.14, 0.14, '#68787a');
        if (mast) mast.name = `${bridge.id}:deck-lamp`;
        const inward = new THREE.Vector3(
          side * s.tz * 1.65,
          0.75,
          -side * s.tx * 1.65,
        );
        for (const lift of communal ? [0] : [0, 0.55]) {
          const shoulder = top.clone().add(new THREE.Vector3(0, lift, 0));
          const elbow = shoulder
            .clone()
            .add(inward.clone().multiplyScalar(0.24));
          const tip = shoulder.clone().add(inward);
          bar(shoulder, elbow, 0.07, 0.07, '#68787a');
          bar(elbow, tip, 0.07, 0.07, '#68787a');
          const head = bar(
            tip.clone().add(new THREE.Vector3(-s.tx * 0.25, 0, -s.tz * 0.25)),
            tip.clone().add(new THREE.Vector3(s.tx * 0.25, 0, s.tz * 0.25)),
            0.22,
            0.1,
            '#e4dfd3',
          );
          if (head) head.name = `${bridge.id}:lamp-head`;
        }
        const wire = s.point.clone().add(new THREE.Vector3(0, 6.3, 0));
        if (previousWire)
          for (const dy of [0, 0.45]) {
            const a = previousWire.clone().add(new THREE.Vector3(0, dy, 0));
            const b = wire.clone().add(new THREE.Vector3(0, dy, 0));
            const mid = a
              .clone()
              .add(b)
              .multiplyScalar(0.5)
              .add(new THREE.Vector3(0, -0.1, 0));
            bar(a, mid, 0.025, 0.025, '#40545a');
            bar(mid, b, 0.025, 0.025, '#40545a');
          }
        previousWire = wire;
      }
    }
    if (!communal && options.includeMedian) {
      for (let at = 5; at < total - 5; at += 4) {
        const next = Math.min(total - 5, at + 4);
        const p = sample((at + next) / 2).point;
        const junction = cityRoads.some(
          (r) =>
            r.bridge !== bridge.id &&
            distanceToRoad(p.x, p.z, r) < r.width / 2 + 2 &&
            Math.abs(cityRoadHeight(r, p.x, p.z) - p.y) < 1.5,
        );
        if (junction) continue;
        for (const side of [-1, 1])
          bar(
            sample(at, side * 0.18, 0.63).point,
            sample(next, side * 0.18, 0.63).point,
            0.08,
            0.22,
            '#68787a',
          );
        bar(
          sample(at, 0, 0.04).point,
          sample(at, 0, 0.68).point,
          0.12,
          0.12,
          '#65706c',
        );
      }
    }
  }
  return group;
}
