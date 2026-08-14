import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GENERATE_DEADLINE_MS, VERIFY_KEY_DEADLINE_MS } from '$lib/ai/limits';
import { openAiProvider } from './openai';

// Mock the SDK so the tests exercise the adapter's mapping from OpenAI
// responses/errors to the provider-agnostic AiImageResult, with no live calls.
const { create, retrieve, construct } = vi.hoisted(() => ({
  create: vi.fn(),
  retrieve: vi.fn(),
  construct: vi.fn(),
}));
vi.mock('openai', () => ({
  default: class {
    responses = { create };
    models = { retrieve };
    constructor(options: unknown) {
      construct(options);
    }
  },
}));

// A 1×1 PNG, so the adapter's canvas-shape read has real header bytes to parse.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const request = {
  apiKey: 'test-key',
  image: { base64: PNG_1X1, mimeType: 'image/png' },
  prompt: 'a prompt',
  deadlineMs: GENERATE_DEADLINE_MS,
};

const imageResponse = {
  status: 'completed',
  output: [
    { type: 'image_generation_call', status: 'completed', result: 'BBBB', output_format: 'webp' },
  ],
};

beforeEach(() => {
  create.mockReset();
  retrieve.mockReset();
  construct.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('openAiProvider.generateImage', () => {
  it('returns the image when the model produced one', async () => {
    create.mockResolvedValue(imageResponse);
    await expect(openAiProvider.generateImage(request)).resolves.toEqual({
      kind: 'image',
      data: 'BBBB',
      mimeType: 'image/webp',
    });
  });

  it('maps a prose reply to a refusal', async () => {
    create.mockResolvedValue({
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: "Let's draw something else!" }],
        },
      ],
    });
    await expect(openAiProvider.generateImage(request)).resolves.toEqual({
      kind: 'refusal',
      reason: "Let's draw something else!",
    });
  });

  it('maps an empty response to a retryable error', async () => {
    create.mockResolvedValue({ status: 'completed', output: [] });
    const result = await openAiProvider.generateImage(request);
    expect(result.kind).toBe('error');
    expect((result as { reason: string }).reason).toMatch(/^Model did not return an image/);
  });

  it('maps a thrown moderation block to a refusal (first line only)', async () => {
    create.mockRejectedValue(
      Object.assign(new Error('Rejected by the safety system\nmore detail'), {
        status: 400,
        code: 'moderation_blocked',
      })
    );
    await expect(openAiProvider.generateImage(request)).resolves.toEqual({
      kind: 'refusal',
      reason: 'Rejected by the safety system',
    });
  });

  it('names an unverified organization instead of reporting a generic outage', async () => {
    create.mockRejectedValue(
      Object.assign(new Error('Your organization must be verified to use `gpt-image-2`.'), {
        status: 403,
      })
    );
    const result = await openAiProvider.generateImage(request);
    expect(result.kind).toBe('error');
    expect((result as { reason: string }).reason).toMatch(/identity verification/);
  });

  it('maps any other thrown error to a retryable error', async () => {
    create.mockRejectedValue(Object.assign(new Error('Rate limit reached'), { status: 429 }));
    await expect(openAiProvider.generateImage(request)).resolves.toEqual({
      kind: 'error',
      reason: 'OpenAI request failed: Rate limit reached',
    });
  });

  it('leaves the model free to decline instead of forcing the image tool', async () => {
    create.mockResolvedValue(imageResponse);
    await openAiProvider.generateImage(request);
    // Any tool_choice that names the image tool would remove the refusal path
    // this provider is chosen for.
    expect(create.mock.calls[0][0].tool_choice).toBeUndefined();
  });

  it('sends the child-safety rules as a system instruction, not as prompt text', async () => {
    create.mockResolvedValue(imageResponse);
    await openAiProvider.generateImage(request);
    const call = create.mock.calls[0][0];
    expect(call.instructions).toMatch(/toddlers aged 2 and up/);
    expect(JSON.stringify(call.input)).not.toMatch(/toddlers aged 2 and up/);
  });

  it('asks for a canvas matching the shape the child drew on', async () => {
    create.mockResolvedValue(imageResponse);
    // A 4:3 landscape WebP — the format the client uploads when it can encode one.
    const wideWebp =
      'UklGRlQAAABXRUJQVlA4IEgAAAAwBACdASpgAEAAPp1Oo02lpCMiIWgAsBOJaQB2AAAWZEiRIkSJEiRIj6AA/u4KZ//FtI6FMh//+0s/+pZ/9Sz/NMSFwwgAAAA=';
    await openAiProvider.generateImage({
      ...request,
      image: { base64: wideWebp, mimeType: 'image/webp' },
    });
    expect(create.mock.calls[0][0].tools[0].size).toBe('1536x1024');
  });

  it('bounds the call at the deadline the ladder specifies, not merely at something', async () => {
    create.mockResolvedValue(imageResponse);
    await openAiProvider.generateImage(request);
    // Naming the constant is the point: a bound of "greater than zero" would
    // keep passing if the deadline drifted past Netlify's ceiling, which is the
    // one thing ADR-0063's ladder exists to prevent.
    expect(construct).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-key', timeout: GENERATE_DEADLINE_MS, maxRetries: 0 })
    );
  });

  it('also passes an abort signal, which bounds the response body the SDK timeout does not', async () => {
    create.mockResolvedValue(imageResponse);
    await openAiProvider.generateImage(request);
    const options = create.mock.calls[0][1];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.timeout).toBe(GENERATE_DEADLINE_MS);
  });
});

describe('openAiProvider.verifyKey', () => {
  it('returns ok when the probe call succeeds', async () => {
    retrieve.mockResolvedValue({ id: 'gpt-image-2' });
    await expect(openAiProvider.verifyKey('good-key')).resolves.toEqual({ ok: true });
  });

  it('returns the rejection reason when the probe call throws', async () => {
    retrieve.mockRejectedValue(new Error('Incorrect API key provided'));
    await expect(openAiProvider.verifyKey('bad-key')).resolves.toEqual({
      ok: false,
      reason: 'Incorrect API key provided',
    });
  });

  it('probes the image model generation uses, without generating', async () => {
    retrieve.mockResolvedValue({ id: 'gpt-image-2' });
    create.mockResolvedValue(imageResponse);
    await openAiProvider.verifyKey('good-key');
    await openAiProvider.generateImage(request);
    expect(create).toHaveBeenCalledOnce();
    expect(retrieve.mock.calls[0][0]).toBe(create.mock.calls[0][0].tools[0].model);
  });

  it('bounds the probe at the key-check deadline so a hung provider cannot occupy the invocation', async () => {
    retrieve.mockResolvedValue({ id: 'gpt-image-2' });
    await openAiProvider.verifyKey('good-key');
    expect(construct.mock.calls[0][0].timeout).toBe(VERIFY_KEY_DEADLINE_MS);
    expect(retrieve.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('retries the probe once, so a transient blip is not reported as a bad key', async () => {
    retrieve.mockResolvedValue({ id: 'gpt-image-2' });
    await openAiProvider.verifyKey('good-key');
    expect(construct.mock.calls[0][0].maxRetries).toBeGreaterThan(0);
  });
});
