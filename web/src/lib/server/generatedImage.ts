import { hasPunchedBackground, isStyleName } from '../ai/styles';

export async function prepareGeneratedImage(
  style: string | null,
  bytes: Uint8Array,
  mimeType: string
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (!isStyleName(style) || !hasPunchedBackground(style)) return { bytes, mimeType };
  const { keyStickerBackground } = await import('./ai/flatBackgroundPunch');
  const { buffer } = await keyStickerBackground(bytes);
  return { bytes: buffer, mimeType: 'image/png' };
}
