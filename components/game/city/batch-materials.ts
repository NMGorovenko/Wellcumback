import * as THREE from 'three';
import type { RenderKit } from '../world/render-kit.ts';

/** Solid city paint differs mostly by colour. Bake that colour into vertices so
 * nearby facades share a draw call, preserving lighting and LOD geometry.
 * Textured, transparent and custom shaders keep their own material unchanged.
 */
export function cityBatchMaterials(kit: RenderKit) {
  const shared = new Map<string, THREE.MeshStandardMaterial>();
  const resolved = new Map<THREE.Material, THREE.Material>();
  const sourcePaint = new Set(kit.cache.values());
  return (source: THREE.Material): THREE.Material => {
    if (resolved.has(source)) return resolved.get(source)!;
    if (
      !(source instanceof THREE.MeshStandardMaterial) ||
      !sourcePaint.has(source) ||
      source.transparent ||
      source.vertexColors ||
      source.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ||
      Object.values(source).some((value) => value instanceof THREE.Texture)
    )
      return source;
    const json = source.toJSON();
    // All remaining material parameters, including emissive/side/depth/blending,
    // must match. Only base colour moves from the uniform to a vertex attribute.
    const { uuid: _uuid, color: _color, name: _name, ...parameters } = json;
    const key = JSON.stringify(parameters);
    let material = shared.get(key);
    if (!material) {
      material = source.clone();
      material.color.set(0xffffff);
      material.vertexColors = true;
      shared.set(key, material);
      kit.materials.add(material);
    }
    resolved.set(source, material);
    return material;
  };
}

export function bakeCityPaint(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
) {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) material.color.toArray(colors, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
