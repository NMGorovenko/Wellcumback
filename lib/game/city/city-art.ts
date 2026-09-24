/** Addressed landmarks; coordinates adapt the real neighbourhood to the game's
 * compressed street grid. Sources and deliberate offsets: city-art-reference-019.md.
 * No layout import: layout can reserve these footprints before generating houses. */
export type CityMuralSubject = 'surikov' | 'stolby' | 'polar';
export type CityArtParcel = {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
};
export type CityMural = CityArtParcel & {
  subject: CityMuralSubject;
  address: string;
  lat: number;
  lon: number;
  /** Local dimensions before rotating the whole host building. */
  facadeWidth: number;
  buildingDepth: number;
  angle: number;
  floors: number;
  color: string;
};
export const CITY_MURALS: readonly CityMural[] = [
  {
    id: 'mural-surikov',
    subject: 'surikov',
    address: 'СУРИКОВА, 53',
    lat: 56.015877,
    lon: 92.875218,
    x: 192,
    z: -55,
    w: 28,
    d: 16,
    h: 28,
    facadeWidth: 16,
    buildingDepth: 28,
    angle: -Math.PI / 2,
    floors: 9,
    color: '#b6aba0',
  },
  {
    id: 'mural-stolby',
    subject: 'stolby',
    address: 'КАРАМЗИНА, 20',
    lat: 55.988847,
    lon: 92.853272,
    x: -84,
    z: 464,
    w: 16,
    d: 24,
    h: 42,
    facadeWidth: 16,
    buildingDepth: 24,
    angle: Math.PI,
    floors: 14,
    color: '#cbbb9e',
  },
  {
    id: 'mural-polar',
    subject: 'polar',
    address: 'РЕСПУБЛИКИ, 51',
    lat: 56.015108,
    lon: 92.839151,
    x: -259,
    z: -150,
    w: 20,
    d: 18,
    h: 21,
    facadeWidth: 20,
    buildingDepth: 18,
    angle: 0,
    floors: 7,
    color: '#b5bcb3',
  },
];
/** June 2026 spoil heap by City Hall, Karl Marx / Veynbaum. This is a remembered
 * construction stage; removal had already begun by 30 June. Not Revolution Sq. */
export const METRO_CONSTRUCTION: CityArtParcel = {
  id: 'metro-cityhall',
  x: 251,
  z: 39,
  w: 48,
  d: 27,
  h: 12,
};
export const CITY_ART_PARCELS: readonly CityArtParcel[] = [
  ...CITY_MURALS,
  METRO_CONSTRUCTION,
];
export function cityArtParcelClear(
  parcel: { x: number; z: number; w: number; d: number },
  margin = 2,
) {
  return CITY_ART_PARCELS.every(
    (art) =>
      Math.abs(parcel.x - art.x) >= (parcel.w + art.w) / 2 + margin ||
      Math.abs(parcel.z - art.z) >= (parcel.d + art.d) / 2 + margin,
  );
}
