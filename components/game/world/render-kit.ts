import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** A scene owns its geometry, materials and textures. Objects share materials. */
export class RenderKit {
  readonly geometries = new Set<THREE.BufferGeometry>();
  readonly materials = new Set<THREE.Material>();
  readonly renderTargets = new Set<THREE.RenderTarget>();
  readonly textures = new Set<THREE.Texture>();
  readonly cache = new Map<string, THREE.MeshStandardMaterial>();
  readonly scene: THREE.Scene;
  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }
  material(color: string, roughness = 0.78, metalness = 0) {
    const key = `${color}/${roughness}/${metalness}`;
    let material = this.cache.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
      });
      this.materials.add(material);
      this.cache.set(key, material);
    }
    return material;
  }
  mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D = this.scene,
  ) {
    this.geometries.add(geometry);
    this.materials.add(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  box(
    w: number,
    h: number,
    d: number,
    color: string,
    x = 0,
    y = 0,
    z = 0,
    parent: THREE.Object3D = this.scene,
    radius = 0.015,
  ) {
    const geometry =
      radius > 0
        ? new RoundedBoxGeometry(
            w,
            h,
            d,
            2,
            Math.min(radius, w / 3, h / 3, d / 3),
          )
        : new THREE.BoxGeometry(w, h, d);
    const mesh = this.mesh(geometry, this.material(color), parent);
    mesh.position.set(x, y, z);
    return mesh;
  }
  sphere(
    xr: number,
    yr: number,
    zr: number,
    color: string,
    x = 0,
    y = 0,
    z = 0,
    parent: THREE.Object3D = this.scene,
    segments = 20,
  ) {
    const mesh = this.mesh(
      new THREE.SphereGeometry(1, segments, 14),
      this.material(color),
      parent,
    );
    mesh.scale.set(xr, yr, zr);
    mesh.position.set(x, y, z);
    return mesh;
  }
  cylinder(
    rt: number,
    rb: number,
    h: number,
    color: string,
    x = 0,
    y = 0,
    z = 0,
    parent: THREE.Object3D = this.scene,
  ) {
    const mesh = this.mesh(
      new THREE.CylinderGeometry(rt, rb, h, 16),
      this.material(color),
      parent,
    );
    mesh.position.set(x, y, z);
    return mesh;
  }
  rod(
    from: THREE.Vector3,
    to: THREE.Vector3,
    r: number,
    color: string,
    parent: THREE.Object3D = this.scene,
  ) {
    const delta = to.clone().sub(from);
    const mesh = this.cylinder(r, r, delta.length(), color, 0, 0, 0, parent);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return mesh;
  }
  torus(
    radius: number,
    tube: number,
    color: string,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = this.scene,
  ) {
    const mesh = this.mesh(
      new THREE.TorusGeometry(radius, tube, 8, 24),
      this.material(color, 0.36, 0.65),
      parent,
    );
    mesh.position.set(x, y, z);
    return mesh;
  }
  texture(url: string) {
    const texture = new THREE.TextureLoader().load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.textures.add(texture);
    return texture;
  }
  dispose() {
    // Instance matrices/colours are GPU buffers owned by the mesh, not geometry.
    this.scene.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    this.renderTargets.forEach((target) => target.dispose());
    this.renderTargets.clear();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
    this.cache.clear();
    this.scene.clear();
  }
}
