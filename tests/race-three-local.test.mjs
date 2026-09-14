import test from 'node:test';
import assert from 'node:assert/strict';
import {
  changeLocalRacers,
  freshRace,
  startRace,
  carBlocked,
  resolveCarContacts,
  advanceDrift,
} from '../lib/game/race/engine.ts';
import { localRaceInputs } from '../lib/game/race/input.ts';
import { raceCourse } from '../lib/game/race/course.ts';
import { CAR_COLORS } from '../lib/game/race/vehicles.ts';
import {
  validRaceCommand,
  validRaceInputs,
  validRaceState,
} from '../lib/game/race/validation.ts';
import { neutralRaceInput } from '../lib/game/race/types.ts';
import { applyRaceCommand } from '../lib/game/network/room-race.ts';
import { ROOM_VERSION } from '../lib/game/network/room-types.ts';

const party = () => {
  const race = freshRace();
  for (let slot = 0; slot < 3; slot++)
    changeLocalRacers(race, slot, 3, `Device ${slot}`);
  return race;
};

await test('nine cars fit the three-device room with distinct colours and stable local identities', () => {
  const race = party();
  assert.equal(race.players, 9);
  assert.equal(race.racers.length, 9);
  assert.equal(CAR_COLORS.length, 9);
  assert.equal(new Set(CAR_COLORS.map((c) => c.hex)).size, 9);
  assert.equal(new Set(race.racers.map((r) => r.colorId)).size, 9);
  assert.deepEqual(
    race.racers.map((r) => r.id),
    ['0:0', '0:1', '0:2', '1:0', '1:1', '1:2', '2:0', '2:1', '2:2'],
  );
  assert.equal(validRaceState(race, 3), true);
  assert.equal(
    validRaceState(race, 2),
    false,
    'room capacity still counts devices',
  );
  assert.equal(
    validRaceState(race, 4),
    false,
    'four-device rooms are not supported',
  );
});

await test('shrinking and expanding one local crew preserves other devices and never duplicates colours', () => {
  const race = party();
  const others = structuredClone(race.racers.filter((r) => r.memberSlot !== 1));
  race.racers.forEach((r) => {
    r.ready = true;
  });
  changeLocalRacers(race, 1, 1, 'Guest');
  assert.equal(race.racers.length, 7);
  assert(race.racers.every((r) => !r.ready));
  assert.deepEqual(
    race.racers.filter((r) => r.memberSlot !== 1),
    others,
  );
  changeLocalRacers(race, 1, 3, 'Guest');
  assert.equal(race.players, 9);
  assert.equal(new Set(race.racers.map((r) => r.colorId)).size, 9);
  assert.equal(validRaceState(race), true);
  const before = structuredClone(race);
  for (const count of [0, 4, -1, 1.5, NaN])
    changeLocalRacers(race, 0, count, 'Bad');
  for (const slot of [-1, 3, 0.5, NaN]) changeLocalRacers(race, slot, 1, 'Bad');
  assert.deepEqual(race, before);
});

await test('the third local driver has independent keyboard and analog controls', () => {
  const inputs = localRaceInputs(
    new Set(['KeyW', 'ArrowLeft', 'KeyI', 'KeyL', 'KeyO', 'KeyU']),
    [
      { throttle: -0.2, steer: 0.3 },
      { throttle: 0.6, steer: 0.8 },
      { throttle: -1, steer: -1 },
    ],
    3,
  );
  assert.deepEqual(inputs, [
    { throttle: 1, steer: 0.3, handbrake: false, reset: false },
    { throttle: 0.6, steer: -1, handbrake: false, reset: false },
    { throttle: 1, steer: 1, handbrake: true, reset: true },
  ]);
  const analog = localRaceInputs(
    new Set(),
    [
      { throttle: 0, steer: 0 },
      { throttle: 0, steer: 0 },
      { throttle: 0.7, steer: -0.4 },
    ],
    3,
  );
  assert.deepEqual(analog[2], {
    throttle: 0.7,
    steer: -0.4,
    handbrake: false,
    reset: false,
  });
  assert.equal(localRaceInputs(new Set(), [], 4).length, 3);
  assert.equal(validRaceInputs(inputs), true);
  assert.equal(validRaceInputs([...inputs, neutralRaceInput()]), false);
  assert.equal(
    validRaceInputs([
      ...inputs.slice(0, 2),
      { ...inputs[2], throttle: Infinity },
    ]),
    false,
  );
});

await test('localIndex 2 can configure only its authenticated device and duplicate colour remains rejected', () => {
  const race = party(),
    roster = [0, 1, 2].map((slot) => ({
      id: `device${slot}`,
      slot,
      name: `Device ${slot}`,
      connected: true,
      lastSeen: 0,
    }));
  const world = {
    scene: 'race',
    epoch: 1,
    attempt: 1,
    brief: true,
    state: race,
  };
  const hostThird = structuredClone(race.racers.find((r) => r.id === '0:2'));
  const guestThird = race.racers.find((r) => r.id === '1:2');
  const command = {
    kind: 'race-car',
    localIndex: 2,
    vehicleId: 'amg-gt',
    colorId: guestThird.colorId,
    memberSlot: 0,
  };
  assert.equal(validRaceCommand(command), true);
  assert.ok(applyRaceCommand(world, command, 1, roster));
  assert.equal(guestThird.vehicleId, 'amg-gt');
  assert.deepEqual(
    race.racers.find((r) => r.id === '0:2'),
    hostThird,
  );
  const before = structuredClone(race);
  applyRaceCommand(
    world,
    { ...command, colorId: hostThird.colorId },
    1,
    roster,
  );
  assert.deepEqual(race, before);
  for (const command of [
    { kind: 'race-local', value: 4 },
    { kind: 'race-car', localIndex: 3, vehicleId: 'amg-gt', colorId: 'cyan' },
  ]) {
    assert.equal(validRaceCommand(command), false);
    assert.equal(applyRaceCommand(world, command, 1, roster), null);
  }
  assert.equal(validRaceCommand({ kind: 'race-local', value: 3 }), true);
});

await test('a third car requires local slots 0 and 1; malformed ninth-car snapshots are rejected', () => {
  const race = party();
  const missingSecond = structuredClone(race);
  missingSecond.racers = missingSecond.racers.filter((r) => r.id !== '1:1');
  assert.equal(validRaceState(missingSecond), false);
  for (const mutate of [
    (s) => {
      s.racers[8].localIndex = 3;
      s.racers[8].id = '2:3';
    },
    (s) => {
      s.racers[8].memberSlot = 3;
      s.racers[8].id = '3:2';
    },
    (s) => {
      s.racers[8].colorId = s.racers[0].colorId;
    },
  ]) {
    const invalid = structuredClone(race);
    mutate(invalid);
    assert.equal(validRaceState(invalid), false);
  }
});

await test('nine-car starting grids remain clear on both existing courses', () => {
  for (const id of ['krasnoyarsk', 'nordschleife']) {
    const race = party(),
      course = raceCourse(id);
    race.racers.forEach((r) => {
      r.ready = true;
    });
    assert.equal(startRace(race, course), true);
    for (const { id: racerId, car } of race.racers)
      assert.equal(
        carBlocked(course, car.x, car.z, car.heading),
        false,
        `${id} ${racerId}`,
      );
    assert.equal(
      resolveCarContacts(
        race,
        course,
        race.racers.map((r) => ({ ...r.car })),
      ).size,
      0,
      id,
    );
  }
});

await test('third-player drift banking and a remote crash never change another racer’s score', () => {
  const race = party();
  race.mode = 'drift';
  race.phase = 'racing';
  race.paused = false;
  for (const [i, racer] of race.racers.entries()) {
    racer.score = 100 + i;
    racer.combo = 20 + i;
    racer.straightTime = 0.44;
  }
  const before = structuredClone(race.racers);
  const localThird = race.racers.find((r) => r.id === '0:2');
  const remoteThird = race.racers.find((r) => r.id === '2:2');
  advanceDrift(race, localThird, false, 0.02);
  advanceDrift(race, remoteThird, true, 0.02);
  assert.equal(localThird.score, 124);
  assert.equal(localThird.combo, 0);
  assert.equal(remoteThird.score, 108);
  assert.equal(remoteThird.combo, 0);
  for (const racer of race.racers.filter(
    (r) => r !== localThird && r !== remoteThird,
  ))
    assert.deepEqual(
      racer,
      before.find((r) => r.id === racer.id),
    );
});

await test('three-input rooms use protocol 8 rather than silently changing protocol 7', () => {
  assert.equal(ROOM_VERSION, 8);
});
