import type { Course } from './course.ts';

export type TrackTerrain = {
  positions: Float32Array;
  indices: Uint32Array;
  colors: Float32Array;
  heightAt: (x: number, z: number) => number;
};

/** One height per world position. A swept ribbon folds over itself at hairpins. */
const cache = new WeakMap<Course, Map<number, TrackTerrain>>();
export function createTrackTerrain(course: Course, cell = 4): TrackTerrain {
  const cached = cache.get(course)?.get(cell);
  if (cached) return cached;
  const margin = 110;
  const minX =
    Math.floor((Math.min(...course.points.map((p) => p.x)) - margin) / cell) *
    cell;
  const minZ =
    Math.floor((Math.min(...course.points.map((p) => p.z)) - margin) / cell) *
    cell;
  const nx =
    Math.ceil(
      (Math.max(...course.points.map((p) => p.x)) + margin - minX) / cell,
    ) + 1;
  const nz =
    Math.ceil(
      (Math.max(...course.points.map((p) => p.z)) + margin - minZ) / cell,
    ) + 1;
  const count = nx * nz;
  let heights = new Float32Array(count);
  const lateral = new Float32Array(count),
    ceiling = new Float32Array(count).fill(Infinity);
  // The distant hills need a coarse height field, not hundreds of thousands of
  // exact road projections. The fine corridor ceiling below remains exact.
  const stride = 4,
    cnx = Math.ceil((nx - 1) / stride) + 1,
    cnz = Math.ceil((nz - 1) / stride) + 1;
  const coarse = new Float32Array(cnx * cnz),
    coarseDistance = new Float32Array(cnx * cnz);
  for (let z = 0; z < cnz; z++)
    for (let x = 0; x < cnx; x++) {
      const p = course.closest(
        minX + x * cell * stride,
        minZ + z * cell * stride,
      );
      coarse[z * cnx + x] = p.y;
      coarseDistance[z * cnx + x] = p.lateral;
    }
  const interpolate = (values: Float32Array, x: number, z: number) => {
    const gx = Math.min(cnx - 1.000001, x / stride),
      gz = Math.min(cnz - 1.000001, z / stride),
      ix = Math.floor(gx),
      iz = Math.floor(gz),
      u = gx - ix,
      v = gz - iz;
    const i = iz * cnx + ix;
    return (
      (values[i] * (1 - u) + values[i + 1] * u) * (1 - v) +
      (values[i + cnx] * (1 - u) + values[i + cnx + 1] * u) * v
    );
  };
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) {
      const i = z * nx + x,
        wx = minX + x * cell,
        wz = minZ + z * cell;
      lateral[i] = interpolate(coarseDistance, x, z);
      const hills =
        (Math.sin(wx / 65) * Math.cos(wz / 79) + Math.sin((wx + wz) / 130)) * 2;
      heights[i] =
        interpolate(coarse, x, z) -
        0.65 +
        hills * Math.min(1, Math.max(0, (lateral[i] - 12) / 55));
    }
  // Clamp every vertex of every grid cell touched by the road to below that
  // segment's lowest point. This protects the complete width, including curves
  // crossing a cell diagonally; checking only the nearest vertex misses those.
  const corridor = course.halfWidth + 2.6 + cell * Math.SQRT2;
  for (let i = 0; i < course.points.length - 1; i++) {
    const a = course.points[i],
      b = course.points[i + 1];
    const x0 = Math.max(
      0,
      Math.floor((Math.min(a.x, b.x) - corridor - minX) / cell),
    );
    const x1 = Math.min(
      nx - 1,
      Math.ceil((Math.max(a.x, b.x) + corridor - minX) / cell),
    );
    const z0 = Math.max(
      0,
      Math.floor((Math.min(a.z, b.z) - corridor - minZ) / cell),
    );
    const z1 = Math.min(
      nz - 1,
      Math.ceil((Math.max(a.z, b.z) + corridor - minZ) / cell),
    );
    const dx = b.x - a.x,
      dz = b.z - a.z,
      length2 = dx * dx + dz * dz;
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const wx = minX + x * cell,
          wz = minZ + z * cell;
        const t = Math.max(
          0,
          Math.min(1, ((wx - a.x) * dx + (wz - a.z) * dz) / length2),
        );
        if (Math.hypot(wx - a.x - dx * t, wz - a.z - dz * t) > corridor)
          continue;
        const index = z * nx + x;
        ceiling[index] = Math.min(ceiling[index], Math.min(a.y, b.y) - 0.28);
      }
  }
  // Smooth the hills without lifting terrain into the reserved road corridor.
  for (let pass = 0; pass < 24; pass++) {
    const next = new Float32Array(heights);
    for (let z = 1; z < nz - 1; z++)
      for (let x = 1; x < nx - 1; x++) {
        const i = z * nx + x;
        next[i] = Math.min(
          ceiling[i],
          (heights[i] * 4 +
            heights[i - 1] +
            heights[i + 1] +
            heights[i - nx] +
            heights[i + nx]) /
            8,
        );
      }
    heights = next;
  }
  const positions = new Float32Array(count * 3),
    colors = new Float32Array(count * 3);
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) {
      const i = z * nx + x,
        wx = minX + x * cell,
        wz = minZ + z * cell;
      positions.set([wx, heights[i], wz], i * 3);
      const shade =
        Math.sin(wx / 18) * Math.cos(wz / 23) * 0.018 +
        Math.sin((wx + wz) / 41) * 0.014;
      const verge = Math.max(
        0,
        1 - Math.abs(lateral[i] - course.halfWidth) / 9,
      );
      colors.set(
        [
          0.17 + shade + verge * 0.065,
          0.235 + shade + verge * 0.05,
          0.13 + shade,
        ],
        i * 3,
      );
    }
  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let at = 0;
  for (let z = 0; z < nz - 1; z++)
    for (let x = 0; x < nx - 1; x++) {
      const i = z * nx + x;
      indices.set([i, i + nx, i + 1, i + 1, i + nx, i + nx + 1], at);
      at += 6;
    }
  const heightAt = (x: number, z: number) => {
    const gx = Math.max(0, Math.min(nx - 1.000001, (x - minX) / cell));
    const gz = Math.max(0, Math.min(nz - 1.000001, (z - minZ) / cell));
    const ix = Math.floor(gx),
      iz = Math.floor(gz),
      u = gx - ix,
      v = gz - iz,
      i = iz * nx + ix;
    // Match the two actual triangles, not a bilinear approximation.
    return u + v <= 1
      ? heights[i] +
          u * (heights[i + 1] - heights[i]) +
          v * (heights[i + nx] - heights[i])
      : heights[i + nx + 1] +
          (1 - u) * (heights[i + nx] - heights[i + nx + 1]) +
          (1 - v) * (heights[i + 1] - heights[i + nx + 1]);
  };
  const terrain = { positions, indices, colors, heightAt };
  const entries = cache.get(course) ?? new Map<number, TrackTerrain>();
  entries.set(cell, terrain);
  cache.set(course, entries);
  return terrain;
}
