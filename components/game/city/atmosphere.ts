import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { RenderKit } from '../world/render-kit.ts';

/** Bake the analytic daylight/cloud shader once. A cheap cube lookup replaces
 * four-octave cloud noise and atmospheric scattering for millions of pixels on
 * EVERY frame, including split-screen racing. */
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
  const background = kit.scene.background;
  const target = new THREE.WebGLCubeRenderTarget(512, {
    type: THREE.HalfFloatType,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  kit.renderTargets.add(target);
  const bakingScene = new THREE.Scene();
  bakingScene.add(sky);
  const capture = new THREE.CubeCamera(1, 2000000, target);
  let renderer: THREE.WebGLRenderer | undefined;
  let baked = false;
  const prepare = (value: THREE.WebGLRenderer) => {
    renderer = value;
    if (baked) return;
    sky.position.set(0, 0, 0);
    capture.update(value, bakingScene);
    baked = true;
  };
  return {
    prepare,
    invalidate() {
      baked = false;
    },
    sky,
    update(_camera: THREE.Camera, _seconds: number, visible = true) {
      if (!baked && renderer) prepare(renderer);
      kit.scene.background = visible && baked ? target.texture : background;
    },
  };
}
