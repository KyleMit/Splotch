import { describe, it, expect } from 'vitest';
import type { GenerateContentResponse } from '@google/genai';
import { classifyGeminiResponse, isSafetyError } from './aiSafety';

// Minimal synthetic responses — we only care about the few fields the classifier
// reads, so cast through `unknown` rather than building full SDK objects.
const resp = (value: unknown) => value as GenerateContentResponse;

describe('classifyGeminiResponse', () => {
  it('returns the image part when the model produced one', () => {
    const r = classifyGeminiResponse(
      resp({
        candidates: [
          { content: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'image/png' } }] } },
        ],
      })
    );
    expect(r).toEqual({ kind: 'image', data: 'AAAA', mimeType: 'image/png' });
  });

  it('defaults a missing mimeType to image/png', () => {
    const r = classifyGeminiResponse(
      resp({ candidates: [{ content: { parts: [{ inlineData: { data: 'AAAA' } }] } }] })
    );
    expect(r).toMatchObject({ kind: 'image', mimeType: 'image/png' });
  });

  it('flags a prompt-level block as safety', () => {
    const r = classifyGeminiResponse(
      resp({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } })
    );
    expect(r).toEqual({ kind: 'safety', reason: 'PROHIBITED_CONTENT' });
  });

  it('flags an IMAGE_SAFETY finishReason as safety', () => {
    const r = classifyGeminiResponse(
      resp({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] })
    );
    expect(r).toEqual({ kind: 'safety', reason: 'IMAGE_SAFETY' });
  });

  it('treats a prose-only refusal (no image) as a safety refusal', () => {
    const r = classifyGeminiResponse(
      resp({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  text: 'I cannot fulfill this request. The original image contains offensive content.',
                },
              ],
            },
          },
        ],
      })
    );
    expect(r).toEqual({
      kind: 'safety',
      reason: 'I cannot fulfill this request. The original image contains offensive content.',
    });
  });

  it('treats a response with no content at all as empty (try again)', () => {
    const r = classifyGeminiResponse(resp({ candidates: [{ content: { parts: [] } }] }));
    expect(r).toMatchObject({ kind: 'empty' });
  });

  it('treats a blank/whitespace text part as empty, not a refusal', () => {
    const r = classifyGeminiResponse(
      resp({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '   ' }] } }] })
    );
    expect(r).toMatchObject({ kind: 'empty' });
  });
});

describe('isSafetyError', () => {
  it('treats a 400 with a safety message as a safety error', () => {
    expect(
      isSafetyError(Object.assign(new Error('Request blocked for SAFETY'), { status: 400 }))
    ).toBe(true);
  });

  it('treats a prohibited-content message as a safety error regardless of status', () => {
    expect(isSafetyError(new Error('PROHIBITED_CONTENT in request'))).toBe(true);
  });

  it('does not treat quota/auth errors as safety errors', () => {
    expect(isSafetyError(Object.assign(new Error('Resource exhausted'), { status: 429 }))).toBe(
      false
    );
    expect(isSafetyError(Object.assign(new Error('API key invalid'), { status: 401 }))).toBe(false);
  });

  it('does not treat a 400 validation error as a safety error (category names in the message)', () => {
    const err = Object.assign(
      new Error(
        `Invalid value at 'safety_settings[0].category' (HarmCategory), "HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT". status: INVALID_ARGUMENT`
      ),
      { status: 400 }
    );
    expect(isSafetyError(err)).toBe(false);
  });
});
