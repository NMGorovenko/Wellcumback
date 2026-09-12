import {
  freshCity,
  resetCityCar,
  tickCity,
  type CityState,
} from '../city/engine.ts';
import {
  freshGame,
  tick,
  act,
  setPaused,
  moveToSide,
  setChairs,
  type GameState,
} from '../screen/engine.ts';
import {
  createScreenEpisode,
  screenEpisodes,
  type ScreenEpisode,
} from '../screen/episodes.ts';
import { PLAYER_BINDINGS } from '../input/bindings.ts';
import {
  neutralDrive,
  driveIsNeutral,
  type DriveAxes,
} from '../input/drive.ts';
import {
  captureRoomInput,
  publishRoomWorld,
  roomActive,
  roomFresh,
  roomHost,
  roomInputDeadlineMs,
  roomSnapshot,
  roomWorld,
  takeRoomFrame,
} from './room-client.ts';
import type { RoomCommand, RoomFrame, RoomWorld } from './room-types.ts';

const held = new Map<number, RoomFrame>();
const inputAt = new Map<number, number>();
const disarmedSlots = new Set<number>();
function suspendRemoteInput() {
  held.clear();
  for (const member of roomSnapshot().roster)
    if (member.slot) disarmedSlots.add(member.slot);
}
const HOST_STEP = 1 / 60;
let lastWorldKey = '';
let hostAccumulator = 0;
let inputArmed = false;
export function mapRoomKeys(
  keys: ReadonlySet<string>,
  slot: number,
  toolOwner = slot,
) {
  const from = PLAYER_BINDINGS[0],
    to = PLAYER_BINDINGS[slot];
  const result = new Set<string>();
  if (!to) return result;
  for (const name of Object.keys(from) as (keyof typeof from)[])
    if (keys.has(from[name])) result.add(to[name]);
  if (keys.has('Space')) result.add(to.action);
  if (keys.has('KeyQ') && toolOwner === slot) result.add('KeyQ');
  return result;
}
function screenWorld(
  state: GameState,
  brief: boolean,
  epoch: number,
): RoomWorld {
  return {
    scene: 'screen',
    state: state as unknown as Record<string, unknown>,
    brief,
    epoch,
    driver: 0,
  };
}
export function initializeRoomCity() {
  // A restored host must read its saved world before a city RAF can create one.
  if (roomHost() && !roomWorld() && roomSnapshot().status === 'connected')
    publishRoomWorld({
      scene: 'city',
      epoch: 0,
      brief: false,
      state: freshCity() as unknown as Record<string, unknown>,
      driver: 0,
    });
}
function includeJoinedPlayers(state: GameState) {
  // Joining is permitted during the brief. The final join and begin request may
  // cross in flight, so adopt all accepted stable slots after the next poll too.
  state.players = Math.min(
    3,
    Math.max(
      state.players,
      ...roomSnapshot().roster.map((member) => member.slot + 1),
    ),
  );
}
export function roomCommand(command: RoomCommand, slot = roomSnapshot().slot) {
  if (!roomActive()) return;
  if (!roomHost()) {
    // Keyboard/gamepad action and its held state are one input frame; treating
    // the following RAF as another press would double-trigger some phases.
    const keys =
      command.kind === 'action' && command.value === 'input'
        ? new Set(['KeyE'])
        : new Set<string>();
    captureRoomInput(keys, neutralDrive(), command);
    return;
  }
  const world = roomWorld();
  if (!world) return;
  const isOwner = slot === 0;
  if (
    world.scene === 'city' &&
    (command.kind === 'pause' || (command.kind === 'resume' && isOwner))
  ) {
    world.state.paused = command.kind === 'pause';
    suspendRemoteInput();
    inputArmed = false;
    publishRoomWorld({ ...world });
    return;
  }
  if (command.kind === 'restart' && isOwner && world.scene === 'city') {
    const state = world.state as unknown as CityState;
    resetCityCar(state);
    state.accumulator = 0;
    state.previousAction = false;
    publishRoomWorld({ ...world, epoch: world.epoch + 1 });
  } else if (
    command.kind === 'start-screen' &&
    isOwner &&
    world.scene === 'city'
  ) {
    const members = roomSnapshot().roster;
    if (members.length < 2 || members.some((p) => !p.connected) || !roomFresh())
      return;
    const state = freshGame(Math.max(...members.map((p) => p.slot)) + 1);
    setPaused(state, true);
    publishRoomWorld(screenWorld(state, true, world.epoch + 1));
  } else if (command.kind === 'exit' && isOwner) {
    publishRoomWorld({
      scene: 'city',
      epoch: world.epoch + 1,
      brief: false,
      state: freshCity() as unknown as Record<string, unknown>,
      driver: 0,
    });
  } else if (command.kind === 'wheel' && isOwner && world.scene === 'city') {
    const slots = roomSnapshot()
      .roster.filter((p) => p.connected)
      .map((p) => p.slot);
    const driver =
      slots[(slots.indexOf(world.driver ?? 0) + 1) % slots.length] ?? 0;
    publishRoomWorld({ ...world, epoch: world.epoch + 1, driver });
  } else if (world.scene === 'screen') {
    const s = world.state as unknown as GameState;
    includeJoinedPlayers(s);
    if (command.kind === 'pause') {
      setPaused(s, true);
      suspendRemoteInput();
      inputArmed = false;
    } else if (command.kind === 'resume' && isOwner && roomFresh()) {
      suspendRemoteInput();
      setPaused(s, false);
      inputArmed = false;
    } else if (command.kind === 'begin' && isOwner && roomFresh()) {
      setPaused(s, false);
      publishRoomWorld({ ...world, brief: false });
      inputArmed = false;
    } else if (command.kind === 'restart' && isOwner) {
      const next = freshGame(s.players);
      setPaused(next, true);
      publishRoomWorld(screenWorld(next, true, world.epoch + 1));
    } else if (
      command.kind === 'episode' &&
      isOwner &&
      typeof command.value === 'string' &&
      screenEpisodes.some((p) => p.id === command.value)
    ) {
      const next = createScreenEpisode(
        s.players,
        command.value as ScreenEpisode,
      );
      publishRoomWorld(screenWorld(next, false, world.epoch + 1));
    } else if (!world.brief && !s.paused && slot >= 0 && slot < s.players) {
      if (command.kind === 'action') act(s, slot);
      if (command.kind === 'move-side' && typeof command.value === 'number')
        moveToSide(s, slot, command.value);
      if (
        command.kind === 'chairs' &&
        (slot === 0 || slot === 1) &&
        (command.value === 1 || command.value === 2)
      )
        setChairs(s, command.value);
    }
    if (roomWorld()?.epoch === world.epoch)
      publishRoomWorld({
        ...world,
        state: s as unknown as Record<string, unknown>,
        brief: roomWorld()?.brief ?? world.brief,
      });
  }
}
function collect(world: RoomWorld) {
  for (const p of roomSnapshot().roster) {
    if (!p.slot) continue;
    if (
      !p.connected ||
      (held.has(p.slot) &&
        performance.now() - (inputAt.get(p.slot) ?? 0) > roomInputDeadlineMs())
    ) {
      held.delete(p.slot);
      // A fast host can see a healthy guest's next frame after its own input
      // deadline. Neutralize the gap, but reserve the release latch for an
      // actual disconnect or explicit pause.
      if (!p.connected) disarmedSlots.add(p.slot);
    }
    const frame = takeRoomFrame(p.slot, world.epoch);
    if (frame && p.connected) {
      inputAt.set(p.slot, performance.now());
      if (!frame.keys.length && driveIsNeutral(frame.drive) && !frame.command)
        disarmedSlots.delete(p.slot);
      if (!disarmedSlots.has(p.slot)) {
        held.set(p.slot, frame);
        if (frame.command) roomCommand(frame.command, p.slot);
      }
    }
  }
}
/** Consume a queued input only when its corresponding simulation step runs.
 * Fast displays must not swallow a press/release pair between engine ticks. */
function hostSteps(
  world: RoomWorld,
  dt: number,
  step: (current: RoomWorld) => void,
) {
  const worldKey = `${roomSnapshot().code}:${world.scene}:${world.epoch}`;
  if (lastWorldKey !== worldKey) {
    held.clear();
    inputAt.clear();
    disarmedSlots.clear();
    inputArmed = false;
    hostAccumulator = 0;
    lastWorldKey = worldKey;
  }
  if (!Number.isFinite(dt) || dt <= 0) return;
  hostAccumulator += Math.min(dt, 0.1);
  while (hostAccumulator + 1e-9 >= HOST_STEP) {
    hostAccumulator = Math.max(0, hostAccumulator - HOST_STEP);
    collect(world);
    const current = roomWorld();
    // A queued command may replace the scene. Its previous state must never
    // overwrite the new world or consume that world's first input frame.
    if (
      !current ||
      current.epoch !== world.epoch ||
      current.scene !== world.scene
    ) {
      hostAccumulator = 0;
      return;
    }
    step(current);
  }
}
export function tickRoomCity(
  state: CityState,
  dt: number,
  keys: ReadonlySet<string>,
  drive?: DriveAxes,
) {
  initializeRoomCity();
  const world = roomWorld();
  if (!world || world.scene !== 'city') return;
  if (!roomHost()) {
    captureRoomInput(keys, drive);
    const { x, z, heading } = state;
    Object.assign(state, world.state);
    const amount = 1 - Math.exp(-dt * 18);
    if (Math.hypot(x - state.x, z - state.z) < 10) {
      state.x = x + (state.x - x) * amount;
      state.z = z + (state.z - z) * amount;
      state.heading =
        heading +
        Math.atan2(
          Math.sin(state.heading - heading),
          Math.cos(state.heading - heading),
        ) *
          amount;
    }
    return;
  }
  hostSteps(world, dt, (current) => {
    const s = current.state as unknown as CityState;
    if (!roomFresh()) {
      inputArmed = false;
      suspendRemoteInput();
      s.paused = true;
    }
    const driver = current.driver ?? 0;
    const remote = held.get(driver);
    const input = driver === 0 ? keys : new Set(remote?.keys ?? []);
    if (
      roomFresh() &&
      !input.size &&
      driveIsNeutral(driver === 0 ? drive : remote?.drive)
    )
      inputArmed = true;
    const selected =
      inputArmed && roomFresh() ? new Set(input) : new Set<string>();
    selected.delete('KeyE'); // Story transitions are an explicit room command.
    tickCity(
      s,
      HOST_STEP,
      selected,
      inputArmed && roomFresh()
        ? driver === 0
          ? drive
          : remote?.drive
        : neutralDrive(),
    );
    s.interaction = null;
    Object.assign(state, s);
    publishRoomWorld({
      ...current,
      state: s as unknown as Record<string, unknown>,
    });
  });
}
export function tickRoomScreen(
  state: GameState,
  dt: number,
  keys: ReadonlySet<string>,
) {
  const world = roomWorld();
  if (!world || world.scene !== 'screen') return;
  if (!roomHost()) {
    captureRoomInput(keys);
    Object.assign(state, world.state);
    return;
  }
  hostSteps(world, dt, (current) => {
    const s = current.state as unknown as GameState;
    includeJoinedPlayers(s);
    if (!roomFresh()) {
      setPaused(s, true);
      suspendRemoteInput();
      inputArmed = false;
    }
    if (!keys.size && roomFresh()) inputArmed = true;
    const merged = mapRoomKeys(
      inputArmed ? keys : new Set<string>(),
      0,
      s.tool.owner,
    );
    if (inputArmed)
      for (const [slot, frame] of held)
        for (const code of mapRoomKeys(new Set(frame.keys), slot, s.tool.owner))
          merged.add(code);
    tick(s, HOST_STEP, merged);
    Object.assign(state, s);
    publishRoomWorld({
      ...current,
      state: s as unknown as Record<string, unknown>,
    });
  });
}
