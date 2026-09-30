// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// A refusal that threw no finished picture away.
const refused = (reason: string) => ({ kind: 'safety', reason, imageDiscardedBy: [] });

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
    expect(r).toEqual(refused("I can't turn that drawing into a picture."));
  });

  it('treats the SDK typed refusal part as a safety refusal', () => {
    const r = classifyOpenAiResponse(
      resp({
        status: 'completed',
        output: [message([{ type: 'refusal', refusal: 'I cannot help with that.' }])],
      })
    );
    expect(r).toEqual(refused('I cannot help with that.'));
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

  it('keeps a failed image call retryable even when the model apologised for it', () => {
    // The tool ran and broke. An apology alongside it is not the model declining
    // the drawing, and filing it as a refusal would tell the child to draw
    // something different when the same drawing would have worked.
    const r = classifyOpenAiResponse(
      resp({
        status: 'completed',
        output: [
          imageCall({ result: null, status: 'failed' }),
          message([{ type: 'output_text', text: "Sorry, I couldn't finish that." }]),
        ],
      })
    );
    expect(r).toMatchObject({ kind: 'empty' });
  });

  it.each(['image_content_policy_violation', 'invalid_prompt', 'bio_policy'])(
    'reads a %s policy block off the error code rather than waiting for prose',
    (code) => {
      const r = classifyOpenAiResponse(
        resp({ status: 'failed', output: [], error: { code, message: 'blocked by policy' } })
      );
      expect(r).toEqual(refused('blocked by policy'));
    }
  );

  it('does not treat an ordinary upstream error code as a policy block', () => {
    const r = classifyOpenAiResponse(
      resp({ status: 'failed', output: [], error: { code: 'server_error', message: 'boom' } })
    );
    expect(r).toMatchObject({ kind: 'empty' });
  });

  it('honours a typed refusal even when the image tool also failed', () => {
    // A `refusal` content part is machine-readable in exactly the way the error
    // codes are, so it outranks any reasoning about what the tool did. Filing it
    // as retryable would offer the child the same drawing the model just
    // declined.
    const r = classifyOpenAiResponse(
      resp({
        status: 'completed',
        output: [
          imageCall({ result: null, status: 'failed' }),
          message([{ type: 'refusal', refusal: 'I cannot help with that.' }]),
        ],
      })
    );
    expect(r).toEqual(refused('I cannot help with that.'));
  });

  it('reads a content-filter stop off incomplete_details', () => {
    const r = classifyOpenAiResponse(
      resp({ status: 'incomplete', output: [], incomplete_details: { reason: 'content_filter' } })
    );
    expect(r).toEqual(refused('content_filter'));
  });

  it('prefers the policy error message over a content-filter stop', () => {
    const r = classifyOpenAiResponse(
      resp({
        status: 'incomplete',
        output: [],
        error: { code: 'bio_policy', message: 'blocked by policy' },
        incomplete_details: { reason: 'content_filter' },
      })
    );
    expect(r).toEqual(refused('blocked by policy'));
  });

  it('falls back to the policy error code when its message is empty', () => {
    const r = classifyOpenAiResponse(
      resp({
        status: 'incomplete',
        output: [],
        error: { code: 'bio_policy', message: '' },
        incomplete_details: { reason: 'content_filter' },
      })
    );
    expect(r).toEqual(refused('bio_policy'));
  });

  it('does not mistake a non-policy incomplete reason for a refusal', () => {
    const r = classifyOpenAiResponse(
      resp({
        status: 'incomplete',
        output: [],
        incomplete_details: { reason: 'max_output_tokens' },
      })
    );
    expect(r).toMatchObject({ kind: 'empty' });
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

// ADR-0023's 2026-09 amendment: a machine-readable decline outranks a completed
// image beside it. Each signal is pinned on its own, so narrowing the rule for
// one of them is a deliberate edit here rather than a silent reorder.
describe('classifyOpenAiResponse with a completed image beside a decline', () => {
  const REFUSAL_TEXT = 'I cannot draw the thing in this picture.';
  const POLICY_MESSAGE = 'The drawing shows something blocked by policy.';
  const IMAGE = { kind: 'image', data: 'AAAA', mimeType: 'image/png' };
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // The classifier is a pure query; the adapter owns the log line.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it.each([
    {
      decline: 'a typed refusal part',
      response: {
        status: 'completed',
        output: [imageCall(), message([{ type: 'refusal', refusal: REFUSAL_TEXT }])],
      },
      reason: REFUSAL_TEXT,
      discardedBy: ['refusal part'],
    },
    {
      decline: 'a policy error code',
      response: {
        status: 'failed',
        output: [imageCall()],
        error: {
          code: 'image_content_policy_violation',
          message: POLICY_MESSAGE,
        },
      },
      reason: POLICY_MESSAGE,
      discardedBy: ['error.code=image_content_policy_violation'],
    },
    {
      decline: 'a content_filter stop',
      response: {
        status: 'incomplete',
        output: [imageCall()],
        incomplete_details: { reason: 'content_filter' },
      },
      reason: 'content_filter',
      discardedBy: ['incomplete_details.reason=content_filter'],
    },
  ])(
    'refuses over $decline and names only what discarded the image',
    ({ response, reason, discardedBy }) => {
      // An exact match, so the image bytes go nowhere and the names carry
      // neither the refusal prose nor the policy message: either one can
      // describe the child's drawing.
      expect(classifyOpenAiResponse(resp(response))).toEqual({
        kind: 'safety',
        reason,
        imageDiscardedBy: discardedBy,
      });
    }
  );

  it('names every decline that discarded the image', () => {
    const r = classifyOpenAiResponse(
      resp({
        status: 'incomplete',
        output: [imageCall(), message([{ type: 'refusal', refusal: REFUSAL_TEXT }])],
        error: { code: 'bio_policy', message: POLICY_MESSAGE },
        incomplete_details: { reason: 'content_filter' },
      })
    );
    expect(r).toEqual({
      kind: 'safety',
      reason: POLICY_MESSAGE,
      imageDiscardedBy: [
        'error.code=bio_policy',
        'incomplete_details.reason=content_filter',
        'refusal part',
      ],
    });
  });

  it('does not name a blank refusal part that sits beside a real decline', () => {
    const r = classifyOpenAiResponse(
      resp({
        status: 'incomplete',
        output: [imageCall(), message([{ type: 'refusal', refusal: '   ' }])],
        incomplete_details: { reason: 'content_filter' },
      })
    );
    expect(r).toEqual({
      kind: 'safety',
      reason: 'content_filter',
      imageDiscardedBy: ['incomplete_details.reason=content_filter'],
    });
  });

  it('still refuses when a malformed message part sits beside the refusal', () => {
    const r = classifyOpenAiResponse(
      resp({
        status: 'completed',
        output: [
          imageCall(),
          message([null, 'stray text', { type: 'refusal', refusal: REFUSAL_TEXT }]),
        ],
      })
    );
    expect(r).toEqual({
      kind: 'safety',
      reason: REFUSAL_TEXT,
      imageDiscardedBy: ['refusal part'],
    });
  });

  it('still delivers the image when the malformed parts beside it decline nothing', () => {
    // The refusal reader runs before the image is read, so a part it cannot
    // parse is skipped rather than thrown on, and does not count as a decline.
    const r = classifyOpenAiResponse(
      resp({
        status: 'completed',
        output: [imageCall(), message([null, 'stray text', 42, { type: 'refusal', refusal: 7 }])],
      })
    );
    expect(r).toEqual(IMAGE);
  });

  it.each([
    {
      label: 'an image alone',
      response: { status: 'completed', output: [imageCall()] },
    },
    {
      label: 'an image with a comment',
      response: {
        status: 'completed',
        output: [imageCall(), message([{ type: 'output_text', text: 'Here you go!' }])],
      },
    },
    {
      label: 'an image beside a blank refusal part',
      response: {
        status: 'completed',
        output: [imageCall(), message([{ type: 'refusal', refusal: '   ' }])],
      },
    },
    {
      label: 'an image beside a non-policy stop',
      response: {
        status: 'incomplete',
        output: [imageCall()],
        incomplete_details: { reason: 'max_output_tokens' },
      },
    },
    {
      label: 'an image beside an ordinary error code',
      response: {
        status: 'failed',
        output: [imageCall()],
        error: { code: 'server_error', message: 'boom' },
      },
    },
  ])('delivers $label, which carries no decline', ({ response }) => {
    expect(classifyOpenAiResponse(resp(response))).toEqual(IMAGE);
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
