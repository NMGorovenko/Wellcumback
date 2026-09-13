import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameSampler } from '../lib/game/performance.ts';
import {
  defaultControlSettings,
  parseControlSettings,
} from '../lib/game/input/settings.ts';

void test('FPS is opt-in and old preferences remain compatible', () => {
  const saved = defaultControlSettings();
  assert.equal(saved.showFps, false);
  delete saved.showFps;
  assert.equal(parseControlSettings(JSON.stringify(saved)).showFps, false);
  saved.showFps = true;
  assert.equal(parseControlSettings(JSON.stringify(saved)).showFps, true);
  saved.showFps = 'true';
  assert.equal(parseControlSettings(JSON.stringify(saved)).showFps, false);
});

void test('FPS measures completed frames at both 30 and 144 Hz and reports visible stalls', () => {
  for (const rate of [30, 60, 144]) {
    const sampler = createFrameSampler();
    let fps;
    for (let i = 0; i <= rate; i++)
      fps = sampler.sample((i * 1000) / rate) ?? fps;
    assert.equal(fps, rate);
    assert.ok(sampler.sample(8000) <= 1);
    sampler.reset();
    assert.equal(sampler.sample(9000), null);
  }
});
