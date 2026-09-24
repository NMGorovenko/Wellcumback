import test from 'node:test';
import assert from 'node:assert/strict';
import { cityRoads } from '../lib/game/city/layout.ts';
import { freshCity, stepCityCar } from '../lib/game/city/engine.ts';
import { cityRoadHeight, citySurfacePose } from '../lib/game/city/surface.ts';

const offsets = [-7, -5.5, -3, 0, 3, 5.5, 7];
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const unit = (a, b) => {
  const length = distance(a, b);
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
};
const heading = (a, b) => Math.atan2(b.x - a.x, a.z - b.z);
function streetCar(point, angle, speed = 0) {
  // Only initialise on the real street. Subsequent poses come exclusively
  // from normal driving inputs: never seed the raised deck's elevation/id.
  return {
    ...freshCity(),
    ...point,
    heading: angle,
    vx: Math.sin(angle) * speed,
    vz: -Math.cos(angle) * speed,
    speed,
    ...citySurfacePose(point.x, point.z, angle),
  };
}

void test('both lanes steer from Baykitskaya onto the Nikolaevsky left ramp without falling under its deck', () => {
  const ramp = cityRoads.find((r) => r.id === 'nikolaevsky-left:0');
  const street = cityRoads
    .filter((r) => r.id.startsWith('baykitskaya:'))
    .at(-1);
  const incoming = unit(street.from, street.to);
  const outgoing = unit(ramp.from, ramp.to);
  const centre = [
    {
      x: street.to.x - incoming.x * 36,
      z: street.to.z - incoming.z * 36,
    },
    ramp.from,
    { x: ramp.to.x - outgoing.x * 6, z: ramp.to.z - outgoing.z * 6 },
  ];
  for (const offset of offsets) {
    const points = lanePoints(centre, offset);
    const car = streetCar(points[0], heading(points[0], points[1]));
    assert.equal(car.surfaceId, `road:${street.id}`, 'start on Baykitskaya');
    driveLane(car, points, `left lane ${offset}`);
    assert.ok(
      Math.abs(car.elevation - cityRoadHeight(ramp, car.x, car.z)) < 0.05,
      `left lane ${offset} at ${car.x},${car.z} selected ${car.surfaceId} at ${car.elevation}, deck ${cityRoadHeight(ramp, car.x, car.z)}`,
    );
    assert.match(car.surfaceId, /^road:nikolaevsky-left:/);
  }
});

function lanePoints(points, offset) {
  const lane = points.map((point, i) => {
    const before = unit(points[Math.max(0, i - 1)], points[Math.max(1, i)]);
    const after = unit(
      points[Math.min(i, points.length - 2)],
      points[Math.min(i + 1, points.length - 1)],
    );
    const nx = -before.z - after.z,
      nz = before.x + after.x,
      length = Math.hypot(nx, nz);
    const miter = (nx * -before.z + nz * before.x) / length;
    return {
      x: point.x + (nx / length / miter) * offset,
      z: point.z + (nz / length / miter) * offset,
    };
  });
  const result = [lane[0]];
  for (let i = 1; i < lane.length; i++) {
    const a = lane[i - 1],
      b = lane[i],
      steps = Math.ceil(distance(a, b));
    for (let step = 1; step <= steps; step++)
      result.push({
        x: a.x + ((b.x - a.x) * step) / steps,
        z: a.z + ((b.z - a.z) * step) / steps,
      });
  }
  return result;
}

function driveLane(car, points, label) {
  let cursor = 0,
    largestStep = 0;
  for (let frame = 0; frame < 30 * 60; frame++) {
    if (distance(car, points.at(-1)) < 2) break;
    let nearest = cursor,
      best = Infinity;
    for (
      let i = Math.max(0, cursor - 3);
      i < Math.min(points.length, cursor + 22);
      i++
    ) {
      const gap = distance(car, points[i]);
      if (gap < best) {
        best = gap;
        nearest = i;
      }
    }
    cursor = Math.max(cursor, nearest);
    const target =
      points[
        Math.min(points.length - 1, cursor + Math.round(3 + car.speed * 0.3))
      ];
    const difference = heading(car, target) - car.heading;
    const angle = Math.atan2(Math.sin(difference), Math.cos(difference));
    const forward =
      car.vx * Math.sin(car.heading) - car.vz * Math.cos(car.heading);
    const desired =
      Math.min(8, Math.sqrt(7 * distance(car, points.at(-1)))) *
      Math.max(0.2, Math.cos(angle));
    const previousHeight = car.elevation;
    const contact = stepCityCar(
      car,
      {
        throttle: clamp((desired - forward) * 0.35, -1, 1),
        steer: clamp(angle * 2, -1, 1),
        handbrake: false,
      },
      1 / 60,
    );
    assert.equal(contact.worldContact, false, `${label} at ${car.x},${car.z}`);
    largestStep = Math.max(
      largestStep,
      Math.abs(car.elevation - previousHeight),
    );
  }
  assert.ok(distance(car, points.at(-1)) < 2, `${label} stalled`);
  assert.ok(largestStep < 0.15, `${label}: ${largestStep}m step`);
}

void test('both lanes turn from the right approach onto the Nikolaevsky deck using normal steering', () => {
  const approach = cityRoads.find((r) => r.id === 'nikolaevsky-right:0');
  const span = cityRoads.filter((r) => r.bridge === 'nikolaevsky').at(-1);
  const street = unit(approach.from, approach.to);
  const bridge = unit(span.to, span.from);
  const centre = [
    { x: approach.from.x + street.x * 36, z: approach.from.z + street.z * 36 },
    approach.from,
    { x: span.to.x + bridge.x * 80, z: span.to.z + bridge.z * 80 },
  ];
  for (const offset of offsets) {
    const points = lanePoints(centre, offset);
    const car = streetCar(points[0], heading(points[0], points[1]));
    assert.equal(car.surfaceId, 'road:nikolaevsky-right:0');
    driveLane(car, points, `right lane ${offset}`);
    assert.ok(
      Math.abs(car.elevation - cityRoadHeight(span, car.x, car.z)) < 0.05,
      `right lane ${offset} selected ground below the deck`,
    );
    assert.match(car.surfaceId, /^road:bridge-nikolaevsky:/);
  }
});
