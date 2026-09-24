import {
  CITY_BOBROVY_LOG,
  CITY_PARKING,
  cityBuildings,
  type CityPoint,
} from '../../../lib/game/city/layout.ts';
import { cityGroundHeight } from '../../../lib/game/city/surface.ts';
import type { CityReviewCamera } from './scene.tsx';

export type CityReviewPlace = CityPoint & {
  heading: number;
  road?: string;
  view?: CityReviewCamera;
};

const building = (kind: string) => cityBuildings.find((b) => b.kind === kind)!;
const museum = building('museum'),
  opera = building('theatre'),
  kubatura = building('kubatura'),
  arena = building('arena'),
  bobBuildings = cityBuildings.filter((b) => b.kind === 'bobrovy-log'),
  bob = CITY_BOBROVY_LOG.base,
  summit = CITY_BOBROVY_LOG.summit,
  parking = CITY_PARKING.find((p) => p.id === 'kubatura')!;

function view(
  anchor: CityPoint,
  eye: [number, number, number],
  target: [number, number, number],
  shadowSize = 55,
): CityReviewPlace {
  const base = cityGroundHeight(anchor.x, anchor.z),
    position = { x: anchor.x + eye[0], y: base + eye[1], z: anchor.z + eye[2] },
    look = {
      x: anchor.x + target[0],
      y: base + target[1],
      z: anchor.z + target[2],
    };
  position.y = Math.max(
    position.y,
    cityGroundHeight(position.x, position.z) + 3,
  );
  return {
    x: position.x,
    z: position.z,
    heading: Math.atan2(look.x - position.x, position.z - look.z),
    view: { position, look, fov: 50, shadowSize },
  };
}

const bobFront = {
  x:
    (Math.min(...bobBuildings.map((b) => b.x - b.w / 2)) +
      Math.max(...bobBuildings.map((b) => b.x + b.w / 2))) /
    2,
  z: Math.min(...bobBuildings.map((b) => b.z - b.d / 2)),
};

/** Development-only frames use canonical parcels and current terrain heights,
 * so moving a landmark or raising its forecourt cannot leave stale viewpoints. */
export const CITY_LANDMARK_REVIEW_PLACES: Record<string, CityReviewPlace> = {
  'Музей · восточнее моста': view(museum, [28, 20, 48], [-12, 3, 7]),
  'Опера · восточный фасад': view(opera, [48, 11, 11], [0, 3, 0]),
  'Кубатура · поднятая парковка': view(
    kubatura,
    [76, 44, parking.z - kubatura.z + 110],
    [0, 7, parking.z - kubatura.z - 12],
    90,
  ),
  'Бобровый лог · вход': view(bobFront, [5, 25, -115], [0, 7, 12], 105),
  'Бобровый лог · сверху': {
    ...view(
      bob,
      [(summit.x - bob.x) / 2, 650, (summit.z - bob.z) / 2 - 30],
      [
        (summit.x - bob.x) / 2,
        (cityGroundHeight(summit.x, summit.z) -
          cityGroundHeight(bob.x, bob.z)) /
          2,
        (summit.z - bob.z) / 2,
      ],
      230,
    ),
    x: bob.x,
    z: bob.z,
  },
  'Дворец Ярыгина · фасад': view(
    arena,
    [18, 18, arena.d / 2 + 60],
    [0, arena.h * 0.4, 0],
    75,
  ),
};
