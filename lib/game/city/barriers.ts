import { cityRoads, distanceToRoad, type CityRect } from './layout.ts';
import { cityRoadHeight, cityRoadLayer } from './surface.ts';
import { roadSurfaceOutlines } from './road-surfaces.ts';

/** The visible rails and physical contacts share these exact footprints.
 * Clip the exposed boundary of the road union, including its rounded bends;
 * only a junction at the same elevation opens a gap in an elevated rail. */
export const cityBarriers: CityRect[] = cityRoads
  .filter((road) => road.bridge || cityRoadLayer(road) === 'raised')
  .flatMap((road) => {
    const outline = roadSurfaceOutlines([road], undefined, 0.2)[0];
    const nearby = cityRoads.filter(
      (other) =>
        other !== road &&
        Math.min(road.from.x, road.to.x) - road.width <
          Math.max(other.from.x, other.to.x) + other.width &&
        Math.max(road.from.x, road.to.x) + road.width >
          Math.min(other.from.x, other.to.x) - other.width &&
        Math.min(road.from.z, road.to.z) - road.width <
          Math.max(other.from.z, other.to.z) + other.width &&
        Math.max(road.from.z, road.to.z) + road.width >
          Math.min(other.from.z, other.to.z) - other.width,
    );
    const covered = (x: number, z: number) =>
      nearby.some(
        (other) =>
          distanceToRoad(x, z, other) < other.width / 2 + 0.26 &&
          Math.abs(cityRoadHeight(other, x, z) - cityRoadHeight(road, x, z)) <
            1.2,
      );
    const result: CityRect[] = [];
    for (let edge = 0; edge < outline.length; edge++) {
      const a = outline[edge],
        b = outline[(edge + 1) % outline.length];
      const dx = b.x - a.x,
        dz = b.z - a.z,
        length = Math.hypot(dx, dz);
      const steps = Math.ceil(length / 1.5);
      for (let step = 0; step < steps; step++) {
        let lo = step / steps,
          hi = (step + 1) / steps;
        const at = (t: number) => ({ x: a.x + dx * t, z: a.z + dz * t });
        const middle = at((lo + hi) / 2);
        if (covered(middle.x, middle.z)) continue;
        // Keep the collider inside the exposed fragment, including an angled
        // junction's first/last centimetres instead of spanning its entrance.
        if (covered(at(lo).x, at(lo).z)) {
          let left = lo,
            right = (lo + hi) / 2;
          for (let i = 0; i < 8; i++) {
            const mid = (left + right) / 2,
              p = at(mid);
            if (covered(p.x, p.z)) left = mid;
            else right = mid;
          }
          lo = right;
        }
        if (covered(at(hi).x, at(hi).z)) {
          let left = (lo + hi) / 2,
            right = hi;
          for (let i = 0; i < 8; i++) {
            const mid = (left + right) / 2,
              p = at(mid);
            if (covered(p.x, p.z)) right = mid;
            else left = mid;
          }
          hi = left;
        }
        if ((hi - lo) * length < 0.02) continue;
        const p = at((lo + hi) / 2);
        result.push({
          ...p,
          w: 0.28,
          d: (hi - lo) * length + 0.025,
          angle: Math.atan2(dx, dz),
          roadId: road.id,
        });
      }
    }
    const merged: CityRect[] = [];
    for (const piece of result) {
      const last = merged.at(-1);
      const gap = last
        ? Math.hypot(piece.x - last.x, piece.z - last.z)
        : Infinity;
      if (
        last &&
        Math.abs(last.angle! - piece.angle!) < 1e-7 &&
        gap <= (last.d + piece.d) / 2 + 0.01 &&
        gap + (last.d + piece.d) / 2 <= 8
      ) {
        const length = gap + (last.d + piece.d) / 2;
        const shift = (length - last.d) / 2;
        last.x += ((piece.x - last.x) / gap) * shift;
        last.z += ((piece.z - last.z) / gap) * shift;
        last.d = length;
      } else merged.push({ ...piece });
    }
    return merged;
  });
