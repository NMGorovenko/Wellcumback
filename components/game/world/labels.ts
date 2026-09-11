import * as THREE from 'three';
import type { RenderKit } from './render-kit';

/** High-density in-world sign; canvas is a texture, never a gameplay overlay. */
export function makeLabel(
  kit: RenderKit,
  text: string,
  color = '#ebeadc',
  width = 1.2,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#171d20dd';
  ctx.beginPath();
  ctx.roundRect(2, 4, 508, 88, 20);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = '500 36px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 48, 472);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  kit.textures.add(map);
  const material = new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthWrite: false,
  });
  kit.materials.add(material);
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, (width * 96) / 512, 1);
  return sprite;
}
