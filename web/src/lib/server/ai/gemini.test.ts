import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geminiProvider } from './gemini';

// Mock the SDK so the tests exercise the adapter's mapping from Gemini
// responses/errors to the provider-agnostic AiImageResult, with no live calls.
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  HarmCategory: {
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
  },
  HarmBlockThreshold: { BLOCK_LOW_AND_ABOVE: 'BLOCK_LOW_AND_ABOVE' },
}));

const request = {
  apiKey: 'test-key',
  image: { base64: 'AAAA', mimeType: 'image/png' },
  prompt: 'a prompt',
};

beforeEach(() => {
  generateContent.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('geminiProvider.generateImage', () => {
  it('returns the image when the model produced one', async () => {
    generateContent.mockResolvedValue({
      candidates: [
        { content: { parts: [{ inlineData: { data: 'BBBB', mimeType: 'image/webp' } }] } },
      ],
    });
    await expect(geminiProvider.generateImage(request)).resolves.toEqual({
      kind: 'image',
      data: 'BBBB',
      mimeType: 'image/webp',
    });
  });

  it('maps a safety classification to a refusal', async () => {
    generateContent.mockResolvedValue({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } });
    await expect(geminiProvider.generateImage(request)).resolves.toEqual({
      kind: 'refusal',
      reason: 'PROHIBITED_CONTENT',
    });
  });

  it('maps an empty response to a retryable error', async () => {
    generateContent.mockResolvedValue({ candidates: [{ content: { parts: [] } }] });
    const result = await geminiProvider.generateImage(request);
    expect(result.kind).toBe('error');
    expect((result as { reason: string }).reason).toMatch(/^Model did not return an image/);
  });

  it('maps a thrown blocked-content error to a refusal (first line only)', async () => {
    generateContent.mockRejectedValue(
      Object.assign(new Error('Request blocked for SAFETY POLICY\nmore detail'), { status: 400 })
    );
    await expect(geminiProvider.generateImage(request)).resolves.toEqual({
      kind: 'refusal',
      reason: 'Request blocked for SAFETY POLICY',
    });
  });

  it('maps any other thrown error to a retryable error', async () => {
    generateContent.mockRejectedValue(
      Object.assign(new Error('Resource exhausted'), { status: 429 })
    );
    await expect(geminiProvider.generateImage(request)).resolves.toEqual({
      kind: 'error',
      reason: 'Gemini request failed: Resource exhausted',
    });
  });
});

describe('geminiProvider.verifyKey', () => {
  it('returns ok when the probe call succeeds', async () => {
    generateContent.mockResolvedValue({});
    await expect(geminiProvider.verifyKey('good-key')).resolves.toEqual({ ok: true });
  });

  it('returns the rejection reason when the probe call throws', async () => {
    generateContent.mockRejectedValue(new Error('API key invalid'));
    await expect(geminiProvider.verifyKey('bad-key')).resolves.toEqual({
      ok: false,
      reason: 'API key invalid',
    });
  });
});
