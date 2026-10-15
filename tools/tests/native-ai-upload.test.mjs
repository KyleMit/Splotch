import { beforeEach, expect, it, vi } from 'vitest';
import { encodeAiUpload } from '../../experiments/native-architecture/src/platform/aiUpload.ts';
import { encodeAiUpload as encodeWebUpload } from '../../experiments/native-architecture/src/platform/aiUpload.web.ts';
import { UPLOAD_WEBP_QUALITY } from '../../web/src/lib/drawing/aiUploadEncoding.ts';
import { nativeAiBoundary } from './native-ai-boundary.mjs';
import { createNativeAi } from '../../experiments/native-architecture/src/ai/generation.ts';
import { rgbaPng } from './native-png-fixtures.mjs';

const encoder = vi.hoisted(() => ({ encode: vi.fn(), dispose: vi.fn(), web: vi.fn() }));
vi.mock('@shopify/react-native-skia', () => ({
  ImageFormat: { WEBP: 6 },
  Skia: {
    Data: { fromBytes: (bytes) => bytes },
    Image: {
      MakeImageFromEncoded: () => ({ encodeToBytes: encoder.encode, dispose: encoder.dispose }),
    },
  },
}));
vi.mock('../../web/src/lib/drawing/aiUploadEncoding.ts', async (original) => ({
  ...(await original()),
  encodeWebpUpload: encoder.web,
}));
beforeEach(() => vi.resetAllMocks());

it('sends encoded WebP while its journal and submitted original retain the full PNG', async () => {
  const boundary = nativeAiBoundary();
  const png = rgbaPng(4, 4, 255);
  const webp = new Uint8Array([7, 8]);
  encoder.encode.mockReturnValue(webp);
  const post = vi.fn(
    async () => new Response(rgbaPng(2, 2, 255), { headers: { 'Content-Type': 'image/png' } })
  );
  const owner = createNativeAi({
    storage: boundary.aiStorage,
    vault: boundary.aiVault,
    admit: boundary.admitAiImage,
    prepare: async () => ({ bytes: png, originalId: 'picture-1-fixture', originalModel: '{}' }),
    transport: async (request) =>
      request.path === '/api/free-generation-grant'
        ? new Response('{"ok":true,"remaining":10,"limit":10}')
        : post(request),
  });
  try {
    owner.open();
    const { x, y } = owner.getState().gate;
    owner.gateInput(String(x * y));
    owner.gateAnswer();
    await vi.waitFor(() => expect(owner.getState().busy).toBe(false));
    await owner.generate();
    expect(boundary.aiStorage.prepare.mock.calls[0][2]).toEqual(png);
    expect(post.mock.calls[0][0]).toMatchObject({
      headers: { 'Content-Type': 'image/webp' },
      body: webp,
    });
    expect(owner.getState().submitted.uri).toBe(`data:image/png;base64,${png.toString('base64')}`);
  } finally {
    owner.dispose();
  }
});

it('uploads smaller WebP at shipping quality while retaining the original PNG bytes', async () => {
  const png = new Uint8Array([1, 2, 3, 4]);
  const webp = new Uint8Array([5, 6]);
  encoder.encode.mockReturnValue(webp);
  expect(await encodeAiUpload(png)).toEqual({ bytes: webp, mime: 'image/webp' });
  expect(encoder.encode).toHaveBeenCalledWith(6, Math.round(UPLOAD_WEBP_QUALITY * 100));
  expect(encoder.dispose).toHaveBeenCalledOnce();
  expect(png).toEqual(new Uint8Array([1, 2, 3, 4]));
});

it.each(['larger', 'failure'])('falls back to the original PNG after %s encoding', async (kind) => {
  const png = new Uint8Array([1, 2]);
  if (kind === 'failure')
    encoder.encode.mockImplementation(() => {
      throw new Error('codec');
    });
  else encoder.encode.mockReturnValue(new Uint8Array([3, 4, 5]));
  expect(await encodeAiUpload(png)).toEqual({ bytes: png, mime: 'image/png' });
  expect(encoder.dispose).toHaveBeenCalledOnce();
});

it('uses the shipping browser encoder for web uploads', async () => {
  const png = new Uint8Array([1, 2]);
  encoder.web.mockResolvedValue(new Blob([new Uint8Array([3])], { type: 'image/webp' }));
  expect(await encodeWebUpload(png)).toEqual({ bytes: new Uint8Array([3]), mime: 'image/webp' });
  encoder.web.mockResolvedValue(null);
  expect(await encodeWebUpload(png)).toEqual({ bytes: png, mime: 'image/png' });
});
