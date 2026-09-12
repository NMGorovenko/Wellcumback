import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import security from '../desktop/security.cjs';
import { prepareDesktopApp } from '../scripts/build-desktop.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const html =
  '<!doctype html><meta http-equiv="Content-Security-Policy" content="script-src \'unsafe-inline\'"><script>globalThis.test = "Привет";</script>';
const sourceManifest = (value = html) => ({
  version: '0.4.0',
  html_bytes: Buffer.byteLength(value),
  html_sha256: createHash('sha256').update(value).digest('hex'),
});

await test('only the fixed game authority/document is exposed; no file traversal or remote origin', () => {
  assert.equal(security.isGameURL(security.GAME_URL), true);
  assert.equal(security.isGameURL(`${security.GAME_URL}#help`), true);
  for (const value of [
    'https://game/index.html',
    'file:///etc/passwd',
    'wellcum://evil/index.html',
    'wellcum://game.evil/index.html',
    'wellcum://user@game/index.html',
    'wellcum://game:80/index.html',
    'wellcum://game/index.html?file=secret',
    'wellcum://game/%2e%2e/main.cjs',
    'wellcum://game/renderer/index.html',
    'wellcum://game/%69ndex.html',
    'data:text/html,hi',
    'not a url',
  ]) {
    assert.equal(security.isGameURL(value), false, value);
  }
  assert.equal(security.isGameOrigin('wellcum://game'), true);
  assert.equal(security.isGameOrigin('wellcum://game.evil'), false);
});

await test('desktop CSP hashes the actual inline script and permits no arbitrary script/network', () => {
  const result = security.prepareRenderer(html, sourceManifest(), '0.4.0');
  const digest = createHash('sha256')
    .update('globalThis.test = "Привет";')
    .digest('base64');
  assert.ok(result.manifest.csp.includes(`script-src 'sha256-${digest}'`));
  assert.ok(!/script-src[^;]*unsafe-inline/.test(result.manifest.csp));
  assert.ok(result.manifest.csp.includes("connect-src 'none'"));
  assert.ok(result.manifest.csp.includes("frame-src 'none'"));
  assert.doesNotThrow(() =>
    security.verifyRenderer(result.html, result.manifest, '0.4.0'),
  );
  assert.throws(
    () =>
      security.verifyRenderer(
        result.html + 'changed',
        result.manifest,
        '0.4.0',
      ),
    /damaged/,
  );
  assert.throws(
    () => security.verifyRenderer(result.html, result.manifest, '0.5.0'),
    /damaged/,
  );
});

await test('packaging rejects a stale version, broken source hash, external or extra script', () => {
  assert.throws(
    () => security.prepareRenderer(html, sourceManifest(), '0.5.0'),
    /manifest\/version/,
  );
  assert.throws(
    () => security.prepareRenderer(html + 'tamper', sourceManifest(), '0.4.0'),
    /manifest\/version/,
  );
  for (const invalid of [
    html + '<script>more()</script>',
    html.replace('<script>', '<script src="https://evil/">'),
  ]) {
    assert.throws(
      () => security.prepareRenderer(invalid, sourceManifest(invalid), '0.4.0'),
      /one inline script/,
    );
  }
});

await test('protocol responses serve only the allowed GET and include the restrictive CSP', async () => {
  const result = security.prepareRenderer(html, sourceManifest(), '0.4.0');
  const response = security.rendererResponse(
    { url: security.GAME_URL, method: 'GET' },
    result.html,
    result.manifest.csp,
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), result.html);
  assert.equal(
    response.headers.get('content-security-policy'),
    result.manifest.csp,
  );
  assert.equal(
    security.rendererResponse(
      { url: 'wellcum://game/main.cjs', method: 'GET' },
      html,
      '',
    ).status,
    404,
  );
  assert.equal(
    security.rendererResponse(
      { url: security.GAME_URL, method: 'POST' },
      html,
      '',
    ).status,
    405,
  );
});

async function fixture(t) {
  const project = await mkdtemp(
    path.join(os.tmpdir(), 'wellcum-desktop-test-'),
  );
  t.after(() => rm(project, { recursive: true, force: true }));
  for (const dir of ['desktop', 'scripts', 'outputs/portable'])
    await mkdir(path.join(project, dir), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(project, 'package.json'),
      JSON.stringify({ type: 'module', version: '0.4.0' }),
    ),
    writeFile(path.join(project, 'outputs/portable/Wellcum-back.html'), html),
    writeFile(
      path.join(project, 'outputs/portable/build.json'),
      JSON.stringify(sourceManifest()),
    ),
    copyFile(
      path.join(root, 'desktop/main.cjs'),
      path.join(project, 'desktop/main.cjs'),
    ),
    copyFile(
      path.join(root, 'desktop/security.cjs'),
      path.join(project, 'desktop/security.cjs'),
    ),
    copyFile(
      path.join(root, 'scripts/build-desktop.mjs'),
      path.join(project, 'scripts/build-desktop.mjs'),
    ),
  ]);
  return project;
}

await test('prepared app is self-contained and has no web-server or production Node dependencies', async (t) => {
  const project = await fixture(t);
  const appDir = await prepareDesktopApp(project);
  const pkg = JSON.parse(
    await readFile(path.join(appDir, 'package.json'), 'utf8'),
  );
  assert.equal(pkg.version, '0.4.0');
  assert.equal(pkg.main, 'main.cjs');
  assert.equal(pkg.dependencies, undefined);
  const result = await readFile(
    path.join(appDir, 'renderer/index.html'),
    'utf8',
  );
  const manifest = JSON.parse(
    await readFile(path.join(appDir, 'renderer/build.json'), 'utf8'),
  );
  assert.doesNotThrow(() =>
    security.verifyRenderer(result, manifest, pkg.version),
  );
});

await test('public desktop prepare command rebuilds portable first instead of packaging stale output', async (t) => {
  const project = await fixture(t);
  await writeFile(
    path.join(project, 'outputs/portable/Wellcum-back.html'),
    'stale HTML',
  );
  await writeFile(
    path.join(project, 'scripts/build-portable.mjs'),
    `import { writeFile } from 'node:fs/promises';\nawait writeFile('outputs/portable/Wellcum-back.html', ${JSON.stringify(html)});\nawait writeFile('outputs/portable/build.json', ${JSON.stringify(JSON.stringify(sourceManifest()))});\n`,
  );
  execFileSync(
    process.execPath,
    [path.join(project, 'scripts/build-desktop.mjs'), 'prepare'],
    { cwd: project },
  );
  const prepared = await readFile(
    path.join(project, 'outputs/desktop-app/renderer/index.html'),
    'utf8',
  );
  assert.ok(prepared.includes('Привет'));
  assert.ok(!prepared.includes('stale HTML'));
});

await test('main process sandboxes the trusted renderer and denies navigation, popups, and unrelated permissions', async () => {
  const prepared = security.prepareRenderer(html, sourceManifest(), '0.4.0');
  const app = new EventEmitter();
  Object.assign(app, {
    setName() {},
    setPath() {},
    getPath: () => '/tmp',
    getVersion: () => '0.4.0',
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    quit() {},
  });
  const ses = new EventEmitter();
  const handlers = {};
  Object.assign(ses, {
    protocol: {
      handle: (scheme, fn) => {
        handlers.protocol = { scheme, fn };
      },
    },
    setPermissionRequestHandler: (fn) => {
      handlers.permission = fn;
    },
    setPermissionCheckHandler: (fn) => {
      handlers.check = fn;
    },
    webRequest: {
      onBeforeRequest: (_filter, fn) => {
        handlers.network = fn;
      },
    },
  });
  let window;
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super();
      window = this;
      this.options = options;
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, {
        isDestroyed: () => false,
        getURL: () => this.url,
        setWindowOpenHandler: (fn) => {
          handlers.popup = fn;
        },
      });
    }
    loadURL(url) {
      this.url = url;
      return Promise.resolve();
    }
  }
  const electron = {
    app,
    BrowserWindow: FakeWindow,
    screen: {
      getPrimaryDisplay: () => ({ workAreaSize: { width: 1280, height: 800 } }),
    },
    dialog: { showErrorBox: (_title, message) => assert.fail(message) },
    Menu: { setApplicationMenu() {}, buildFromTemplate: (items) => items },
    protocol: {
      registerSchemesAsPrivileged: (schemes) => {
        handlers.schemes = schemes;
      },
    },
    session: {
      fromPartition: (partition) => {
        handlers.partition = partition;
        return ses;
      },
    },
  };
  vm.runInNewContext(
    await readFile(path.join(root, 'desktop/main.cjs'), 'utf8'),
    {
      require: (id) => {
        if (id === 'electron') return electron;
        if (id === 'node:path') return path;
        if (id === './security.cjs') return security;
        if (id === 'node:fs/promises')
          return {
            readFile: (file) =>
              Promise.resolve(
                file.endsWith('index.html')
                  ? prepared.html
                  : JSON.stringify(prepared.manifest),
              ),
          };
        throw new Error(`Unexpected main-process dependency: ${id}`);
      },
      __dirname: '/app',
      process: { platform: 'darwin' },
      console,
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(window.url, security.GAME_URL);
  assert.equal(handlers.partition, 'persist:wellcum-game-v1');
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.equal(window.options.webPreferences.contextIsolation, true);
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.options.webPreferences.preload, undefined);
  assert.equal(window.options.webPreferences.webSecurity, true);
  assert.equal(handlers.schemes[0].privileges.bypassCSP, undefined);
  assert.equal(handlers.popup({ url: 'https://example.com' }).action, 'deny');
  let prevented = false;
  window.webContents.emit('will-frame-navigate', {
    isMainFrame: true,
    url: 'https://example.com',
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  const requestPermission = (permission, requestingUrl, isMainFrame = true) => {
    let granted;
    handlers.permission(
      window.webContents,
      permission,
      (answer) => {
        granted = answer;
      },
      { requestingUrl, isMainFrame },
    );
    return granted;
  };
  assert.equal(requestPermission('fullscreen', security.GAME_URL), true);
  assert.equal(requestPermission('fullscreen', 'https://example.com'), false);
  assert.equal(
    requestPermission('fullscreen', security.GAME_URL, false),
    false,
  );
  for (const permission of [
    'media',
    'hid',
    'clipboard-read',
    'automatic-fullscreen',
  ]) {
    assert.equal(requestPermission(permission, security.GAME_URL), false);
  }
  assert.equal(
    handlers.check(window.webContents, 'fullscreen', security.GAME_ORIGIN),
    true,
  );
  assert.equal(
    handlers.check(window.webContents, 'fullscreen', 'https://game'),
    false,
  );
  assert.equal(handlers.check(null, 'fullscreen', security.GAME_ORIGIN), false);
  handlers.network({}, (answer) => assert.equal(answer.cancel, true));
});
