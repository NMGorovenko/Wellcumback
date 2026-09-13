/** Exercise the signed application itself; never modify its bundle or user profile. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  stat,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { RoomSocket } from '../lib/game/network/room-socket.ts';
import { ROOM_VERSION } from '../lib/game/network/room-types.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const appPath = process.argv[2] && path.resolve(process.argv[2]);
if (
  process.platform !== 'darwin' ||
  !appPath?.endsWith('.app') ||
  process.argv.length !== 3
)
  throw new Error(
    'Usage on macOS: node scripts/smoke-signed-mac.mjs /path/to/Wellcum\\ back.app',
  );
const appBinary = path.join(appPath, 'Contents/MacOS/Wellcum back');
const tunnelBinary = path.join(
  appPath,
  'Contents/Resources/tunnel/cloudflared',
);
const asarPath = path.join(appPath, 'Contents/Resources/app.asar');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = async (file) =>
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 15000,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw (
      result.error ??
      new Error(`${path.basename(command)} failed: ${result.stderr}`)
    );
  return result.stdout;
};
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
const signature = spawnSync('codesign', ['--display', '--verbose=4', appPath], {
  encoding: 'utf8',
});
assert.equal(signature.status, 0);
assert.match(signature.stderr, /Authority=Developer ID Application:/);
assert.match(signature.stderr, /flags=.*runtime/);
assert.match(signature.stderr, /Timestamp=/);
const originalAsar = await digest(asarPath);
const temporary = await mkdtemp(
  path.join(os.tmpdir(), 'wellcum-signed-smoke-'),
);
const testHome = path.join(temporary, 'home');
await mkdir(path.join(testHome, 'Library/Application Support'), {
  recursive: true,
});
const environment = {
  ...process.env,
  HOME: testHome,
  CFFIXED_USER_HOME: testHome,
};
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.NODE_OPTIONS;
let child,
  cdp,
  peer,
  checkpoint = 'profile isolation',
  failure;
let diagnostics = '';
const observedErrors = [];
const audioContexts = new Map();
let audioNodes = 0;
let audioClock;

class DebugClient {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.id) {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(message.id);
        if (message.error)
          entry.reject(new Error(`${entry.method}: ${message.error.message}`));
        else entry.resolve(message.result);
      } else this.onEvent?.(message.method, message.params);
    });
    socket.on('close', () => {
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Signed application debugger closed'));
      }
      this.pending.clear();
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Debugger timeout: ${method}`));
      }, 12000);
      this.pending.set(id, { method, resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text,
      );
    return result.result.value;
  }
}

async function waitFor(check, label, attempts = 100) {
  checkpoint = label;
  for (let i = 0; i < attempts; i++) {
    if (child?.exitCode !== null && child?.exitCode !== undefined)
      throw new Error(`Signed app exited ${child.exitCode}: ${label}`);
    if (await check()) return;
    await pause(100);
  }
  throw new Error(`Timed out: ${label}`);
}
const click = (label) =>
  cdp.evaluate(`(() => {
  const target = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || b.textContent.trim()) === ${JSON.stringify(label)});
  if (!target || target.disabled) throw new Error('Unavailable button: ' + ${JSON.stringify(label)});
  target.click();
})()`);
const invoke = (method, ...args) =>
  cdp.evaluate(`window.wellcumNetwork.${method}(...${JSON.stringify(args)})`);
const visible = (selector) =>
  cdp.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);

try {
  // Prove Foundation/Electron agree on the disposable HOME before launching production main.
  const probeFile = path.join(temporary, 'isolation.cjs');
  const probeResult = path.join(temporary, 'isolation.json');
  await writeFile(
    probeFile,
    `const {app}=require('electron'); require('node:fs').writeFileSync(${JSON.stringify(probeResult)}, JSON.stringify({home:app.getPath('home'),appData:app.getPath('appData')})); app.exit(0);\n`,
  );
  run(require('electron'), [probeFile], { env: environment });
  const paths = JSON.parse(await readFile(probeResult, 'utf8'));
  assert.equal(paths.home, testHome);
  assert.equal(
    paths.appData,
    path.join(testHome, 'Library/Application Support'),
  );
  const tunnelVersion = run(tunnelBinary, ['--version'], {
    env: environment,
  }).trim();
  assert.match(tunnelVersion, /^cloudflared version /);

  checkpoint = 'signed executable startup';
  child = spawn(
    appBinary,
    ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'],
    {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let debuggerUrl;
  const read = (data) => {
    diagnostics = (diagnostics + data.toString()).slice(-10000);
    debuggerUrl ??= diagnostics.match(
      /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/,
    )?.[1];
  };
  child.stdout.on('data', read);
  child.stderr.on('data', read);
  child.on('error', (error) => {
    failure = error;
  });
  await waitFor(() => {
    if (failure) throw failure;
    return Boolean(debuggerUrl);
  }, 'loopback debugger');
  const endpoint = new URL(debuggerUrl);
  let target;
  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${endpoint.port}/json/list`);
    target = (await response.json()).find(
      (entry) =>
        entry.type === 'page' && entry.url.startsWith('wellcum://game'),
    );
    return Boolean(target);
  }, 'production game renderer');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  cdp = new DebugClient(socket);
  cdp.onEvent = (method, params) => {
    if (method === 'Runtime.exceptionThrown')
      observedErrors.push(params.exceptionDetails.text);
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error')
      observedErrors.push(
        params.args.map((arg) => arg.value ?? arg.description).join(' '),
      );
    if (
      method === 'WebAudio.contextCreated' ||
      method === 'WebAudio.contextChanged'
    )
      audioContexts.set(params.context.contextId, params.context);
    if (method === 'WebAudio.contextWillBeDestroyed')
      audioContexts.delete(params.contextId);
    if (method === 'WebAudio.audioNodeCreated') audioNodes++;
  };
  checkpoint = 'signed debugger initialization';
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('WebAudio.enable');
  await cdp.send('Page.bringToFront');
  await waitFor(() => visible('.city-hub canvas'), 'signed game WebGL canvas');
  const startup = await cdp.evaluate(`(() => {
    const canvas = document.querySelector('canvas'); const gl = canvas.getContext('webgl2');
    return {origin:location.origin, secure:isSecureContext, node:typeof process, require:typeof require,
      gamepads:typeof navigator.getGamepads, webgl:Boolean(gl && !gl.isContextLost()), width:canvas.width, height:canvas.height,
      hasNativeNetwork:typeof window.wellcumNetwork?.host === 'function'};
  })()`);
  assert.deepEqual(startup, {
    origin: 'wellcum://game',
    secure: true,
    node: 'undefined',
    require: 'undefined',
    gamepads: 'function',
    webgl: true,
    width: startup.width,
    height: startup.height,
    hasNativeNetwork: true,
  });
  assert.ok(startup.width > 0 && startup.height > 0);
  const helperPids = run('pgrep', ['-P', String(child.pid)])
    .trim()
    .split(/\s+/);
  const rendererCommand = helperPids
    .map((pid) => run('ps', ['-p', pid, '-o', 'args=']))
    .find((command) => command.includes('--type=renderer'));
  assert.ok(
    rendererCommand?.includes('--enable-sandbox'),
    'actual signed renderer retains Chromium sandbox',
  );
  assert.ok(
    rendererCommand.includes(
      `--user-data-dir=${path.join(paths.appData, 'WellcumBack')}`,
    ),
    'actual signed renderer uses only the disposable profile',
  );
  assert.ok(
    (await stat(path.join(paths.appData, 'WellcumBack'))).isDirectory(),
    'production profile created under isolated appData',
  );

  await waitFor(() => cdp.evaluate('document.hasFocus()'), 'signed app focus');
  if (await visible('.city-pause-menu')) await click('Продолжить поездку');
  await waitFor(
    () => cdp.evaluate('!document.querySelector(".city-pause-menu")'),
    'driving unpaused',
  );
  await cdp.evaluate('document.activeElement?.blur()');
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'w',
    code: 'KeyW',
    windowsVirtualKeyCode: 87,
  });
  try {
    await waitFor(
      () =>
        [...audioContexts.values()].some(
          (context) => context.contextState === 'running',
        ),
      'real game AudioContext running',
    );
    await waitFor(
      () =>
        cdp.evaluate(
          'parseInt(document.querySelector(".city-speed")?.textContent || "0", 10) > 0',
        ),
      'native driving input',
    );
    assert.ok(audioNodes > 5, 'game created an actual audio graph');
    const context = [...audioContexts.values()].find(
      (item) => item.contextState === 'running',
    );
    const first = await cdp.send('WebAudio.getRealtimeData', {
      contextId: context.contextId,
    });
    // CoreAudio may need time to resume after the initial focus pause.
    let second;
    try {
      await waitFor(
        async () => {
          assert.equal(
            audioContexts.get(context.contextId)?.contextState,
            'running',
          );
          assert.equal(
            await cdp.evaluate(
              'document.hasFocus() && !document.hidden && !document.querySelector(".city-pause-menu")',
            ),
            true,
            'game stays focused and unpaused during audio observation',
          );
          second = await cdp.send('WebAudio.getRealtimeData', {
            contextId: context.contextId,
          });
          return (
            second.realtimeData.currentTime > first.realtimeData.currentTime
          );
        },
        'native audio device clock advances',
        40,
      );
      audioClock = {
        from: first.realtimeData.currentTime,
        to: second.realtimeData.currentTime,
      };
    } catch (error) {
      const focus = await cdp.evaluate(
        '({focused:document.hasFocus(), hidden:document.hidden, paused:Boolean(document.querySelector(".city-pause-menu"))})',
      );
      throw new Error(
        `${error.message}: ${JSON.stringify({ first, second, context: audioContexts.get(context.contextId), focus })}`,
      );
    }
  } finally {
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'w',
      code: 'KeyW',
      windowsVirtualKeyCode: 87,
    });
  }

  await click('Онлайн-комната');
  await click('Одна сеть / VPN');
  await waitFor(
    () => visible('.network-addresses button'),
    'native LAN interface selector',
  );
  await cdp.evaluate(
    'document.querySelector(".network-addresses button").click()',
  );
  await click('Создать игру');
  await waitFor(() => visible('.room-invite'), 'native room created by UI');
  const hosted = await invoke('status');
  assert.equal(hosted.state, 'ready');
  assert.ok(hosted.selectedAddress);
  assert.equal(new URL(hosted.connection.url).hostname, hosted.selectedAddress);
  peer = new RoomSocket(hosted.connection, (url) => new WebSocket(url));
  const invitation = await cdp.evaluate(
    'document.querySelector("textarea[readonly]").value',
  );
  const credentials = JSON.parse(
    Buffer.from(invitation.slice(5), 'base64url').toString(),
  );
  const joined = await peer.request({
    version: ROOM_VERSION,
    op: 'join',
    code: credentials.code,
    name: 'Signed QA guest',
  });
  assert.equal(joined.status, 200);
  assert.equal(joined.body.slot, 1);
  await waitFor(
    () =>
      cdp.evaluate(
        'document.querySelector(".room-members")?.textContent.includes("Signed QA guest")',
      ),
    'independent guest in native roster',
  );
  const poll = (extra = {}) =>
    peer.request({
      version: ROOM_VERSION,
      op: 'poll',
      code: credentials.code,
      token: joined.body.token,
      ...extra,
    });
  await click('Вернуться в игру');
  let world;
  await waitFor(async () => {
    world = await poll();
    return Boolean(world.body.snapshot);
  }, 'actual game snapshot through native SQLite relay');
  assert.equal(world.body.snapshot.scene, 'city');
  assert.equal(typeof world.body.snapshot.state.paused, 'boolean');
  assert.ok(Number.isFinite(world.body.snapshot.state.elapsed));
  assert.ok(Number.isFinite(world.body.snapshot.state.x));
  assert.ok(Number.isFinite(world.body.snapshot.state.z));
  await click('Онлайн-комната');
  await click('Закрыть комнату и сервер');
  await waitFor(
    async () => (await invoke('status')).state === 'offline',
    'native room/server shutdown',
  );
  await assert.rejects(
    poll(),
    'independent guest loses transport after native shutdown',
  );
  await waitFor(
    () => cdp.evaluate('!document.querySelector(".room-invite")'),
    'closed room cleared from UI',
  );
  await cdp.send('Page.bringToFront');
  await cdp.evaluate(
    'document.querySelector(".network-dialog [data-slot=dialog-close]").click()',
  );
  await waitFor(
    () => cdp.evaluate('!document.querySelector(".network-dialog[data-open]")'),
    'network dialog closed',
  );
  await pause(200);
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
  });
  await mkdir(path.join(root, 'outputs'), { recursive: true });
  const screenshotPath = path.join(root, 'outputs/signed-mac-smoke.png');
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  assert.deepEqual(
    observedErrors,
    [],
    'no game console errors or unhandled exceptions',
  );
  assert.equal(await digest(asarPath), originalAsar, 'signed ASAR unchanged');
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
  console.log(
    'SIGNED_MAC_SMOKE_OK',
    JSON.stringify({
      startup,
      audioNodes,
      audioClock,
      tunnelVersion,
      isolatedProfile: true,
      rendererSandbox: true,
      nativeLanGuest: true,
      realCitySnapshot: true,
      bundleUnchanged: true,
      screenshot: screenshotPath,
      note: 'Audio graph/device clock verified; subjective listening and physical gamepad were not tested.',
    }),
  );
} catch (error) {
  console.error('SIGNED_MAC_SMOKE_FAILED', checkpoint, error.stack ?? error);
  console.error('SIGNED_MAC_DIAGNOSTICS', diagnostics);
  process.exitCode = 1;
} finally {
  peer?.close();
  if (cdp) {
    await invoke('stop').catch(() => {});
    cdp.socket.close();
  }
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      pause(3000),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await rm(temporary, { recursive: true, force: true });
}
