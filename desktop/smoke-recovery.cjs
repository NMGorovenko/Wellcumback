/* oxlint-disable typescript/no-require-imports -- Isolated Electron test entry, never packaged. */
const { app, dialog } = require('electron');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');

const appDir = process.env.WELLCUM_SMOKE_APP;
const profile = process.env.WELLCUM_SMOKE_PROFILE;
const phase = process.env.WELLCUM_RECOVERY_PHASE;
if (!appDir || !profile || !['host', 'guest'].includes(phase))
  throw new Error('Use scripts/smoke-recovery.mjs');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const setPath = app.setPath.bind(app);
setPath('sessionData', profile);
app.setPath = (name, value) =>
  setPath(name, name === 'userData' ? profile : value);
const networkFile = require.resolve(path.join(appDir, 'network.cjs'));
const original = require(networkFile);
const requests = [];
let manager,
  auxiliary,
  failNext = false,
  latestLaunch,
  launchCount = 0,
  port;
// Override only the provider inside this test process. Real main, preload, relay and sender checks remain intact.
require.cache[networkFile].exports = {
  ...original,
  createDesktopNetwork(options) {
    manager = original.createDesktopNetwork({
      ...options,
      async openTunnel(launch) {
        latestLaunch = launch;
        port = launch.port;
        launchCount++;
        if (failNext) {
          failNext = false;
          throw new Error('QA: temporary provider failure');
        }
        return {
          connection: {
            url: `wss://test-tunnel-${launchCount}.invalid/rooms`,
            accessKey: launch.accessKey,
          },
          stop: async () => {},
        };
      },
    });
    const request = manager.request.bind(manager);
    manager.request = async (connection, payload) => {
      const observation = { connection, payload };
      requests.push(observation);
      const response = await request(connection, payload);
      observation.response = response;
      return response;
    };
    return manager;
  },
};
const options = {
  schema: readFileSync(path.join(appDir, 'rooms.sql'), 'utf8'),
  binary: '/unused/test-provider',
  tempRoot: profile,
};
const makeInvitation = (connection, code) =>
  'WCB1:' +
  Buffer.from(JSON.stringify({ ...connection, code, version: 5 })).toString(
    'base64url',
  );
const parse = (text) => original.parseInvitation(text);
let finished = false,
  checkpoint = 'loading',
  backgroundError;
async function fail(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  console.error('RECOVERY_UI_FAILED', phase, checkpoint, error.stack ?? error);
  await auxiliary?.stop();
  await manager?.stop();
  app.exit(1);
}
const timer = setTimeout(
  () => void fail(new Error('Recovery UI timeout')),
  35000,
);
dialog.showErrorBox = (title, message) =>
  void fail(new Error(`${title}: ${message}`));

async function until(check, label) {
  checkpoint = label;
  for (let i = 0; i < 150; i++) {
    if (backgroundError) throw backgroundError;
    if (await check()) return;
    await pause(50);
  }
  throw new Error(`Timed out: ${label}`);
}
const evaluate = (contents, expression) =>
  contents.executeJavaScript(expression);
const click = (contents, label) =>
  evaluate(
    contents,
    `(() => {
  const target = [...document.querySelectorAll('button, summary')].find(b => (b.getAttribute('aria-label') || b.textContent.trim()) === ${JSON.stringify(label)});
  if (!target || target.disabled) throw new Error('Unavailable button: ' + ${JSON.stringify(label)});
  target.click();
})()`,
  );
const field = async (contents, selector, value) => {
  await evaluate(
    contents,
    `(() => { const field = document.querySelector(${JSON.stringify(selector)}); field.focus(); field.select(); })()`,
  );
  await contents.insertText(value);
};
const credentials = (contents) =>
  evaluate(contents, `JSON.parse(sessionStorage.getItem('wellcum-room-v5'))`);
const invitation = (contents) =>
  evaluate(contents, `document.querySelector('textarea[readonly]')?.value`);
const visible = (contents, selector) =>
  evaluate(
    contents,
    `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
  );
const buttonAvailable = (contents, label) =>
  evaluate(
    contents,
    `[...document.querySelectorAll('button')].some(b => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled)`,
  );

async function inspectHost(contents) {
  await click(contents, 'Онлайн-комната');
  await click(contents, 'Создать игру');
  await until(() => visible(contents, '.room-invite'), 'created host room');
  const before = await credentials(contents);
  const first = parse(await invitation(contents));
  auxiliary = original.createDesktopNetwork(options);
  const local = {
    url: `ws://127.0.0.1:${port}/rooms`,
    accessKey: first.accessKey,
  };
  const request = (payload) =>
    auxiliary.request(local, { version: 5, ...payload });
  const guest = (
    await request({ op: 'join', code: before.code, name: 'QA guest' })
  ).body;
  let reply;
  const poll = async (extra) => {
    const result = await request({
      op: 'poll',
      code: before.code,
      token: guest.token,
      ...extra,
    });
    assert.equal(result.status, 200);
    reply = result.body;
    return reply;
  };
  await poll({});
  await until(
    () => buttonAvailable(contents, 'Передать ведущего · QA guest'),
    'guest visible in roster',
  );
  await click(contents, 'Вернуться в игру');
  await until(
    async () => (await poll({})).snapshot,
    'actual renderer publishes city',
  );
  // Move using native input so a reset cannot masquerade as preserved initial state.
  app.focus({ steal: true });
  contents.focus();
  await until(
    () => evaluate(contents, 'document.hasFocus()'),
    'native driving focus',
  );
  if (await visible(contents, '.city-pause-menu')) {
    await until(
      () => buttonAvailable(contents, 'Продолжить поездку'),
      'room ready to continue',
    );
    await click(contents, 'Продолжить поездку');
  }
  await until(
    async () => !(await poll({})).snapshot.state.paused,
    'city running before drive',
  );
  await evaluate(contents, 'document.activeElement?.blur()');
  await evaluate(
    contents,
    `window.__recoveryKey = null; window.addEventListener('keydown', event => {
    if (event.code === 'KeyW') window.__recoveryKey = { code: event.code, trusted: event.isTrusted };
  });`,
  );
  const startPosition = reply.snapshot.state.z;
  contents.sendInputEvent({ type: 'keyDown', keyCode: 'W' });
  try {
    await until(
      async () =>
        Math.abs((await poll({})).snapshot.state.z - startPosition) > 0.05,
      'native driving progress',
    );
    assert.equal(
      await evaluate(contents, 'window.__recoveryKey?.trusted'),
      true,
    );
  } catch (error) {
    const input = await evaluate(
      contents,
      `({focus: document.hasFocus(), hidden: document.hidden, active: document.activeElement?.tagName, key: window.__recoveryKey})`,
    );
    throw new Error(
      `${error.message}: ${JSON.stringify({ input, frozen: reply.frozen, roles: reply.snapshot.roles, state: reply.snapshot.state })}`,
    );
  } finally {
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'W' });
  }
  await click(contents, 'Онлайн-комната');
  await click(contents, 'Передать ведущего · QA guest');
  await until(
    async () => (await poll({})).snapshot.roles[0] === 1,
    'gameplay leader transferred',
  );
  const saved = structuredClone(reply.snapshot);
  latestLaunch.onExit();
  await until(
    () => buttonAvailable(contents, 'Восстановить интернет-связь'),
    'recovery button appears',
  );
  assert.equal(await invitation(contents), '', 'obsolete invitation is hidden');
  assert.equal(
    await evaluate(
      contents,
      `document.querySelector('[aria-label="Скопировать приглашение"]').disabled`,
    ),
    true,
  );
  failNext = true;
  await click(contents, 'Восстановить интернет-связь');
  await until(
    () =>
      evaluate(
        contents,
        `document.querySelector('.network-message')?.textContent.includes('QA: temporary provider failure')`,
      ),
    'failed retry shown in UI',
  );
  assert.equal((await credentials(contents)).code, before.code);
  await click(contents, 'Восстановить интернет-связь');
  await until(
    async () => (await invitation(contents))?.startsWith('WCB1:'),
    'replacement invitation visible',
  );
  const next = parse(await invitation(contents));
  assert.equal(next.code, first.code);
  assert.equal(next.accessKey, first.accessKey);
  assert.notEqual(next.url, first.url);
  assert.equal((await credentials(contents)).token, before.token);
  assert.equal((await credentials(contents)).connection.url, next.url);
  await poll({ rejoin: true });
  await pause(200);
  const restored = (await poll({})).snapshot;
  assert.equal(restored.attempt, saved.attempt);
  assert.deepEqual(restored.roles, saved.roles);
  assert.equal(restored.state.z, saved.state.z);
  assert.equal(restored.state.elapsed, saved.state.elapsed);
  assert.equal(
    restored.state.paused,
    true,
    'all clients returned, but continuation is manual',
  );
  assert.equal((await credentials(contents)).slot, 0);
  await click(contents, 'Закрыть комнату и сервер');
  await until(
    async () => (await manager.status()).state === 'offline',
    'explicit server stop',
  );
  assert.equal(await credentials(contents), null);
}

async function inspectGuest(contents) {
  let fixturePort;
  auxiliary = original.createDesktopNetwork({
    ...options,
    async openTunnel(launch) {
      fixturePort = launch.port;
      return {
        connection: {
          url: `ws://127.0.0.1:${launch.port}/rooms`,
          accessKey: launch.accessKey,
        },
        stop: async () => {},
      };
    },
  });
  const status = await auxiliary.host('internet');
  assert.equal(status.state, 'ready');
  const request = (payload) =>
    auxiliary.request(status.connection, { version: 5, ...payload });
  const host = (await request({ op: 'create', name: 'QA host', capacity: 2 }))
    .body;
  const snapshot = JSON.parse(
    readFileSync(process.env.WELLCUM_RECOVERY_WORLD, 'utf8'),
  );
  let seq = 0,
    pauseAck = 0,
    polling = false;
  const tick = async () => {
    if (polling) return;
    polling = true;
    try {
      const response = await request({
        op: 'poll',
        code: host.code,
        token: host.token,
        snapshotSeq: ++seq,
        snapshot,
        pauseAck,
      });
      assert.equal(response.status, 200);
      pauseAck = response.body.pauseRevision;
    } catch (error) {
      backgroundError = error;
    } finally {
      polling = false;
    }
  };
  await tick();
  const interval = setInterval(() => void tick(), 100);
  try {
    await click(contents, 'Онлайн-комната');
    await field(contents, '#room-name', 'QA guest');
    await field(
      contents,
      '#room-code',
      makeInvitation(status.connection, host.code),
    );
    await click(contents, 'Подключиться');
    await until(
      () => visible(contents, '.room-invite'),
      'guest joined through UI',
    );
    const before = await credentials(contents);
    assert.equal(before.slot, 1);
    await click(contents, 'Обновить приглашение');
    await until(
      () => visible(contents, '#replacement-invite'),
      'expanded replacement form',
    );
    const next = {
      ...status.connection,
      url: `ws://localhost:${fixturePort}/rooms`,
    };
    await field(
      contents,
      '#replacement-invite',
      makeInvitation(next, host.code),
    );
    const beforeRetarget = requests.length;
    await click(contents, 'Вернуться по новому приглашению');
    await until(
      async () => (await credentials(contents)).connection.url === next.url,
      'new address saved by guest UI',
    );
    let received;
    await until(() => {
      received = requests
        .slice(beforeRetarget)
        .find(
          (entry) =>
            entry.connection.url === next.url &&
            entry.payload.op === 'poll' &&
            entry.payload.rejoin === true &&
            entry.payload.token === before.token &&
            entry.response?.status === 200,
        );
      return Boolean(received);
    }, 'real guest poll/rejoin succeeded at replacement endpoint');
    assert.equal(received.response.body.slot, before.slot);
    assert.equal(received.response.body.snapshot.attempt, 17);
    assert.equal(received.response.body.snapshot.state.x, 42);
    assert.equal(received.response.body.snapshot.state.elapsed, 143);
    assert.equal(received.response.body.snapshot.state.paused, true);
    assert.equal(
      requests
        .slice(beforeRetarget)
        .some((entry) => entry.payload.op === 'join'),
      false,
      'retarget must reuse the member, never issue a fresh join',
    );
    await until(
      () =>
        evaluate(
          contents,
          `document.querySelectorAll('.room-members .connected').length === 2 && !document.querySelector('.network-message')?.textContent.includes('Возвращаемся')`,
        ),
      'guest actually reconnected',
    );
    const after = await credentials(contents);
    assert.equal(after.token, before.token);
    assert.equal(after.slot, before.slot);
    assert.equal(after.code, before.code);
    const probe = await request({
      op: 'poll',
      code: host.code,
      token: host.token,
    });
    assert.equal(
      probe.body.roster.length,
      2,
      'no new join or extra participant',
    );
    assert.equal(probe.body.snapshot.attempt, 17);
    assert.equal(probe.body.snapshot.state.elapsed, 143);
    assert.equal(probe.body.snapshot.state.x, 42);
    assert.equal(probe.body.snapshot.state.paused, true);
    await click(contents, 'Вернуться в игру');
    await until(
      async () => !(await visible(contents, '[role="dialog"]')),
      'network dialog fully closed',
    );
    await until(
      () => visible(contents, '.city-pause-menu'),
      'guest sees paused city',
    );
    assert.equal(await buttonAvailable(contents, 'Продолжит ведущий'), false);
    const screenshot = await contents.capturePage();
    require('node:fs').writeFileSync(
      path.join(process.cwd(), 'outputs/recovery-guest.png'),
      screenshot.toPNG(),
    );
    await click(contents, 'Онлайн-комната');
    await click(contents, 'Выйти из комнаты');
    await until(
      async () => (await credentials(contents)) === null,
      'explicit guest exit',
    );
  } finally {
    clearInterval(interval);
    while (polling) await pause(50);
  }
}

app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', () => {
    void (async () => {
      if (process.platform === 'darwin')
        window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      window.setAlwaysOnTop(true);
      window.show();
      window.focus();
      app.focus({ steal: true });
      window.webContents.focus();
      await until(
        () => visible(window.webContents, '[aria-label="Онлайн-комната"]'),
        'game canvas and network menu',
      );
      await (phase === 'host' ? inspectHost : inspectGuest)(window.webContents);
      await auxiliary?.stop();
      await manager?.stop();
      finished = true;
      clearTimeout(timer);
      console.log(
        'RECOVERY_UI_OK',
        JSON.stringify({
          phase,
          actualRenderer: true,
          actualPreload: true,
          provider: 'simulated',
          transport: 'loopback',
        }),
      );
      app.quit();
    })().catch(fail);
  });
});
require(path.join(appDir, 'main.cjs'));
