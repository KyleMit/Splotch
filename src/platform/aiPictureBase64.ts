import type { AiResult } from '../ai/journal';

// A kept AI picture is a file in the app's own storage; one held in memory because storage did not
// confirm it is a base64 data URI of its bytes.
export async function aiPictureBase64(picture: AiResult): Promise<string> {
  const prefix = `data:${picture.mime};base64,`;
  if (picture.uri.startsWith(prefix)) return picture.uri.slice(prefix.length);
  const LegacyFiles = await import('expo-file-system/legacy');
  return LegacyFiles.readAsStringAsync(picture.uri, { encoding: LegacyFiles.EncodingType.Base64 });
}
