import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cityRoads,
  cityStops,
  cityBuildings,
  CITY_PARKING,
} from '../lib/game/city/layout.ts';
import {
  cityGroundHeight,
  cityRoadHeight,
  citySurfacePose,
  cityRoadsConnect,
  cityOverpassClearance,
} from '../lib/game/city/surface.ts';
import {
  freshCity,
  tickCity,
  stepCityCar,
  teleportCityCar,
} from '../lib/game/city/engine.ts';
import {
  cityNavigationRoute,
  cityRouteLength,
} from '../lib/game/city/navigation.ts';
import {
  NETWORK_VERSION,
  readPeerPacket,
} from '../lib/game/network/protocol.ts';

const upper = cityRoads.find((r) => r.id === 'bridge-nikolaevsky:0');
const lower = cityRoads.find((r) => r.id === 'left-quay:3');
const crossing = { x: -716.6666666666666, z: 448.8333333333333 };
const heading = (r) => Math.atan2(r.to.x - r.from.x, r.from.z - r.to.z);
const poseOn = (road, x, z) => ({
  elevation: cityRoadHeight(road, x, z),
  surfaceId: `road:${road.id}`,
});
const carOn = (road, p, speed = 8) => {
  const h = heading(road);
  return {
    ...freshCity(),
    ...p,
    heading: h,
    vx: Math.sin(h) * speed,
    vz: -Math.cos(h) * speed,
    speed,
    ...citySurfacePose(
      p.x,
      p.z,
      h,
      poseOn(road, p.x, p.z).elevation,
      `road:${road.id}`,
    ),
  };
};

void test('city elevations preserve western terraces, low centre, and bounded slopes on every road', () => {
  const at = (id) => cityStops.find((s) => s.id === id);
  assert.ok(cityGroundHeight(at('akadem').x, at('akadem').z) > 55);
  assert.ok(cityGroundHeight(at('nikita').x, at('nikita').z) > 35);
  assert.ok(cityGroundHeight(at('komsomoll').x, at('komsomoll').z) < 15);
  for (const road of cityRoads) {
    const length = Math.hypot(road.to.x - road.from.x, road.to.z - road.from.z),
      steps = Math.ceil(length);
    let previous = cityRoadHeight(road, road.from.x, road.from.z);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps,
        x = road.from.x + (road.to.x - road.from.x) * t,
        z = road.from.z + (road.to.z - road.from.z) * t;
      const y = cityRoadHeight(road, x, z);
      assert.ok(Number.isFinite(y));
      assert.ok(
        Math.abs(y - previous) / (length / steps) < 0.2,
        `${road.id} grade at ${t}`,
      );
      previous = y;
    }
  }
});

void test('overlapping approach and bridge deck polygons sample exactly the same raised surface', () => {
  const approach = cityRoads.find((r) => r.id === 'nikolaevsky-left:1');
  for (const p of [
    { x: -731.2235962822898, z: 435.415978978298 },
    { x: -724.0430003679386, z: 437.4839112533941 },
  ])
    assert.equal(
      cityRoadHeight(approach, p.x, p.z),
      cityRoadHeight(upper, p.x, p.z),
    );
});

void test('Nikolaevsky remembers upper and lower surfaces at the same x/z, including a JSON snapshot', () => {
  const above = poseOn(upper, crossing.x, crossing.z),
    below = poseOn(lower, crossing.x, crossing.z);
  assert.ok(above.elevation - below.elevation > 8);
  assert.equal(cityRoadsConnect(upper, lower, crossing.x, crossing.z), false);
  assert.equal(cityOverpassClearance(crossing.x, crossing.z), above.elevation);
  for (const [road, expected] of [
    [upper, above],
    [lower, below],
  ]) {
    const saved = JSON.parse(JSON.stringify(expected));
    for (const h of [heading(road), heading(road) + Math.PI]) {
      const pose = citySurfacePose(
        crossing.x,
        crossing.z,
        h,
        saved.elevation,
        saved.surfaceId,
      );
      assert.ok(Math.abs(pose.elevation - expected.elevation) < 1e-9);
    }
  }
});

void test('ordinary fixed-step driving crosses above and beneath the deck without hitting upper railings', () => {
  for (const road of [upper, lower]) {
    const h = heading(road),
      p = {
        x: crossing.x - Math.sin(h) * 16,
        z: crossing.z + Math.cos(h) * 16,
      };
    const car = carOn(road, p),
      startY = car.elevation;
    let maxStep = 0,
      highest = startY;
    for (let i = 0; i < 240; i++) {
      const previous = car.elevation;
      const hit = stepCityCar(
        car,
        { throttle: 0.18, steer: 0, handbrake: false },
        1 / 60,
      );
      assert.equal(
        hit.worldContact,
        false,
        `${road.id} blocked at ${car.x},${car.z}`,
      );
      maxStep = Math.max(maxStep, Math.abs(car.elevation - previous));
      highest = Math.max(highest, car.elevation);
      assert.ok(
        Math.abs(car.elevation - cityRoadHeight(road, car.x, car.z)) < 0.12,
      );
    }
    assert.ok(
      (car.x - crossing.x) * Math.sin(h) - (car.z - crossing.z) * Math.cos(h) >
        12,
    );
    assert.ok(maxStep < 0.05, 'no discrete layer switch');
    if (road === upper)
      assert.ok(
        highest > startY + 1 && car.elevation < highest - 1,
        'the shared street rises to the deck crest, then descends toward the river',
      );
  }
});

void test('leaving the edge of an elevated deck is blocked rather than teleporting to ground', () => {
  const car = carOn(upper, crossing, 10);
  car.heading = heading(upper) + Math.PI / 2;
  car.vx = Math.sin(car.heading) * 10;
  car.vz = -Math.cos(car.heading) * 10;
  let contacted = false;
  for (let i = 0; i < 180; i++) {
    const previous = car.elevation;
    const hit = stepCityCar(
      car,
      { throttle: 0.3, steer: 0, handbrake: false },
      1 / 60,
    );
    contacted ||= hit.worldContact;
    assert.ok(Math.abs(car.elevation - previous) < 0.15);
    assert.ok(car.elevation - cityGroundHeight(car.x, car.z) > 5);
  }
  assert.equal(contacted, true);
});

void test('uphill load reduces acceleration and downhill load increases it without idle creep', () => {
  const road = cityRoads.find((r) => r.id === 'left-quay:1');
  const mid = {
    x: (road.from.x + road.to.x) / 2,
    z: (road.from.z + road.to.z) / 2,
  };
  const up = carOn(road, mid, 15),
    down = carOn(road, mid, 15);
  down.heading += Math.PI;
  down.vx = -down.vx;
  down.vz = -down.vz;
  Object.assign(down, citySurfacePose(down.x, down.z, down.heading));
  const uphill = up.pitch > 0 ? up : down,
    downhill = up.pitch > 0 ? down : up;
  assert.ok(uphill.pitch > 0.03 && downhill.pitch < -0.03);
  for (let i = 0; i < 120; i++)
    for (const car of [uphill, downhill])
      stepCityCar(car, { throttle: 0.4, steer: 0, handbrake: false }, 1 / 60);
  assert.ok(downhill.speed > uphill.speed + 0.3);
  const parked = carOn(road, mid, 0);
  for (let i = 0; i < 120; i++)
    stepCityCar(parked, { throttle: 0, steer: 0, handbrake: false }, 1 / 60);
  assert.equal(parked.speed, 0);
  assert.equal(parked.x, mid.x);
  assert.equal(parked.z, mid.z);
});

void test('terrain motion survives pause, JSON rejoin, network copy, and canonical fast travel', () => {
  const car = carOn(lower, { x: crossing.x - 10, z: crossing.z + 2.75 });
  for (let i = 0; i < 10; i++) tickCity(car, 1 / 60, new Set(['KeyW']));
  car.paused = true;
  const frozen = JSON.stringify(car);
  tickCity(car, 0.1, new Set(['KeyW']));
  assert.equal(JSON.stringify(car), frozen);
  car.paused = false;
  const rejoined = JSON.parse(JSON.stringify(car));
  const packet = readPeerPacket(
    JSON.stringify({
      type: 'city',
      version: NETWORK_VERSION,
      seq: 1,
      epoch: 0,
      driver: 'host',
      state: car,
    }),
  );
  assert.equal(packet.state.surfaceId, car.surfaceId);
  assert.equal(packet.state.elevation, car.elevation);
  assert.equal(packet.state.pitch, car.pitch);
  for (let i = 0; i < 60; i++) {
    tickCity(car, 1 / 60, new Set(['KeyW']));
    tickCity(rejoined, 1 / 60, new Set(['KeyW']));
  }
  assert.deepEqual(car, rejoined);
  for (const stop of cityStops) {
    assert.equal(teleportCityCar(car, stop.id), true);
    assert.ok(
      Math.abs(
        car.elevation - citySurfacePose(car.x, car.z, car.heading).elevation,
      ) < 1e-9,
    );
    assert.equal(car.speed, 0);
  }
});

void test('navigation never joins the two stacked Nikolaevsky roads', () => {
  const a = { ...crossing, ...poseOn(upper, crossing.x, crossing.z) },
    b = { ...crossing, ...poseOn(lower, crossing.x, crossing.z) };
  const route = cityNavigationRoute(a, b);
  assert.ok(route.length > 3);
  assert.ok(
    cityRouteLength(route) > 140,
    'same x/z on another deck requires the actual road approach',
  );
  assert.ok(
    route.some((p) => Math.hypot(p.x + 775, p.z - 444.6363636363636) < 0.1),
    'route returns to the grounded approach at Studgorodok',
  );
  assert.ok(
    cityRouteLength(route) < 4000,
    'lower level remains connected to the city',
  );
});

void test('building centres and nearby footprint corners remain level while roads stay smooth', () => {
  const building =
    cityBuildings.find((b) => b.id === 'borisova-30') ??
    cityBuildings.find((b) => b.x < -750 && b.x > -900 && b.w > 15);
  assert.ok(building);
  const y = cityGroundHeight(building.x, building.z);
  for (const dx of [-0.45, 0.45])
    for (const dz of [-0.45, 0.45])
      assert.ok(
        Math.abs(
          cityGroundHeight(
            building.x + building.w * dx,
            building.z + building.d * dz,
          ) - y,
        ) < 0.001,
      );
  for (const lot of CITY_PARKING)
    assert.ok(Number.isFinite(cityGroundHeight(lot.x, lot.z)));
});

void test('street entries, island exits and all three complete bridges are drivable in both directions', () => {
  const road = (id) => cityRoads.find((r) => r.id === id);
  const chain = (prefix) => cityRoads.filter((r) => r.id.startsWith(prefix));
  const ends = (roads) => roads.map((r) => r.to);
  const spans = (id) => cityRoads.filter((r) => r.bridge === id);
  const vino = chain('vinogradovsky');
  /** @type {[string, {x:number,z:number}[]][]} */
  const paths = [
    [
      'nikolaevsky',
      [
        road('nikolaevsky-left:0').from,
        ...ends(chain('nikolaevsky-left')),
        ...ends(spans('nikolaevsky')),
        { x: -515, z: 659.56 },
      ],
    ],
    [
      'kommunalny',
      [
        road('veynbauma:0').to,
        road('veynbauma:0').from,
        ...ends(spans('kommunalny')),
        road('predmostnaya-north:0').to,
      ],
    ],
    [
      'oktyabrsky',
      [
        road('oktyabrsky-left:0').from,
        road('oktyabrsky-left:0').to,
        ...ends(spans('oktyabrsky')),
        road('oktyabrsky-right:0').to,
      ],
    ],
    [
      'vinogradovsky',
      [
        {
          x: 388,
          z: vino[0].from.z - (12 * (vino[0].to.z - vino[0].from.z)) / 100,
        },
        vino[0].from,
        ...ends(vino.slice(0, 3)),
        road('tatyshev-loop:0').to,
      ],
    ],
    [
      'tatyshev-ramp',
      [
        { x: 925, z: -238.56363636363636 },
        road('tatyshev-exit:1').to,
        road('tatyshev-exit:1').from,
        road('tatyshev-exit:0').from,
        road('bridge-oktyabrsky:2').from,
      ],
    ],
    [
      'otdyha-west',
      [
        road('bridge-kommunalny:1').from,
        road('otdyha-loop:0').from,
        road('otdyha-loop:0').to,
        road('otdyha-loop:1').to,
      ],
    ],
    [
      'otdyha-east',
      [
        road('bridge-kommunalny:4').to,
        road('bridge-kommunalny:4').from,
        road('otdyha-loop:7').from,
        road('otdyha-loop:7').to,
      ],
    ],
  ];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  for (const [name, path] of paths)
    for (const direction of [1, -1]) {
      const points = direction === 1 ? path : [...path].reverse();
      const [a, b] = points,
        h = Math.atan2(b.x - a.x, a.z - b.z);
      const car = { ...freshCity(), ...a, heading: h };
      Object.assign(car, citySurfacePose(car.x, car.z, car.heading));
      let next = 1,
        maxStep = 0;
      for (let frame = 0; frame < 180 * 60 && next < points.length; frame++) {
        const p = points[next],
          dx = p.x - car.x,
          dz = p.z - car.z,
          d = Math.hypot(dx, dz);
        if (d < 1.5) {
          next++;
          continue;
        }
        const angle = Math.atan2(
          Math.sin(Math.atan2(dx, -dz) - car.heading),
          Math.cos(Math.atan2(dx, -dz) - car.heading),
        );
        const forward =
          car.vx * Math.sin(car.heading) - car.vz * Math.cos(car.heading);
        const desired =
          Math.min(6, Math.sqrt(7 * d)) * Math.max(0.16, Math.cos(angle));
        const prior = car.elevation;
        tickCity(car, 1 / 60, new Set(), {
          throttle: clamp((desired - forward) * 0.35, -1, 1),
          steer: clamp(angle * 2, -1, 1),
        });
        maxStep = Math.max(maxStep, Math.abs(car.elevation - prior));
      }
      assert.equal(
        next,
        points.length,
        `${name}/${direction} stalled at ${car.x},${car.z} on ${car.surfaceId}`,
      );
      assert.equal(car.bumps, 0, `${name}/${direction} bumped`);
      assert.ok(
        maxStep < 0.15,
        `${name}/${direction} vertical jump ${maxStep}`,
      );
    }
});

void test('Nikolaevsky deck is continuous across the transverse bisector of every bend', () => {
  const roads = cityRoads.filter((r) => r.bridge === 'nikolaevsky');
  for (let i = 1; i < roads.length; i++) {
    const a = roads[i - 1],
      b = roads[i],
      p = a.to;
    const al = Math.hypot(a.to.x - a.from.x, a.to.z - a.from.z),
      bl = Math.hypot(b.to.x - b.from.x, b.to.z - b.from.z);
    const dx = (b.to.x - b.from.x) / bl - (a.to.x - a.from.x) / al,
      dz = (b.to.z - b.from.z) / bl - (a.to.z - a.from.z) / al,
      l = Math.hypot(dx, dz);
    for (const radius of [2, 5, 8]) {
      const x = p.x + (dx / l) * radius,
        z = p.z + (dz / l) * radius;
      const left = cityRoadHeight(a, x - (dz / l) * 0.01, z + (dx / l) * 0.01),
        right = cityRoadHeight(b, x + (dz / l) * 0.01, z - (dx / l) * 0.01);
      assert.ok(
        Math.abs(left - right) < 0.005,
        `${a.id}/${b.id}: centimetre movement jumps ${Math.abs(left - right)}m`,
      );
    }
  }
});
