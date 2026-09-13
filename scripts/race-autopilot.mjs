import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root =
  process.env.WELLCUM_RESEARCH_REPO ??
  fileURLToPath(new URL('../', import.meta.url));
mkdirSync(`${root}/outputs/race-audit`, { recursive: true });
const sourceHashes = Object.fromEntries(
  [
    'lib/game/race/course.ts',
    'lib/game/race/engine.ts',
    'lib/game/race/vehicles.ts',
    'lib/game/race/nordschleife-data.ts',
    'lib/game/race/nordschleife-arcade.ts',
    'lib/game/city/car-physics.ts',
    'lib/game/city/powertrain.ts',
  ].map((p) => [
    p,
    createHash('sha256')
      .update(readFileSync(`${root}/${p}`))
      .digest('hex'),
  ]),
);
const { raceCourse } = await import(
  pathToFileURL(`${root}/lib/game/race/course.ts`)
);
const { freshRace, startRace, tickRace, advanceGates, carBlocked } =
  await import(pathToFileURL(`${root}/lib/game/race/engine.ts`));
const { stepCar } = await import(
  pathToFileURL(`${root}/lib/game/city/car-physics.ts`)
);
const { vehicleTuning } = await import(
  pathToFileURL(`${root}/lib/game/race/vehicles.ts`)
);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const wrap = (n) => Math.atan2(Math.sin(n), Math.cos(n));
const dt = 1 / 120;
function planner(course, tuning, lateralAcceleration) {
  const count = Math.ceil(course.length / 2),
    spacing = course.length / count;
  const values = Array.from({ length: count }, (_, i) => {
    const s = i * spacing,
      a = course.sample(s - 4),
      b = course.sample(s),
      c = course.sample(s + 4);
    const ab = Math.hypot(b.x - a.x, b.z - a.z),
      bc = Math.hypot(c.x - b.x, c.z - b.z),
      ac = Math.hypot(c.x - a.x, c.z - a.z);
    const curvature =
      (2 * Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x))) /
      Math.max(0.001, ab * bc * ac);
    return Math.min(
      tuning.maxSpeed,
      Math.sqrt(lateralAcceleration / Math.max(0.0001, curvature)),
    );
  });
  // Backward braking envelope across repeated circuits, wrapping finish/start.
  const brake = tuning.brake * 0.62;
  for (let pass = 0; pass < 3; pass++)
    for (let i = count - 1; i >= 0; i--)
      values[i] = Math.min(
        values[i],
        Math.sqrt(values[(i + 1) % count] ** 2 + 2 * brake * spacing),
      );
  return (s) =>
    values[
      Math.floor(
        (((s % course.length) + course.length) % course.length) / spacing,
      ) % count
    ];
}
function run(trackId, vehicleId, lateralAcceleration = 12) {
  const course = raceCourse(trackId),
    race = freshRace();
  race.trackId = trackId;
  race.laps = Number(process.argv[5] ?? 3);
  const racer = race.racers[0];
  racer.vehicleId = vehicleId;
  racer.ready = true;
  const tuning = vehicleTuning(vehicleId, trackId === 'krasnoyarsk'),
    speedLimit = planner(course, tuning, lateralAcceleration);
  startRace(race, course);
  let countdownElapsed = 0;
  while (race.phase === 'countdown') {
    tickRace(race, 1 / 60, new Map(), course);
    countdownElapsed += 1 / 60;
  }
  const history = [],
    contacts = [],
    gates = [],
    lapTimes = [];
  let contactSteps = 0;
  let maxLateral = 0,
    maxSpeed = 0,
    stalled = 0,
    progress = -6,
    previousClosest = course.closest(racer.car.x, racer.car.z).distance;
  let furthest = -6,
    lastAdvanceTime = 0;
  for (let frame = 0; frame < 120 * 900; frame++) {
    const car = racer.car,
      near = course.closest(car.x, car.z),
      forward = car.vx * Math.sin(car.heading) - car.vz * Math.cos(car.heading);
    let step = near.distance - previousClosest;
    if (step > course.length / 2) step -= course.length;
    if (step < -course.length / 2) step += course.length;
    progress += step;
    previousClosest = near.distance;
    if (progress > furthest + 0.5) {
      furthest = progress;
      lastAdvanceTime = race.elapsed;
    }
    const look = clamp(3.8 + car.speed * 0.26, 3.8, 16),
      target = course.sample(near.distance + look);
    const dx = target.x - car.x,
      dz = target.z - car.z,
      distance = Math.hypot(dx, dz),
      alpha = wrap(Math.atan2(dx, -dz) - car.heading);
    const velocityAngle =
      car.speed > 1 ? Math.atan2(car.vx, -car.vz) : car.heading;
    const slip = wrap(velocityAngle - car.heading);
    const yawLimit =
      (tuning.yaw + (car.driftBlend ?? 0) * tuning.driftYaw) *
      Math.min(1, tuning.steeringSpeed / Math.max(1, Math.abs(forward))) *
      Math.min(1, Math.abs(forward) / 2.2);
    const desiredYaw =
      (2 * Math.max(2, forward) * Math.sin(alpha)) / Math.max(2, distance) -
      slip * 2.2;
    const steer = clamp(desiredYaw / Math.max(0.2, yawLimit), -1, 1);
    const wanted =
      Math.min(speedLimit(near.distance), speedLimit(near.distance + 2)) *
      Math.max(0.35, Math.cos(alpha));
    const throttle = clamp((wanted - forward) * 0.38 + 0.1, -1, 1);
    const previous = { x: car.x, z: car.z };
    race.elapsed += dt;
    car.elapsed += dt;
    const hit = stepCar(
      car,
      { throttle, steer, handbrake: false },
      dt,
      (x, z, h) => carBlocked(course, x, z, h),
      tuning,
    );
    const oldGate = racer.nextGate,
      oldLaps = racer.laps,
      oldLapStart = racer.lapStart;
    advanceGates(race, racer, course, previous);
    if (racer.laps !== oldLaps) lapTimes.push(race.elapsed - oldLapStart);
    if (hit.worldContact) contactSteps++;
    if (oldGate !== racer.nextGate)
      gates.push({
        time: race.elapsed,
        gate: oldGate,
        next: racer.nextGate,
        progress: near.distance,
      });
    if (
      hit.worldContact &&
      (!contacts.length || race.elapsed - contacts.at(-1).time > 0.5)
    )
      contacts.push({
        time: race.elapsed,
        s: near.distance,
        name: near.name,
        x: car.x,
        z: car.z,
        speed: car.speed,
      });
    maxLateral = Math.max(maxLateral, near.lateral);
    maxSpeed = Math.max(maxSpeed, car.speed);
    if (frame % 120 === 0)
      history.push({
        t: race.elapsed,
        s: near.distance,
        x: car.x,
        z: car.z,
        speed: car.speed,
        steer,
        wanted,
        heading: car.heading,
        lateral: near.lateral,
        gate: racer.nextGate,
      });
    if (racer.finishTime !== null) break;
    if (race.elapsed - lastAdvanceTime > 15) {
      stalled = 1;
      break;
    }
  }
  const result = {
    capturedAt: new Date().toISOString(),
    sourceHashes,
    trackId,
    vehicleId,
    lateralAcceleration,
    tuning,
    raceLaps: race.laps,
    completedLaps: racer.laps,
    countdownElapsed,
    elapsedIncludingCountdown: race.elapsed + countdownElapsed,
    lapTimes,
    contactSteps,
    length: course.length,
    completed: racer.finishTime !== null,
    lap: racer.bestLap,
    elapsed: race.elapsed,
    estimatedThreeLaps: racer.bestLap === null ? null : 3 * racer.bestLap + 3,
    maxSpeed,
    maxLateral,
    stalled,
    progress,
    passedGates: racer.passedGates,
    expectedGates: course.gates.length * race.laps + 1,
    nextGate: racer.nextGate,
    contacts,
    gates,
  };
  writeFileSync(
    `${root}/outputs/race-audit/autopilot-${trackId}-${vehicleId}-${lateralAcceleration}-${race.laps}laps.json`,
    JSON.stringify({ result, history }, null, 2),
  );
  const { gates: _, sourceHashes: __, tuning: ___, ...summary } = result;
  console.log(JSON.stringify(summary));
}
for (const track of process.argv[2]
  ? [process.argv[2]]
  : ['krasnoyarsk', 'nordschleife'])
  for (const vehicle of process.argv[3]
    ? [process.argv[3]]
    : ['mustang', 'amg-gt'])
    run(track, vehicle, Number(process.argv[4] ?? 12));
