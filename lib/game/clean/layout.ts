/** One floorplan for movement, props and camera. Units stay at 70 per metre:
 * more floor space must never enlarge people, furniture or interaction reach. */
export const MAP_UNITS_PER_METRE = 70;
export const mapSize = { width: 1700, height: 1160 };
export const bounds = { minX: 60, maxX: 1640, minY: 60, maxY: 1110 };
export const stations = [
  { id: 'desk', x: 1545, y: 590, label: 'ДНЕВАЛЬНЫЙ' },
  { id: 'toilet', x: 250, y: 1020, label: 'ТУАЛЕТ' },
  { id: 'shower', x: 610, y: 1010, label: 'ДУШ' },
  { id: 'washer', x: 1550, y: 1045, label: 'СТИРАЛКА' },
  { id: 'valve', x: 1355, y: 1030, label: 'ВЕНТИЛЬ' },
  { id: 'bucket', x: 1125, y: 1015, label: 'ВЕДРО' },
  { id: 'gear', x: 1005, y: 912, label: 'ХИМЗАЩИТА' },
  { id: 'duty', x: 160, y: 615, label: 'ДЕЖУРСТВО' },
] as const;
export const rooms = [
  { id: 'sleep', x: 60, y: 60, w: 1580, h: 390, color: '#a39a73', wood: true },
  {
    id: 'toilet',
    x: 60,
    y: 771,
    w: 365,
    h: 339,
    color: '#c8c9b7',
    wood: false,
  },
  {
    id: 'shower',
    x: 445,
    y: 771,
    w: 300,
    h: 339,
    color: '#c3d0c7',
    wood: false,
  },
  {
    id: 'utility',
    x: 765,
    y: 771,
    w: 450,
    h: 339,
    color: '#b8b59b',
    wood: false,
  },
  {
    id: 'laundry',
    x: 1235,
    y: 771,
    w: 405,
    h: 339,
    color: '#cbd0bf',
    wood: false,
  },
] as const;
export const doorways = [
  { left: 180, right: 380, y: 763, label: 'ТУАЛЕТ' },
  { left: 500, right: 700, y: 763, label: 'ДУШЕВАЯ' },
  { left: 885, right: 1115, y: 763, label: 'ХОЗКОМНАТА' },
  { left: 1320, right: 1550, y: 763, label: 'ПРАЧЕЧНАЯ' },
] as const;
export const obstacles = [
  ...Array.from({ length: 7 }, (_, i) => ({
    x: 100 + i * 220,
    y: 140,
    w: 100,
    h: 135,
    label: 'КРОВАТЬ',
    kind: 'bed',
  })),
  { x: 660, y: 330, w: 180, h: 65, label: 'СКАМЬЯ', kind: 'bench' },
  ...[425, 745, 1215].map((x) => ({
    x,
    y: 771,
    w: 20,
    h: 339,
    label: 'ПЕРЕГОРОДКА',
    kind: 'wall',
  })),
  ...rooms.slice(1).flatMap((room, i) => {
    const door = doorways[i];
    return [
      {
        x: room.x,
        y: 755,
        w: door.left - room.x,
        h: 16,
        label: door.label,
        kind: 'wall',
      },
      {
        x: door.right,
        y: 755,
        w: room.x + room.w - door.right,
        h: 16,
        label: door.label,
        kind: 'wall',
      },
    ];
  }),
  ...[
    [60, 250],
    [440, 440],
    [1100, 300],
  ].map(([x, w]) => ({
    x,
    y: 450,
    w,
    h: 16,
    label: 'СПАЛЬНОЕ ПОМЕЩЕНИЕ',
    kind: 'wall',
  })),
];
export const furniture = [
  { x: 1500, y: 530, w: 90, h: 45, label: 'ТУМБА', kind: 'desk' },
  { x: 1510, y: 1000, w: 80, h: 60, label: 'СТИРАЛКА', kind: 'washer' },
  { x: 950, y: 855, w: 110, h: 28, label: 'ШКАФ ХИМЗАЩИТЫ', kind: 'gear' },
  { x: 228, y: 1050, w: 44, h: 42, label: 'УНИТАЗ', kind: 'toilet' },
];
export const crewSpawn = { x: stations[6].x, y: 924, spacing: 44 };
export const npcSpawns = [
  { x: 1545, y: 490 },
  { x: 920, y: 355 },
  { x: 1140, y: 355 },
];
export const witnessLookPoints = [
  { x: 1460, y: 970 },
  { x: 1605, y: 960 },
];
export const washerLeaks = [
  [-85, -70],
  [55, -65],
  [0, 45],
  [-95, 40],
  [-120, -95],
  [60, 50],
].map(([x, y]) => ({ x: stations[3].x + x, y: stations[3].y + y }));
