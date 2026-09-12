import type { StagePoint } from './staging.ts';

/** Mesh-space palm and working tip. Drill uses a fixed .32m bit whose back starts
 * at x=.11. Geometry and hand placement share the same anchors. */
export const TOOL_ANCHORS = {
  drill: { grip: { x: -0.04, y: -0.1, z: 0 }, tip: { x: 0.43, y: 0, z: 0 } },
  vacuum: {
    grip: { x: -0.065, y: -0.07, z: 0 },
    tip: { x: 0.31, y: 0.04, z: 0 },
  },
} as const;
export type HeldTool = keyof typeof TOOL_ANCHORS;
export function toolGripTarget(
  kind: HeldTool,
  tip: StagePoint,
  shoulder: StagePoint,
): StagePoint {
  const anchor = TOOL_ANCHORS[kind];
  const length = Math.hypot(
    anchor.tip.x - anchor.grip.x,
    anchor.tip.y - anchor.grip.y,
    anchor.tip.z - anchor.grip.z,
  );
  const dx = shoulder.x - tip.x,
    dy = shoulder.y - tip.y,
    dz = shoulder.z - tip.z;
  const distance = Math.hypot(dx, dy, dz);
  // A degenerate target still produces a finite, correctly sized tool transform.
  if (distance < 1e-9) return { x: tip.x, y: tip.y, z: tip.z + length };
  return {
    x: tip.x + (dx * length) / distance,
    y: tip.y + (dy * length) / distance,
    z: tip.z + (dz * length) / distance,
  };
}
