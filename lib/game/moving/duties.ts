import { movingStations } from './layout.ts';
import {
  LAPTOP_SECONDS,
  LAPTOP_OPERATION_SECONDS,
  movingIncident,
} from './incidents.ts';
export { LAPTOP_SECONDS } from './incidents.ts';
import { clearMovingRoute, movingNavigate } from './navigation.ts';
import { distance, forceDrop } from './physics.ts';
import { say } from './messages.ts';
import type { MovingInput, MovingState } from './types.ts';

export const TOILET_SECONDS = 8;
export const movingWorkRate = (stamina: number) =>
  0.65 + 0.35 * Math.min(1, Math.max(0, stamina) / 35);
const neutral = (): MovingInput => ({
  x: 0,
  y: 0,
  action: false,
  alternate: false,
});
export function hasMovingDuty(s: MovingState) {
  return s.alert.active || s.toilet.active;
}
function begin(s: MovingState, kind: 'alert' | 'toilet') {
  const actor = s.actors[0],
    duty = s[kind],
    station = kind === 'alert' ? movingStations.laptop : movingStations.toilet;
  duty.active = true;
  duty.count++;
  duty.progress = 0;
  if (kind === 'alert') {
    s.alert.operation = 0;
    s.alert.awaitingRelease = true;
    s.alert.inputMismatch = false;
  }
  actor.zipping = null;
  actor.packingBag = null;
  actor.activityProgress = 0;
  actor.activity = kind === 'alert' ? 'alert-walk' : 'toilet-walk';
  actor.taskTarget = {
    kind: kind === 'alert' ? 'laptop' : 'toilet',
    id: null,
    x: station.x,
    y: station.y,
  };
  forceDrop(s, actor);
  clearMovingRoute(actor);
  say(s, kind === 'alert' ? movingIncident(duty.count).announcement : 'toilet');
}
/** Deadlines schedule only one mandatory job at a time. The next alert is
 * measured from completion, leaving a real interval for packing and resting. */
export function movingDutyInput(
  s: MovingState,
  dt: number,
  human: MovingInput,
): MovingInput | null {
  if (!hasMovingDuty(s) && s.elapsed >= s.dutyGraceUntil) {
    if (s.elapsed >= s.alert.nextAt) begin(s, 'alert');
    else if (s.elapsed >= s.toilet.nextAt) begin(s, 'toilet');
  }
  if (!hasMovingDuty(s)) return null;
  const actor = s.actors[0],
    kind = s.alert.active ? 'alert' : 'toilet',
    duty = s[kind];
  if (!forceDrop(s, actor))
    return {
      ...neutral(),
      ...movingNavigate(s, actor, { x: 330, y: 300 }, dt, 30),
    };
  const station =
    kind === 'alert' ? movingStations.laptop : movingStations.toilet;
  if (actor.activity === 'alert-walk' || actor.activity === 'toilet-walk') {
    const dock = kind === 'alert' ? 6 : 35;
    if (distance(actor, station) > dock)
      return { ...neutral(), ...movingNavigate(s, actor, station, dt, dock) };
    clearMovingRoute(actor);
    actor.activity = kind === 'alert' ? 'laptop' : 'toilet';
    actor.facing = station.facing;
  }
  if (kind === 'alert') {
    const alert = s.alert;
    if (alert.awaitingRelease) {
      actor.working = false;
      alert.inputMismatch = false;
      if (!human.action && !human.alternate) alert.awaitingRelease = false;
    } else {
      const operation = movingIncident(alert.count).operations[
        Math.min(1, alert.operation)
      ];
      const correct =
        operation.control === 'action' ? human.action : human.alternate;
      const wrong =
        operation.control === 'action' ? human.alternate : human.action;
      alert.inputMismatch = wrong;
      actor.working = correct && !wrong;
      if (actor.working) {
        const boundary =
          alert.operation === 0
            ? LAPTOP_OPERATION_SECONDS[0] / LAPTOP_SECONDS
            : 1;
        duty.progress = Math.min(
          boundary,
          duty.progress + (dt * movingWorkRate(actor.stamina)) / LAPTOP_SECONDS,
        );
        if (duty.progress >= boundary) {
          alert.operation++;
          alert.awaitingRelease = boundary < 1;
        }
      }
    }
  } else duty.progress = Math.min(1, duty.progress + dt / TOILET_SECONDS);
  actor.activityProgress = duty.progress;
  if (duty.progress >= 1) {
    duty.active = false;
    duty.nextAt = s.elapsed + (kind === 'alert' ? 85 : 155);
    s.dutyGraceUntil = s.elapsed + 24;
    actor.activity = 'free';
    actor.activityProgress = 0;
    actor.taskTarget = null;
    if (kind === 'toilet') actor.stamina = Math.min(100, actor.stamina + 8);
    say(s, kind === 'alert' ? movingIncident(duty.count).fixed : 'relief');
  }
  return neutral();
}
