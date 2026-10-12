import { describe, expect, it, vi } from 'vitest';
import { generateImage, IMAGE_MODEL, IMAGE_TIMEOUT_MS } from '../lib/gemini.mjs';

function imageResponse(bytes, mimeType = 'image/png') {
  return {
    candidates: [
      {
        content: {
          parts: [{ inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType } }],
        },
      },
    ],
  };
}

describe('generateImage', () => {
  it('sends image bytes before the prompt with optional temperature', async () => {
    const generateContent = vi.fn().mockResolvedValue(imageResponse('output', 'image/webp'));
    const ai = { models: { generateContent } };

    await expect(
      generateImage(ai, {
        imageBytes: Buffer.from('input'),
        mimeType: 'image/webp',
        prompt: 'color it',
        temperature: 0.7,
      })
    ).resolves.toEqual({ bytes: Buffer.from('output'), mimeType: 'image/webp' });

    expect(IMAGE_MODEL).toBe('gemini-3.1-flash-image');
    expect(IMAGE_TIMEOUT_MS).toBe(120_000);
    expect(generateContent).toHaveBeenCalledOnce();
    expect(generateContent).toHaveBeenCalledWith({
      model: IMAGE_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/webp',
                data: Buffer.from('input').toString('base64'),
              },
            },
            { text: 'color it' },
          ],
        },
      ],
      config: {
        abortSignal: expect.any(AbortSignal),
        temperature: 0.7,
      },
    });
  });

  it('sends text-only contents with aspect ratio and omits temperature', async () => {
    const generateContent = vi.fn().mockResolvedValue(imageResponse('outline'));
    const ai = { models: { generateContent } };

    await generateImage(ai, {
      prompt: 'draw an outline',
      aspectRatio: '2:3',
    });

    expect(generateContent).toHaveBeenCalledWith({
      model: IMAGE_MODEL,
      contents: [{ role: 'user', parts: [{ text: 'draw an outline' }] }],
      config: {
        abortSignal: expect.any(AbortSignal),
        imageConfig: { aspectRatio: '2:3' },
      },
    });
  });

  it('throws the classified non-image reason', async () => {
    const ai = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          promptFeedback: { blockReason: 'SAFETY' },
        }),
      },
    };

    await expect(generateImage(ai, { prompt: 'blocked' })).rejects.toThrow('safety: SAFETY');
  });
});
