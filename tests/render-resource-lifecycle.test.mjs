import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { disposeGameRenderer } from '../components/game/world/dispose-renderer.ts';
void test('scene teardown releases instance buffers as well as shared geometry, materials and textures once', () => {
  const scene = new THREE.Scene(),
    kit = new RenderKit(scene);
  const geometry = new THREE.BoxGeometry(),
    material = kit.material('#fff'),
    texture = new THREE.Texture();
  kit.geometries.add(geometry);
  kit.textures.add(texture);
  const target = new THREE.WebGLCubeRenderTarget(16);
  kit.renderTargets.add(target);
  let targets = 0;
  target.addEventListener('dispose', () => targets++);
  let instances = 0,
    geometries = 0,
    materials = 0,
    textures = 0;
  geometry.addEventListener('dispose', () => geometries++);
  material.addEventListener('dispose', () => materials++);
  texture.addEventListener('dispose', () => textures++);
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.InstancedMesh(geometry, material, 100);
    mesh.setColorAt(0, new THREE.Color('#f00'));
    mesh.addEventListener('dispose', () => instances++);
    scene.add(mesh);
  }
  kit.dispose();
  kit.dispose();
  assert.deepEqual(
    { instances, geometries, materials, textures },
    { instances: 2, geometries: 1, materials: 1, textures: 1 },
  );
  assert.equal(targets, 1);
  assert.equal(kit.renderTargets.size, 0);
  assert.equal(scene.children.length, 0);
  assert.equal(
    kit.geometries.size +
      kit.materials.size +
      kit.textures.size +
      kit.cache.size,
    0,
  );
});
void test('abandoned WebGL context is released immediately after renderer cleanup', () => {
  const calls = [];
  disposeGameRenderer({
    dispose: () => calls.push('dispose'),
    forceContextLoss: () => calls.push('release context'),
  });
  assert.deepEqual(calls, ['dispose', 'release context']);
});
