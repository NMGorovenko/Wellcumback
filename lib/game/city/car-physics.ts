import type { CityState } from './engine.ts';
import {
  advancePowertrain,
  freshPowertrain,
  type TransmissionTuning,
} from './powertrain.ts';
import type { DriveAxes } from '../input/drive.ts';

export type CarInput = DriveAxes & { handbrake: boolean };
export type VehicleTuning = {
  maxSpeed: number;
  acceleration: number;
  power: number;
  brake: number;
  reverseAcceleration: number;
  torqueFalloff: number;
  shiftTorque: number;
  grip: number;
  driftGrip: number;
  automaticSlip: number;
  downforce: number;
  yaw: number;
  driftYaw: number;
  steeringSpeed: number;
  drag: number;
  transmission?: TransmissionTuning;
};
export const CITY_MUSTANG: VehicleTuning = {
  maxSpeed: 32,
  acceleration: 26,
  power: 260,
  brake: 30,
  reverseAcceleration: 10,
  torqueFalloff: 0.3,
  shiftTorque: 0.28,
  grip: 7.5,
  driftGrip: 0.55,
  automaticSlip: 0.52,
  downforce: 0,
  yaw: 1.7,
  driftYaw: 1.1,
  steeringSpeed: Infinity,
  drag: 0.2,
};
/** One fixed vehicle step, shared by city and races. No dialogue or mission side effects.
 * Raw contacts must be returned even during the cosmetic bump cooldown. */
export function stepCar(
  s: CityState,
  input: CarInput,
  dt: number,
  blocked: (x: number, z: number, heading: number) => boolean,
  tuning: VehicleTuning = CITY_MUSTANG,
) {
  const { throttle: gas, steer: steering } = input;
  s.throttle = gas;
  const handbrake = input.handbrake;
  let fx = Math.sin(s.heading),
    fz = -Math.cos(s.heading);
  const forward = s.vx * fx + s.vz * fz;
  s.steering += (steering - s.steering) * (1 - Math.exp(-dt * 12));
  // The Mustang is playful on every corner without holding a drift button.
  // Preserve grip at parking speeds, under braking and while reversing.
  const speedFactor = Math.max(0, Math.min(1, (forward - 2.5) / 5.5));
  const turnFactor = Math.max(
    0,
    Math.min(1, (Math.abs(s.steering) - 0.12) / 0.7),
  );
  const automaticSlip =
    gas < 0 ? 0 : tuning.automaticSlip * speedFactor * turnFactor;
  const targetSlip = handbrake ? 1 : automaticSlip;
  const blend = s.driftBlend ?? 0;
  s.driftBlend =
    blend +
    (targetSlip - blend) *
      (1 - Math.exp(-dt * (targetSlip > blend ? 11 : 2.8)));

  const turnSpeed = Math.min(1, Math.abs(forward) / 2.2);
  const nextHeading =
    s.heading +
    s.steering *
      (tuning.yaw + s.driftBlend * tuning.driftYaw) *
      Math.min(1, tuning.steeringSpeed / Math.max(1, Math.abs(forward))) *
      turnSpeed *
      Math.sign(forward) *
      dt;
  let hit = false;
  if (!blocked(s.x, s.z, nextHeading)) s.heading = nextHeading;
  else if (Math.abs(nextHeading - s.heading) > 1e-8) hit = true;
  fx = Math.sin(s.heading);
  fz = -Math.cos(s.heading);
  const lateral = s.vx * -fz + s.vz * fx;
  const fullGrip = tuning.grip + tuning.downforce * forward * forward;
  const grip = fullGrip + (tuning.driftGrip - fullGrip) * s.driftBlend;
  const opposing = gas * forward < 0 && Math.abs(forward) > 0.35;
  // Keep small analog inputs gentle; full throttle gets the stronger engine.
  const motor = (s.powertrain ??= freshPowertrain());
  advancePowertrain(motor, forward, gas, dt, tuning.transmission);
  const changing = motor.time < motor.shiftUntil;
  // Strong initial torque carries on beyond the old 65 km/h ceiling. The
  // automatic briefly unloads the driven wheels as well as the exhaust.
  const fullTorque =
    tuning.acceleration - Math.max(0, forward) * tuning.torqueFalloff;
  const acceleration = opposing
    ? tuning.brake
    : gas < 0
      ? tuning.reverseAcceleration
      : Math.min(
          tuning.acceleration * 0.558 +
            (fullTorque - tuning.acceleration * 0.558) * gas * gas,
          tuning.power / Math.max(10, forward),
        ) * (changing ? tuning.shiftTorque : 1);
  // Rolling resistance is mild: lifting the accelerator preserves momentum,
  // while an opposite pedal gives controllable braking before reversing.
  const speed = Math.hypot(s.vx, s.vz);
  const resistance = tuning.drag + 0.25 / Math.max(speed, 0.3);
  s.vx +=
    (gas * fx * acceleration - s.vx * resistance - lateral * -fz * grip) * dt;
  s.vz +=
    (gas * fz * acceleration - s.vz * resistance - lateral * fx * grip) * dt;
  if (!gas && Math.hypot(s.vx, s.vz) < 0.08) s.vx = s.vz = 0;
  const magnitude = Math.hypot(s.vx, s.vz),
    // A brake request does not turn forward motion into reverse motion.
    // Apply the reverse cap only after the car actually starts moving back.
    maxSpeed = s.vx * fx + s.vz * fz < 0 ? 6 : tuning.maxSpeed;
  if (magnitude > maxSpeed) {
    s.vx *= maxSpeed / magnitude;
    s.vz *= maxSpeed / magnitude;
  }
  if (!blocked(s.x + s.vx * dt, s.z, s.heading)) s.x += s.vx * dt;
  else {
    s.vx *= -0.3;
    hit = true;
  }
  if (!blocked(s.x, s.z + s.vz * dt, s.heading)) s.z += s.vz * dt;
  else {
    s.vz *= -0.3;
    hit = true;
  }
  s.speed = Math.hypot(s.vx, s.vz);
  const finalLateral = s.vx * Math.cos(s.heading) + s.vz * Math.sin(s.heading);
  s.drifting =
    s.driftBlend > 0.08 && Math.abs(finalLateral) > 0.8 && s.speed > 2.4;
  if (s.drifting) s.driftDistance += s.speed * dt;
  return { worldContact: hit };
}
