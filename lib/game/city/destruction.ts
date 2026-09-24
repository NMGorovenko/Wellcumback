import { cityBarriers } from './barriers.ts';
import { cityTrees } from './trees.ts';
import { cityGroundHeight, cityRoadHeight } from './surface.ts';
import { cityRoads } from './layout.ts';

/** A compact persistent direction per object, plus a bounded animation tail.
 * Marks survive reconnect/host handoff without replaying old impacts. */
export type CityImpact = [
  id: number,
  time: number,
  direction: number,
  force: number,
];
export type CityDamage = { marks: string; hits: CityImpact[] };
const roads = new Map(cityRoads.map((r) => [r.id, r]));
export const breakableObjects = [
  ...cityBarriers.map((b, id) => ({
    ...b,
    id,
    kind: 'rail' as const,
    y: cityRoadHeight(roads.get(b.roadId!)!, b.x, b.z),
  })),
  ...cityTrees.map((p, i) => ({
    id: cityBarriers.length + i,
    kind: 'tree' as const,
    x: p.x,
    z: p.z,
    y: cityGroundHeight(p.x, p.z),
    w: 0.38 * p.scale,
    d: 0.38 * p.scale,
    angle: 0,
  })),
];
export const freshCityDamage = (): CityDamage => ({ marks: '', hits: [] });
export function brokenDirection(damage: CityDamage | undefined, id: number) {
  const code = damage?.marks.charCodeAt(id) ?? NaN;
  return code >= 65 && code <= 80 ? ((code - 65) * Math.PI * 2) / 16 : null;
}
export const isCityObjectBroken = (
  damage: CityDamage | undefined,
  id: number,
) => brokenDirection(damage, id) !== null;

const cellSize = 32,
  grid = new Map<string, number[]>();
for (const o of breakableObjects) {
  const radius = Math.hypot(o.w, o.d) / 2 + 3;
  for (
    let x = Math.floor((o.x - radius) / cellSize);
    x <= Math.floor((o.x + radius) / cellSize);
    x++
  )
    for (
      let z = Math.floor((o.z - radius) / cellSize);
      z <= Math.floor((o.z + radius) / cellSize);
      z++
    ) {
      const key = `${x}:${z}`,
        ids = grid.get(key) ?? [];
      ids.push(o.id);
      grid.set(key, ids);
    }
}
export function cityBreakablesAt(
  x: number,
  z: number,
  y: number,
  damage?: CityDamage,
) {
  return (
    grid.get(`${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`) ?? []
  ).filter((id) => {
    const o = breakableObjects[id];
    if (isCityObjectBroken(damage, id) || Math.abs(o.y - y) > 2.5) return false;
    const dx = x - o.x,
      dz = z - o.z,
      a = o.angle ?? 0;
    return (
      Math.abs(dx * Math.cos(a) - dz * Math.sin(a)) < o.w / 2 + 0.85 &&
      Math.abs(dx * Math.sin(a) + dz * Math.cos(a)) < o.d / 2 + 0.85
    );
  });
}
/** Returns false for a brush along a rail or a slow nudge. */
export function strikeCityObject(
  damage: CityDamage,
  id: number,
  vx: number,
  vz: number,
  time: number,
) {
  const o = breakableObjects[id];
  if (!o || isCityObjectBroken(damage, id)) return false;
  const impact =
    o.kind === 'rail'
      ? Math.abs(vx * Math.cos(o.angle ?? 0) - vz * Math.sin(o.angle ?? 0))
      : Math.hypot(vx, vz);
  if (impact < (o.kind === 'rail' ? 8 : 6.5)) return false;
  const bin =
    ((Math.round((Math.atan2(vx, vz) / (Math.PI * 2)) * 16) % 16) + 16) % 16;
  const marks = damage.marks.padEnd(id + 1, '.');
  damage.marks =
    marks.slice(0, id) + String.fromCharCode(65 + bin) + marks.slice(id + 1);
  damage.hits.push([
    id,
    time,
    (bin * Math.PI * 2) / 16,
    Math.min(1, impact / 28),
  ]);
  if (damage.hits.length > 16) damage.hits.shift();
  return true;
}
export function validCityDamage(value: unknown): value is CityDamage | undefined {
  if (value === undefined) return true; // Old local saves start with intact scenery.
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const d = value as CityDamage;
  return (
    typeof d.marks === 'string' &&
    d.marks.length <= breakableObjects.length &&
    /^[.A-P]*$/.test(d.marks) &&
    Array.isArray(d.hits) &&
    d.hits.length <= 16 &&
    new Set(d.hits.map((h) => (Array.isArray(h) ? h[0] : -1))).size ===
      d.hits.length &&
    d.hits.every(
      (h) =>
        Array.isArray(h) &&
        h.length === 4 &&
        h.every(Number.isFinite) &&
        Number.isInteger(h[0]) &&
        h[0] >= 0 &&
        h[0] < breakableObjects.length &&
        h[1] >= 0 &&
        h[1] <= 1e9 &&
        h[2] >= 0 &&
        h[2] < Math.PI * 2 &&
        h[3] >= 0 &&
        h[3] <= 1 &&
        isCityObjectBroken(d, h[0]),
    )
  );
}
