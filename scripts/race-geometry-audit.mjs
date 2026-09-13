import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root =
  process.env.WELLCUM_RESEARCH_REPO ??
  fileURLToPath(new URL('../', import.meta.url));
mkdirSync(`${root}/outputs/race-audit`, { recursive: true });
const { raceCourse, NORDSCHLEIFE_SCALE } = await import(
  pathToFileURL(`${root}/lib/game/race/course.ts`)
);
const { carBlocked } = await import(
  pathToFileURL(`${root}/lib/game/race/engine.ts`)
);
const cross = (a, b) => a.x * b.z - a.z * b.x;
const minus = (a, b) => ({ x: a.x - b.x, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.z * b.z;
const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
});
const clamp = (t) => Math.max(0, Math.min(1, t));
const project = (p, a, b) =>
  clamp(dot(minus(p, a), minus(b, a)) / dot(minus(b, a), minus(b, a)));
function segmentMinimum(a, b, c, d) {
  const candidates = [
    [0, project(a, c, d)],
    [1, project(b, c, d)],
    [project(c, a, b), 0],
    [project(d, a, b), 1],
  ];
  const r = minus(b, a),
    s = minus(d, c),
    q = minus(c, a),
    den = cross(r, s);
  if (Math.abs(den) > 1e-12) {
    const t = cross(q, s) / den,
      u = cross(q, r) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) candidates.push([t, u]);
  }
  let best = { distance: Infinity };
  for (const [t, u] of candidates) {
    const p = lerp(a, b, t),
      q = lerp(c, d, u),
      distance = Math.hypot(p.x - q.x, p.z - q.z);
    if (distance < best.distance) best = { distance, t, u, p, q };
  }
  return best;
}
const results = [];
for (const id of ['krasnoyarsk', 'nordschleife']) {
  const course = raceCourse(id),
    blocked = [],
    gateBlocked = [],
    gridBlocked = [];
  let samples = 0;
  for (let d = 0; d < course.length; d += 0.25) {
    const p = course.sample(d);
    samples++;
    if (carBlocked(course, p.x, p.z, Math.atan2(p.dx, -p.dz)))
      blocked.push({ d, name: p.name });
  }
  course.gates.forEach((g, i) => {
    if (carBlocked(course, g.x, g.z, Math.atan2(g.dx, -g.dz)))
      gateBlocked.push(i);
  });
  for (let i = 0; i < 6; i++) {
    const p = course.sample(-6 - Math.floor(i / 2) * 6),
      side = i % 2 === 0 ? -1.8 : 1.8;
    const x = p.x - p.dz * side,
      z = p.z + p.dx * side;
    if (carBlocked(course, x, z, Math.atan2(p.dx, -p.dz))) gridBlocked.push(i);
  }
  const result = {
    id,
    lengthMetres: course.length,
    points: course.points.length,
    roadWidth: course.halfWidth * 2,
    centerlineProbeSpacing: 0.25,
    centerlineProbeCount: samples,
    centerlineBlocked: blocked,
    gateCount: course.gates.length,
    gateCentersBlocked: gateBlocked,
    sixGridPositionsBlocked: gridBlocked,
  };
  if (id === 'nordschleife') {
    let best = { distance: Infinity };
    const ps = course.points,
      ds = course.distances;
    let checked = 0;
    for (let i = 0; i < ps.length - 1; i++)
      for (let j = i + 1; j < ps.length - 1; j++) {
        const a = ps[i],
          b = ps[i + 1],
          c = ps[j],
          d = ps[j + 1];
        const dx = Math.max(
          0,
          Math.min(a.x, b.x) - Math.max(c.x, d.x),
          Math.min(c.x, d.x) - Math.max(a.x, b.x),
        );
        const dz = Math.max(
          0,
          Math.min(a.z, b.z) - Math.max(c.z, d.z),
          Math.min(c.z, d.z) - Math.max(a.z, b.z),
        );
        if (dx * dx + dz * dz > 20 * 20) continue;
        const gapAtStart = Math.min(
          ds[j] - ds[i],
          course.length - (ds[j] - ds[i]),
        );
        if (gapAtStart + ds[i + 1] - ds[i] + ds[j + 1] - ds[j] <= 20) continue;
        const hit = segmentMinimum(a, b, c, d),
          si = ds[i] + (ds[i + 1] - ds[i]) * hit.t,
          sj = ds[j] + (ds[j + 1] - ds[j]) * hit.u;
        const gap = Math.min(
          Math.abs(sj - si),
          course.length - Math.abs(sj - si),
        );
        if (gap <= 20) continue;
        checked++;
        if (hit.distance < best.distance)
          best = {
            distance: hit.distance,
            i,
            j,
            arcGapMetres: gap,
            a: { ...hit.p, y: a.y + (b.y - a.y) * hit.t, s: si, name: a.name },
            b: { ...hit.q, y: c.y + (d.y - c.y) * hit.u, s: sj, name: c.name },
          };
      }
    result.scale = NORDSCHLEIFE_SCALE;
    result.nonlocalMinimum = best;
    result.planarRoadEdgeClearanceMetres = best.distance - course.halfWidth * 2;
    result.nonlocalMinimumMethod =
      'Exact endpoint/projection/intersection distance between polyline segments, closest-point cyclic arclength gap >20 m; broad phase within 20 m.';
    result.nearbyNonlocalSegmentPairsChecked = checked;
  }
  results.push(result);
}
const report = {
  capturedAt: new Date().toISOString(),
  courseSha256: createHash('sha256')
    .update(readFileSync(`${root}/lib/game/race/course.ts`))
    .digest('hex'),
  results,
};
writeFileSync(
  `${root}/outputs/race-audit/geometry.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
