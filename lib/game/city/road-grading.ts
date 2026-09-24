import type { CityRoad } from './layout.ts';

type Point = {
  x: number;
  z: number;
  y: number;
  fixed: boolean;
  minimum?: number;
};
/** Engineer the ground-road bed separately from natural hills. Shared junction
 * vertices and a 10% node-grade budget prevent terrain ridges becoming steps.
 * Spatially blending differently oriented profiles can use additional grade;
 * the final road field is checked separately against the driving slope limit.
 * Raised decks are excluded: an underpass must never be welded to its bridge. */
export function createRoadGrading(
  roads: readonly CityRoad[],
  height: (x: number, z: number) => number,
  minimumHeight: (x: number, z: number) => number | undefined = () => undefined,
) {
  const ground = roads.filter(
    (r) =>
      !r.bridge &&
      r.layer !== 'raised' &&
      [r.from.x, r.from.z, r.to.x, r.to.z].every(Number.isFinite) &&
      Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z) > 1e-6,
  );
  const cuts = ground.map((r) => {
    const count = Math.ceil(
      Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z) / 8,
    );
    return Array.from({ length: count + 1 }, (_, i) => i / count);
  });
  for (let i = 0; i < ground.length; i++)
    for (let j = i + 1; j < ground.length; j++) {
      const a = ground[i],
        b = ground[j],
        ax = a.to.x - a.from.x,
        az = a.to.z - a.from.z,
        bx = b.to.x - b.from.x,
        bz = b.to.z - b.from.z,
        det = ax * bz - az * bx;
      if (Math.abs(det) < 1e-8) continue;
      const dx = b.from.x - a.from.x,
        dz = b.from.z - a.from.z,
        t = (dx * bz - dz * bx) / det,
        u = (dx * az - dz * ax) / det;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        cuts[i].push(t);
        cuts[j].push(u);
      }
    }
  // Include the boundary of a clearance corridor itself. Sampling only its
  // interior nodes lets a narrow bridge fall below its minimum near either
  // bank. Bisection keeps these new constraints on the defined side.
  for (let i = 0; i < ground.length; i++) {
    const road = ground[i];
    const ts = [...new Set(cuts[i])].sort((a, b) => a - b);
    const minimumAt = (t: number) =>
      minimumHeight(
        road.from.x + (road.to.x - road.from.x) * t,
        road.from.z + (road.to.z - road.from.z) * t,
      );
    for (let j = 1; j < ts.length; j++) {
      let a = ts[j - 1],
        b = ts[j];
      const aDefined = minimumAt(a) !== undefined;
      if (aDefined === (minimumAt(b) !== undefined)) continue;
      for (let iteration = 0; iteration < 32; iteration++) {
        const mid = (a + b) / 2;
        if ((minimumAt(mid) !== undefined) === aDefined) a = mid;
        else b = mid;
      }
      cuts[i].push(aDefined ? a : b);
    }
  }
  const points: Point[] = [],
    lookup = new Map<string, number>();
  const deckEnds = roads
    .filter((r) => !!r.bridge || r.layer === 'raised')
    .flatMap((r) => [r.from, r.to]);
  const node = (x: number, z: number) => {
    const key = `${Math.round(x * 1000)}:${Math.round(z * 1000)}`;
    const minimum = minimumHeight(x, z);
    if (lookup.has(key)) {
      const index = lookup.get(key)!;
      if (minimum !== undefined)
        points[index].minimum = Math.max(
          points[index].minimum ?? -Infinity,
          minimum,
        );
      return index;
    }
    const index = points.length;
    points.push({
      x,
      z,
      y: height(x, z),
      minimum,
      fixed: deckEnds.some((p) => Math.hypot(p.x - x, p.z - z) < 0.1),
    });
    lookup.set(key, index);
    return index;
  };
  const profiles = ground.map((r, i) => ({
    r,
    ts: [...new Set(cuts[i])].sort((a, b) => a - b),
    nodes: [] as number[],
  }));
  const edges: { a: number; b: number; limit: number }[] = [];
  for (const p of profiles) {
    p.nodes = p.ts.map((t) =>
      node(
        p.r.from.x + (p.r.to.x - p.r.from.x) * t,
        p.r.from.z + (p.r.to.z - p.r.from.z) * t,
      ),
    );
    for (let i = 1; i < p.nodes.length; i++) {
      const a = p.nodes[i - 1],
        b = p.nodes[i];
      edges.push({
        a,
        b,
        limit:
          Math.hypot(points[a].x - points[b].x, points[a].z - points[b].z) *
          0.1,
      });
    }
  }
  // A shortest-path envelope enforces the grade across the whole connected
  // network, including tiny approach links. Iterative local averaging left
  // visible steps at junctions before it had propagated along long streets.
  const neighbours = points.map(() => [] as { node: number; cost: number }[]);
  for (const e of edges) {
    neighbours[e.a].push({ node: e.b, cost: e.limit });
    neighbours[e.b].push({ node: e.a, cost: e.limit });
  }
  function envelope(seeds: number[]) {
    const values = [...seeds];
    const heap: { node: number; value: number }[] = [];
    const push = (entry: { node: number; value: number }) => {
      let i = heap.length;
      heap.push(entry);
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heap[parent].value <= entry.value) break;
        heap[i] = heap[parent];
        i = parent;
      }
      heap[i] = entry;
    };
    seeds.forEach((value, node) => {
      if (Number.isFinite(value)) push({ node, value });
    });
    while (heap.length) {
      const current = heap[0],
        last = heap.pop()!;
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let child = i * 2 + 1;
          if (
            child + 1 < heap.length &&
            heap[child + 1].value < heap[child].value
          )
            child++;
          if (heap[child].value >= last.value) break;
          heap[i] = heap[child];
          i = child;
        }
        heap[i] = last;
      }
      if (current.value > values[current.node] + 1e-9) continue;
      for (const edge of neighbours[current.node]) {
        const value = current.value + edge.cost;
        if (value < values[edge.node] - 1e-9) {
          values[edge.node] = value;
          push({ node: edge.node, value });
        }
      }
    }
    return values;
  }
  // Existing bridge junctions pin their height; small Kacha spans require at
  // least bank clearance, but may rise to meet a neighbouring higher bridge.
  const lower = envelope(
    points.map((p) => {
      return p.fixed ? -p.y : p.minimum === undefined ? Infinity : -p.minimum;
    }),
  ).map((value) => -value);
  const corrected = envelope(points.map((p, i) => Math.max(p.y, lower[i])));
  points.forEach((p, i) => {
    p.y = corrected[i];
  });
  const cells = new Map<string, typeof profiles>();
  for (const p of profiles) {
    const r = p.r,
      pad = r.width / 2 + 12;
    for (
      let x = Math.floor((Math.min(r.from.x, r.to.x) - pad) / 100);
      x <= Math.floor((Math.max(r.from.x, r.to.x) + pad) / 100);
      x++
    )
      for (
        let z = Math.floor((Math.min(r.from.z, r.to.z) - pad) / 100);
        z <= Math.floor((Math.max(r.from.z, r.to.z) + pad) / 100);
        z++
      ) {
        const key = `${x}:${z}`,
          list = cells.get(key) ?? [];
        list.push(p);
        cells.set(key, list);
      }
  }
  return (x: number, z: number, natural: number) => {
    let weighted = 0,
      total = 0,
      influence = 0;
    const samples: { y: number; distanceSquared: number; weight: number }[] =
      [];
    let nearestSquared = Infinity;
    for (const p of cells.get(
      `${Math.floor(x / 100)}:${Math.floor(z / 100)}`,
    ) ?? []) {
      const r = p.r,
        dx = r.to.x - r.from.x,
        dz = r.to.z - r.from.z;
      const projected =
        ((x - r.from.x) * dx + (z - r.from.z) * dz) / (dx * dx + dz * dz);
      const t = Math.max(0, Math.min(1, projected));
      const distance = Math.hypot(x - r.from.x - t * dx, z - r.from.z - t * dz),
        gap = distance - r.width / 2;
      if (gap >= 12) continue;
      let lo = 0,
        hi = p.ts.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (p.ts[mid] <= t) lo = mid;
        else hi = mid;
      }
      // Extend the endpoint tangent underneath its rounded cap. Clamping its
      // height made a straight road acquire a bump when adjacent caps blended.
      const u = (projected - p.ts[lo]) / (p.ts[hi] - p.ts[lo]);
      const y =
        points[p.nodes[lo]].y +
        (points[p.nodes[hi]].y - points[p.nodes[lo]].y) * u;
      const shoulder = Math.max(0, gap) / 12,
        weight = 1 - shoulder * shoulder * (3 - 2 * shoulder);
      if (weight <= 0) continue;
      const distanceSquared = distance * distance;
      samples.push({ y, distanceSquared, weight });
      nearestSquared = Math.min(nearestSquared, distanceSquared);
      influence = Math.max(influence, weight);
    }
    if (!samples.length) return natural;
    // Only relative distances matter in a weighted average. Normalizing at
    // the nearest profile avoids discarding tiny absolute Gaussian weights
    // before the shoulder has faded; that cutoff opened vertical terrain seams.
    for (const sample of samples) {
      const contribution =
        Math.exp(-(sample.distanceSquared - nearestSquared) / 12) *
        sample.weight;
      weighted += sample.y * contribution;
      total += contribution;
    }
    const graded = natural + (weighted / total - natural) * influence;
    // Across an angled river, neighbouring profiles can differ by a few
    // millimetres at the same query. Their blend must still clear the water.
    return Math.max(graded, minimumHeight(x, z) ?? -Infinity);
  };
}
