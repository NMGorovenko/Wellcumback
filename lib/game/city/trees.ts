import {
  cityBuildings,
  cityRoads,
  distanceToRoad,
  inCityWater,
  CITY_BOUNDS,
  CITY_PARKING,
  CITY_COURTYARDS,
} from './layout.ts';

/** One deterministic planting plan shared by collisions and instanced rendering. */
function plantCityTrees() {
  const points: { x: number; z: number; scale: number; pine: boolean }[] = [];
  const lawns: { x: number; z: number; radius: number }[] = [];
  const width = CITY_BOUNDS.maxX - CITY_BOUNDS.minX,
    depth = CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ;
  const obstacles = [...CITY_PARKING, ...cityBuildings];
  const waterDirections = Array.from({ length: 8 }, (_, i) => [
    Math.cos((i * Math.PI) / 4),
    Math.sin((i * Math.PI) / 4),
  ]);
  const clear = (x: number, z: number, radius: number) => {
    if (
      x - radius < CITY_BOUNDS.minX ||
      x + radius > CITY_BOUNDS.maxX ||
      z - radius < CITY_BOUNDS.minZ ||
      z + radius > CITY_BOUNDS.maxZ ||
      inCityWater(x, z, radius + 2) ||
      // The island predicate uses an exact outline, so also check its edges.
      waterDirections.some(([dx, dz]) =>
        inCityWater(x + dx * radius, z + dz * radius, 2),
      ) ||
      cityRoads.some(
        (r) => distanceToRoad(x, z, r) < r.width / 2 + radius + 2.5,
      )
    )
      return false;
    return !obstacles.some(
      (p) =>
        Math.abs(x - p.x) < p.w / 2 + radius + 1.2 &&
        Math.abs(z - p.z) < p.d / 2 + radius + 1.2,
    );
  };
  // Fixed budgets: the larger geography must not multiply draw calls or trees.
  // Neighbour-cell checks keep adjacent street groups from stacking canopies.
  const occupied = new Map<string, { x: number; z: number }[]>();
  const addTree = (x: number, z: number, n: number) => {
    if (points.length >= 2400) return;
    const scale = 1.04 + (n % 5) * 0.12;
    if (!clear(x, z, 1.35 * scale)) return;
    const cx = Math.floor(x / 5),
      cz = Math.floor(z / 5);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        if (
          occupied
            .get(`${cx + dx}/${cz + dz}`)
            ?.some((p) => Math.hypot(p.x - x, p.z - z) < 4.5)
        )
          return;
    const key = `${cx}/${cz}`,
      cell = occupied.get(key) ?? [];
    cell.push({ x, z });
    occupied.set(key, cell);
    points.push({ x, z, scale, pine: x < -2100 ? n % 3 !== 0 : n % 4 === 0 });
  };
  // Each compact residential block has an open green middle. Keep lawns away
  // from through-roads and parked cars, then plant a perimeter rather than
  // filling the entire district uniformly with trees.
  CITY_COURTYARDS.forEach((court, i) => {
    const radius = Math.min(court.w, court.d) * 0.47;
    if (clear(court.x, court.z, radius)) {
      lawns.push({ x: court.x, z: court.z, radius });
      for (let n = 0; n < 8; n++) {
        const angle = (n * Math.PI) / 4;
        addTree(
          court.x + Math.cos(angle) * radius * 0.82,
          court.z + Math.sin(angle) * radius * 0.82,
          i * 17 + n,
        );
      }
    }
  });
  // Alternating roadside birch groups and deeper courtyard groves leave visible
  // gaps at entrances. A small meadow under a grove breaks up empty pale ground.
  cityRoads.forEach((r, ri) => {
    if (r.bridge) return;
    const dx = r.to.x - r.from.x,
      dz = r.to.z - r.from.z;
    const length = Math.hypot(dx, dz);
    if (length < 65) return;
    const tx = dx / length,
      tz = dz / length;
    for (
      let station = 0, t = 52 + (ri % 3) * 21;
      t < length - 28;
      station++, t += 180
    )
      for (const side of [-1, 1]) {
        const n = ri * 113 + station * 7 + (side + 1);
        const courtyard = n % 2 === 0;
        const offset = r.width / 2 + (courtyard ? 49 : 13);
        const x = r.from.x + tx * t - tz * side * offset;
        const z = r.from.z + tz * t + tx * side * offset;
        const radius = 10 + (n % 4);
        if (courtyard && lawns.length < 480 && clear(x, z, radius))
          lawns.push({ x, z, radius });
        for (let tree = 0; tree < 5; tree++) {
          const along = (tree - 2) * 5.5;
          const across = tree % 2 ? 2.8 : -2.2;
          addTree(
            x + tx * along - tz * across,
            z + tz * along + tx * across,
            n + tree,
          );
        }
      }
  });
  // A little distant woodland remains between the developed street corridors.
  for (let n = 0; n < 180; n++) {
    const x = CITY_BOUNDS.minX + ((n * 0.61803398875) % 1) * width;
    const z = CITY_BOUNDS.minZ + ((n * 0.41421356237) % 1) * depth;
    addTree(x, z, n);
  }
  return { points, lawns };
}
export const cityPlanting = plantCityTrees();
export const cityTrees = cityPlanting.points;
