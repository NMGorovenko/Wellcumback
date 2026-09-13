import type { RoomWorld } from './room-types.ts';

export const roomRoles = (world: RoomWorld | null): [number, number, number] =>
  world?.roles ?? [0, 1, 2];
export const leaderSlot = (world: RoomWorld | null) => roomRoles(world)[0];
export const roomActor = (world: RoomWorld | null, memberSlot: number) =>
  roomRoles(world).indexOf(memberSlot);
export const isRoomLeader = (world: RoomWorld | null, memberSlot: number) =>
  memberSlot === leaderSlot(world);

/** Swap only the main role and the selected companion. */
export function transferRoles(world: RoomWorld, memberSlot: number) {
  const roles = [...roomRoles(world)] as [number, number, number];
  const actor = roles.indexOf(memberSlot);
  if (actor > 0) [roles[0], roles[actor]] = [roles[actor], roles[0]];
  return roles;
}
