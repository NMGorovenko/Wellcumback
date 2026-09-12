import {
  decodeInvite,
  encodeInvite,
  readPeerPacket,
  type PeerPacket,
} from './protocol.ts';
export type PeerStatus =
  | 'idle'
  | 'gathering'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'failed';
type PeerEvents = {
  onStatus: (status: PeerStatus, message?: string) => void;
  onPacket: (packet: PeerPacket) => void;
};
/** A copy/paste handshake with one data channel. A connection is usable only
 * after that channel opens; ICE's connected state alone cannot carry packets. */
export class DrivingPeer {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cancelGather: (() => void) | null = null;
  private events: PeerEvents;
  private opened = false;
  private failureReasons = new WeakMap<RTCPeerConnection, string>();
  constructor(events: PeerEvents) {
    this.events = events;
  }
  private setup() {
    this.close();
    this.opened = false;
    if (typeof RTCPeerConnection === 'undefined')
      throw new Error('Этот браузер не поддерживает сетевую поездку.');
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    this.pc = pc;
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === 'connected') {
        if (this.channel?.readyState === 'open') {
          this.clearTimer();
          this.events.onStatus('connected');
        } else this.events.onStatus('connecting');
      } else if (pc.connectionState === 'disconnected') {
        this.events.onStatus(
          'connecting',
          'Связь прервалась. Пробуем восстановить…',
        );
        this.waitForFriend(
          pc,
          8000,
          'Связь прервалась. Обменяйтесь новыми кодами.',
        );
      } else if (pc.connectionState === 'failed')
        this.fail(pc, this.connectionFailureMessage(pc));
      else if (pc.connectionState === 'closed')
        this.fail(pc, 'Друг отключился.', 'closed');
      else if (pc.connectionState === 'connecting')
        this.events.onStatus('connecting');
    };
    pc.ondatachannel = (event) => this.attach(pc, event.channel);
    return pc;
  }
  private attach(pc: RTCPeerConnection, channel: RTCDataChannel) {
    if (this.pc !== pc || channel.label !== 'wellcum-city-v1' || this.channel) {
      channel.close();
      return;
    }
    this.channel = channel;
    const current = () => this.pc === pc && this.channel === channel;
    channel.onopen = () => {
      if (current()) {
        this.opened = true;
        this.clearTimer();
        this.events.onStatus('connected');
      }
    };
    channel.onclose = () => {
      if (current())
        this.fail(
          pc,
          this.opened ? 'Друг отключился.' : this.connectionFailureMessage(pc),
          this.opened ? 'closed' : 'failed',
        );
    };
    channel.onerror = () => {
      if (current()) this.fail(pc, 'Не получилось передать данные.');
    };
    channel.onmessage = (event) => {
      if (!current()) return;
      const packet = readPeerPacket(event.data);
      if (packet) this.events.onPacket(packet);
    };
  }
  private connectionFailureMessage(pc: RTCPeerConnection) {
    if (this.opened) return 'Связь прервалась. Обменяйтесь новыми кодами.';
    if (
      pc.iceConnectionState === 'connected' ||
      pc.iceConnectionState === 'completed'
    )
      return 'Маршрут найден, но канал данных не открылся. Создайте новые коды на обеих сторонах.';
    const publicCandidate = /^a=candidate:.* typ srflx(?: |\r?$)/m.test(
      pc.localDescription?.sdp ?? '',
    );
    const route = publicCandidate
      ? 'STUN-адрес получен, но прямое соединение не установилось.'
      : 'Прямое соединение не установилось.';
    const manual =
      pc.localDescription?.type === 'answer'
        ? ' Если ответ вставили с задержкой, нужны новые коды.'
        : '';
    return (
      route +
      ' В этой сети может понадобиться TURN-сервер; пока его нет. Можно попробовать другую сеть или локальную игру.' +
      manual
    );
  }
  private fail(
    pc: RTCPeerConnection,
    message: string,
    status: PeerStatus = 'failed',
  ) {
    if (this.pc !== pc) return;
    this.failureReasons.set(pc, message);
    this.close();
    this.events.onStatus(status, message);
  }
  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  private waitForFriend(pc: RTCPeerConnection, ms = 45000, message?: string) {
    this.clearTimer();
    this.timer = setTimeout(
      () => this.fail(pc, message ?? this.connectionFailureMessage(pc)),
      ms,
    );
  }
  private async gather(pc: RTCPeerConnection) {
    if (pc.iceGatheringState === 'complete') return;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (cancelled = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', changed);
        if (this.cancelGather === cancel) this.cancelGather = null;
        if (cancelled || this.pc !== pc)
          reject(
            new Error(this.failureReasons.get(pc) ?? 'Соединение закрыто.'),
          );
        else resolve();
      };
      const cancel = () => finish(true);
      const changed = () => {
        if (pc.iceGatheringState === 'complete') finish();
      };
      const timer = setTimeout(finish, 8000);
      this.cancelGather = cancel;
      pc.addEventListener('icegatheringstatechange', changed);
      if (pc.iceGatheringState === 'complete') finish();
    });
  }
  private check(pc: RTCPeerConnection) {
    if (this.pc !== pc)
      throw new Error(this.failureReasons.get(pc) ?? 'Соединение закрыто.');
  }
  async offer() {
    const pc = this.setup();
    this.events.onStatus('gathering');
    try {
      this.attach(
        pc,
        pc.createDataChannel('wellcum-city-v1', {
          ordered: false,
          maxRetransmits: 0,
        }),
      );
      const offer = await pc.createOffer();
      this.check(pc);
      await pc.setLocalDescription(offer);
      await this.gather(pc);
      this.check(pc);
      this.events.onStatus('waiting');
      return encodeInvite(pc.localDescription!);
    } catch (error) {
      if (this.pc === pc) this.close();
      throw this.failureReasons.has(pc)
        ? new Error(this.failureReasons.get(pc))
        : error;
    }
  }
  async answer(code: string) {
    const offer = decodeInvite(code, 'offer');
    const pc = this.setup();
    this.events.onStatus('gathering');
    try {
      await pc.setRemoteDescription(offer);
      this.check(pc);
      const answer = await pc.createAnswer();
      this.check(pc);
      await pc.setLocalDescription(answer);
      await this.gather(pc);
      this.check(pc);
      if (this.channel?.readyState === 'open') {
        this.clearTimer();
        this.events.onStatus('connected');
      } else {
        this.events.onStatus(
          'waiting',
          'Передай ответ водителю сразу. Если попытка завершится, создайте новые коды.',
        );
        // This is only an upper bound for the UI; it cannot extend native ICE checks.
        this.waitForFriend(
          pc,
          180000,
          'Время обмена кодами истекло. Создайте новые коды и передайте ответ сразу.',
        );
      }
      return encodeInvite(pc.localDescription!);
    } catch (error) {
      if (this.pc === pc) this.close();
      throw this.failureReasons.has(pc)
        ? new Error(this.failureReasons.get(pc))
        : error;
    }
  }
  async accept(code: string) {
    const answer = decodeInvite(code, 'answer'),
      pc = this.pc;
    if (!pc || pc.signalingState !== 'have-local-offer')
      throw new Error('Сначала создайте приглашение.');
    this.events.onStatus('connecting');
    this.waitForFriend(pc);
    try {
      await pc.setRemoteDescription(answer);
      this.check(pc);
    } catch (error) {
      if (this.pc === pc) this.close();
      throw this.failureReasons.has(pc)
        ? new Error(this.failureReasons.get(pc))
        : error;
    }
  }
  send(packet: PeerPacket) {
    const channel = this.channel;
    if (channel?.readyState === 'open' && channel.bufferedAmount < 64000) {
      try {
        channel.send(JSON.stringify(packet));
      } catch {
        /* Next tick supersedes a dropped packet. */
      }
    }
  }
  close() {
    this.clearTimer();
    this.cancelGather?.();
    this.cancelGather = null;
    if (this.channel) {
      this.channel.onopen =
        this.channel.onclose =
        this.channel.onerror =
        this.channel.onmessage =
          null;
      this.channel.close();
      this.channel = null;
    }
    if (this.pc) {
      this.pc.onconnectionstatechange = this.pc.ondatachannel = null;
      this.pc.close();
      this.pc = null;
    }
  }
}
