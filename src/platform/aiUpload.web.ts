import { encodeWebpUpload } from '../lib/drawing/aiUploadEncoding';
import type { AiUpload } from './aiUpload';

export async function encodeAiUpload(png: Uint8Array): Promise<AiUpload> {
  const webp = await encodeWebpUpload(new Blob([new Uint8Array(png)], { type: 'image/png' }));
  return webp
    ? { bytes: new Uint8Array(await webp.arrayBuffer()), mime: 'image/webp' }
    : { bytes: png, mime: 'image/png' };
}
