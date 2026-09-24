import type { CityBuilding } from './layout.ts';
// Coordinates are compact game positions; photo/geographic sources in docs/city-rightbank-reference-020.md.
export const CITY_RIGHTBANK_PARCELS: CityBuilding[] = [
  {
    kind: 'aerokos',
    x: 1457.5,
    z: -79,
    w: 106,
    d: 106,
    h: 34,
    angle: 3.141592653589793,
    color: '#dedfd9',
  },
  {
    kind: 'fighter',
    x: 1085,
    z: -643,
    w: 40,
    d: 46,
    h: 25,
    color: '#b9c3c6',
  },
  {
    kind: 'zori',
    x: -740,
    z: 690,
    w: 94,
    d: 30,
    h: 68,
    color: '#dedfd9',
  },
  {
    kind: 'zori',
    x: -970,
    z: 720,
    w: 86,
    d: 32,
    h: 64,
    color: '#dedfd9',
  },
  {
    kind: 'zori',
    x: -1080,
    z: 752,
    w: 86,
    d: 32,
    h: 62,
    color: '#dedfd9',
  },
  {
    kind: 'zori',
    x: -760,
    z: 785,
    w: 90,
    d: 32,
    h: 66,
    color: '#dedfd9',
  },
  {
    kind: 'zori',
    x: -1040,
    z: 840,
    w: 86,
    d: 32,
    h: 60,
    color: '#dedfd9',
  },
  {
    kind: 'zori',
    x: -1155,
    z: 865,
    w: 84,
    d: 32,
    h: 58,
    color: '#dedfd9',
  },
  {
    kind: 'fuel',
    x: -1100,
    z: 203,
    w: 42,
    d: 30,
    h: 6,
    color: '#46717c',
  },
  {
    kind: 'fuel',
    x: -972,
    z: -92,
    w: 42,
    d: 30,
    h: 6,
    color: '#46717c',
  },
  {
    kind: 'fuel',
    x: -320,
    z: 123,
    w: 42,
    d: 30,
    h: 6,
    color: '#46717c',
  },
  {
    kind: 'fuel',
    x: 360,
    z: -495,
    w: 42,
    d: 30,
    h: 6,
    color: '#46717c',
  },
  {
    kind: 'fuel',
    x: 0,
    z: 650,
    w: 42,
    d: 30,
    h: 6,
    color: '#46717c',
  },
  {
    kind: 'fuel',
    x: 1391,
    z: 330,
    w: 42,
    d: 30,
    h: 6,
    color: '#46717c',
  },
];
export const CITY_LOCAL_ACCESS = [
  {
    id: 'lesnikov-access',
    width: 12,
    points: [
      {
        x: -700,
        z: 610.75,
      },
      {
        x: -660,
        z: 672,
      },
      {
        x: -650,
        z: 750,
      },
      {
        x: -820,
        z: 750,
      },
      {
        x: -900,
        z: 795,
      },
      {
        x: -985,
        z: 785,
      },
      {
        x: -1120,
        z: 785,
      },
      {
        x: -1210,
        z: 810,
      },
    ],
  },
  {
    id: 'fuel-stud-access',
    width: 7,
    points: [
      {
        x: -1100,
        z: 236.29545,
      },
      {
        x: -1100,
        z: 218,
      },
    ],
  },
  {
    id: 'fuel-svobodny-access',
    width: 7,
    points: [
      {
        x: -991,
        z: -19.333,
      },
      {
        x: -989,
        z: -70,
      },
      {
        x: -989,
        z: -77,
      },
    ],
  },
  {
    id: 'fuel-bograda-access',
    width: 7,
    points: [
      {
        x: -320,
        z: 64.4,
      },
      {
        x: -320,
        z: 108,
      },
    ],
  },
  {
    id: 'fuel-vzletka-access',
    width: 7,
    points: [
      {
        x: 360,
        z: -527.125,
      },
      {
        x: 360,
        z: -510,
      },
    ],
  },
  {
    id: 'fuel-sverdlovsk-access',
    width: 7,
    points: [
      {
        x: 0,
        z: 714,
      },
      {
        x: 0,
        z: 665,
      },
    ],
  },
  {
    id: 'fuel-michurina-access',
    width: 7,
    points: [
      {
        x: 1391,
        z: 246,
      },
      {
        x: 1391,
        z: 315,
      },
    ],
  },
];
export const CITY_FUEL_STOPS = [
  {
    id: 'fuel-stud',
    x: -1100,
    z: 203,
  },
  {
    id: 'fuel-svobodny',
    x: -972,
    z: -92,
  },
  {
    id: 'fuel-bograda',
    x: -320,
    z: 123,
  },
  {
    id: 'fuel-vzletka',
    x: 360,
    z: -495,
  },
  {
    id: 'fuel-sverdlovsk',
    x: 0,
    z: 650,
  },
  {
    id: 'fuel-michurina',
    x: 1391,
    z: 330,
  },
];
/** Physical islands/columns/operator cabin, not the open canopy parcel. */
export function fuelSolids(b: Pick<CityBuilding, 'w' | 'd'>) {
  return [
    { x: b.w * 0.34, z: -b.d * 0.1, w: b.w * 0.21, d: b.d * 0.58, h: 3.8 },
    ...[-0.29, 0.075].map((x) => ({
      x: x * b.w,
      z: b.d * 0.09,
      w: 2.05,
      d: b.d * 0.33,
      h: 1.7,
    })),
    ...[-0.31, 0.11].flatMap((x) =>
      [-0.13, 0.3].map((z) => ({
        x: x * b.w,
        z: z * b.d,
        w: 0.22,
        d: 0.22,
        h: 4.6,
      })),
    ),
    { x: -b.w * 0.4, z: -b.d * 0.36, w: 5.2, d: 0.35, h: 5.2 },
  ];
}
