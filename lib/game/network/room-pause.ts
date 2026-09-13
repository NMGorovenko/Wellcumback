import { setPaused, type GameState } from '../screen/engine.ts';
import type { RoomWorld } from './room-types.ts';
export function pauseRoomWorld(world: RoomWorld) {
  if (world.scene === 'screen')
    setPaused(world.state as unknown as GameState, true);
  else {
    world.state.paused = true;
    if (Array.isArray(world.state.previousAction))
      world.state.previousAction.fill(false);
    if (Array.isArray(world.state.previousSecondary))
      world.state.previousSecondary.fill(false);
  }
}
