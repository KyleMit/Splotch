const UPLOAD_WEBP_QUALITY = 0.85;

// No API reports canvas encode capability directly; the spec-mandated PNG
// fallback for an unsupported type IS the feature signal, so a 1×1 probe
// answers in ~1 ms. Memoized per page load and deliberately never persisted:
// a stored "no" would outlive a Safari upgrade that adds a WebP encoder and
// silently disable the smaller upload forever.
let webpEncodeSupported: boolean | null = null;

function canEncodeWebp(): boolean {
  if (webpEncodeSupported === null) {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    webpEncodeSupported = probe.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpEncodeSupported;
}

// Transcode the composited drawing to WebP for the upload only. Decoding the PNG
// and re-encoding is exact on the source pixels, so the model sees the same
// image at a fraction of the bytes. Returns null (caller falls back to the PNG)
// if the platform can't decode/encode or the encoder declines.
export async function encodeWebpUpload(png: Blob): Promise<Blob | null> {
  try {
    // Skipping outright on a non-encoding engine matters: Safari has no canvas
    // WebP encoder (the WebP-encoder row in docs/COMPATIBILITY.md), so without
    // this gate an iPad spends ~105 ms of blocked main thread per generation
    // decoding and re-encoding a blob the type guard below then discards —
    // measured on device, docs/scratchpad/webp-upload-encode-cost-2026-08.md.
    if (!canEncodeWebp()) return null;
    const bitmap = await createImageBitmap(png);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const webp = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', UPLOAD_WEBP_QUALITY)
    );
    // A platform without WebP encoding hands back a PNG (or null) here; only take
    // the result when it's genuinely smaller WebP, so we never upload a fatter
    // re-encode than the original.
    return webp && webp.type === 'image/webp' && webp.size < png.size ? webp : null;
  } catch {
    return null;
  }
}
