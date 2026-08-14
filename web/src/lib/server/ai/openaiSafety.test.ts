import { describe, it, expect } from 'vitest';
import type { Response as OpenAiResponse } from 'openai/resources/responses/responses';
import { classifyOpenAiResponse, isSafetyError, isVerificationError } from './openaiSafety';

// Minimal synthetic responses — we only care about the few fields the classifier
// reads, so cast through `unknown` rather than building full SDK objects.
const resp = (value: unknown) => value as OpenAiResponse;

const imageCall = (overrides: Record<string, unknown> = {}) => ({
  type: 'image_generation_call',
  status: 'completed',
  result: 'AAAA',
  output_format: 'png',
  ...overrides,
});

const message = (content: unknown[]) => ({ type: 'message', status: 'completed', content });

describe('classifyOpenAiResponse', () => {
  it('returns the image when the tool produced one', () => {
    expect(classifyOpenAiResponse(resp({ status: 'completed', output: [imageCall()] }))).toEqual({
      kind: 'image',
      data: 'AAAA',
      mimeType: 'image/png',
    });
  });

  it('carries the tool output format through to the mime type', () => {
    const r = classifyOpenAiResponse(
      resp({ status: 'completed', output: [imageCall({ output_format: 'webp' })] })
    );
    expect(r).toMatchObject({ kind: 'image', mimeType: 'image/webp' });
  });

  it('defaults a missing output format to image/png', () => {
    const r = classifyOpenAiResponse(
      resp({ status: 'completed', output: [imageCall({ output_format: undefined })] })
    );
    expect(r).toMatchObject({ kind: 'image', mimeType: 'image/png' });
  });

  it('treats a prose-only reply (no image) as a safety refusal', () => {
    const r = classifyOpenAiResponse(
      resp({
        status: 'completed',
        output: [
          message([{ type: 'output_text', text: "I can't turn that drawing into a picture." }]),
        ],
      })
    );
    expect(r).toEqual({
      kind: 'safety',
      reason: "I can't turn that drawing into a picture.",
    });
  });

  it('treats the SDK typed refusal part as a safety refusal', () => {
    const r = classifyOpenAiResponse(
      resp({
        status: 'completed',
        output: [message([{ type: 'refusal', refusal: 'I cannot help with that.' }])],
      })
    );
    expect(r).toEqual({ kind: 'safety', reason: 'I cannot help with that.' });
  });

  it('prefers the image when the model both drew and commented', () => {
    const r = classifyOpenAiResponse(
      resp({
        status: 'completed',
        output: [imageCall(), message([{ type: 'output_text', text: 'Here you go!' }])],
      })
    );
    expect(r).toMatchObject({ kind: 'image' });
  });

  it('treats an image call that returned no bytes as empty (try again)', () => {
    const r = classifyOpenAiResponse(
      resp({ status: 'completed', output: [imageCall({ result: null, status: 'incomplete' })] })
    );
    expect(r).toMatchObject({ kind: 'empty' });
    // The failure has to name what came back — "completed" alone cannot tell a
    // stalled image call apart from an empty output list.
    expect((r as { reason: string }).reason).toContain('image_generation_call:incomplete');
  });

  it('treats a blank/whitespace reply as empty, not a refusal', () => {
    const r = classifyOpenAiResponse(
      resp({ status: 'completed', output: [message([{ type: 'output_text', text: '   ' }])] })
    );
    expect(r).toMatchObject({ kind: 'empty' });
  });

  it('treats a response with no output at all as empty', () => {
    const r = classifyOpenAiResponse(resp({ status: 'completed', output: [] }));
    expect(r).toMatchObject({ kind: 'empty' });
    expect((r as { reason: string }).reason).toContain('none');
  });

  it('surfaces an upstream error message when the response carries one', () => {
    const r = classifyOpenAiResponse(
      resp({ status: 'failed', output: [], error: { message: 'upstream exploded' } })
    );
    expect(r).toEqual({ kind: 'empty', reason: 'upstream exploded' });
  });
});

describe('isSafetyError', () => {
  it('treats a platform moderation block as a safety error', () => {
    expect(
      isSafetyError(
        Object.assign(new Error('rejected by the safety system'), {
          status: 400,
          code: 'moderation_blocked',
        })
      )
    ).toBe(true);
  });

  it('does not treat quota, auth, or transport errors as safety errors', () => {
    expect(
      isSafetyError(
        Object.assign(new Error('Rate limit reached'), { status: 429, code: 'rate_limit_exceeded' })
      )
    ).toBe(false);
    expect(
      isSafetyError(
        Object.assign(new Error('Incorrect API key'), { status: 401, code: 'invalid_api_key' })
      )
    ).toBe(false);
    expect(isSafetyError(new Error('socket hang up'))).toBe(false);
  });
});

describe('isVerificationError', () => {
  it('recognises the unverified-organization rejection', () => {
    const err = Object.assign(
      new Error('Your organization must be verified to use the model `gpt-image-2`.'),
      { status: 403 }
    );
    expect(isVerificationError(err)).toBe(true);
  });

  it('does not claim any other 403 is a verification problem', () => {
    expect(
      isVerificationError(Object.assign(new Error('Country not supported'), { status: 403 }))
    ).toBe(false);
  });

  it('does not fire on a non-403 that merely mentions verification', () => {
    expect(
      isVerificationError(
        Object.assign(new Error('please verify your organization'), { status: 500 })
      )
    ).toBe(false);
  });
});
