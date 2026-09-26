import * as THREE from 'three';

// Probe actual rendered triangles after paint has moved into vertex colours.
// Geometry attributes stay shared; only per-colour triangle indices are copied.
export function citySurfaceColors(root) {
  const colors = new Map(),
    temporary = [];
  const add = (color, mesh) => {
    const list = colors.get(color) ?? [];
    list.push(mesh);
    colors.set(color, list);
  };
  const color = new THREE.Color();
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isInstancedMesh || Array.isArray(mesh.material))
      return;
    const g = mesh.geometry,
      c = g.attributes.color;
    if (mesh.name.startsWith('city-relief-ground')) {
      add('82966d', mesh);
      return;
    }
    if (!mesh.material.vertexColors || !c) {
      add(mesh.material.color?.getHexString(), mesh);
      return;
    }
    const byColor = new Map(),
      count = g.index?.count ?? g.attributes.position.count;
    for (let i = 0; i < count; i += 3) {
      const a = g.index?.getX(i) ?? i,
        b = g.index?.getX(i + 1) ?? i + 1,
        d = g.index?.getX(i + 2) ?? i + 2;
      color
        .setRGB(c.getX(a), c.getY(a), c.getZ(a))
        .multiply(mesh.material.color);
      const key = color.getHexString(),
        indices = byColor.get(key) ?? [];
      indices.push(a, b, d);
      byColor.set(key, indices);
    }
    for (const [key, indices] of byColor) {
      const geometry = new THREE.BufferGeometry();
      geometry.attributes = { ...g.attributes };
      geometry.setIndex(indices);
      const part = new THREE.Mesh(geometry, mesh.material);
      part.matrix.copy(mesh.matrixWorld);
      part.matrixAutoUpdate = false;
      part.updateMatrixWorld(true);
      add(key, part);
      temporary.push(geometry);
    }
  });
  return { colors, dispose: () => temporary.forEach((g) => g.dispose()) };
}
