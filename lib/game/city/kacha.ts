/** Shared, compressed Kacha corridor. +x east, +z south; no layout import.
 * Northern boundary of the historic centre, joining the Yenisei at Strelka.
 * These are art-directed game anchors, not a survey: docs/kacha-reference-019.md. */
export type KachaPoint = { x: number; z: number };
export const KACHA_POINTS: readonly KachaPoint[] = [
  { x: -2500, z: -1200 },
  { x: -1950, z: -1050 },
  { x: -1500, z: -800 },
  { x: -1100, z: -600 },
  { x: -780, z: -440 },
  { x: -510, z: -355 },
  { x: -300, z: -308 },
  { x: -90, z: -280 },
  { x: 80, z: -274 },
  { x: 240, z: -250 },
  { x: 370, z: -220 },
  { x: 440, z: -165 },
  { x: 490, z: -85 },
  { x: 530, z: -10 },
];
export const KACHA_HALF_WIDTH = 6;
export const KACHA_BANK_WIDTH = 4.5;
export const KACHA_BANK_RISE = 2.2;
export const KACHA_BOUNDS = { minX: -2500, maxX: 530, minZ: -1200, maxZ: -10 };
let length = 0;
const segments = KACHA_POINTS.slice(1).map((to, i) => {
  const from = KACHA_POINTS[i],
    dx = to.x - from.x,
    dz = to.z - from.z;
  const distance = Math.hypot(dx, dz),
    start = length;
  length += distance;
  return {
    from,
    to,
    dx,
    dz,
    length: distance,
    start,
    nx: -dz / distance,
    nz: dx / distance,
  };
});
export const KACHA_LENGTH = length;
export const KACHA_RENDER_STEP = 12;
// The renderer tessellates each original segment independently. End the built
// banks at an actual strip boundary before the open mouth, not an approximate cut.
export const KACHA_BANK_END_ALONG = (() => {
  let end = 0;
  for (const s of segments) {
    const count = Math.ceil(s.length / KACHA_RENDER_STEP);
    for (let i = 1; i <= count; i++) {
      const at = s.start + (s.length * i) / count;
      if (at <= KACHA_LENGTH - 16) end = at;
    }
  }
  return end;
})();
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export function kachaWaterHeight(along: number) {
  return 0.03 + 8.47 * (1 - clamp(along / KACHA_LENGTH));
}

export function sampleKacha(x: number, z: number) {
  let best = Infinity,
    index = 0,
    t = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i],
      u = clamp(
        ((x - s.from.x) * s.dx + (z - s.from.z) * s.dz) / s.length ** 2,
      );
    const squared =
      (x - s.from.x - s.dx * u) ** 2 + (z - s.from.z - s.dz * u) ** 2;
    if (squared < best) {
      best = squared;
      index = i;
      t = u;
    }
  }
  const s = segments[index],
    px = s.from.x + s.dx * t,
    pz = s.from.z + s.dz * t;
  const along = s.start + s.length * t,
    waterHeight = kachaWaterHeight(along);
  return {
    x: px,
    z: pz,
    along,
    distance: Math.sqrt(best),
    signedDistance: (x - px) * s.nx + (z - pz) * s.nz,
    nx: s.nx,
    nz: s.nz,
    waterHeight,
    bedHeight: waterHeight - 1.4,
    bankHeight: waterHeight + KACHA_BANK_RISE,
  };
}

export function nearKacha(x: number, z: number, radius: number) {
  return (
    x >= KACHA_BOUNDS.minX - radius &&
    x <= KACHA_BOUNDS.maxX + radius &&
    z >= KACHA_BOUNDS.minZ - radius &&
    z <= KACHA_BOUNDS.maxZ + radius
  );
}
export function inKachaWater(x: number, z: number, padding = 0) {
  const radius = Math.max(0, KACHA_HALF_WIDTH + padding);
  return nearKacha(x, z, radius) && sampleKacha(x, z).distance <= radius;
}
/** Reserve both promenades, not only the blue water, before procedural parcels. */
export function inKachaCorridor(x: number, z: number, padding = 0) {
  return inKachaWater(x, z, KACHA_BANK_WIDTH + padding);
}

/** Conservative complete-rectangle clearance, including long parcels whose
 * corners miss a narrow river. Liang–Barsky clips each finite channel segment
 * against a parcel expanded by the water plus both promenade margins. */
export function kachaParcelClear(
  x: number,
  z: number,
  w: number,
  d: number,
  padding = 0,
) {
  const margin = KACHA_HALF_WIDTH + KACHA_BANK_WIDTH + Math.max(0, padding);
  const hw = w / 2 + margin,
    hd = d / 2 + margin;
  if (!nearKacha(x, z, Math.max(hw, hd))) return true;
  for (const segment of segments) {
    let enter = 0,
      leave = 1;
    for (const [origin, delta, half] of [
      [segment.from.x - x, segment.dx, hw],
      [segment.from.z - z, segment.dz, hd],
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (Math.abs(origin) > half) {
          enter = 2;
          break;
        }
      } else {
        const a = (-half - origin) / delta,
          b = (half - origin) / delta;
        enter = Math.max(enter, Math.min(a, b));
        leave = Math.min(leave, Math.max(a, b));
      }
    }
    if (enter <= leave) return false;
  }
  return true;
}

export function sampleKachaAlong(along: number) {
  const at = Math.max(0, Math.min(KACHA_LENGTH, along));
  const s = segments.find((p) => at <= p.start + p.length) ?? segments.at(-1)!;
  const t = clamp((at - s.start) / s.length),
    waterHeight = kachaWaterHeight(at);
  return {
    x: s.from.x + s.dx * t,
    z: s.from.z + s.dz * t,
    along: at,
    nx: s.nx,
    nz: s.nz,
    waterHeight,
    bedHeight: waterHeight - 1.4,
    bankHeight: waterHeight + KACHA_BANK_RISE,
  };
}

/** Mitered offsets share vertices at bends: no cracks between water/walk strips. */
export function kachaOffsetPoints(offset: number) {
  return KACHA_POINTS.map((p, i) => {
    const a = segments[Math.max(0, i - 1)],
      b = segments[Math.min(i, segments.length - 1)];
    const nx = a.nx + b.nx,
      nz = a.nz + b.nz,
      norm = Math.hypot(nx, nz);
    const mx = nx / norm,
      mz = nz / norm;
    const scale = offset / Math.max(0.5, mx * b.nx + mz * b.nz);
    return { x: p.x + mx * scale, z: p.z + mz * scale };
  });
}
export const KACHA_CHANNEL_OUTLINE = [
  ...kachaOffsetPoints(KACHA_HALF_WIDTH),
  ...kachaOffsetPoints(-KACHA_HALF_WIDTH).reverse(),
];
export const KACHA_CORRIDOR_OUTLINE = [
  ...kachaOffsetPoints(KACHA_HALF_WIDTH + KACHA_BANK_WIDTH),
  ...kachaOffsetPoints(-KACHA_HALF_WIDTH - KACHA_BANK_WIDTH).reverse(),
];

function offsetSlice(offset: number, start: number, end: number) {
  const points = kachaOffsetPoints(offset),
    result: KachaPoint[] = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i],
      a = Math.max(start, s.start),
      b = Math.min(end, s.start + s.length);
    if (b <= a) continue;
    for (const along of [a, b]) {
      const t = (along - s.start) / s.length;
      const p = {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        z: points[i].z + (points[i + 1].z - points[i].z) * t,
      };
      if (
        !result.length ||
        Math.hypot(p.x - result.at(-1)!.x, p.z - result.at(-1)!.z) > 1e-6
      )
        result.push(p);
    }
  }
  return result;
}
/** Built promenades replace terrain only up to their last rendered strip.
 * The final open mouth removes water alone and keeps the natural shore. */
export const KACHA_TERRAIN_HOLES = [
  [
    ...offsetSlice(
      KACHA_HALF_WIDTH + KACHA_BANK_WIDTH,
      0,
      KACHA_BANK_END_ALONG,
    ),
    ...offsetSlice(
      -KACHA_HALF_WIDTH - KACHA_BANK_WIDTH,
      0,
      KACHA_BANK_END_ALONG,
    ).reverse(),
  ],
  [
    ...offsetSlice(KACHA_HALF_WIDTH, KACHA_BANK_END_ALONG, KACHA_LENGTH),
    ...offsetSlice(
      -KACHA_HALF_WIDTH,
      KACHA_BANK_END_ALONG,
      KACHA_LENGTH,
    ).reverse(),
  ],
];

export type KachaRoad = {
  id: string;
  from: KachaPoint;
  to: KachaPoint;
  width: number;
};

/** Shared visual/physical inner-bank rail intervals. Gaps include the complete
 * road width and turning margin, so a bridge entrance never meets a cross rail. */
export function kachaBankRails(roads: readonly KachaRoad[]) {
  const rails: {
    from: KachaPoint;
    to: KachaPoint;
    fromHeight: number;
    toHeight: number;
  }[] = [];
  const edges = [-1, 1].map((side) =>
    kachaOffsetPoints(side * KACHA_HALF_WIDTH),
  );
  let along = 0;
  const roadDistance = (p: KachaPoint, road: KachaRoad) => {
    const dx = road.to.x - road.from.x,
      dz = road.to.z - road.from.z;
    const t = clamp(
      ((p.x - road.from.x) * dx + (p.z - road.from.z) * dz) /
        (dx * dx + dz * dz || 1),
    );
    return Math.hypot(p.x - road.from.x - dx * t, p.z - road.from.z - dz * t);
  };
  for (let segment = 1; segment < KACHA_POINTS.length; segment++) {
    const a = KACHA_POINTS[segment - 1],
      b = KACHA_POINTS[segment];
    const distance = Math.hypot(b.x - a.x, b.z - a.z),
      count = Math.ceil(distance / KACHA_RENDER_STEP);
    for (let i = 0; i < count; i++) {
      const start = along + (distance * i) / count,
        end = along + (distance * (i + 1)) / count;
      if (end > KACHA_BANK_END_ALONG + 1e-6) continue;
      for (const edge of edges) {
        const point = (t: number) => ({
          x: edge[segment - 1].x + (edge[segment].x - edge[segment - 1].x) * t,
          z: edge[segment - 1].z + (edge[segment].z - edge[segment - 1].z) * t,
        });
        const from = point(i / count),
          to = point((i + 1) / count),
          middle = point((i + 0.5) / count);
        if (
          middle.x <= -780 ||
          roads.some((road) =>
            [from, middle, to].some(
              (p) => roadDistance(p, road) <= road.width / 2 + 7,
            ),
          )
        )
          continue;
        rails.push({
          from,
          to,
          fromHeight: kachaWaterHeight(start) + KACHA_BANK_RISE,
          toHeight: kachaWaterHeight(end) + KACHA_BANK_RISE,
        });
      }
    }
    along += distance;
  }
  return rails;
}
/** Actual finite road/river intersections, including crossings at polyline nodes. */
export function kachaRoadCrossings(roads: readonly KachaRoad[]) {
  const result: {
    road: KachaRoad;
    x: number;
    z: number;
    along: number;
    roadT: number;
    halfLength: number;
    waterHeight: number;
    deckHeight: number;
    nx: number;
    nz: number;
  }[] = [];
  for (const road of roads) {
    const dx = road.to.x - road.from.x,
      dz = road.to.z - road.from.z,
      roadLength = Math.hypot(dx, dz);
    if (roadLength < 0.01) continue;
    for (const s of segments) {
      const determinant = dx * s.dz - dz * s.dx;
      if (Math.abs(determinant) < 1e-6) continue;
      const qx = s.from.x - road.from.x,
        qz = s.from.z - road.from.z;
      const roadT = (qx * s.dz - qz * s.dx) / determinant,
        riverT = (qx * dz - qz * dx) / determinant;
      if (
        roadT < -1e-6 ||
        roadT > 1.000001 ||
        riverT < -1e-6 ||
        riverT > 1.000001
      )
        continue;
      const x = road.from.x + dx * roadT,
        z = road.from.z + dz * roadT;
      if (
        result.some(
          (p) => p.road.id === road.id && Math.hypot(p.x - x, p.z - z) < 0.01,
        )
      )
        continue;
      const along = s.start + s.length * clamp(riverT),
        waterHeight = kachaWaterHeight(along);
      const sine = Math.abs(determinant) / (roadLength * s.length);
      result.push({
        road,
        x,
        z,
        along,
        roadT,
        waterHeight,
        deckHeight: waterHeight + KACHA_BANK_RISE + 0.22,
        halfLength:
          (KACHA_HALF_WIDTH + KACHA_BANK_WIDTH + 0.8) / Math.max(0.12, sine),
        nx: -dz / roadLength,
        nz: dx / roadLength,
      });
    }
  }
  return result;
}

/** Short guard intervals leave shared street junctions fully open. Both the
 * renderer and physical guards consume these same pieces. */
export function kachaBridgeRails(roads: readonly KachaRoad[]) {
  const rails: { road: KachaRoad; from: KachaPoint; to: KachaPoint }[] = [];
  const distance = (p: KachaPoint, road: KachaRoad) => {
    const dx = road.to.x - road.from.x,
      dz = road.to.z - road.from.z;
    const t = clamp(
      ((p.x - road.from.x) * dx + (p.z - road.from.z) * dz) /
        (dx * dx + dz * dz || 1),
    );
    return Math.hypot(p.x - road.from.x - dx * t, p.z - road.from.z - dz * t);
  };
  for (const crossing of kachaRoadCrossings(roads)) {
    if (crossing.along > KACHA_BANK_END_ALONG) continue;
    const { road, nx, nz, halfLength } = crossing;
    const count = Math.max(2, Math.ceil((halfLength * 2) / 5));
    for (const side of [-1, 1]) {
      const offset = side * (road.width / 2 + 0.35);
      const point = (t: number) => ({
        x: crossing.x + nz * (-halfLength + halfLength * 2 * t) + nx * offset,
        z: crossing.z - nx * (-halfLength + halfLength * 2 * t) + nz * offset,
      });
      for (let i = 0; i < count; i++) {
        const from = point(i / count),
          to = point((i + 1) / count),
          middle = point((i + 0.5) / count);
        if (
          roads.some(
            (other) =>
              other.id !== road.id &&
              [from, middle, to].some(
                (p) => distance(p, other) < other.width / 2 + 2,
              ),
          )
        )
          continue;
        rails.push({ road, from, to });
      }
    }
  }
  return rails;
}
