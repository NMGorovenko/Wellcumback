const obj = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown, min: number, max: number) =>
  finite(v) && Number.isInteger(v) && Number(v) >= min && Number(v) <= max;
const colors = ['red', 'blue', 'yellow', 'green', 'violet', 'white'];
/** Validate flat command payloads before they enter the authoritative queue. */
export function validRaceCommand(c: Record<string, unknown>) {
  switch (c.kind) {
    case 'race-car':
      return (
        (c.localIndex === 0 || c.localIndex === 1) &&
        (c.vehicleId === 'mustang' || c.vehicleId === 'amg-one') &&
        colors.includes(String(c.colorId))
      );
    case 'race-local':
      return c.value === 1 || c.value === 2;
    case 'race-laps':
      return c.value === 1 || c.value === 3;
    case 'race-track':
      return c.value === 'krasnoyarsk' || c.value === 'nordschleife';
    case 'race-mode':
      return c.value === 'circuit' || c.value === 'drift';
    case 'race-ready':
    case 'race-start':
      return integer(c.revision, 0, Number.MAX_SAFE_INTEGER);
    default:
      return true;
  }
}
export function validRaceInputs(value: unknown) {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 2 &&
    value.every(
      (input) =>
        obj(input) &&
        [input.throttle, input.steer].every(
          (v) => finite(v) && Math.abs(Number(v)) <= 1,
        ) &&
        typeof input.handbrake === 'boolean' &&
        typeof input.reset === 'boolean',
    )
  );
}
export function validRaceState(value: unknown, capacity = 3) {
  if (
    !obj(value) ||
    !['krasnoyarsk', 'nordschleife'].includes(String(value.trackId)) ||
    !['circuit', 'drift'].includes(String(value.mode)) ||
    !['lobby', 'countdown', 'racing', 'result'].includes(String(value.phase)) ||
    ![1, 3].includes(Number(value.laps)) ||
    typeof value.paused !== 'boolean' ||
    !integer(value.revision, 0, Number.MAX_SAFE_INTEGER) ||
    !Array.isArray(value.racers) ||
    value.racers.length < 1 ||
    value.racers.length > 6 ||
    ![value.elapsed, value.countdown, value.accumulator].every(
      (v) => finite(v) && Number(v) >= 0,
    )
  )
    return false;
  const ids = new Set(),
    usedColors = new Set();
  for (const r of value.racers) {
    if (
      !obj(r) ||
      !integer(r.memberSlot, 0, capacity - 1) ||
      !integer(r.localIndex, 0, 1) ||
      r.id !== `${Number(r.memberSlot)}:${Number(r.localIndex)}` ||
      ids.has(r.id) ||
      typeof r.name !== 'string' ||
      r.name.length > 80 ||
      !['mustang', 'amg-one'].includes(String(r.vehicleId)) ||
      !colors.includes(String(r.colorId)) ||
      usedColors.has(r.colorId) ||
      typeof r.ready !== 'boolean' ||
      typeof r.started !== 'boolean' ||
      !integer(r.laps, 0, 3) ||
      !integer(r.nextGate, 0, 127) ||
      !integer(r.passedGates, 0, 10000) ||
      ![
        r.score,
        r.combo,
        r.comboDuration,
        r.straightTime,
        r.lapStart,
        r.elevation,
        r.pitch,
      ].every(finite) ||
      !obj(r.car) ||
      ![
        'x',
        'z',
        'vx',
        'vz',
        'heading',
        'speed',
        'steering',
        'elapsed',
        'driftDistance',
      ].every((key) => finite((r.car as Record<string, unknown>)[key])) ||
      typeof r.car.drifting !== 'boolean' ||
      !(r.finishTime === null || finite(r.finishTime)) ||
      !(r.bestLap === null || finite(r.bestLap))
    )
      return false;
    ids.add(r.id);
    usedColors.add(r.colorId);
  }
  return value.racers.every(
    (r) => r.localIndex === 0 || ids.has(`${r.memberSlot}:0`),
  );
}
export function frozenRaceConfig(state: Record<string, unknown>) {
  const racers = state.racers as Record<string, unknown>[];
  return JSON.stringify([
    state.trackId,
    state.mode,
    state.laps,
    racers.map((r) => [
      r.id,
      r.memberSlot,
      r.localIndex,
      r.vehicleId,
      r.colorId,
    ]),
  ]);
}
