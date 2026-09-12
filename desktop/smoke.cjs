/* oxlint-disable typescript/no-require-imports -- Electron-only test entry; never included in the packaged app. */
const { app, dialog } = require('electron');
const path = require('node:path');
const assert = require('node:assert/strict');

const appDir = process.env.WELLCUM_SMOKE_APP;
const profile = process.env.WELLCUM_SMOKE_PROFILE;
const phase = process.env.WELLCUM_SMOKE_PHASE;
if (!appDir || !profile || !['write', 'read'].includes(phase))
  throw new Error('Use scripts/smoke-desktop.mjs.');

// Exercise the real main entry while keeping every test save in a disposable profile.
const setPath = app.setPath.bind(app);
setPath('sessionData', profile);
app.setPath = (name, value) =>
  setPath(name, name === 'userData' ? profile : value);
let finished = false;
const errors = [];
function fail(error) {
  if (finished) return;
  finished = true;
  console.error(
    'DESKTOP_SMOKE_FAILED',
    error instanceof Error ? error.stack : error,
  );
  app.exit(1);
}
dialog.showErrorBox = (title, message) =>
  fail(new Error(`${title}: ${message}`));
const timer = setTimeout(
  () => fail(new Error('Native desktop smoke timed out after 30 seconds')),
  30000,
);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(contents, expression, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await contents.executeJavaScript(expression)) return;
    await pause(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

app.on('browser-window-created', (_event, window) => {
  const contents = window.webContents;
  contents.on('console-message', (details) => {
    if (details.level === 'error') errors.push(details.message);
  });
  contents.on('render-process-gone', (_event, details) =>
    fail(new Error(`Renderer exited: ${details.reason}`)),
  );
  contents.on('did-fail-load', (_event, code, description) =>
    fail(new Error(`Load failed: ${code} ${description}`)),
  );
  contents.once('did-finish-load', () => {
    void inspect(window).catch(fail);
  });
});

async function tapKey(contents, keyCode, held = 70) {
  contents.sendInputEvent({ type: 'keyDown', keyCode });
  await pause(held);
  contents.sendInputEvent({ type: 'keyUp', keyCode });
  await pause(70);
}

async function inspectCityInput(contents) {
  // Native Electron key events, not DOM-dispatched KeyboardEvent objects.
  await contents.executeJavaScript(`window.__desktopSmokeSpace = false; window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && event.isTrusted) window.__desktopSmokeSpace = true;
  });`);
  contents.sendInputEvent({ type: 'keyDown', keyCode: 'W' });
  await waitFor(
    contents,
    `Boolean(document.querySelector('.city-arrival button'))`,
    'driving to the first story',
  );
  contents.sendInputEvent({ type: 'keyUp', keyCode: 'W' });
  contents.sendInputEvent({ type: 'keyDown', keyCode: 'S' });
  await waitFor(
    contents,
    `Boolean(document.querySelector('.city-arrival button:not(:disabled)'))`,
    'braking at the story entrance',
  );
  contents.sendInputEvent({ type: 'keyUp', keyCode: 'S' });
  await tapKey(contents, 'Space', 250);
  assert.equal(
    await contents.executeJavaScript(
      `Boolean(window.__desktopSmokeSpace && document.querySelector('.city-hub') && document.querySelector('.city-arrival button:not(:disabled)'))`,
    ),
    true,
    'Real Space must not launch an available story',
  );
  await tapKey(contents, 'Escape');
  await waitFor(
    contents,
    `Boolean(document.querySelector('.city-pause-menu'))`,
    'keyboard city pause',
  );
  for (let i = 0; i < 2; i++) await tapKey(contents, 'Down');
  // The fresh hub defaults to two players; both fake devices should appear below.
  await waitFor(
    contents,
    `document.querySelector('.city-pause-menu .pad-selected')?.textContent.includes('2')`,
    'two-player setting',
  );
  for (let i = 0; i < 4; i++) await tapKey(contents, 'Down');
  assert.equal(
    await contents.executeJavaScript(
      `document.querySelector('.city-pause-menu .pad-selected')?.textContent`,
    ),
    'Управление',
  );
  await tapKey(contents, 'Return');
  await waitFor(
    contents,
    `Boolean(document.querySelector('[role="dialog"]'))`,
    'keyboard settings navigation',
  );

  // These are simulated standard Gamepad API frames; this is not a hardware compatibility test.
  await contents.executeJavaScript(`(() => {
    const pads = Array(8).fill(null);
    for (const [index, id] of [[2, 'Xbox 360 Controller'], [7, 'DualSense Wireless Controller']]) {
      pads[index] = { index, id, mapping: 'standard', connected: true, axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    }
    window.__desktopSmokePads = pads;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
    document.querySelectorAll('.control-player-tabs button')[1].click();
    document.querySelectorAll('.control-device-tabs button')[1].click();
  })()`);
  await waitFor(
    contents,
    `document.querySelectorAll('.control-pad-devices li').length === 2 && document.querySelector('.control-pad-devices').textContent.includes('Xbox') && document.querySelector('.control-pad-devices').textContent.includes('DualSense')`,
    'both simulated controller labels',
  );
  await tapKey(contents, 'Escape');
  await waitFor(
    contents,
    `!document.querySelector('[role="dialog"]')`,
    'Escape closing only settings',
  );
  assert.equal(
    await contents.executeJavaScript(
      `Boolean(document.querySelector('.city-pause-menu'))`,
    ),
    true,
    'Closing settings must leave the underlying city paused',
  );
  await tapKey(contents, 'Escape');
  await waitFor(
    contents,
    `!document.querySelector('.city-pause-menu')`,
    'keyboard resume',
  );
  const button = async (pad, index, pressed) => {
    await contents.executeJavaScript(
      `Object.assign(window.__desktopSmokePads[${pad}].buttons[${index}], { pressed: ${pressed}, value: ${pressed ? 1 : 0} })`,
    );
    await pause(150);
  };
  await button(7, 9, true);
  assert.equal(
    await contents.executeJavaScript(
      `Boolean(document.querySelector('.city-pause-menu'))`,
    ),
    false,
    'The second controller must not control the one-driver city',
  );
  await button(7, 9, false);
  await button(2, 9, true);
  await waitFor(
    contents,
    `Boolean(document.querySelector('.city-pause-menu'))`,
    'simulated Xbox pause',
  );
  await button(2, 9, false);
  await button(2, 0, true);
  await waitFor(
    contents,
    `!document.querySelector('.city-pause-menu')`,
    'simulated Xbox resume',
  );
  await button(2, 0, false);
  await contents.executeJavaScript(`window.__desktopSmokePads[2] = null`);
  await pause(200);
  await button(7, 9, true);
  await waitFor(
    contents,
    `Boolean(document.querySelector('.city-pause-menu'))`,
    'DualSense taking over after Xbox disconnect',
  );
  await button(7, 9, false);
  await button(7, 0, true);
  await waitFor(
    contents,
    `!document.querySelector('.city-pause-menu')`,
    'simulated DualSense resume',
  );
  await button(7, 0, false);
  await contents.executeJavaScript(
    `delete navigator.getGamepads; delete window.__desktopSmokePads`,
  );
  await tapKey(contents, 'Escape');
  await waitFor(
    contents,
    `Boolean(document.querySelector('.city-pause-menu'))`,
    'pause before stories',
  );
  await tapKey(contents, 'Down');
  await tapKey(contents, 'Return');
  await waitFor(
    contents,
    `Boolean(document.querySelector('.hub-stage'))`,
    'stories opened from city pause',
  );
  await tapKey(contents, 'Escape');
  await waitFor(
    contents,
    `Boolean(document.querySelector('.city-hub'))`,
    'Escape returning from stories to city',
  );
}

async function inspect(window) {
  const contents = window.webContents;
  window.show();
  window.focus();
  app.focus({ steal: true });
  contents.focus();
  await waitFor(contents, `document.hasFocus()`, 'native game window focus');
  await waitFor(
    contents,
    `Boolean(document.querySelector('canvas') && document.querySelector('[aria-label="Клавиатура и геймпады"]'))`,
    'the city canvas and controls',
  );
  const startup = await contents.executeJavaScript(`(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2');
    return { title: document.title, origin: location.origin, secure: isSecureContext,
      node: typeof process, require: typeof require, gamepads: typeof navigator.getGamepads,
      webgl: Boolean(gl && !gl.isContextLost()), width: canvas.width, height: canvas.height };
  })()`);
  assert.equal(startup.origin, 'wellcum://game');
  assert.equal(startup.secure, true);
  assert.equal(startup.node, 'undefined');
  assert.equal(startup.require, 'undefined');
  assert.equal(startup.gamepads, 'function');
  assert.equal(startup.webgl, true);
  assert.ok(
    startup.width > 0 && startup.height > 0 && startup.title.length > 0,
  );
  const preferences = contents.getLastWebPreferences();
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.webSecurity, true);

  if (phase === 'write') {
    await inspectCityInput(contents);
    await contents.executeJavaScript(
      `document.querySelector('[aria-label="Клавиатура и геймпады"]').click()`,
      true,
    );
    await waitFor(
      contents,
      `Boolean(document.querySelector('[role="dialog"]'))`,
      'settings dialog',
    );
    await contents.executeJavaScript(
      `document.querySelector('[role="dialog"] [data-slot="dialog-close"]').click()`,
      true,
    );
    await waitFor(
      contents,
      `!document.querySelector('[role="dialog"]')`,
      'settings dialog closing',
    );
    await contents.executeJavaScript(
      `document.querySelector('.fullscreen-button').click()`,
      true,
    );
    await waitFor(
      contents,
      `Boolean(document.fullscreenElement)`,
      'native fullscreen (window fallback does not pass)',
    );
    await contents.executeJavaScript(
      `document.querySelector('.fullscreen-button').click()`,
      true,
    );
    await waitFor(contents, `!document.fullscreenElement`, 'fullscreen exit');
    await contents.executeJavaScript(
      `localStorage.setItem('__wellcum_desktop_smoke', 'survives-cold-start')`,
    );
    contents.session.flushStorageData();
  } else {
    assert.equal(
      await contents.executeJavaScript(
        `localStorage.getItem('__wellcum_desktop_smoke')`,
      ),
      'survives-cold-start',
    );
    await contents.executeJavaScript(
      `localStorage.removeItem('__wellcum_desktop_smoke')`,
    );
  }
  await pause(200);
  assert.deepEqual(errors, [], 'Renderer console errors');
  finished = true;
  clearTimeout(timer);
  console.log(
    'DESKTOP_SMOKE_OK',
    JSON.stringify({
      phase,
      keyboardRoutes: phase === 'write',
      simulatedControllers: phase === 'write' ? ['Xbox', 'DualSense'] : [],
      ...startup,
      platform: process.platform,
      arch: process.arch,
    }),
  );
  app.quit();
}

require(path.join(appDir, 'main.cjs'));
