import { ROOM_VERSION } from './room-types.ts';
import { validateConnection, type RoomConnection } from './connection.ts';

export type SocketReply = { status: number; body: unknown };
/** WebSocket RPC carries the same verified protocol as HTTP, without gateway polling delays. */
export class RoomSocket {
  private socket: WebSocket | null = null;
  private opening: Promise<void> | null = null;
  private next = 0;
  private pending = new Map<
    number,
    {
      resolve: (reply: SocketReply) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private readonly connection: RoomConnection;
  private readonly createSocket: (url: string) => WebSocket;
  constructor(
    connection: RoomConnection,
    createSocket: (url: string) => WebSocket = (url) => new WebSocket(url),
  ) {
    this.connection = validateConnection(connection);
    this.createSocket = createSocket;
  }
  async connect(): Promise<void> {
    if (this.opening) return this.opening;
    if (this.socket?.readyState === 1) return;
    const ws = this.createSocket(this.connection.url);
    this.socket = ws;
    this.opening = new Promise<void>((resolve, reject) => {
      let ready = false;
      const timer = setTimeout(() => {
        ws.close();
        reject(
          new Error(
            'Сервер не отвечает. Проверьте, что ведущий оставил игру открытой.',
          ),
        );
      }, 10000);
      const disconnect = () => {
        clearTimeout(timer);
        if (this.socket && this.socket !== ws) return;
        if (this.socket === ws) this.socket = null;
        if (!ready)
          reject(
            new Error(
              'Соединение с сервером не установлено. Проверь строку подключения.',
            ),
          );
        for (const request of this.pending.values()) {
          clearTimeout(request.timer);
          request.reject(new Error('Связь прервалась. Переподключаемся…'));
        }
        this.pending.clear();
      };
      ws.addEventListener('open', () =>
        ws.send(
          JSON.stringify({
            kind: 'hello',
            version: ROOM_VERSION,
            accessKey: this.connection.accessKey,
          }),
        ),
      );
      ws.addEventListener('error', disconnect);
      ws.addEventListener('close', disconnect);
      ws.addEventListener('message', (event) => {
        if (typeof event.data !== 'string' || event.data.length > 512 * 1024) {
          ws.close();
          return;
        }
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          ws.close();
          return;
        }
        if (!message || typeof message !== 'object' || Array.isArray(message)) {
          ws.close();
          return;
        }
        if (!ready) {
          clearTimeout(timer);
          if (message.kind !== 'hello' || message.version !== ROOM_VERSION) {
            reject(
              new Error(
                'Сервер не принял приглашение или версии игры различаются.',
              ),
            );
            ws.close();
            return;
          }
          ready = true;
          resolve();
          return;
        }
        const request = this.pending.get(message.id);
        if (!request || !Number.isInteger(message.status)) return;
        this.pending.delete(message.id);
        clearTimeout(request.timer);
        request.resolve({ status: message.status, body: message.body });
      });
    }).finally(() => {
      this.opening = null;
    });
    return this.opening;
  }
  async request(body: unknown): Promise<SocketReply> {
    await this.connect();
    const socket = this.socket;
    if (
      !socket ||
      socket.readyState !== 1 ||
      socket.bufferedAmount > 512 * 1024 ||
      this.pending.size >= 4
    )
      throw new Error('Соединение перегружено. Ждём сервер.');
    const id = ++this.next;
    const payload = JSON.stringify({ id, body });
    if (payload.length > 256 * 1024)
      throw new Error('Слишком большой игровой снимок.');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        socket.close();
        reject(new Error('Сервер не ответил вовремя. Переподключаемся…'));
      }, 8000);
      this.pending.set(id, { resolve, reject, timer });
      socket.send(payload);
    });
  }
  close() {
    this.socket?.close();
    this.socket = null;
  }
}
