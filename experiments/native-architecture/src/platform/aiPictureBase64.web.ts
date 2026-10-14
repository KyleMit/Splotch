import type { AiResult } from '../ai/journal';

// Every AI picture the web app shows is a base64 data URI of its own bytes (aiStorage.web.ts).
export async function aiPictureBase64(picture: AiResult): Promise<string> {
  const prefix = `data:${picture.mime};base64,`;
  if (!picture.uri.startsWith(prefix)) throw new Error('This AI picture cannot be saved.');
  return picture.uri.slice(prefix.length);
}
