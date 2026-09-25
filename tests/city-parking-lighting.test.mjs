import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderKit } from '../components/game/world/render-kit.ts';
import { createMallParking } from '../components/game/city/mall-landmarks.ts';
import { CITY_PARKING } from '../lib/game/city/layout.ts';
void test('parking triangle boundaries share one lighting normal, including the Kvant fan regression', (t) => {
  const kit = new RenderKit(new THREE.Scene()),
    g = new THREE.Group();
  try {
    createMallParking(kit, g);
    for (const lot of CITY_PARKING.filter(
      (p) => !p.id.startsWith('fuel-') && p.id !== 'kubatura',
    )) {
      const mesh = g.getObjectByName(`parking:${lot.id}:pavement`);
      assert.ok(mesh?.isMesh, lot.id);
      const p = mesh.geometry.attributes.position,
        n = mesh.geometry.attributes.normal,
        at = new Map();
      let repeated = 0,
        maxLightingJump = 0;
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i).toFixed(4)}:${p.getY(i).toFixed(4)}:${p.getZ(i).toFixed(4)}`;
        const normal = new THREE.Vector3().fromBufferAttribute(n, i);
        assert.ok(
          Number.isFinite(normal.length()) &&
            Math.abs(normal.length() - 1) < 1e-5 &&
            normal.y > 0,
          `${lot.id} invalid pavement normal`,
        );
        const previous = at.get(key);
        if (previous) {
          repeated++;
          maxLightingJump = Math.max(
            maxLightingJump,
            normal.distanceTo(previous),
          );
        } else at.set(key, normal);
      }
      t.diagnostic(
        `${lot.id}: ${repeated} shared corners; worst lighting jump ${maxLightingJump}`,
      );
      assert.ok(repeated > 100, `${lot.id} exercises shared pavement corners`);
      assert.ok(
        maxLightingJump < 0.002,
        `${lot.id}: triangle fan creates visible lighting discontinuity ${maxLightingJump}`,
      );
    }
  } finally {
    kit.dispose();
  }
});
