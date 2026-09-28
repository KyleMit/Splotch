import { hasPunchedBackground, type StyleName } from '../ai/styles';

export async function prepareGeneratedImage(
  style: StyleName | null,
  bytes: Uint8Array,
  mimeType: string
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (style === null || !hasPunchedBackground(style)) return { bytes, mimeType };
  const { keyStickerBackground } = await import('./ai/flatBackgroundPunch');
  const { buffer } = await keyStickerBackground(bytes);
  return { bytes: buffer, mimeType: 'image/png' };
}
