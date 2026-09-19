import * as THREE from 'three';
import type { RenderKit } from '../world/render-kit.ts';

/** Lettering is attached to the facade, not a floating billboard. */
export function facadeText(
  kit: RenderKit,
  g: THREE.Group,
  text: string,
  color: string,
  w: number,
  x: number,
  y: number,
  z: number,
) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.font = 'bold 78px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 512, 64, 1010);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  kit.textures.add(tex);
  const material = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = kit.mesh(new THREE.PlaneGeometry(w, w / 8), material, g);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  return mesh;
}
