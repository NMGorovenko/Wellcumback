/** Continuous car axes, separate from discrete interaction commands. */
export type DriveAxes = { throttle: number; steer: number };
export const neutralDrive = (): DriveAxes => ({ throttle: 0, steer: 0 });
export const boundedAxis = (value: number) =>
  Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
export function analogAxis(value: number, deadzone = 0.15): number {
  const v = boundedAxis(value);
  return Math.abs(v) <= deadzone
    ? 0
    : (Math.sign(v) * (Math.abs(v) - deadzone)) / (1 - deadzone);
}
/** Keyboard overrides only the axis it owns; a neutral attached pad cannot cancel keys. */
export function resolveDrive(
  keys: ReadonlySet<string>,
  axes?: DriveAxes,
): DriveAxes {
  return {
    throttle:
      keys.has('KeyW') || keys.has('KeyS')
        ? Number(keys.has('KeyW')) - Number(keys.has('KeyS'))
        : boundedAxis(axes?.throttle ?? 0),
    steer:
      keys.has('KeyA') || keys.has('KeyD')
        ? Number(keys.has('KeyD')) - Number(keys.has('KeyA'))
        : boundedAxis(axes?.steer ?? 0),
  };
}
export const driveIsNeutral = (axes?: DriveAxes) =>
  !axes || (!axes.throttle && !axes.steer);
