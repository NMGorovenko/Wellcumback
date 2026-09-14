import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { freshCity } from '../lib/game/city/engine.ts';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createMustang } from '../components/game/city/mustang.ts';
import { cityFaceCamera } from '../components/game/city/camera.ts';

void test('face inspection keeps the actual convertible and all heads in frame through motion and viewport changes', () => {
  const kit = new RenderKit(new THREE.Scene());
  kit.texture = () => {
    const texture = new THREE.Texture();
    kit.textures.add(texture);
    return texture;
  };
  const car = createMustang(kit);
  try {
    for (const [width, height] of [
      [1280, 720],
      [1440, 900],
      [1024, 768],
      [390, 844],
      [720, 1280],
    ])
      for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
        for (const [vx, vz] of [
          [0, 0],
          [0, -32],
          [0, 6],
          [32, 0],
          [-12, -8],
        ]) {
          const state = {
            ...freshCity(),
            x: 0,
            z: 0,
            heading,
            vx,
            vz,
            speed: Math.hypot(vx, vz),
            steering: 0.7,
            elapsed: 2.6,
            drifting: true,
          };
          car.update(state, 0.025, true);
          car.root.updateMatrixWorld(true);
          const aspect = width / height,
            view = cityFaceCamera(state, aspect),
            half = view.halfHeight;
          const camera = new THREE.OrthographicCamera(
            -half * aspect,
            half * aspect,
            half,
            -half,
            0.1,
            180,
          );
          const look = new THREE.Vector3(view.look.x, view.look.y, view.look.z);
          camera.position
            .copy(look)
            .addScaledVector(
              new THREE.Vector3(view.outward.x, view.outward.y, view.outward.z),
              90,
            );
          camera.lookAt(look);
          camera.updateMatrixWorld(true);
          let maxX = 0,
            maxY = 0;
          const point = new THREE.Vector3();
          car.root.traverse((object) => {
            if (!object.isMesh) return;
            const vertices = object.geometry.attributes.position;
            for (let i = 0; i < vertices.count; i++) {
              point
                .fromBufferAttribute(vertices, i)
                .applyMatrix4(object.matrixWorld)
                .project(camera);
              maxX = Math.max(maxX, Math.abs(point.x));
              maxY = Math.max(maxY, Math.abs(point.y));
            }
          });
          assert(
            maxX < 0.99 && maxY < 0.99,
            `${width}×${height}, heading ${heading}, velocity ${vx}/${vz}: model clipped at ${maxX}/${maxY}`,
          );
        }
  } finally {
    kit.dispose();
  }
});
