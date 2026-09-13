/* oxlint-disable typescript/no-require-imports -- Native test harness, excluded from packages. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { fork } = require('node:child_process');

module.exports = async function inspectNetwork(contents) {
  const peer = fork(path.join(__dirname, '../tests/helpers/room-peer.mjs'), {
    execPath: process.env.WELLCUM_SMOKE_NODE,
    execArgv: ['--experimental-strip-types'],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  let sequence = 0;
  const pending = new Map();
  peer.on('message', ({ id, result, error }) => {
    const request = pending.get(id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(id);
    if (error) request.reject(new Error(error));
    else request.resolve(result);
  });
  const guest = (connection, payload) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Independent guest timeout'));
      }, 8000);
      pending.set(id, { resolve, reject, timer });
      peer.send({ id, connection, payload });
    });
  const invoke = (method, ...args) =>
    contents.executeJavaScript(
      `window.wellcumNetwork.${method}(...${JSON.stringify(args)})`,
    );
  const click = (label) =>
    contents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent.trim()) === ${JSON.stringify(label)});
    if (!button || button.disabled) throw new Error('Unavailable network button');
    button.click();
  })()`);
  const waitFor = async (expression) => {
    for (let n = 0; n < 100; n++) {
      if (await contents.executeJavaScript(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Network UI did not reach expected state');
  };
  try {
    assert.equal(
      await contents.executeJavaScript(`typeof window.wellcumNetwork?.host`),
      'function',
    );
    const choices = await invoke('status');
    assert.ok(
      choices.localInterfaces.length > 0,
      'addresses are available before hosting',
    );
    const selected = choices.localInterfaces[0].address;
    await click('Онлайн-комната');
    await waitFor(`Boolean(document.querySelector('.network-dialog'))`);
    await click('Одна сеть / VPN');
    await waitFor(
      `Boolean(document.querySelector('.network-addresses button'))`,
    );
    await contents.executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('.network-addresses button')].find((b) => b.querySelector('strong')?.textContent === ${JSON.stringify(selected)});
      if (!button) throw new Error('Selected adapter is missing in UI');
      button.click();
    })()`);
    await click('Создать игру');
    await waitFor(`Boolean(document.querySelector('.room-invite'))`);
    assert.equal((await invoke('status')).selectedAddress, selected);
    await click('Закрыть комнату и сервер');
    await waitFor(`!document.querySelector('.room-invite')`);
    await click('Close');
    const status = await invoke('host', 'lan', selected);
    assert.equal(status.selectedAddress, selected);
    assert.equal(new URL(status.connection.url).hostname, selected);
    assert.equal(status.state, 'ready', status.message);
    const connection = status.connection;
    const request = (payload) =>
      invoke('request', connection, { version: 5, ...payload });
    const created = await request({
      op: 'create',
      name: 'Native host',
      capacity: 3,
    });
    assert.equal(created.status, 201);
    const host = created.body;
    const joined = await guest(connection, {
      op: 'join',
      code: host.code,
      name: 'Separate guest',
    });
    assert.equal(joined.status, 200);
    const poll = (extra) =>
      request({ op: 'poll', code: host.code, token: host.token, ...extra });
    const remote = (extra) =>
      guest(connection, {
        op: 'poll',
        code: host.code,
        token: joined.body.token,
        ...extra,
      });
    let epoch = 0;
    for (const scene of ['city', 'screen', 'clean', 'moving']) {
      const snapshot = {
        scene,
        epoch: ++epoch,
        attempt: epoch,
        roles: [0, 1, 2],
        driver: 0,
        brief: true,
        state: { paused: true, players: 2 },
      };
      assert.equal((await poll({ snapshot, snapshotSeq: epoch })).status, 200);
      assert.deepEqual((await remote({})).body.snapshot, snapshot);
    }
    await remote({
      frames: [
        { seq: 1, epoch, keys: ['KeyE'] },
        { seq: 2, epoch, keys: [] },
      ],
    });
    assert.deepEqual(
      (await poll({})).body.frames['1'].map((frame) => frame.keys),
      [['KeyE'], []],
    );
    await poll({ acks: { 1: 2 } });
    assert.equal((await remote({})).body.ack, 2);
    await invoke('stop');
    assert.equal((await invoke('status')).state, 'offline');
    await assert.rejects(
      remote({}),
      'stopping native server disconnects the independent client',
    );
    console.log(
      'DESKTOP_LAN_OK: native address selection UI, sandboxed preload, selected LAN listener, SQLite relay, separate Node guest, four scenes, input ACK and shutdown',
    );
  } finally {
    await invoke('stop');
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('Peer closed'));
    }
    pending.clear();
    peer.kill();
  }
};
