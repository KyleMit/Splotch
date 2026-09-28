import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A roomy PNG so the tiny stubbed WebP is genuinely smaller and gets used.
const png = new Blob(['P'.repeat(200)], { type: 'image/png' });

function stubWebpEncoder() {
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp,probe');
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 8, height: 8, close: vi.fn() }))
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    cb: BlobCallback,
    type?: string
  ) {
    cb(new Blob(['webp'], { type: type ?? 'image/png' }));
  });
}

// The encode-support probe is memoized for the page load, so each test starts from a fresh module.
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('encodeWebpUpload', () => {
  it('re-encodes the PNG as a smaller WebP when the platform can encode one', async () => {
    stubWebpEncoder();
    const { encodeWebpUpload } = await import('./aiUploadEncoding');

    const upload = await encodeWebpUpload(png);

    expect(upload?.type).toBe('image/webp');
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/webp',
      expect.any(Number)
    );
  });

  it('skips the transcode entirely when the platform cannot encode WebP', async () => {
    // Safari's canvas answers an unsupported toDataURL type with the
    // spec-mandated PNG fallback; the capability gate reads that as "no WebP
    // encoder" and must skip without ever decoding the export — on an iPad the
    // decode + discarded re-encode costs ~105 ms of blocked main thread.
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    const { encodeWebpUpload } = await import('./aiUploadEncoding');

    await expect(encodeWebpUpload(png)).resolves.toBeNull();
    expect(decode).not.toHaveBeenCalled();
  });

  it('probes WebP encode support once across uploads', async () => {
    stubWebpEncoder();
    const { encodeWebpUpload } = await import('./aiUploadEncoding');

    const first = await encodeWebpUpload(png);
    const second = await encodeWebpUpload(png);

    expect(first?.type).toBe('image/webp');
    expect(second?.type).toBe('image/webp');
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledTimes(1);
  });
});
