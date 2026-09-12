import * as THREE from 'three';
import type { RefObject } from 'react';

export type OverlayRect = { x: number; y: number; w: number; h: number };
export type ProtectedHead = { x: number; y: number; radius: number };
const point = new THREE.Vector3();
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

/** Try short sideways steps before lifting the bubble. The speaker remains
 * underneath its tail, and a crowded scene never sends dialogue across the room. */
export function speechPlacement(
  ax: number,
  ay: number,
  w: number,
  h: number,
  width: number,
  height: number,
  heads: readonly ProtectedHead[] = [],
) {
  const minX = 10,
    maxX = Math.max(minX, width - w - 10);
  const x = clamp(ax - w / 2, minX, maxX);
  const y = clamp(ay - h - 30, 82, Math.max(82, height - h - 20));
  const nearbyX = (value: number) =>
    clamp(
      value,
      Math.max(minX, Math.min(x, ax - w + 26)),
      Math.min(maxX, Math.max(x, ax - 26)),
    );
  const nearbyY = (value: number) => clamp(value, Math.max(82, y - 48), y);
  const xs = [
    x,
    ...heads.flatMap((head) => [
      nearbyX(head.x - head.radius - w - 8),
      nearbyX(head.x + head.radius + 8),
    ]),
  ];
  const ys = [
    y,
    ...heads.map((head) => nearbyY(head.y - head.radius - h - 24)),
  ];
  let best = { x, y },
    bestScore = Infinity;
  for (const cx of xs)
    for (const cy of ys) {
      let score = (cx - x) ** 2 + (cy - y) ** 2 * 2;
      for (const head of heads) {
        const dx = head.x - clamp(head.x, cx, cx + w);
        const dy = head.y - clamp(head.y, cy, cy + h + 16);
        const overlap = head.radius ** 2 - dx ** 2 - dy ** 2;
        if (overlap > 0) score += 1e6 + overlap * 1e3;
      }
      if (score < bestScore) {
        bestScore = score;
        best = { x: cx, y: cy };
      }
    }
  return { ...best, tail: clamp(ax - best.x - 8, 18, w - 30) };
}

export function placeSpeechBubble(
  ref: RefObject<HTMLOutputElement | null> | undefined,
  anchor: THREE.Object3D | THREE.Vector3 | null,
  camera: THREE.Camera,
  host: HTMLElement,
  visible: boolean,
  protectedAnchors: readonly THREE.Object3D[] = [],
): OverlayRect | null {
  const bubble = ref?.current;
  if (!bubble) return null;
  if (!visible || !anchor || bubble.hidden) {
    bubble.style.visibility = 'hidden';
    return null;
  }
  camera.updateMatrixWorld();
  if (anchor instanceof THREE.Vector3) point.copy(anchor);
  else anchor.getWorldPosition(point);
  point.y += 0.16;
  point.project(camera);
  if (
    Math.abs(point.z) > 1 ||
    Math.abs(point.x) > 1.2 ||
    Math.abs(point.y) > 1.2
  ) {
    bubble.style.visibility = 'hidden';
    return null;
  }
  const width = host.clientWidth,
    height = host.clientHeight;
  const ax = ((point.x + 1) * width) / 2,
    ay = ((1 - point.y) * height) / 2;
  const heads: ProtectedHead[] = [];
  for (const head of protectedAnchors) {
    if (head === anchor) continue;
    head.getWorldPosition(point);
    point.project(camera);
    if (
      Math.abs(point.z) > 1 ||
      Math.abs(point.x) > 1.2 ||
      Math.abs(point.y) > 1.2
    )
      continue;
    heads.push({
      x: ((point.x + 1) * width) / 2,
      y: ((1 - point.y) * height) / 2,
      radius: 26,
    });
  }
  const w = bubble.offsetWidth,
    h = bubble.offsetHeight;
  const { x, y, tail } = speechPlacement(ax, ay, w, h, width, height, heads);
  bubble.style.left = `${Math.round(x)}px`;
  bubble.style.top = `${Math.round(y)}px`;
  bubble.style.setProperty('--speech-tail', `${tail}px`);
  bubble.style.visibility = 'visible';
  return { x, y, w, h: h + 16 };
}
