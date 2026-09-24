/** Serializable suspension/flight state. The host owns it just like wheel motion. */
export type CityFlight = {
  airborne: boolean;
  vy: number;
  waterTime: number;
  landing: number;
  safe?: {
    x: number;
    z: number;
    heading: number;
    elevation: number;
    surfaceId: string;
  };
};
export const freshFlight = (): CityFlight => ({
  airborne: false,
  vy: 0,
  waterTime: 0,
  landing: 0,
});
export function validCityFlight(
  value: unknown,
): value is CityFlight | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const f = value as CityFlight;
  if (
    typeof f.airborne !== 'boolean' ||
    ![f.vy, f.waterTime, f.landing].every(Number.isFinite) ||
    Math.abs(f.vy) > 100 ||
    f.waterTime < 0 ||
    f.waterTime > 10 ||
    f.landing < 0 ||
    f.landing > 1
  )
    return false;
  if (f.safe !== undefined) {
    const p = f.safe;
    if (
      !p ||
      typeof p !== 'object' ||
      Array.isArray(p) ||
      ![p.x, p.z, p.heading, p.elevation].every(Number.isFinite) ||
      Math.abs(p.x) > 2600 ||
      Math.abs(p.z) > 1900 ||
      Math.abs(p.elevation) > 200 ||
      typeof p.surfaceId !== 'string' ||
      p.surfaceId.length > 100 ||
      !/^road:[a-z0-9:-]+$/.test(p.surfaceId)
    )
      return false;
  }
  return true;
}
