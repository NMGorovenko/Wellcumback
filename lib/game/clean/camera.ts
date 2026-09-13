import { bounds, mapSize, MAP_UNITS_PER_METRE } from './layout.ts';

export const isBarracksStoryClose = (phase: string) =>
  ['duty', 'find', 'accident', 'toilet'].includes(phase);

/** Show the surrounding passage, not the whole itinerary. Fixed pitch and
 * heading avoid camera spins while a player watches the timing cue. */
export function barracksFollow(x: number, z: number, aspect: number) {
  const distance = 10.8 * Math.max(1, 0.85 / Math.max(0.35, aspect));
  const pitch = Math.PI * 0.255;
  const look = { x, y: 0.85, z: z - 0.45 };
  return {
    look,
    position: {
      x,
      y: look.y + Math.sin(pitch) * distance,
      z: look.z + Math.cos(pitch) * distance,
    },
    far: 65,
  };
}

/** Fixed isometric view fitted to floor corners plus standing head height.
 * Only the viewport aspect ratio changes this framing, never a story action. */
export function barracksOverview(aspect: number, verticalFov = 43) {
  const halfWidth =
    (bounds.maxX - bounds.minX) / MAP_UNITS_PER_METRE / 2 + 0.55;
  const halfDepth =
    (bounds.maxY - bounds.minY) / MAP_UNITS_PER_METRE / 2 + 0.55;
  const look = {
    x: 0,
    y: 1.0,
    z:
      ((bounds.minY + bounds.maxY) / 2 - mapSize.height / 2) /
      MAP_UNITS_PER_METRE,
  };
  const pitch = Math.PI * 0.295,
    sin = Math.sin(pitch),
    cos = Math.cos(pitch);
  const tanV = Math.tan((verticalFov * Math.PI) / 360),
    tanH = tanV * Math.max(0.25, aspect);
  let distance = 0;
  // Fit the complete cutaway, including wall posters, with 9% screen padding.
  for (const x of [-halfWidth, halfWidth])
    for (const z of [-halfDepth, halfDepth])
      for (const height of [-0.2, 3.2]) {
        const y = height - look.y,
          vertical = y * cos - z * sin,
          depth = y * sin + z * cos;
        distance = Math.max(
          distance,
          depth + Math.abs(x) / (tanH * 0.91),
          depth + Math.abs(vertical) / (tanV * 0.91),
        );
      }
  return {
    look,
    position: { x: 0, y: look.y + distance * sin, z: look.z + distance * cos },
    far: distance + halfDepth + 15,
  };
}
