import { env } from 'cloudflare:workers';
import { handleRoomRequest, type RoomDatabase } from '@/lib/server/rooms';

const MAX_REQUEST_BYTES = 256 * 1024;
const headers = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'application/json; charset=utf-8',
};
function error(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers,
  });
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return error(403, 'INVALID_ORIGIN', 'Откройте комнату на сайте игры.');
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    return error(415, 'INVALID_CONTENT_TYPE', 'Нужен JSON-запрос.');
  const length = request.headers.get('content-length');
  if (length && Number(length) > MAX_REQUEST_BYTES)
    return error(413, 'REQUEST_TOO_LARGE', 'Слишком большой запрос.');
  const db = (env as unknown as { ROOMS_DB?: RoomDatabase }).ROOMS_DB;
  if (!db)
    return error(503, 'RELAY_UNAVAILABLE', 'Сервер комнаты ещё не настроен.');
  let payload: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return error(400, 'INVALID_JSON', 'Пустой запрос.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return error(413, 'REQUEST_TOO_LARGE', 'Слишком большой запрос.');
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    payload = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
  } catch {
    return error(400, 'INVALID_JSON', 'Не удалось прочитать запрос.');
  }
  const result = await handleRoomRequest(db, payload);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers,
  });
}
