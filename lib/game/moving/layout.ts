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
] as const;
export const bagAnchors = [
  { x: 220, y: 460 },
  { x: 375, y: 535 },
  { x: 220, y: 655 },
  { x: 375, y: 745 },
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
] as const;

export function movingOverview(aspect: number, fov = 43) {
  const halfWidth = (bounds.maxX - bounds.minX) / 140 + 0.5;
  const halfDepth = (bounds.maxY - bounds.minY) / 140 + 0.55;
  const pitch = Math.PI * 0.32,
    sin = Math.sin(pitch),
    cos = Math.cos(pitch);
  const tanV = Math.tan((fov * Math.PI) / 360),
    tanH = tanV * Math.max(0.25, aspect);
  let distance = 0;
  for (const x of [-halfWidth, halfWidth])
    for (const z of [-halfDepth, halfDepth])
      for (const h of [-0.2, 2.7]) {
        const y = h - 0.8,
          depth = y * sin + z * cos;
        distance = Math.max(
          distance,
          depth + Math.abs(x) / (tanH * 0.9),
          depth + Math.abs(y * cos - z * sin) / (tanV * 0.9),
        );
      }
  return {
    look: { x: 0, y: 0.8, z: 0 },
    position: { x: 0, y: 0.8 + distance * sin, z: distance * cos },
    far: distance + halfDepth + 12,
  };
}
