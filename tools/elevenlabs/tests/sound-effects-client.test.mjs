import { describe, expect, it, vi } from 'vitest';
import {
  ElevenLabsApiError,
  ElevenLabsSoundEffectsClient,
  normalizeSoundEffectRequest,
  OUTPUT_FORMATS,
} from '../lib/sound-effects-client.mjs';

describe('ElevenLabs sound-effects client', () => {
  it('submits only the sound-generation request with the documented field names', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(Buffer.from('audio bytes'), {
          headers: { 'character-cost': '6', 'content-type': 'audio/mpeg' },
        })
    );
    const client = new ElevenLabsSoundEffectsClient({ apiKey: 'secret', fetchImpl });

    const result = await client.generateSoundEffect({
      text: 'A pop',
      durationSeconds: 0.5,
      loop: false,
      promptInfluence: 0.7,
      outputFormat: 'mp3_44100_128',
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, request] = fetchImpl.mock.calls[0];
    expect(url.href).toBe(
      'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128'
    );
    expect(request.headers).toEqual({
      'content-type': 'application/json',
      'xi-api-key': 'secret',
    });
    expect(JSON.parse(request.body)).toEqual({
      text: 'A pop',
      duration_seconds: 0.5,
      loop: false,
      prompt_influence: 0.7,
      model_id: 'eleven_text_to_sound_v2',
    });
    expect(result).toMatchObject({ characterCost: 6, contentType: 'audio/mpeg' });
    expect(result.bytes.toString()).toBe('audio bytes');
  });

  it('retries a rate limit after Retry-After without probing another endpoint', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: {
              type: 'rate_limit_error',
              code: 'rate_limit_exceeded',
              message: 'Slow down',
              request_id: 'req-1',
            },
          }),
          { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '2' } }
        )
      )
      .mockResolvedValueOnce(new Response(Buffer.from('audio')));
    const sleepImpl = vi.fn(async () => undefined);
    const onRetry = vi.fn();
    const client = new ElevenLabsSoundEffectsClient({
      apiKey: 'secret',
      fetchImpl,
      sleepImpl,
      onRetry,
    });

    await expect(
      client.generateSoundEffect({ text: 'Pop', durationSeconds: 0.5 })
    ).resolves.toMatchObject({ outputFormat: 'mp3_44100_128' });
    expect(sleepImpl).toHaveBeenCalledWith(2_000);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1, delayMs: 2_000 }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(new Set(fetchImpl.mock.calls.map(([url]) => url.pathname))).toEqual(
      new Set(['/v1/sound-generation'])
    );
  });

  it('surfaces structured API error details after retries are exhausted', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            detail: {
              type: 'authorization_error',
              code: 'insufficient_permissions',
              message: 'Sound Effects access is required',
              param: 'model_id',
              request_id: 'req-2',
            },
          }),
          { status: 403, headers: { 'content-type': 'application/json' } }
        )
    );
    const client = new ElevenLabsSoundEffectsClient({ apiKey: 'secret', fetchImpl });

    const error = await client
      .generateSoundEffect({ text: 'Pop', durationSeconds: 0.5 })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ElevenLabsApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'insufficient_permissions',
      type: 'authorization_error',
      param: 'model_id',
      requestId: 'req-2',
    });
    expect(error.message).toContain('Sound Effects access is required');
  });

  it('validates every paid request before fetch can run', () => {
    expect(() => normalizeSoundEffectRequest({ text: 'Pop', durationSeconds: 0.49 })).toThrow(
      /between 0.5 and 30/
    );
    expect(() => normalizeSoundEffectRequest({ text: 'Pop', promptInfluence: 1.1 })).toThrow(
      /between 0 and 1/
    );
    expect(() => normalizeSoundEffectRequest({ text: 'Pop', modelId: 'another-model' })).toThrow(
      /eleven_text_to_sound_v2/
    );
    expect(OUTPUT_FORMATS).toHaveLength(21);
  });
});
