import { UPLOAD_WEBP_QUALITY } from '../lib/drawing/aiUploadEncoding';

export type AiUpload = Readonly<{ bytes: Uint8Array; mime: 'image/png' | 'image/webp' }>;

export async function encodeAiUpload(png: Uint8Array): Promise<AiUpload> {
  try {
    const { Skia, ImageFormat } = await import('@shopify/react-native-skia');
    const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(png));
    if (!image) return { bytes: png, mime: 'image/png' };
    try {
      const webp = image.encodeToBytes(ImageFormat.WEBP, Math.round(UPLOAD_WEBP_QUALITY * 100));
      if (webp.length < png.length) return { bytes: webp, mime: 'image/webp' };
    } finally {
      image.dispose();
    }
  } catch {
    return { bytes: png, mime: 'image/png' };
  }
  return { bytes: png, mime: 'image/png' };
}
