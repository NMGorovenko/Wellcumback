/** A deliberately schematic Krasnoyarsk. Personal markers are placeholders,
 * not geographic addresses; the user can provide district landmarks later. */
export const CITY_BOUNDS = { minX: -29, maxX: 29, minZ: -20, maxZ: 20 };
export const BRIDGES = [-10, 10];
export const RIVER_HALF_WIDTH = 4;
export type CityMission = 'screen' | 'clean' | 'moving';
export const cityStops: {
  id: string;
  x: number;
  z: number;
  title: string;
  subtitle: string;
  mission?: CityMission;
  color: string;
}[] = [
  {
    id: 'nikita',
    x: -12,
    z: 10,
    title: 'У Никиты',
    subtitle: 'Экран на полстены',
    mission: 'screen',
    color: '#d9e89b',
  },
  {
    id: 'yarik',
    x: -12,
    z: -10,
    title: 'У Ярика',
    subtitle: 'Переезд · ранняя глава',
    mission: 'moving',
    color: '#ffd55e',
  },
  {
    id: 'roma',
    x: 12,
    z: 10,
    title: 'Байка Ромы',
    subtitle: 'Чистый проход',
    mission: 'clean',
    color: '#9bc8e8',
  },
  {
    id: 'new-home',
    x: 12,
    z: -10,
    title: 'Новый дом Ярика',
    subtitle: 'Сначала соберём все сумки',
    color: '#efa990',
  },
];
export const cityBuildings = [
  { x: -23, z: -13.5, w: 6, d: 7, h: 3.5, color: '#d6bc91' },
  { x: -21, z: -1, w: 9, d: 8, h: 4.5, color: '#a4b8bd' },
  { x: -23, z: 13, w: 6, d: 5, h: 3.2, color: '#decfae' },
  { x: -7, z: -1, w: 2.5, d: 8, h: 2.5, color: '#bf947d' },
  { x: 21, z: -13.5, w: 8, d: 7, h: 4.2, color: '#e0ceb0' },
  { x: 22, z: 0, w: 8, d: 8, h: 3.4, color: '#91aeb2' },
  { x: 23, z: 13, w: 6, d: 5, h: 3, color: '#c7c9aa' },
  { x: 7, z: -1, w: 2.5, d: 8, h: 2.6, color: '#d6b58c' },
];
