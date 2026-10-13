import type { AiResponse } from './transport';
export async function readAiBytes(
  response: AiResponse,
  cap: number,
  signal: AbortSignal
): Promise<Uint8Array> {
  const hint = response.headers.get('Content-Length');
  if (hint && /^\d+$/.test(hint) && Number(hint) > cap) {
    void response.body?.cancel().catch(() => {});
    throw new Error('Response exceeds limit');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new Error('Request cancelled');
      const next = await reader.read();
      if (signal.aborted) throw new Error('Request cancelled');
      if (next.done) break;
      length += next.value.byteLength;
      if (length > cap) {
        cancel();
        throw new Error('Response exceeds limit');
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
