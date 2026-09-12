import type { StagePoint, StagedWorker } from './staging.ts';

/** Free room width allows this much screen shift in legacy logical coordinates. */
export const CARRY_SHIFT_LIMIT = 1.2;

/** Keep the entire crouched body on the viewing side of the cloth. CARRY_SHIFT_LIMIT
 * must also constrain the engine: an unlimited grip cannot be reached through furniture. */
export function carrierStaging(grip: StagePoint): StagedWorker {
  return {
    x: grip.x,
    y: 0,
    z: grip.z + 0.46,
    rotation: Math.PI,
    crouch: Math.max(0, Math.min(0.72, 0.96 - grip.y)),
    lean: 0,
  };
}
