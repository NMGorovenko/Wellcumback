import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { RenderKit } from '../world/render-kit.ts';

/** A shared daylight sky, including clouds. It follows each camera independently,
 * so split-screen views and fast travel cannot leave the skybox behind. */
export function createCityAtmosphere(kit: RenderKit) {
  const sky = new Sky();
  sky.name = 'krasnoyarsk-daylight';
  sky.scale.setScalar(1000000);
  sky.frustumCulled = false;
  // Draw at the far depth after opaque streets/buildings so hidden cloud
  // fragments fail depth testing instead of shading the entire viewport.
  sky.renderOrder = 1000;
  sky.castShadow = sky.receiveShadow = false;
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 3.2;
  uniforms.rayleigh.value = 1.6;
  uniforms.mieCoefficient.value = 0.004;
  uniforms.mieDirectionalG.value = 0.76;
  uniforms.sunPosition.value = new THREE.Vector3(-0.5, 0.65, 0.38)
    .normalize()
    .multiplyScalar(450000);
  uniforms.cloudCoverage.value = 0.52;
  uniforms.cloudDensity.value = 0.72;
  uniforms.cloudScale.value = 0.00034;
  uniforms.cloudElevation.value = 0.42;
  uniforms.cloudSpeed.value = 0.000007;
  kit.geometries.add(sky.geometry);
  kit.materials.add(sky.material);
  kit.scene.add(sky);
  return {
    sky,
    update(camera: THREE.Camera, seconds: number, visible = true) {
      sky.visible = visible;
      sky.position.copy(camera.position);
      uniforms.time.value = seconds;
    },
  };
}
