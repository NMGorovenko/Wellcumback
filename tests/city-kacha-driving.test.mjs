import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshCity,
  stepCityCar,
  cityCarBlocked,
} from '../lib/game/city/engine.ts';
import { cityRoadHeight, citySurfacePose } from '../lib/game/city/surface.ts';
import { CITY_KACHA_CROSSINGS } from '../lib/game/city/kacha-decks.ts';
import { inKachaWater, sampleKacha } from '../lib/game/city/kacha.ts';

// Complete dry-street / channel / dry-street traversals: perpendicular centre
// streets, Ada Lebedeva's oblique span, and the quay near the river mouth.
const crossings = [
  'perensona-kacha:0',
  'veynbauma-kacha:0',
  'ada-lebedeva:3',
  'left-quay:8',
];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

for (const id of crossings) {
  for (const direction of [1, -1]) {
    for (const lane of [-1, 1]) {
      void test(`${id} drives across Kacha in direction ${direction}, lane ${lane}, using normal physics`, () => {
        const crossing = CITY_KACHA_CROSSINGS.find(
          (span) => span.road.id === id,
        );
        assert.ok(crossing, `${id} must cross the actual Kacha channel`);
        const { road, nx, nz } = crossing;
        const roadLength = Math.hypot(
          road.to.x - road.from.x,
          road.to.z - road.from.z,
        );
        const before = Math.min(
          crossing.halfLength + 15,
          crossing.roadT * roadLength - (id === 'left-quay:8' ? 9 : 3),
        );
        const after = Math.min(
          crossing.halfLength + 15,
          (1 - crossing.roadT) * roadLength - 3,
        );
        const offset = lane * Math.min(3.5, road.width / 4);
        const point = (along) => ({
          x: crossing.x + nz * along + nx * offset,
          z: crossing.z - nx * along + nz * offset,
        });
        const start = point(direction > 0 ? -before : after);
        const end = point(direction > 0 ? after : -before);
        const heading = Math.atan2(end.x - start.x, start.z - end.z);
        const distance = Math.hypot(end.x - start.x, end.z - start.z);
        assert.equal(
          inKachaWater(start.x, start.z, 1.5),
          false,
          'start on the dry approach',
        );
        assert.equal(
          inKachaWater(end.x, end.z, 1.5),
          false,
          'finish on the opposite dry approach',
        );

        // Resolve the ordinary start surface once; every later coordinate,
        // velocity, elevation and surface choice comes only from stepCityCar.
        const car = {
          ...freshCity(),
          ...start,
          heading,
          ...citySurfacePose(start.x, start.z, heading),
        };
        let progress = 0,
          waterFrames = 0,
          largestStep = 0,
          largestStepAt = '';
        for (
          let frame = 0;
          frame < 30 * 60 && progress < distance - 1;
          frame++
        ) {
          const previousHeight = car.elevation;
          const forward =
            car.vx * Math.sin(heading) - car.vz * Math.cos(heading);
          const contact = stepCityCar(
            car,
            {
              throttle: clamp((8 - forward) * 0.35, -1, 1),
              steer: 0,
              handbrake: false,
            },
            1 / 60,
          );
          const label = `${id} direction ${direction}, lane ${lane}, at ${car.x},${car.z}`;
          assert.equal(
            contact.worldContact,
            false,
            `${label}: water, guard or terrain contact`,
          );
          assert.equal(
            cityCarBlocked(
              car.x,
              car.z,
              car.heading,
              car.elevation,
              car.damage,
            ),
            false,
            `${label}: complete car footprint stays clear`,
          );
          assert.ok(
            Math.abs(car.elevation - cityRoadHeight(road, car.x, car.z)) < 0.12,
            `${label}: ${car.surfaceId} at ${car.elevation} must follow the road`,
          );
          const step = Math.abs(car.elevation - previousHeight);
          if (step > largestStep) {
            largestStep = step;
            largestStepAt = `${car.x},${car.z}: ${previousHeight}→${car.elevation}`;
          }
          if (inKachaWater(car.x, car.z)) {
            waterFrames++;
            assert.ok(
              car.elevation > sampleKacha(car.x, car.z).waterHeight + 2,
              `${label}: car stays above the channel`,
            );
          }
          progress =
            (car.x - start.x) * Math.sin(heading) -
            (car.z - start.z) * Math.cos(heading);
        }
        assert.ok(
          progress >= distance - 1,
          `${id}: reaches the far approach without teleporting`,
        );
        assert.ok(
          waterFrames > 30,
          `${id}: actually traverses the water corridor`,
        );
        assert.ok(
          largestStep < 0.1,
          `${id}: no sudden vertical step (${largestStep}m at ${largestStepAt})`,
        );
      });
    }
  }
}
