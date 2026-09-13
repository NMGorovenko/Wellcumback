import * as THREE from 'three';
import type { RefObject } from 'react';
import { hudObstacles } from './hud-obstacles.ts';

export type ActionCueRefs = RefObject<(HTMLDivElement | null)[]>;
const projected = new THREE.Vector3();

/** DOM badges follow real head positions. Keep badges inside the canvas and
 * separate clustered crew members without obscuring their faces. */
export function placeActionCues(
  refs: ActionCueRefs | undefined,
  heads: THREE.Object3D[],
  camera: THREE.Camera,
  host: HTMLElement,
  visible: boolean,
  avoid: readonly { x: number; y: number; w: number; h: number }[] = [],
) {
  if (!refs) return;
  camera.updateMatrixWorld();
  const width = host.clientWidth,
    height = host.clientHeight;
  const occupied: { x: number; y: number; w: number; h: number }[] = [
    ...avoid,
    ...hudObstacles(host),
    { x: 12, y: 10, w: Math.min(260, width * 0.45), h: 72 },
    { x: width - 125, y: 10, w: 115, h: 44 },
  ];
  // A partner's badge must not land on another face when the crew bunches up.
  for (const head of heads) {
    head.getWorldPosition(projected);
    projected.project(camera);
    if (Math.abs(projected.z) <= 1)
      occupied.push({
        x: ((projected.x + 1) * width) / 2 - 22,
        y: ((1 - projected.y) * height) / 2 - 22,
        w: 44,
        h: 52,
      });
  }
  refs.current.forEach((badge, i) => {
    if (!badge) return;
    const head = heads[i];
    if (!visible || !head) {
      badge.style.visibility = 'hidden';
      return;
    }
    head.getWorldPosition(projected);
    projected.y += 0.12;
    projected.project(camera);
    if (
      Math.abs(projected.x) > 1.15 ||
      Math.abs(projected.y) > 1.15 ||
      Math.abs(projected.z) > 1
    ) {
      badge.style.visibility = 'hidden';
      return;
    }
    const anchorX = ((projected.x + 1) * width) / 2,
      anchorY = ((1 - projected.y) * height) / 2;
    const w = badge.offsetWidth,
      h = badge.offsetHeight;
    const clampX = (x: number) => Math.max(8, Math.min(width - w - 8, x));
    const clampY = (y: number) => Math.max(10, Math.min(height - h - 10, y));
    const overlaps = (x: number, y: number) =>
      occupied.some(
        (r) =>
          x < r.x + r.w + 8 &&
          x + w + 8 > r.x &&
          y < r.y + r.h + 8 &&
          y + h + 8 > r.y,
      );
    // Prefer a short sideways glance; a tall cue stack above the actor feels detached.
    const sideY = clampY(anchorY - h / 2);
    const sides =
      i % 2 === 0
        ? [anchorX - w - 42, anchorX + 42]
        : [anchorX + 42, anchorX - w - 42];
    const aboveX = clampX(anchorX - w / 2),
      aboveY = clampY(anchorY - h - 38);
    const above = badge.dataset?.timing === 'true' && !overlaps(aboveX, aboveY);
    const sideX = sides.find(
      (cx) => cx >= 8 && cx + w <= width - 8 && !overlaps(cx, sideY),
    );
    let x = above ? aboveX : (sideX ?? aboveX),
      y = above ? aboveY : sideX === undefined ? aboveY : sideY;
    if (overlaps(x, y)) {
      const candidates = [
        [x, anchorY + 48],
        [anchorX - w - 42, y],
        [anchorX + 42, y],
        ...occupied.flatMap((r) => [
          [x, r.y - h - 10],
          [x, r.y + r.h + 10],
        ]),
      ];
      const choice = candidates
        .map(([cx, cy]) => [clampX(cx), clampY(cy)])
        .filter(([cx, cy]) => !overlaps(cx, cy))
        .sort(
          ([ax, ay], [bx, by]) =>
            (ax + w / 2 - anchorX) ** 2 +
            (ay + h / 2 - anchorY) ** 2 -
            ((bx + w / 2 - anchorX) ** 2 + (by + h / 2 - anchorY) ** 2),
        )[0];
      if (choice) [x, y] = choice;
    }
    badge.style.left = `${Math.round(x)}px`;
    badge.style.top = `${Math.round(y)}px`;
    badge.style.visibility = 'visible';
    occupied.push({ x, y, w, h });
  });
}
