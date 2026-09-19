import {
  freshRoma2,
  roma2Action,
  roma2Tick,
  type Roma2State,
} from '../roma2/engine.ts';
import {
  vehiclePose,
  rememberVehicleStep,
  setVehicleRemainder,
} from '../city/vehicle-presentation.ts';
import { newRaceWorld, applyRaceCommand, syncRaceLobby } from './room-race.ts';
import { tickRace } from '../race/engine.ts';
import { raceCourse } from '../race/course.ts';
import {
  neutralRaceInput,
  type RaceInput,
  type RaceState,
} from '../race/types.ts';
import { pauseRoomWorld } from './room-pause.ts';
import {
  roomActor,
  roomRoles,
  leaderSlot,
  isRoomLeader,
  transferRoles,
} from './room-roles.ts';
import { cleanRole, cleanActiveActorCount } from '../clean/cast.ts';
import {
  freshClean,
  cleanAction,
  cleanTick,
  type CleanState,
} from '../clean/engine.ts';
import {
  cleanEpisodes,
  createCleanEpisode,
  type CleanEpisodeId,
} from '../clean/episodes.ts';
import {
  freshMoving,
  movingAction,
  movingTick,
  type MovingState,
} from '../moving/engine.ts';
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
  raceStartConfirmed,
  raceLobbyConfirmed,
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
let localActionPulse = '';
const pulseKey = (world: RoomWorld) =>
  `${roomSnapshot().code}:${world.scene}:${world.epoch}`;
type RoomStory = 'screen' | 'clean' | 'moving' | 'roma2';
function freshStoryWorld(
  scene: RoomStory,
  players: number,
  epoch: number,
  previous?: RoomWorld,
): RoomWorld {
  const state =
    scene === 'screen'
      ? freshGame(players)
      : scene === 'clean'
        ? freshClean(players)
        : scene === 'roma2'
          ? freshRoma2(players)
          : freshMoving(players);
  state.paused = true;
  return {
    scene,
    epoch,
    brief: true,
    driver: leaderSlot(previous ?? null),
    roles: roomRoles(previous ?? null),
    attempt: epoch,
    state: state as unknown as Record<string, unknown>,
  };
}
function includeStoryPlayers(world: RoomWorld) {
  const state = world.state as unknown as CleanState | MovingState | Roma2State;
  const count = Math.min(
    3,
    Math.max(state.players, ...roomSnapshot().roster.map((p) => p.slot + 1)),
  );
  if (world.scene === 'moving') {
    const s = state as MovingState;
    const seed = s.actors.length < count ? freshMoving(count) : null;
    while (s.actors.length < count) {
      s.actors.push(structuredClone(seed!.actors[s.actors.length]));
      s.previousAction.push(false);
      s.previousSecondary.push(false);
    }
  }
  if (world.scene === 'roma2') {
    const s = state as Roma2State;
    const seed = freshRoma2(count);
    while (s.actors.length < count) s.actors.push(seed.actors[s.actors.length]);
  }
  state.players = count;
  state.actorCount =
    world.scene === 'clean' ? cleanActiveActorCount(state) : count;
}
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
  previous?: RoomWorld,
): RoomWorld {
  return {
    scene: 'screen',
    state: state as unknown as Record<string, unknown>,
    brief,
    epoch,
    driver: leaderSlot(previous ?? null),
    roles: roomRoles(previous ?? null),
    attempt: epoch,
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
  if (!world || (!roomFresh() && command.kind !== 'pause')) return;
  const isOwner = isRoomLeader(world, slot);
  const actor = roomActor(world, slot);
  if (command.kind === 'start-race' && isOwner && world.scene === 'city') {
    const roster = roomSnapshot().roster;
    if (roster.every((m) => m.connected))
      publishRoomWorld(newRaceWorld(world, roster));
    return;
  }
  if (
    world.scene === 'race' &&
    command.kind !== 'exit' &&
    command.kind !== 'leader'
  ) {
    if (command.kind === 'race-start' && !raceLobbyConfirmed()) return;
    const next = applyRaceCommand(world, command, slot, roomSnapshot().roster);
    if (next) {
      if (
        ['pause', 'resume', 'race-start', 'race-lobby'].includes(command.kind)
      ) {
        suspendRemoteInput();
        inputArmed = false;
      }
      publishRoomWorld(next);
    }
    return;
  }
  if (command.kind === 'leader') {
    if (
      !isOwner ||
      !roomFresh() ||
      !Number.isInteger(command.value) ||
      !roomSnapshot().roster.some(
        (p) => p.slot === command.value && p.connected,
      ) ||
      command.value === leaderSlot(world)
    )
      return;
    pauseRoomWorld(world);
    suspendRemoteInput();
    inputArmed = false;
    localActionPulse = '';
    hostAccumulator = 0;
    publishRoomWorld({
      ...world,
      epoch: world.epoch + 1,
      attempt: world.attempt ?? world.epoch,
      roles: transferRoles(world, Number(command.value)),
      driver: Number(command.value),
    });
    return;
  }
  if (
    world.scene === 'city' &&
    (command.kind === 'pause' ||
      (command.kind === 'resume' && isOwner && roomFresh()))
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
    (command.kind === 'start-screen' ||
      (command.kind === 'start-story' &&
        ['screen', 'clean', 'moving', 'roma2'].includes(
          String(command.value),
        ))) &&
    isOwner &&
    world.scene === 'city'
  ) {
    const members = roomSnapshot().roster;
    if (members.length < 2 || members.some((p) => !p.connected) || !roomFresh())
      return;
    const scene =
      command.kind === 'start-screen' ? 'screen' : (command.value as RoomStory);
    publishRoomWorld(
      freshStoryWorld(
        scene,
        Math.max(...members.map((p) => p.slot)) + 1,
        world.epoch + 1,
        world,
      ),
    );
  } else if (command.kind === 'exit' && isOwner) {
    publishRoomWorld({
      scene: 'city',
      epoch: world.epoch + 1,
      brief: false,
      state: freshCity() as unknown as Record<string, unknown>,
      driver: leaderSlot(world),
      roles: roomRoles(world),
      attempt: world.epoch + 1,
    });
  } else if (command.kind === 'wheel' && isOwner && world.scene === 'city') {
    const slots = roomSnapshot()
      .roster.filter((p) => p.connected)
      .map((p) => p.slot);
    roomCommand(
      {
        kind: 'leader',
        value: slots[(slots.indexOf(slot) + 1) % slots.length],
      },
      slot,
    );
  } else if (
    world.scene === 'clean' ||
    world.scene === 'moving' ||
    world.scene === 'roma2'
  ) {
    includeStoryPlayers(world);
    const s = world.state as unknown as CleanState | MovingState | Roma2State;
    if (
      command.kind === 'pause' ||
      (command.kind === 'resume' && isOwner && roomFresh())
    ) {
      s.paused = command.kind === 'pause';
      suspendRemoteInput();
      inputArmed = false;
      localActionPulse = '';
    } else if (
      command.kind === 'begin' &&
      isOwner &&
      roomFresh() &&
      world.brief
    ) {
      s.paused = false;
      if (world.scene === 'clean') cleanAction(s as CleanState);
      else if (world.scene === 'roma2') roma2Action(s as Roma2State);
      else movingAction(s as MovingState);
      world.brief = false;
      inputArmed = false;
      localActionPulse = '';
    } else if (command.kind === 'restart' && isOwner) {
      publishRoomWorld(
        freshStoryWorld(world.scene, s.players, world.epoch + 1, world),
      );
      return;
    } else if (
      command.kind === 'episode' &&
      isOwner &&
      world.scene === 'clean' &&
      cleanEpisodes.some((p) => p.id === command.value)
    ) {
      publishRoomWorld({
        ...world,
        epoch: world.epoch + 1,
        attempt: world.epoch + 1,
        brief: false,
        state: createCleanEpisode(
          s.players,
          command.value as CleanEpisodeId,
        ) as unknown as Record<string, unknown>,
      });
      return;
    } else if (
      command.kind === 'action' &&
      command.value === 'input' &&
      slot === 0 &&
      !world.brief &&
      !s.paused
    ) {
      // A keyboard tap can start and end between two RAF simulation steps.
      localActionPulse = pulseKey(world);
    }
    publishRoomWorld({ ...world });
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
      publishRoomWorld(screenWorld(next, true, world.epoch + 1, world));
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
      publishRoomWorld(screenWorld(next, false, world.epoch + 1, world));
    } else if (!world.brief && !s.paused && actor >= 0 && actor < s.players) {
      if (command.kind === 'action') act(s, actor);
      if (command.kind === 'move-side' && typeof command.value === 'number')
        moveToSide(s, actor, command.value);
      if (
        command.kind === 'chairs' &&
        (actor === 0 || actor === 1) &&
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
      if (
        !frame.keys.length &&
        driveIsNeutral(frame.drive) &&
        (!frame.raceInputs ||
          frame.raceInputs.every(
            (i) => !i.throttle && !i.steer && !i.handbrake && !i.reset,
          )) &&
        !frame.command
      )
        disarmedSlots.delete(p.slot);
      if (!disarmedSlots.has(p.slot)) held.set(p.slot, frame);
      // Menus remain usable while gameplay waits for released buttons.
      const management =
        frame.command &&
        !['action', 'move-side', 'chairs'].includes(frame.command.kind);
      if (frame.command && (management || !disarmedSlots.has(p.slot))) {
        roomCommand(frame.command, p.slot);
        if (
          roomWorld()?.epoch !== world.epoch ||
          roomWorld()?.scene !== world.scene
        )
          return;
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
    if (roomWorld()?.epoch !== world.epoch) {
      hostAccumulator = 0;
      return;
    }
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
    const previous = vehiclePose(s);
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
    rememberVehicleStep(state, previous, vehiclePose(s), HOST_STEP);
    publishRoomWorld({
      ...current,
      state: s as unknown as Record<string, unknown>,
    });
  });
  setVehicleRemainder(state, hostAccumulator, state.paused);
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
      roomActor(current, 0),
      s.tool.owner,
    );
    if (inputArmed)
      for (const [slot, frame] of held)
        for (const code of mapRoomKeys(
          new Set(frame.keys),
          roomActor(current, slot),
          s.tool.owner,
        ))
          merged.add(code);
    tick(s, HOST_STEP, merged);
    Object.assign(state, s);
    publishRoomWorld({
      ...current,
      state: s as unknown as Record<string, unknown>,
    });
  });
}

/** Story engines own their E edges. Unlike the screen, no extra action callback is executed. */
function tickRoomStory<T extends CleanState | MovingState | Roma2State>(
  scene: 'clean' | 'moving' | 'roma2',
  state: T,
  dt: number,
  keys: ReadonlySet<string>,
  tick: (s: T, dt: number, keys: Set<string>) => void,
) {
  const world = roomWorld();
  if (!world || world.scene !== scene) return;
  if (!roomHost()) {
    captureRoomInput(keys);
    Object.assign(state, world.state);
    return;
  }
  hostSteps(world, dt, (current) => {
    includeStoryPlayers(current);
    const s = current.state as unknown as T;
    if (!roomFresh()) {
      s.paused = true;
      suspendRemoteInput();
      inputArmed = false;
      localActionPulse = '';
    }
    if (!keys.size && roomFresh()) inputArmed = true;
    const merged = mapRoomKeys(
      inputArmed ? keys : new Set<string>(),
      roomActor(current, 0),
      scene === 'clean' ? 0 : -1,
    );
    if (inputArmed) {
      if (localActionPulse === pulseKey(current))
        merged.add(PLAYER_BINDINGS[roomActor(current, 0)].action);
      for (const [slot, frame] of held)
        for (const code of mapRoomKeys(
          new Set(frame.keys),
          roomActor(current, slot),
          scene === 'clean' ? 0 : -1,
        ))
          merged.add(code);
    }
    localActionPulse = '';
    const priorPhase = s.phase;
    tick(s, HOST_STEP, merged);
    const cleanupHandoff =
      scene === 'clean' && priorPhase !== 'clean' && s.phase === 'clean';
    if (cleanupHandoff) {
      suspendRemoteInput();
      inputArmed = false;
    }
    Object.assign(state, s);
    publishRoomWorld({
      ...current,
      epoch: current.epoch + (cleanupHandoff ? 1 : 0),
      state: s as unknown as Record<string, unknown>,
    });
  });
}
export const tickRoomClean = (
  state: CleanState,
  dt: number,
  keys: ReadonlySet<string>,
) => tickRoomStory('clean', state, dt, keys, cleanTick);
export const tickRoomMoving = (
  state: MovingState,
  dt: number,
  keys: ReadonlySet<string>,
) => tickRoomStory('moving', state, dt, keys, movingTick);

export const tickRoomRoma2 = (
  state: Roma2State,
  dt: number,
  keys: ReadonlySet<string>,
) => tickRoomStory('roma2', state, dt, keys, roma2Tick);

export function roomRoleName(world: RoomWorld | null, slot: number) {
  if (world?.scene === 'roma2') return `Рядовой ${roomActor(world, slot) + 1}`;
  if (world?.scene === 'race') return 'Гонщик';
  if (
    world?.scene === 'clean' &&
    !['clean', 'result'].includes(String(world.state.phase)) &&
    roomActor(world, slot) > 0
  )
    return 'Наблюдатель';
  const roles =
    world?.scene === 'moving'
      ? ['Ярик', 'Настя', 'Никита']
      : world?.scene === 'clean'
        ? [0, 1, 2].map(
            (actor) =>
              cleanRole(
                {
                  phase: String(world.state.phase),
                  players: Number(world.state.players),
                },
                actor,
              ).name,
          )
        : ['Никита', 'Ярик', 'Рома'];
  return roles[roomActor(world, slot)] ?? 'Друг';
}

/** Each of the three device slots owns up to three car inputs. Each host step advances the world once. */
export function tickRoomRace(
  state: RaceState,
  dt: number,
  localInputs: RaceInput[],
) {
  const world = roomWorld();
  if (world?.scene !== 'race') return;
  if (!roomHost()) {
    captureRoomInput(new Set(), neutralDrive(), undefined, localInputs);
    const previous = state.racers;
    const samePhase = state.phase === world.state.phase;
    Object.assign(state, structuredClone(world.state));
    // Smooth presentation only. Authoritative lap counts, collisions and scores
    // always come from the host; teleports and pause restore immediately.
    if (samePhase && state.phase === 'racing' && !state.paused && roomFresh()) {
      const amount = 1 - Math.exp(-Math.max(0, dt) * 18);
      for (const r of state.racers) {
        const old = previous.find((p) => p.id === r.id);
        if (
          !old ||
          old.respawns !== r.respawns ||
          Math.hypot(old.car.x - r.car.x, old.car.z - r.car.z) > 15
        )
          continue;
        r.car.x = old.car.x + (r.car.x - old.car.x) * amount;
        r.car.z = old.car.z + (r.car.z - old.car.z) * amount;
        r.car.heading =
          old.car.heading +
          Math.atan2(
            Math.sin(r.car.heading - old.car.heading),
            Math.cos(r.car.heading - old.car.heading),
          ) *
            amount;
        r.elevation = old.elevation + (r.elevation - old.elevation) * amount;
      }
    }
    return;
  }
  // A start is tentative until the relay freezes the roster. Preserve queued
  // lobby commands and their ACKs if that compare-and-swap is rejected.
  if (!raceStartConfirmed()) {
    Object.assign(state, structuredClone(world.state));
    return;
  }
  hostSteps(world, dt, (current) => {
    const s = current.state as unknown as RaceState;
    syncRaceLobby(s, roomSnapshot().roster);
    if (!roomFresh()) {
      s.paused = true;
      suspendRemoteInput();
      inputArmed = false;
    }
    if (
      roomFresh() &&
      localInputs.every(
        (i) => !i.throttle && !i.steer && !i.handbrake && !i.reset,
      )
    )
      inputArmed = true;
    const inputs = new Map<string, RaceInput>();
    for (const r of s.racers) {
      const frames =
        r.memberSlot === 0 ? localInputs : held.get(r.memberSlot)?.raceInputs;
      inputs.set(
        r.id,
        inputArmed && roomFresh()
          ? (frames?.[r.localIndex] ?? neutralRaceInput())
          : neutralRaceInput(),
      );
    }
    const previous = s.racers.map((r) => ({
      pose: vehiclePose(r.car, r.elevation, r.pitch),
      respawns: r.respawns,
    }));
    const phase = s.phase;
    if (raceStartConfirmed())
      tickRace(s, HOST_STEP, inputs, raceCourse(s.trackId));
    // Two 120 Hz race steps may arrive as one 60 Hz host batch. Interpolate
    // the complete batch, then advance using the host's fractional remainder.
    s.racers.forEach((r, i) =>
      rememberVehicleStep(
        r.car,
        previous[i].pose,
        vehiclePose(r.car, r.elevation, r.pitch),
        HOST_STEP,
        phase !== 'racing' ||
          s.phase !== 'racing' ||
          r.respawns !== previous[i].respawns,
      ),
    );
    Object.assign(state, s);
    publishRoomWorld({ ...current, brief: s.phase === 'lobby' });
  });
  state.racers.forEach((r) =>
    setVehicleRemainder(r.car, hostAccumulator, state.paused),
  );
}
