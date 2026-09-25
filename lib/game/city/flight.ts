/** Serializable suspension/flight state. The host owns it just like wheel motion. */
export type CityFlight = {
  airborne: boolean;
  vy: number;
  waterTime: number;
  landing: number;
  /** Supported time needed to rearm the take-off hop after landing. */
  launchCooldown?: number;
  /** Chassis travel relative to the wheel contact plane, in metres and m/s. */
  suspension?: { offset: number; velocity: number };
  safe?: {
    x: number;
    z: number;
    heading: number;
    elevation: number;
    surfaceId: string;
  };
};
export const CITY_FLIGHT_GRAVITY = 18;
export const CITY_SUSPENSION_EXTENSION = 0.12;

/** Sample the real road along momentum, including reverse and sideways drift.
 * A wheelbase-sized stencil filters tiny tessellation seams without inventing
 * a speed/time-dependent road texture. */
export function roadVerticalMotion(
  heightAt: (x: number, z: number) => number,
  x: number,
  z: number,
  vx: number,
  vz: number,
  height = heightAt(x, z),
) {
  const speed = Math.hypot(vx, vz);
  if (speed < 0.05) return { velocity: 0, acceleration: 0 };
  const radius = 1.2;
  const dx = (vx / speed) * radius,
    dz = (vz / speed) * radius;
  const ahead = heightAt(x + dx, z + dz);
  const behind = heightAt(x - dx, z - dz);
  // A stencil can cross a deck edge or sample the river bed behind a car.
  // Those are separate contact surfaces, not a road tangent or curvature.
  // Actual movement handles their ledge collision/fall after the wheels arrive.
  if (Math.max(Math.abs(ahead - height), Math.abs(behind - height)) > 0.6)
    return { velocity: 0, acceleration: 0 };
  return {
    velocity: ((ahead - behind) / (2 * radius)) * speed,
    acceleration:
      ((ahead - 2 * height + behind) / (radius * radius)) * speed * speed,
  };
}

/** Exact damped spring step for a constant road acceleration. Keeping its two
 * state variables in flight makes a reconnect continue the same suspension. */
export function advanceCitySuspension(
  flight: CityFlight,
  roadAcceleration: number,
  dt: number,
) {
  const suspension = (flight.suspension ??= { offset: 0, velocity: 0 });
  const frequency = 17,
    damping = 0.65;
  const decayRate = frequency * damping;
  const oscillation = frequency * Math.sqrt(1 - damping * damping);
  const equilibrium =
    -Math.max(-80, Math.min(80, roadAcceleration)) / (frequency * frequency);
  const displacement = suspension.offset - equilibrium;
  const decay = Math.exp(-decayRate * dt);
  const cosine = Math.cos(oscillation * dt),
    sine = Math.sin(oscillation * dt);
  const velocity = suspension.velocity;
  suspension.offset = Math.max(
    -0.16,
    Math.min(
      CITY_SUSPENSION_EXTENSION,
      equilibrium +
        decay *
          (displacement * cosine +
            ((velocity + decayRate * displacement) * sine) / oscillation),
    ),
  );
  suspension.velocity = Math.max(
    -3,
    Math.min(
      3,
      decay *
        (velocity * cosine -
          ((decayRate * velocity + frequency * frequency * displacement) *
            sine) /
            oscillation),
    ),
  );
  if (
    (suspension.offset === -0.16 && suspension.velocity < 0) ||
    (suspension.offset === CITY_SUSPENSION_EXTENSION && suspension.velocity > 0)
  )
    suspension.velocity = 0;
}

/** The landing impulse compresses the chassis once; the same spring releases
 * it afterward instead of starting a separate cosmetic bounce animation. */
export function compressCitySuspension(
  flight: CityFlight,
  impactSpeed: number,
) {
  const suspension = (flight.suspension ??= { offset: 0, velocity: 0 });
  suspension.velocity = Math.max(
    -3,
    suspension.velocity - Math.min(2.6, impactSpeed * 0.22),
  );
}
export const freshFlight = (): CityFlight => ({
  airborne: false,
  vy: 0,
  waterTime: 0,
  landing: 0,
});
export function validCityFlight(
  value: unknown,
): value is CityFlight | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const f = value as CityFlight;
  if (
    typeof f.airborne !== 'boolean' ||
    ![f.vy, f.waterTime, f.landing].every(Number.isFinite) ||
    Math.abs(f.vy) > 100 ||
    f.waterTime < 0 ||
    f.waterTime > 10 ||
    f.landing < 0 ||
    f.landing > 1
  )
    return false;
  if (
    f.launchCooldown !== undefined &&
    (!Number.isFinite(f.launchCooldown) ||
      f.launchCooldown < 0 ||
      f.launchCooldown > 0.25)
  )
    return false;
  if (f.safe !== undefined) {
    const p = f.safe;
    if (
      !p ||
      typeof p !== 'object' ||
      Array.isArray(p) ||
      ![p.x, p.z, p.heading, p.elevation].every(Number.isFinite) ||
      Math.abs(p.x) > 2600 ||
      Math.abs(p.z) > 1900 ||
      Math.abs(p.elevation) > 200 ||
      typeof p.surfaceId !== 'string' ||
      p.surfaceId.length > 100 ||
      !/^road:[a-z0-9:-]+$/.test(p.surfaceId)
    )
      return false;
  }
  if (f.suspension !== undefined) {
    const s = f.suspension;
    if (
      !s ||
      typeof s !== 'object' ||
      Array.isArray(s) ||
      ![s.offset, s.velocity].every(Number.isFinite) ||
      s.offset < -0.16 ||
      s.offset > CITY_SUSPENSION_EXTENSION ||
      Math.abs(s.velocity) > 3
    )
      return false;
  }
  return true;
}
