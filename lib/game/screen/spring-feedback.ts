/** Cosmetic spring flight in scene metres. Only fixed game time advances hits. */
export type SpringPoint = { x: number; y: number; z: number };
export type SpringLayout = {
  scale: number;
  offsetZ: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};
export type SpringFlight = {
  id: number;
  side: number;
  clip: number;
  worker: number;
  at: number;
  from: SpringPoint;
  velocity: SpringPoint;
  bounds: SpringLayout['bounds'];
  hit: null | { worker: number; at: number; point: SpringPoint };
};
export type SpringFlightPose = {
  position: SpringPoint;
  rotation: SpringPoint;
  visible: boolean;
  opacity: number;
};
export const MAX_SPRING_FLIGHTS = 6;
export const SPRING_FLIGHT_LIFETIME = 2.4;
const GRAVITY = 18;
const FLOOR = 0.045;
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
export function createSpringFlight(
  id: number,
  side: number,
  clip: number,
  worker: number,
  at: number,
  power: number,
  layout: SpringLayout,
): SpringFlight {
  const horizontal = side % 2 === 0;
  const index = clamp(clip, 0, 3);
  const t = (index + 0.5) / 4 - 0.5;
  const outwardX = side === 1 ? 1 : side === 3 ? -1 : 0;
  const outwardZ = side === 0 ? -1 : side === 2 ? 1 : 0;
  // The source is the actual coil centre, with the same frame dimensions and
  // -90deg floor rotation as screen-model. A stable tiny tangent adds variety.
  const tangent =
    t * 2.2 + (((id * 17 + side * 7 + index * 13) % 9) - 4) * 0.035;
  const speed = 1.55 + clamp(power, 0, 1) * 0.38;
  return {
    id,
    side,
    clip: index,
    worker,
    at,
    from: {
      x: horizontal ? t * 4.3 : side === 1 ? 2.265 : -2.265,
      y: 0.146,
      z:
        layout.offsetZ +
        (horizontal ? (side === 0 ? -1.215 : 1.215) : -t * 2.26),
    },
    velocity: {
      x: outwardX * speed + (horizontal ? tangent : 0),
      y: 7.8 + clamp(power, 0, 1) * 0.65,
      z: outwardZ * speed + (horizontal ? 0 : tangent),
    },
    bounds: { ...layout.bounds },
    hit: null,
  };
}
function bouncePosition(
  from: SpringPoint,
  vx: number,
  vy: number,
  vz: number,
  time: number,
  out: SpringPoint,
) {
  const age = Math.max(0, time);
  const landing =
    (vy + Math.sqrt(vy * vy + 2 * GRAVITY * Math.max(0, from.y - FLOOR))) /
    GRAVITY;
  const bounceSpeed =
    Math.sqrt(vy * vy + 2 * GRAVITY * Math.max(0, from.y - FLOOR)) * 0.23;
  const after = clamp(age - landing, 0, (2 * bounceSpeed) / GRAVITY);
  const travel = Math.min(age, landing) + after * 0.32;
  out.x = from.x + vx * travel;
  out.z = from.z + vz * travel;
  out.y =
    age <= landing
      ? from.y + vy * age - GRAVITY * age * age * 0.5
      : FLOOR + bounceSpeed * after - GRAVITY * after * after * 0.5;
  out.y = Math.max(FLOOR, out.y);
  return landing + (2 * bounceSpeed) / GRAVITY;
}
export function springFlightPose(
  flight: SpringFlight,
  elapsed: number,
  out: SpringFlightPose = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    visible: false,
    opacity: 0,
  },
): SpringFlightPose {
  const age = elapsed - flight.at;
  const hit = flight.hit && elapsed >= flight.hit.at ? flight.hit : null;
  let settledAt: number;
  if (hit)
    settledAt =
      hit.at -
      flight.at +
      bouncePosition(
        hit.point,
        -flight.velocity.x * 0.32,
        1.6,
        -flight.velocity.z * 0.32,
        elapsed - hit.at,
        out.position,
      );
  else
    settledAt = bouncePosition(
      flight.from,
      flight.velocity.x,
      flight.velocity.y,
      flight.velocity.z,
      age,
      out.position,
    );
  out.position.x = clamp(
    out.position.x,
    flight.bounds.minX + 0.08,
    flight.bounds.maxX - 0.08,
  );
  out.position.z = clamp(
    out.position.z,
    flight.bounds.minZ + 0.08,
    flight.bounds.maxZ - 0.08,
  );
  const spinAge = clamp(age, 0, settledAt);
  out.rotation.x = spinAge * 19 + flight.clip;
  out.rotation.y = spinAge * 12 + flight.side;
  out.rotation.z = spinAge * 23;
  out.visible = age >= 0 && age < SPRING_FLIGHT_LIFETIME;
  out.opacity = out.visible
    ? clamp((SPRING_FLIGHT_LIFETIME - age) / 0.35, 0, 1)
    : 0;
  return out;
}
export function springReaction(
  flights: readonly SpringFlight[] | undefined,
  worker: number,
  elapsed: number,
): number {
  if (!flights) return 0;
  let reaction = 0;
  for (const flight of flights) {
    if (flight.hit?.worker !== worker) continue;
    const age = elapsed - flight.hit.at;
    if (age < 0 || age >= 1.25) continue;
    reaction = Math.max(
      reaction,
      Math.min(1, age / 0.06) * clamp((1.25 - age) / 0.7, 0, 1),
    );
  }
  return reaction;
}
export type SpringActor = { x: number; z: number; animation: string };
function facePoint(actor: SpringActor, layout: SpringLayout): SpringPoint {
  const x = actor.x * layout.scale,
    z = actor.z * layout.scale + layout.offsetZ;
  const crouched = ['hold', 'feed', 'pull'].includes(actor.animation);
  const length = Math.max(0.01, Math.hypot(x, z - layout.offsetZ));
  const forward = crouched ? 0.29 : 0.1;
  return {
    x: x - (x / length) * forward,
    y: crouched ? 1.12 : 1.84,
    z: z - ((z - layout.offsetZ) / length) * forward,
  };
}
function contactFraction(a: SpringPoint, b: SpringPoint, centre: SpringPoint) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z;
  const ox = a.x - centre.x,
    oy = a.y - centre.y,
    oz = a.z - centre.z;
  const length = dx * dx + dy * dy + dz * dz;
  const c = ox * ox + oy * oy + oz * oz - 0.245 * 0.245;
  if (c <= 0) return 0;
  if (length < 1e-12) return null;
  const dot = ox * dx + oy * dy + oz * dz;
  const discriminant = dot * dot - length * c;
  if (discriminant < 0) return null;
  const t = (-dot - Math.sqrt(discriminant)) / length;
  return t >= 0 && t <= 1 ? t : null;
}
/** Contact uses current positions, so moving out of the flight really avoids it.
 * A recorded hit is immutable across snapshot copies/reconnect and fires once. */
export function advanceSpringFlights(
  flights: SpringFlight[],
  elapsed: number,
  dt: number,
  actors: readonly SpringActor[],
  layout: SpringLayout,
): SpringFlight[] {
  const hits: SpringFlight[] = [];
  for (let i = flights.length - 1; i >= 0; i--)
    if (elapsed - flights[i].at >= SPRING_FLIGHT_LIFETIME) flights.splice(i, 1);
  if (flights.length > MAX_SPRING_FLIGHTS)
    flights.splice(0, flights.length - MAX_SPRING_FLIGHTS);
  for (const flight of flights) {
    if (flight.hit || elapsed <= flight.at) continue;
    const previousAt = Math.max(flight.at, elapsed - dt);
    const a = springFlightPose(flight, previousAt).position,
      b = springFlightPose(flight, elapsed).position;
    let earliest = 2,
      victim = -1;
    for (let p = 0; p < actors.length; p++) {
      if (p === flight.worker) continue;
      const t = contactFraction(a, b, facePoint(actors[p], layout));
      if (t !== null && t < earliest) {
        earliest = t;
        victim = p;
      }
    }
    if (victim < 0) continue;
    const at = previousAt + (elapsed - previousAt) * earliest;
    flight.hit = {
      worker: victim,
      at,
      point: springFlightPose(flight, at).position,
    };
    hits.push(flight);
  }
  return hits;
}
