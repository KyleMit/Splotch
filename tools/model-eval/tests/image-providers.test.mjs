import { describe, expect, it, vi } from 'vitest';
import {
  classifyOpenAiResponse,
  isSafetyError,
} from '../../../web/src/lib/server/ai/openaiSafety.ts';
import { callVariant } from '../lib/image-providers.mjs';
import { VARIANTS } from '../lib/model-eval.mjs';

const openAi = vi.hoisted(() => ({ answer: null }));
vi.mock('openai', () => ({
  default: class {
    responses = {
      create: async () => {
        if (openAi.answer.thrown) throw openAi.answer.thrown;
        return openAi.answer.response;
      },
    };
  },
}));

const variant = VARIANTS.find((v) => v.provider === 'openai');

function callWith(answer) {
  openAi.answer = answer;
  return callVariant(variant, {
    apiKeys: { openai: 'unused-by-the-mocked-client' },
    image: { base64: '', mimeType: 'image/png', width: 1024, height: 1024 },
    prompt: '',
    systemInstruction: '',
    timeoutMs: 1,
  });
}

const DECLINE = "I can't turn that drawing into a picture — let's draw something else!";
const imageCall = (fields = {}) => ({
  type: 'image_generation_call',
  status: 'completed',
  result: 'AAAA',
  output_format: 'png',
  ...fields,
});
const message = (...content) => ({ type: 'message', status: 'completed', content });
const refusalPart = { type: 'refusal', refusal: DECLINE };
const respond = (response) => ({ response });
const throwing = (thrown) => ({ thrown });
const moderationBlock = Object.assign(new Error('400 Rejected'), {
  status: 400,
  code: 'moderation_blocked',
});

// The bake-off's vocabulary for production's classifications.
const PRODUCTION_KIND = { image: 'image', safety: 'refusal', empty: 'error' };

function productionKind({ response, thrown }) {
  if (thrown) return isSafetyError(thrown) ? 'refusal' : 'error';
  return PRODUCTION_KIND[classifyOpenAiResponse(response).kind];
}

describe('the OpenAI adapter counts a response the way the app treats it', () => {
  it.each([
    ['a completed image', 'image', respond({ status: 'completed', output: [imageCall()] })],
    [
      'a prose-only decline',
      'refusal',
      respond({ status: 'completed', output: [message({ type: 'output_text', text: DECLINE })] }),
    ],
    ['a moderation block thrown before any response', 'refusal', throwing(moderationBlock)],
    ['an ordinary thrown failure', 'error', throwing(new Error('socket hang up'))],
    ['an empty output list', 'error', respond({ output: [] })],
    // Each row below carries a machine-readable signal (a typed refusal, a policy
    // code, a filter stop, a failed tool call) that decides the cell ahead of any
    // picture or prose.
    [
      'a completed image beside a refusal part',
      'refusal',
      respond({ status: 'completed', output: [imageCall(), message(refusalPart)] }),
    ],
    [
      'a policy error code with no prose',
      'refusal',
      respond({
        status: 'failed',
        output: [],
        error: { code: 'image_content_policy_violation', message: 'Blocked by policy.' },
      }),
    ],
    [
      'a content_filter stop with no prose',
      'refusal',
      respond({
        status: 'incomplete',
        output: [],
        incomplete_details: { reason: 'content_filter' },
      }),
    ],
    [
      'a failed image call beside an apology',
      'error',
      respond({
        status: 'completed',
        output: [
          imageCall({ status: 'failed', result: null }),
          message({ type: 'output_text', text: "Sorry, I couldn't finish that." }),
        ],
      }),
    ],
  ])('%s is counted as %s', async (_shape, expected, answer) => {
    const { kind } = await callWith(answer);
    expect(kind).toBe(expected);
    expect(kind).toBe(productionKind(answer));
  });

  it.each([
    [
      'a refusal beside a finished picture leads with the declines that discarded it',
      [imageCall(), message(refusalPart)],
      `(image discarded: refusal part) ${DECLINE}`,
    ],
    ['a refusal with no picture keeps the decline as its reason', [message(refusalPart)], DECLINE],
  ])('%s', async (_case, output, reason) => {
    expect(await callWith(respond({ status: 'completed', output }))).toMatchObject({
      kind: 'refusal',
      reason,
      finishReason: 'completed',
    });
  });

  it("keeps the image call's status and revised prompt on an image row", async () => {
    const call = imageCall({ output_format: 'webp', revised_prompt: 'A cheerful cat' });
    expect(await callWith(respond({ status: 'completed', output: [call] }))).toMatchObject({
      kind: 'image',
      data: 'AAAA',
      mimeType: 'image/webp',
      finishReason: 'completed',
      revisedPrompt: 'A cheerful cat',
    });
  });
});
