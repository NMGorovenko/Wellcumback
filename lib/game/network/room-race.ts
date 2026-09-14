import {
  changeLocalRacers,
  configureCar,
  freshRace,
  resetReady,
  returnToLobby,
  startRace,
} from '../race/engine.ts';
import { raceCourse } from '../race/course.ts';
import type { RaceState } from '../race/types.ts';
import { CAR_COLORS, VEHICLES } from '../race/vehicles.ts';
import type { RoomCommand, RoomMember, RoomWorld } from './room-types.ts';
import { isRoomLeader, roomRoles, leaderSlot } from './room-roles.ts';
export function newRaceWorld(
  previous: RoomWorld,
  roster: RoomMember[],
): RoomWorld {
  const s = freshRace();
  s.racers = [];
  for (const member of roster)
    changeLocalRacers(s, member.slot, 1, member.name);
  return {
    scene: 'race',
    epoch: previous.epoch + 1,
    attempt: previous.epoch + 1,
    state: s as unknown as Record<string, unknown>,
    brief: true,
    roles: roomRoles(previous),
    driver: leaderSlot(previous),
  };
}
export function syncRaceLobby(s: RaceState, roster: RoomMember[]) {
  if (s.phase !== 'lobby') return;
  for (const member of roster)
    if (!s.racers.some((r) => r.memberSlot === member.slot))
      changeLocalRacers(s, member.slot, 1, member.name);
}
/** A command may only configure cars belonging to its authenticated device. */
export function applyRaceCommand(
  world: RoomWorld,
  command: RoomCommand,
  slot: number,
  roster: RoomMember[],
): RoomWorld | null {
  if (world.scene !== 'race') return null;
  const s = world.state as unknown as RaceState,
    leader = isRoomLeader(world, slot);
  if (command.kind === 'pause' || (leader && command.kind === 'resume')) {
    if (s.phase === 'lobby' || s.phase === 'result') return null;
    s.paused = command.kind === 'pause';
    return { ...world };
  }
  if (command.kind === 'race-lobby' && leader) {
    returnToLobby(s);
    syncRaceLobby(s, roster);
    return { ...world, epoch: world.epoch + 1, brief: true };
  }
  if (s.phase !== 'lobby') return null;
  syncRaceLobby(s, roster);
  if (
    command.kind === 'race-local' &&
    (command.value === 1 || command.value === 2 || command.value === 3)
  ) {
    const member = roster.find((m) => m.slot === slot);
    if (!member) return null;
    changeLocalRacers(s, slot, command.value, member.name);
  } else if (
    command.kind === 'race-car' &&
    (command.localIndex === 0 ||
      command.localIndex === 1 ||
      command.localIndex === 2) &&
    command.vehicleId &&
    Object.hasOwn(VEHICLES, command.vehicleId) &&
    CAR_COLORS.some((c) => c.id === command.colorId)
  ) {
    configureCar(
      s,
      slot,
      command.localIndex,
      command.vehicleId,
      command.colorId!,
    );
  } else if (
    command.kind === 'race-track' &&
    leader &&
    (command.value === 'krasnoyarsk' || command.value === 'nordschleife')
  ) {
    s.trackId = command.value;
    resetReady(s);
  } else if (
    command.kind === 'race-mode' &&
    leader &&
    (command.value === 'circuit' || command.value === 'drift')
  ) {
    s.mode = command.value;
    resetReady(s);
  } else if (
    command.kind === 'race-laps' &&
    leader &&
    (command.value === 1 || command.value === 3)
  ) {
    s.laps = command.value;
    resetReady(s);
  } else if (command.kind === 'race-ready' && command.revision === s.revision) {
    s.racers
      .filter((r) => r.memberSlot === slot)
      .forEach((r) => (r.ready = true));
  } else if (
    command.kind === 'race-start' &&
    leader &&
    command.revision === s.revision &&
    roster.every((m) => m.connected) &&
    startRace(s, raceCourse(s.trackId))
  ) {
    return {
      ...world,
      epoch: world.epoch + 1,
      attempt: world.epoch + 1,
      brief: false,
    };
  } else return null;
  return { ...world };
}
