export type RaceCameraPoint = { x: number; y: number; z: number };

export function raceCameraFraming(speed: number, aspect: number) {
  return {
    lead: 3.5 + speed * 0.22,
    distance: (14 + speed * 0.48) * Math.max(1, 0.9 / aspect),
    height: 8 + speed * 0.15,
  };
}

/** Lift the chase boom over hills while retaining a clear line to the car. */
export function clearRaceCamera(
  desired: RaceCameraPoint,
  car: RaceCameraPoint,
  heightAt: (x: number, z: number) => number,
): RaceCameraPoint {
  let y = Math.max(desired.y, heightAt(desired.x, desired.z) + 2.2);
  const distance = Math.hypot(desired.x - car.x, desired.z - car.z);
  const steps = Math.max(8, Math.ceil(distance / 0.8));
  const anchorY = car.y + 1.15;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ground = heightAt(
      car.x + (desired.x - car.x) * t,
      car.z + (desired.z - car.z) * t,
    );
    y = Math.max(y, anchorY + (ground + 0.65 - anchorY) / t);
  }
  return { ...desired, y };
}
