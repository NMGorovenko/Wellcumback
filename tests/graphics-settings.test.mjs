import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRenderPacer,
  defaultGraphicsSettings,
  graphicsPixelRatio,
  graphicsPreset,
  graphicsShadowSize,
  parseGraphicsSettings,
} from '../lib/game/graphics/settings.ts';
import {
  getGraphicsSettings,
  resetGraphicsSettings,
  setGraphicsPreset,
  updateGraphicsSettings,
} from '../lib/game/graphics/store.ts';
import {
  getControlSettings,
  setControlBinding,
} from '../lib/game/input/settings-store.ts';

void test('graphics saves validate individual fields, preserve valid options and handle old/malformed saves', () => {
  const defaults = defaultGraphicsSettings();
  for (const raw of [null, '{', '{}', 'null', '{"version":2}'])
    assert.deepEqual(parseGraphicsSettings(raw), defaults);
  assert.deepEqual(
    parseGraphicsSettings(
      JSON.stringify({
        version: 1,
        detail: 'high',
        shadows: 'off',
        resolution: -5,
        frameLimit: '60',
      }),
    ),
    { ...defaults, detail: 'high', shadows: 'off' },
  );
  const saved = {
    version: 1,
    detail: 'low',
    shadows: 'low',
    resolution: 0.75,
    frameLimit: 60,
  };
  assert.deepEqual(parseGraphicsSettings(JSON.stringify(saved)), saved);
});

void test('quality presets preserve frame limit and never change keyboard preferences', () => {
  setControlBinding('KeyE', 'KeyZ');
  const controls = getControlSettings();
  updateGraphicsSettings({ frameLimit: 60 });
  for (const quality of ['low', 'medium', 'high']) {
    setGraphicsPreset(quality);
    assert.equal(graphicsPreset(getGraphicsSettings()), quality);
    assert.equal(getGraphicsSettings().frameLimit, 60);
    assert.equal(getControlSettings(), controls);
  }
  updateGraphicsSettings({ shadows: 'off' });
  assert.equal(graphicsPreset(getGraphicsSettings()), null);
  assert.equal(graphicsShadowSize(getGraphicsSettings()), 0);
  resetGraphicsSettings();
  assert.equal(getControlSettings(), controls);
});

void test('render settings bound pixel work on Retina displays and allow lower than native resolution', () => {
  const defaults = defaultGraphicsSettings();
  assert.equal(graphicsPixelRatio(defaults, 3), 1.5);
  assert.equal(graphicsPixelRatio(defaults, 1), 1);
  assert.equal(graphicsPixelRatio({ ...defaults, resolution: 0.75 }, 2), 0.75);
  assert.equal(graphicsPixelRatio(defaults, NaN), 1);
  assert.equal(graphicsShadowSize(defaults), 1024);
});

void test('render pacer honors caps across refresh rates, recovers after hiding and never alters simulation time', () => {
  for (const refresh of [60, 120, 144, 165])
    for (const limit of [0, 30, 60, 120]) {
      const pace = createRenderPacer();
      let frames = 0;
      for (let i = 0; i < refresh * 10; i++)
        if (pace((i * 1000) / refresh, limit)) frames++;
      assert.ok(
        Math.abs(frames - Math.min(refresh, limit || refresh) * 10) <= 1,
        `${refresh}Hz / ${limit}: ${frames}`,
      );
      assert.equal(pace(20000, limit), true);
      assert.equal(pace(1, limit), true);
      assert.equal(pace(2, 0), true);
    }
});

void test('live graphics changes invalidate shadow shaders, release resized targets and hide rendering', async () => {
  const THREE = await import('three');
  const { createGraphicsController } =
    await import('../components/game/world/graphics.ts');
  const savedWindow = globalThis.window,
    savedDocument = globalThis.document;
  globalThis.window = {
    devicePixelRatio: 2,
    localStorage: { getItem: () => null, setItem() {} },
    addEventListener() {},
  };
  globalThis.document = { hidden: false };
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  scene.add(mesh);
  const light = new THREE.DirectionalLight();
  const ratios = [];
  const renderer = {
    shadowMap: { enabled: true },
    setPixelRatio(value) {
      ratios.push(value);
    },
  };
  try {
    resetGraphicsSettings();
    const graphics = createGraphicsController(renderer, light, scene);
    assert.equal(light.shadow.mapSize.x, 1024);
    assert.equal(ratios.at(-1), 1.5);
    let disposed = 0;
    light.shadow.map = {
      dispose() {
        disposed++;
      },
    };
    const version = material.version;
    updateGraphicsSettings({ shadows: 'off', frameLimit: 60 });
    assert.equal(graphics.shouldRender(0), true);
    assert.equal(renderer.shadowMap.enabled, false);
    assert.equal(material.version, version + 1);
    updateGraphicsSettings({ shadows: 'high', resolution: 1 });
    assert.equal(graphics.shouldRender(17), true);
    assert.equal(renderer.shadowMap.enabled, true);
    assert.equal(material.version, version + 2);
    assert.equal(light.shadow.mapSize.x, 2048);
    assert.equal(light.shadow.map, null);
    assert.equal(disposed, 1);
    assert.equal(ratios.at(-1), 1);
    graphics.shouldRender(34);
    assert.equal(
      material.version,
      version + 2,
      'no shader recompilation per frame',
    );
    globalThis.document.hidden = true;
    assert.equal(graphics.shouldRender(10000), false);
    globalThis.document.hidden = false;
    assert.equal(graphics.shouldRender(20000), true);
    graphics.dispose();
  } finally {
    material.dispose();
    mesh.geometry.dispose();
    resetGraphicsSettings();
    if (savedWindow === undefined) delete globalThis.window;
    else globalThis.window = savedWindow;
    if (savedDocument === undefined) delete globalThis.document;
    else globalThis.document = savedDocument;
  }
});
