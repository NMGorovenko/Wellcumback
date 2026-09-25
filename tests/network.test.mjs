import { cityStops } from '../lib/game/city/layout.ts';
import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeInvite,
  decodeInvite,
  readPeerPacket,
  NETWORK_VERSION,
  NETWORK_CHANNEL,
} from '../lib/game/network/protocol.ts';
import { DrivingPeer } from '../lib/game/network/peer.ts';
import {
  createNetworkInvite,
  acceptNetworkAnswer,
  joinNetworkInvite,
  disconnectNetwork,
  networkSnapshot,
  passNetworkWheel,
  tickNetworkCity,
  isNetworkDrive,
} from '../lib/game/network/session.ts';
import { freshCity, tickCity } from '../lib/game/city/engine.ts';
const SDP =
  'v=0\r\ns=Поездка 🧳\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n';
const offer = encodeInvite({ type: 'offer', sdp: SDP }),
  answer = encodeInvite({ type: 'answer', sdp: SDP });
class Channel {
  label = NETWORK_CHANNEL;
  readyState = 'connecting';
  bufferedAmount = 0;
  sent = [];
  open() {
    this.readyState = 'open';
    this.onopen?.();
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 'closed';
  }
  receive(packet) {
    this.onmessage?.({ data: JSON.stringify(packet) });
  }
}
class Connection extends EventTarget {
  static instances = [];
  static deferOffer = null;
  iceGatheringState = 'complete';
  connectionState = 'new';
  signalingState = 'stable';
  localDescription = null;
  channel = null;
  closed = false;
  constructor() {
    super();
    Connection.instances.push(this);
    this.offerFactory = Connection.deferOffer;
    Connection.deferOffer = null;
  }
  async createOffer() {
    return this.offerFactory
      ? this.offerFactory()
      : { type: 'offer', sdp: SDP };
  }
  async createAnswer() {
    return { type: 'answer', sdp: SDP };
  }
  async setLocalDescription(d) {
    this.localDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(d) {
    this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
  createDataChannel(label) {
    this.channel = new Channel();
    this.channel.label = label;
    return this.channel;
  }
  addChannel(label = NETWORK_CHANNEL) {
    const c = new Channel();
    c.label = label;
    this.ondatachannel?.({ channel: c });
    return c;
  }
  state(value) {
    this.connectionState = value;
    this.onconnectionstatechange?.();
  }
  close() {
    this.closed = true;
    this.connectionState = 'closed';
  }
}
const originalRTC = globalThis.RTCPeerConnection;
globalThis.RTCPeerConnection = Connection;
let now = 0;
mock.method(performance, 'now', () => now);
afterEach(() => {
  disconnectNetwork();
  Connection.instances = [];
  Connection.deferOffer = null;
  now = 0;
});
process.on('exit', () => {
  globalThis.RTCPeerConnection = originalRTC;
});
const last = () => Connection.instances.at(-1);
const input = (seq, keys = [], epoch = 0) => ({
  type: 'input',
  version: NETWORK_VERSION,
  seq,
  epoch,
  keys,
});
const city = (seq, driver = 'host', epoch = 0, state = freshCity()) => ({
  type: 'city',
  version: NETWORK_VERSION,
  seq,
  epoch,
  driver,
  state,
});
async function host() {
  await createNetworkInvite();
  const pc = last();
  pc.channel.open();
  return pc.channel;
}
async function guest() {
  await joinNetworkInvite(offer);
  const pc = last(),
    channel = pc.addChannel();
  channel.open();
  return channel;
}

void test('invite codes are ASCII and Unicode SDP round-trips; malformed codes and packet fields are rejected', () => {
  assert.equal(NETWORK_VERSION, 9);
  assert.equal(NETWORK_CHANNEL, 'wellcum-city-v9');
  assert.match(offer, /^WCB9\.[A-Za-z0-9+/=]+$/);
  assert.equal(decodeInvite(`  ${offer}\n`, 'offer').sdp, SDP);
  assert.throws(() => decodeInvite(answer, 'offer'));
  assert.throws(() => decodeInvite('WCB9.%%%', 'offer'));
  assert.throws(() => decodeInvite('WCB9.' + 'a'.repeat(60000), 'offer'));
  assert.equal(readPeerPacket(JSON.stringify(input(1, ['KeyE']))), null);
  assert.equal(
    readPeerPacket(JSON.stringify({ ...input(1), epoch: -1 })),
    null,
  );
  assert.equal(
    readPeerPacket(JSON.stringify({ ...input(1), epoch: undefined })),
    null,
  );
  for (const [field, value] of [
    ['bumps', -1],
    ['accumulator', 3],
    ['steering', 20],
    ['radioUntil', -2],
  ]) {
    assert.equal(
      readPeerPacket(
        JSON.stringify(city(1, 'host', 0, { ...freshCity(), [field]: value })),
      ),
      null,
      field,
    );
  }
  const clean = readPeerPacket(
    JSON.stringify(
      city(1, 'host', 0, { ...freshCity(), injected: { code: 'no' } }),
    ),
  );
  assert.ok(clean);
  assert.equal('injected' in clean.state, false);
});

const legacyInvite = (version, type) =>
  `WCB${version}.` +
  btoa(
    JSON.stringify({
      version,
      type,
      sdp: 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n',
    }),
  );
const mismatch = /Версии игры различаются\. Обновите игру/;

for (const version of [1, 2, 3, 4, 5, 6, 7, 8])
  void test(`version 9 invites reject v${version} offers and answers before applying remote descriptions`, async () => {
    assert.deepEqual(decodeInvite(offer, 'offer'), {
      version: NETWORK_VERSION,
      type: 'offer',
      sdp: SDP,
    });
    assert.deepEqual(decodeInvite(answer, 'answer'), {
      version: NETWORK_VERSION,
      type: 'answer',
      sdp: SDP,
    });
    for (const type of ['offer', 'answer']) {
      const old = legacyInvite(version, type);
      assert.throws(() => decodeInvite(old, type), mismatch);
      assert.throws(
        () => decodeInvite(old.replace(`WCB${version}.`, 'WCB9.'), type),
        mismatch,
      );
    }
    await joinNetworkInvite(legacyInvite(version, 'offer'));
    assert.equal(networkSnapshot().status, 'failed');
    assert.match(networkSnapshot().message, mismatch);
    assert.equal(Connection.instances.length, 0);
    await createNetworkInvite();
    const pc = last();
    await acceptNetworkAnswer(legacyInvite(version, 'answer'));
    assert.equal(networkSnapshot().status, 'failed');
    assert.match(networkSnapshot().message, mismatch);
    assert.equal(pc.signalingState, 'have-local-offer');
  });

void test('old packets cannot route snapshots or reserve sequence numbers in a current session', async () => {
  const channel = await guest(),
    local = freshCity();
  const remote = { ...freshCity(), x: 0, z: 0, speed: 3 };
  for (const version of [1, 2, 3, 4, 5, 6, 7, 8]) {
    assert.equal(
      readPeerPacket(JSON.stringify({ ...input(10), version })),
      null,
    );
    const old = { ...city(10, 'host', 0, remote), version };
    assert.equal(readPeerPacket(JSON.stringify(old)), null);
    channel.receive(old);
    tickNetworkCity(local, 1 / 60, new Set());
    assert.equal(local.x, freshCity().x);
    assert.equal(local.z, freshCity().z);
    assert.equal(local.speed, 0);
  }
  channel.receive(city(10, 'host', 0, remote));
  tickNetworkCity(local, 1 / 60, new Set());
  assert.equal(local.x, remote.x);
  assert.equal(local.z, remote.z);
  assert.equal(local.speed, remote.speed);
});

void test('v1, v2 and v3 data channels cannot take the current v5 connection', async () => {
  const statuses = [];
  const peer = new DrivingPeer({
    onStatus: (status) => statuses.push(status),
    onPacket: () => {},
  });
  await peer.answer(offer);
  const connection = last();
  for (const version of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const channel = connection.addChannel(`wellcum-city-v${version}`);
    assert.equal(channel.readyState, 'closed');
    assert.notEqual(statuses.at(-1), 'connected');
  }
  const current = connection.addChannel();
  current.open();
  assert.equal(statuses.at(-1), 'connected');
  peer.close();
});

void test('ICE connected is insufficient; only current data-channel open/messages can connect or deliver', async () => {
  const statuses = [],
    packets = [];
  const peer = new DrivingPeer({
    onStatus: (s) => statuses.push(s),
    onPacket: (p) => packets.push(p),
  });
  await peer.offer();
  const old = last(),
    oldChannel = old.channel,
    oldMessage = oldChannel.onmessage;
  old.state('connected');
  assert.notEqual(statuses.at(-1), 'connected');
  oldChannel.open();
  assert.equal(statuses.at(-1), 'connected');
  const duplicate = old.addChannel();
  assert.equal(duplicate.readyState, 'closed');
  await peer.offer();
  oldMessage({ data: JSON.stringify(input(1)) });
  assert.equal(packets.length, 0);
  last().channel.open();
  last().channel.receive(input(2));
  assert.equal(packets.length, 1);
  peer.close();
});

void test('cancelled gathering cannot mark a newer guest session failed', async () => {
  let reject;
  Connection.deferOffer = () =>
    new Promise((_, r) => {
      reject = r;
    });
  const pending = createNetworkInvite();
  await joinNetworkInvite(offer);
  const current = networkSnapshot();
  assert.equal(current.role, 'guest');
  assert.equal(current.status, 'waiting');
  reject(Error('old cancelled offer'));
  await pending;
  assert.deepEqual(networkSnapshot(), current);
});

void test('connection timeout closes the transport, while guest gets time to copy its answer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const statuses = [];
  const peer = new DrivingPeer({
    onStatus: (s) => statuses.push(s),
    onPacket: () => {},
  });
  await peer.offer();
  await peer.accept(answer);
  const pc = last();
  t.mock.timers.tick(45001);
  assert.equal(statuses.at(-1), 'failed');
  assert.equal(pc.closed, true);
  await peer.answer(offer);
  const waiting = last();
  t.mock.timers.tick(45001);
  assert.notEqual(statuses.at(-1), 'failed');
  assert.equal(waiting.closed, false);
  peer.close();
});

void test('old sequence and old ownership epoch cannot reapply gas; missing input releases after 350 ms', async () => {
  const channel = await host(),
    s = freshCity();
  passNetworkWheel();
  channel.receive(input(999, ['KeyW'], 0)); // Sent before the wheel was handed over.
  tickNetworkCity(s, 0.1, new Set());
  assert.equal(s.speed, 0);
  channel.receive(input(2, ['KeyW'], 1));
  tickNetworkCity(s, 0.1, new Set());
  assert.ok(s.speed > 0);
  channel.receive(input(1, ['KeyS'], 1));
  now = 351;
  const expected = { ...s };
  tickCity(expected, 0.1, new Set());
  tickNetworkCity(s, 0.1, new Set());
  assert.equal(s.speed, expected.speed);
  assert.equal(s.z, expected.z);
  channel.receive(input(3, [], 1));
  passNetworkWheel();
  s.vx = s.vz = s.speed = 0;
  tickNetworkCity(s, 0.1, new Set(['KeyW']));
  assert.equal(s.speed, 0, 'host also releases before taking back control');
  tickNetworkCity(s, 0.1, new Set());
  tickNetworkCity(s, 0.1, new Set(['KeyW']));
  assert.ok(s.speed > 0);
});

void test('guest needs a neutral input after handoff; pause survives snapshots and sends empty controls', async () => {
  const channel = await guest(),
    s = freshCity();
  channel.receive(city(1, 'guest', 1));
  tickNetworkCity(s, 0.1, new Set(['KeyW']));
  assert.deepEqual(channel.sent.at(-1).keys, []);
  tickNetworkCity(s, 0.1, new Set());
  tickNetworkCity(s, 0.1, new Set(['KeyW']));
  assert.deepEqual(channel.sent.at(-1).keys, ['KeyW']);
  s.paused = true;
  channel.receive(city(2, 'guest', 1));
  tickNetworkCity(s, 0.1, new Set(['KeyW']));
  assert.equal(s.paused, true);
  assert.deepEqual(channel.sent.at(-1).keys, []);
  s.paused = false;
  tickNetworkCity(s, 0.1, new Set(['KeyW']));
  assert.deepEqual(channel.sent.at(-1).keys, []);
});

void test('stale snapshots at timestamp zero stop guest controls, update status and recover on a fresh sequence', async () => {
  const channel = await guest(),
    s = freshCity();
  channel.receive(city(2, 'guest', 1, { ...freshCity(), speed: 5, vz: -5 }));
  channel.receive(city(1, 'host', 0, { ...freshCity(), speed: 9, vz: -9 }));
  tickNetworkCity(s, 0.1, new Set());
  assert.equal(s.speed, 5);
  assert.equal(networkSnapshot().driver, 'guest');
  now = 2001;
  tickNetworkCity(s, 0.1, new Set(['KeyW']));
  assert.equal(s.speed, 0);
  assert.equal(networkSnapshot().status, 'connecting');
  assert.deepEqual(channel.sent.at(-1).keys, []);
  channel.receive(city(3, 'guest', 1, { ...freshCity(), speed: 3, vz: -3 }));
  assert.equal(networkSnapshot().status, 'connected');
  tickNetworkCity(s, 0.1, new Set());
  assert.equal(s.speed, 3);
});

void test('E cannot launch a mission during handshake or failure; guest never becomes local authority without leaving', async () => {
  await createNetworkInvite();
  const waiting = freshCity();
  waiting.x = cityStops[0].x;
  waiting.z = cityStops[0].z;
  waiting.interaction = 'screen';
  tickNetworkCity(waiting, 0.1, new Set(['KeyE']));
  assert.equal(waiting.interaction, null);
  disconnectNetwork();
  const channel = await guest(),
    s = freshCity();
  s.x = cityStops[0].x;
  s.z = cityStops[0].z;
  channel.onclose();
  assert.equal(networkSnapshot().status, 'closed');
  assert.equal(isNetworkDrive(), true);
  tickNetworkCity(s, 0.1, new Set(['KeyE', 'KeyW']));
  assert.equal(s.interaction, null);
  assert.equal(s.speed, 0);
  assert.equal(s.z, cityStops[0].z);
  disconnectNetwork();
  assert.equal(isNetworkDrive(), false);
  tickNetworkCity(s, 0.1, new Set(['KeyE']));
  assert.equal(s.interaction, 'screen');
});

void test('first ICE failure reports a direct-route failure, without inventing a prior connection or exposing candidates', async () => {
  const statuses = [];
  const peer = new DrivingPeer({
    onStatus: (status, message) => statuses.push({ status, message }),
    onPacket: () => {},
  });
  await peer.answer(offer);
  const pc = last();
  pc.localDescription.sdp +=
    'a=candidate:2 1 udp 1234 203.0.113.17 12345 typ srflx raddr 10.0.0.5 rport 54321\r\n';
  pc.iceConnectionState = 'failed';
  pc.state('failed');
  const final = statuses.at(-1);
  assert.equal(final.status, 'failed');
  assert.equal(pc.closed, true);
  assert.match(final.message, /STUN-адрес получен/);
  assert.match(final.message, /TURN-сервер/);
  assert.match(final.message, /ответ вставили с задержкой/);
  assert.doesNotMatch(final.message, /Связь прервалась|203\.0\.113|10\.0\.0/);
  peer.close();
});

void test('failure after an opened data channel is reported as an interrupted connection', async () => {
  const statuses = [];
  const peer = new DrivingPeer({
    onStatus: (status, message) => statuses.push({ status, message }),
    onPacket: () => {},
  });
  await peer.offer();
  const pc = last();
  pc.channel.open();
  pc.iceConnectionState = 'failed';
  pc.state('failed');
  assert.equal(statuses.at(-1).status, 'failed');
  assert.match(statuses.at(-1).message, /Связь прервалась/);
  assert.doesNotMatch(statuses.at(-1).message, /не установилось/);
  peer.close();
});

void test('native failure during answer gathering preserves the useful failure reason through the async session catch', async () => {
  const pending = joinNetworkInvite(offer);
  const pc = last();
  pc.iceGatheringState = 'gathering';
  for (let i = 0; i < 6; i++) await Promise.resolve();
  assert.equal(pc.localDescription?.type, 'answer');
  pc.iceConnectionState = 'failed';
  pc.state('failed');
  const primary = networkSnapshot().message;
  await pending;
  assert.equal(networkSnapshot().status, 'failed');
  assert.equal(networkSnapshot().message, primary);
  assert.match(primary, /Прямое соединение не установилось/);
  assert.notEqual(primary, 'Соединение закрыто.');
  assert.equal(pc.closed, true);
});

void test('closing an unopened channel is not described as a friend disconnecting', async () => {
  const statuses = [];
  const peer = new DrivingPeer({
    onStatus: (status, message) => statuses.push({ status, message }),
    onPacket: () => {},
  });
  await peer.offer();
  const pc = last();
  pc.channel.onclose();
  assert.equal(statuses.at(-1).status, 'failed');
  assert.match(statuses.at(-1).message, /Прямое соединение не установилось/);
  assert.doesNotMatch(statuses.at(-1).message, /Друг отключился/);
  assert.equal(pc.closed, true);
  peer.close();
});

void test('host analog controls need a fresh neutral frame after stale recovery, not a neutral frame during the outage', async () => {
  const channel = await host(),
    s = freshCity();
  const held = { throttle: 0.7, steer: 0.3 },
    neutral = { throttle: 0, steer: 0 };
  channel.receive(input(1));
  tickNetworkCity(s, 0.1, new Set(), held);
  assert.ok(s.speed > 0);
  now = 2001;
  tickNetworkCity(s, 0.1, new Set(), held);
  assert.equal(networkSnapshot().status, 'connecting');
  // Releasing and pressing again while the app is stale must not arm a later
  // recovery: the player has not seen the recovered connection yet.
  tickNetworkCity(s, 0.1, new Set(), neutral);
  tickNetworkCity(s, 0.1, new Set(), held);
  channel.receive(input(2));
  const coasting = { ...s };
  tickCity(coasting, 0.1, new Set());
  tickNetworkCity(s, 0.1, new Set(), held);
  assert.equal(networkSnapshot().status, 'connected');
  for (const field of ['x', 'z', 'vx', 'vz', 'speed', 'steering'])
    assert.equal(
      s[field],
      coasting[field],
      `held recovery input must not affect ${field}`,
    );
  tickNetworkCity(s, 0.1, new Set(), neutral);
  const afterRelease = { ...s };
  tickCity(afterRelease, 0.1, new Set());
  tickNetworkCity(s, 0.1, new Set(), held);
  assert.ok(
    s.speed > afterRelease.speed + 0.3,
    'gas works after a fresh neutral frame',
  );
  assert.ok(s.steering > afterRelease.steering, 'steering also rearms');
});

void test('missing or stale remote analog input becomes neutral and old ownership cannot restore it', async () => {
  const channel = await host(),
    s = freshCity();
  passNetworkWheel();
  channel.receive({ ...input(2, [], 1), drive: { throttle: 0.6, steer: 0.4 } });
  tickNetworkCity(s, 0.1, new Set());
  assert.ok(s.speed > 0 && s.steering > 0);
  now = 351;
  const coasting = { ...s };
  tickCity(coasting, 0.1, new Set());
  tickNetworkCity(s, 0.1, new Set());
  for (const field of ['x', 'z', 'vx', 'vz', 'speed', 'steering'])
    assert.equal(
      s[field],
      coasting[field],
      `350 ms clears the remote ${field} contribution`,
    );
  // A fresh old-client packet has no drive field. It must clear axes instead of
  // inheriting the last analog sample; a previous epoch must still be ignored.
  channel.receive(input(3, [], 1));
  channel.receive({ ...input(999, [], 0), drive: { throttle: 1, steer: -1 } });
  const stillCoasting = { ...s };
  tickCity(stillCoasting, 0.1, new Set());
  tickNetworkCity(s, 0.1, new Set());
  assert.equal(s.speed, stillCoasting.speed);
  assert.equal(s.steering, stillCoasting.steering);
  channel.receive({ ...input(4, [], 1), drive: { throttle: 0.6, steer: 0.4 } });
  tickNetworkCity(s, 0.1, new Set());
  assert.ok(
    s.speed > stillCoasting.speed,
    'a current ownership sample restores remote control',
  );
});

void test('guest sends neutral axes after stale recovery and handoff until both throttle and steering are released', async () => {
  const channel = await guest(),
    s = freshCity();
  const held = { throttle: 0.6, steer: -0.3 },
    neutral = { throttle: 0, steer: 0 };
  channel.receive(city(1, 'guest', 1));
  tickNetworkCity(s, 0.1, new Set(), neutral);
  tickNetworkCity(s, 0.1, new Set(), held);
  assert.deepEqual(channel.sent.at(-1).drive, held);
  now = 2001;
  tickNetworkCity(s, 0.1, new Set(), held);
  assert.deepEqual(channel.sent.at(-1).drive, neutral);
  channel.receive(city(2, 'guest', 1));
  tickNetworkCity(s, 0.1, new Set(), held);
  assert.deepEqual(channel.sent.at(-1).drive, neutral);
  tickNetworkCity(s, 0.1, new Set(), { throttle: 0, steer: -0.3 });
  tickNetworkCity(s, 0.1, new Set(), held);
  assert.deepEqual(
    channel.sent.at(-1).drive,
    neutral,
    'released gas alone does not rearm a held steering stick',
  );
  tickNetworkCity(s, 0.1, new Set(), neutral);
  tickNetworkCity(s, 0.1, new Set(), held);
  assert.deepEqual(channel.sent.at(-1).drive, held);
  channel.receive(city(3, 'host', 2));
  tickNetworkCity(s, 0.1, new Set(), held);
  assert.deepEqual(channel.sent.at(-1).drive, neutral);
  channel.receive(city(4, 'guest', 3));
  tickNetworkCity(s, 0.1, new Set(), held);
  assert.deepEqual(
    channel.sent.at(-1).drive,
    neutral,
    'taking the wheel again requires a new neutral frame',
  );
  tickNetworkCity(s, 0.1, new Set(), neutral);
  tickNetworkCity(s, 0.1, new Set(), held);
  assert.deepEqual(channel.sent.at(-1).drive, held);
});
