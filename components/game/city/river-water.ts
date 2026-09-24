import * as THREE from 'three';
import type { RenderKit } from '../world/render-kit.ts';

/** Small analytic ripples: no reflection render target or extra scene pass. */
export function createYeniseyWater(kit: RenderKit) {
  const time = { value: 0 };
  const material = new THREE.MeshStandardMaterial({
    color: '#356c79',
    roughness: 0.32,
    metalness: 0.24,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cityRiverTime = time;
    shader.vertexShader =
      'varying vec2 cityRiverPoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ncityRiverPoint = position.xz;',
    );
    shader.fragmentShader =
      'varying vec2 cityRiverPoint;\nuniform float cityRiverTime;\n' +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      vec2 p = cityRiverPoint;
      float t = cityRiverTime;
      float longWave = sin(p.x * .15 + p.y * .37 - t * 1.1);
      float ripple = sin(p.x * 1.9 + p.y * 3.4 - t * 2.1)
                   * sin(p.x * .71 - p.y * .36 + t * .65);
      float streak = pow(max(0., ripple), 10.);
      diffuseColor.rgb *= .91 + .055 * longWave + .09 * ripple;
      diffuseColor.rgb += vec3(.19, .28, .3) * streak;
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      #include <normal_fragment_maps>
      normal = normalize(normal + vec3(sin(cityRiverPoint.x * .8 + cityRiverTime) * .045,
        0., cos(cityRiverPoint.y * 1.3 - cityRiverTime * 1.3) * .055));
    `,
    );
  };
  material.customProgramCacheKey = () => 'friendslop-yenisey-ripples-1';
  kit.materials.add(material);
  return {
    material,
    update(elapsed: number) {
      time.value = elapsed;
    },
  };
}
