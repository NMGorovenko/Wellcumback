/** Photo references live in references/moving. This playable cutaway keeps a
 * continuous aisle through the studio; all coordinates are simulation units. */
export const MAP_UNITS_PER_METRE = 70;
export const mapSize = { width: 600, height: 1080 };
export const bounds = { minX: 35, maxX: 565, minY: 35, maxY: 1045 };
export const entry = { x: 335, y: 990, radius: 57 };
export const spawn = { x: 310, y: 895, spacing: 45 };
export const obstacles = [
  { x: 45, y: 380, w: 85, h: 260, kind: 'sofa', label: 'ДИВАН' },
  { x: 470, y: 125, w: 85, h: 275, kind: 'desk', label: 'СТОЛ И КОМПЬЮТЕР' },
  { x: 45, y: 865, w: 190, h: 150, kind: 'kitchen', label: 'КУХНЯ' },
  { x: 465, y: 840, w: 90, h: 185, kind: 'wardrobe', label: 'ШКАФ' },
  { x: 480, y: 580, w: 68, h: 108, kind: 'boxes', label: 'КОРОБКИ' },
  { x: 55, y: 50, w: 75, h: 75, kind: 'toilet', label: 'ТУАЛЕТ' },
] as const;
export const bagAnchors = [
  { x: 220, y: 460 },
  { x: 375, y: 535 },
  { x: 220, y: 655 },
  { x: 375, y: 745 },
  { x: 235, y: 230 },
  { x: 375, y: 125 },
] as const;
export const itemAnchors = [
  { x: 200, y: 155, label: 'Книги', weight: 6, kind: 'books' },
  { x: 390, y: 240, label: 'Провода', weight: 2, kind: 'cables' },
  { x: 220, y: 315, label: 'Посуда', weight: 4, kind: 'box' },
  { x: 390, y: 395, label: 'Куртки', weight: 2, kind: 'clothes' },
  { x: 160, y: 750, label: 'Инструменты', weight: 6, kind: 'box' },
  { x: 435, y: 650, label: 'Ещё книги', weight: 6, kind: 'books' },
  { x: 285, y: 580, label: 'Постельное', weight: 4, kind: 'clothes' },
  { x: 340, y: 835, label: 'Последняя коробка', weight: 6, kind: 'box' },
  { x: 300, y: 130, label: 'Полотенца', weight: 2, kind: 'clothes' },
  { x: 350, y: 330, label: 'Кружки', weight: 4, kind: 'box' },
  { x: 420, y: 465, label: 'Зарядки', weight: 2, kind: 'cables' },
  { x: 305, y: 695, label: 'Обувь', weight: 2, kind: 'box' },
  { x: 265, y: 870, label: 'Кастрюли', weight: 4, kind: 'box' },
  { x: 285, y: 795, label: 'Сковородки', weight: 4, kind: 'box' },
  { x: 435, y: 315, label: 'Клавиатура', weight: 2, kind: 'cables' },
  { x: 175, y: 520, label: 'Подушки', weight: 2, kind: 'clothes' },
  { x: 410, y: 810, label: 'Зимняя обувь', weight: 4, kind: 'box' },
  { x: 270, y: 390, label: 'Папки', weight: 4, kind: 'books' },
  { x: 400, y: 580, label: 'Пледы', weight: 4, kind: 'clothes' },
  { x: 290, y: 490, label: 'Колонки', weight: 6, kind: 'box' },
  { x: 200, y: 835, label: 'Зимние вещи', weight: 4, kind: 'clothes' },
  { x: 270, y: 75, label: 'Мелочи из ящика', weight: 2, kind: 'cables' },
] as const;

export { movingOverview } from './camera.ts';

/** Walk targets remain outside collision furniture; seatWorld is a seated render anchor. */
const station = (x: number, y: number, facing: number) => ({
  x,
  y,
  facing,
  world: {
    x: (x - 300) / MAP_UNITS_PER_METRE,
    y: 0,
    z: (y - 540) / MAP_UNITS_PER_METRE,
  },
});
export const movingStations = {
  sofa: [440, 555, 615].map((y) => ({
    ...station(152, y, -Math.PI / 2),
    seatWorld: {
      x: (102 - 300) / MAP_UNITS_PER_METRE,
      y: 0,
      z: (y - 540) / MAP_UNITS_PER_METRE,
    },
  })),
  laptop: station(435, 240, Math.PI / 2),
  toilet: station(160, 90, -Math.PI / 2),
};
