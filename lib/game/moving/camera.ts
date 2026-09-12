import { bounds, mapSize, MAP_UNITS_PER_METRE } from './layout.ts';

/** Camera and controls share this breakpoint; it uses the actual scene aspect. */
export function movingCameraSide(aspect: number): 'x' | 'z' {
  return aspect >= 1.2 ? 'x' : 'z';
}

/** Fit the entire apartment and standing heads. Wide screens see its long axis
 * horizontally from +X; portrait screens retain the view from +Z. */
export function movingOverview(aspect: number, fov = 43) {
  const side = movingCameraSide(aspect);
  const halfWidth =
    (bounds.maxX - bounds.minX) / (2 * MAP_UNITS_PER_METRE) + 0.5;
  const halfDepth =
    (bounds.maxY - bounds.minY) / (2 * MAP_UNITS_PER_METRE) + 0.55;
  const look = {
    x: (bounds.minX + bounds.maxX - mapSize.width) / 2 / MAP_UNITS_PER_METRE,
    y: 0.8,
    z: (bounds.minY + bounds.maxY - mapSize.height) / 2 / MAP_UNITS_PER_METRE,
  };
  const pitch = Math.PI * 0.32,
    sin = Math.sin(pitch),
    cos = Math.cos(pitch);
  const tanV = Math.tan((fov * Math.PI) / 360),
    tanH = tanV * Math.max(0.25, aspect);
  let distance = 0;
  for (const x of [-halfWidth, halfWidth])
    for (const z of [-halfDepth, halfDepth])
      for (const height of [-0.2, 2.7]) {
        const y = height - look.y,
          alongView = side === 'x' ? x : z,
          horizontal = side === 'x' ? -z : x,
          depth = y * sin + alongView * cos;
        distance = Math.max(
          distance,
          depth + Math.abs(horizontal) / (tanH * 0.9),
          depth + Math.abs(y * cos - alongView * sin) / (tanV * 0.9),
        );
      }
  return {
    side,
    look,
    position: {
      x: look.x + (side === 'x' ? distance * cos : 0),
      y: look.y + distance * sin,
      z: look.z + (side === 'z' ? distance * cos : 0),
    },
    far: distance + Math.max(halfWidth, halfDepth) + 12,
  };
}
