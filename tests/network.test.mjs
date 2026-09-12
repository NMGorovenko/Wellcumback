import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeInvite,
  decodeInvite,
  readPeerPacket,
} from '../lib/game/network/protocol.ts';
import { DrivingPeer } from '../lib/game/network/peer.ts';
import {
  createNetworkInvite,
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
  label = 'wellcum-city-v1';
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
  createDataChannel() {
    this.channel = new Channel();
    return this.channel;
  }
  addChannel() {
    const c = new Channel();
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
  version: 1,
  seq,
  epoch,
  keys,
});
const city = (seq, driver = 'host', epoch = 0, state = freshCity()) => ({
  type: 'city',
  version: 1,
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
  assert.match(offer, /^WCB1\.[A-Za-z0-9+/=]+$/);
  assert.equal(decodeInvite(`  ${offer}\n`, 'offer').sdp, SDP);
  assert.throws(() => decodeInvite(answer, 'offer'));
  assert.throws(() => decodeInvite('WCB1.%%%', 'offer'));
  assert.throws(() => decodeInvite('WCB1.' + 'a'.repeat(60000), 'offer'));
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
  waiting.z = 10;
  waiting.interaction = 'screen';
  tickNetworkCity(waiting, 0.1, new Set(['KeyE']));
  assert.equal(waiting.interaction, null);
  disconnectNetwork();
  const channel = await guest(),
    s = freshCity();
  s.z = 10;
  channel.onclose();
  assert.equal(networkSnapshot().status, 'closed');
  assert.equal(isNetworkDrive(), true);
  tickNetworkCity(s, 0.1, new Set(['KeyE', 'KeyW']));
  assert.equal(s.interaction, null);
  assert.equal(s.speed, 0);
  assert.equal(s.z, 10);
  disconnectNetwork();
  assert.equal(isNetworkDrive(), false);
  tickNetworkCity(s, 0.1, new Set(['KeyE']));
  assert.equal(s.interaction, 'screen');
});


void test("first ICE failure reports a direct-route failure, without inventing a prior connection or exposing candidates", async () => {
  const statuses = [];
  const peer = new DrivingPeer({
    onStatus: (status, message) => statuses.push({ status, message }),
    onPacket: () => {},
  });
  await peer.answer(offer);
  const pc = last();
  pc.localDescription.sdp +=
    "a=candidate:2 1 udp 1234 203.0.113.17 12345 typ srflx raddr 10.0.0.5 rport 54321\r\n";
  pc.iceConnectionState = "failed";
  pc.state("failed");
  const final = statuses.at(-1);
  assert.equal(final.status, "failed");
  assert.equal(pc.closed, true);
  assert.match(final.message, /STUN-адрес получен/);
  assert.match(final.message, /TURN-сервер/);
  assert.match(final.message, /ответ вставили с задержкой/);
  assert.doesNotMatch(final.message, /Связь прервалась|203\.0\.113|10\.0\.0/);
  peer.close();
});

void test("failure after an opened data channel is reported as an interrupted connection", async () => {
  const statuses = [];
  const peer = new DrivingPeer({
    onStatus: (status, message) => statuses.push({ status, message }),
    onPacket: () => {},
  });
  await peer.offer();
  const pc = last();
  pc.channel.open();
  pc.iceConnectionState = "failed";
  pc.state("failed");
  assert.equal(statuses.at(-1).status, "failed");
  assert.match(statuses.at(-1).message, /Связь прервалась/);
  assert.doesNotMatch(statuses.at(-1).message, /не установилось/);
  peer.close();
});

void test("native failure during answer gathering preserves the useful failure reason through the async session catch", async () => {
  const pending = joinNetworkInvite(offer);
  const pc = last();
  pc.iceGatheringState = "gathering";
  for (let i = 0; i < 6; i++) await Promise.resolve();
  assert.equal(pc.localDescription?.type, "answer");
  pc.iceConnectionState = "failed";
  pc.state("failed");
  const primary = networkSnapshot().message;
  await pending;
  assert.equal(networkSnapshot().status, "failed");
  assert.equal(networkSnapshot().message, primary);
  assert.match(primary, /Прямое соединение не установилось/);
  assert.notEqual(primary, "Соединение закрыто.");
  assert.equal(pc.closed, true);
});

void test("closing an unopened channel is not described as a friend disconnecting", async () => {
  const statuses = [];
  const peer = new DrivingPeer({
    onStatus: (status, message) => statuses.push({ status, message }),
    onPacket: () => {},
  });
  await peer.offer();
  const pc = last();
  pc.channel.onclose();
  assert.equal(statuses.at(-1).status, "failed");
  assert.match(statuses.at(-1).message, /Прямое соединение не установилось/);
  assert.doesNotMatch(statuses.at(-1).message, /Друг отключился/);
  assert.equal(pc.closed, true);
  peer.close();
});
