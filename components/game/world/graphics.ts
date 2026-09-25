import type * as THREE from 'three';
import {
  createRenderPacer,
  graphicsPixelRatio,
  graphicsShadowSize,
} from '../../../lib/game/graphics/settings.ts';
import {
  getGraphicsSettings,
  initializeGraphicsSettings,
} from '../../../lib/game/graphics/store.ts';

/** One renderer per client. Settings never enter gameplay or room snapshots. */
export function createGraphicsController(
  renderer: THREE.WebGLRenderer,
  light: THREE.DirectionalLight,
  scene: THREE.Scene,
) {
  initializeGraphicsSettings();
  let previous = null as ReturnType<typeof getGraphicsSettings> | null;
  let previousRatio = 0;
  const pace = createRenderPacer();
  const apply = () => {
    const settings = getGraphicsSettings();
    const ratio = graphicsPixelRatio(settings, window.devicePixelRatio);
    if (ratio !== previousRatio) {
      renderer.setPixelRatio(ratio);
      previousRatio = ratio;
    }
    if (settings !== previous) {
      const size = graphicsShadowSize(settings);
      if (previous && renderer.shadowMap.enabled !== size > 0) {
        // Three's material program key includes USE_SHADOWMAP, but toggling the
        // renderer flag alone does not invalidate already compiled programs.
        const materials = new Set<THREE.Material>();
        scene.traverse((object) => {
          const material = (object as THREE.Mesh).material;
          if (material)
            for (const item of Array.isArray(material) ? material : [material])
              materials.add(item);
        });
        for (const material of materials) material.needsUpdate = true;
      }
      renderer.shadowMap.enabled = size > 0;
      if (size > 0 && light.shadow.mapSize.x !== size) {
        light.shadow.map?.dispose();
        light.shadow.map = null;
        light.shadow.mapPass?.dispose();
        light.shadow.mapPass = null;
        light.shadow.mapSize.set(size, size);
        light.shadow.needsUpdate = true;
      }
      previous = settings;
    }
    return settings;
  };
  apply();
  return {
    settings: getGraphicsSettings,
    shouldRender(now: number) {
      const settings = apply();
      return !document.hidden && pace(now, settings.frameLimit);
    },
    dispose() {
      light.shadow.dispose();
    },
  };
}
