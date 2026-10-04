// One call per bake-off cell, normalized across vendors.
//
// Both adapters answer the same three outcomes the app cares about — an image,
// a safety refusal (the child should draw something else), or a genuine failure
// — and the same provider-neutral token usage, so the report can put a Gemini
// cell and an OpenAI cell in the same column without special-casing either.
//
// The OpenAI adapter deliberately goes through the **Responses API image
// generation tool** rather than `/v1/images/edits`, because that is the shape
// production ships: `/edits` accepts no system instruction and answers a blocked
// drawing with an HTTP 400 (or, measured on this corpus, with a picture), while
// the Responses API keeps the child-safety instruction a real system instruction
// and lets the model decline in the prose the app turns into its 422.

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import OpenAI from 'openai';
import { imageSizeFor } from '../../../web/src/lib/server/ai/imageSize.ts';
import {
  classifyOpenAiResponse,
  isSafetyError,
} from '../../../web/src/lib/server/ai/openaiSafety.ts';
import { ORCHESTRATOR_MODEL, ORCHESTRATOR_REASONING_EFFORT } from './model-eval.mjs';

// Tighten every configurable Gemini harm category to its most aggressive
// setting: the configuration the app's Gemini adapter shipped with, kept so the
// historical baseline is measured as it was served.
const GEMINI_SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_HARASSMENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE }));

// finishReason / blockReason values that mean Gemini deliberately withheld
// content on policy grounds — distinct from a transport or server error.
const GEMINI_SAFETY_REASONS = new Set([
  'SAFETY',
  'IMAGE_SAFETY',
  'PROHIBITED_CONTENT',
  'RECITATION',
  'BLOCKLIST',
  'SPII',
]);

// Gemini infers the aspect from the drawing it is handed; the image tool has to
// be told, and an aspect mismatch would letterbox the child's own composition,
// so the harness asks production's own mapping. Unread dimensions arrive as 0,
// which production's header reader reports as null, so both render square.
const imageToolSize = ({ width, height }) =>
  imageSizeFor(width && height ? { width, height } : null);

const firstLine = (err) => (err?.message || String(err)).split('\n')[0];

// Gemini can throw on blocked content rather than answering with a block reason,
// and the app's Gemini adapter routed that to its refusal path. This baseline
// adapter keeps that rule, so a refused drawing is not counted as an upstream
// error — which would understate the refusal column the safety headline is read
// off.
function isGeminiSafetyError(err) {
  const status = err?.status;
  const message = firstLine(err).toUpperCase();
  // A 400 INVALID_ARGUMENT is a *request* error, not a content refusal — don't
  // let category names inside such a message look like a safety block.
  if (/INVALID_ARGUMENT|INVALID VALUE AT/.test(message)) return false;
  if (status === 400 && /BLOCKED|PROHIBIT|SAFETY POLICY/.test(message)) return true;
  return /PROHIBITED_CONTENT|IMAGE_SAFETY/.test(message);
}

function geminiUsage(metadata) {
  if (!metadata) return null;
  const imageOut =
    metadata.candidatesTokensDetails?.find((entry) => entry.modality === 'IMAGE')?.tokenCount ?? 0;
  return {
    // Gemini reports one prompt total rather than splitting text from image, and
    // its input rate is the same either way, so the whole prompt is booked as
    // image input and the text leg stays zero.
    textInTokens: 0,
    imageInTokens: metadata.promptTokenCount ?? 0,
    textOutTokens: Math.max(0, (metadata.candidatesTokenCount ?? 0) - imageOut),
    imageOutTokens: imageOut,
  };
}

async function callGemini({ apiKey, variant, image, prompt, systemInstruction, timeoutMs }) {
  const ai = new GoogleGenAI({ apiKey });
  let response;
  try {
    response = await ai.models.generateContent({
      model: variant.model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: image.mimeType, data: image.base64 } },
            { text: prompt },
          ],
        },
      ],
      config: {
        abortSignal: AbortSignal.timeout(timeoutMs),
        systemInstruction,
        safetySettings: GEMINI_SAFETY_SETTINGS,
      },
    });
  } catch (err) {
    if (isGeminiSafetyError(err)) return { kind: 'refusal', reason: firstLine(err), usage: null };
    return { kind: 'error', reason: firstLine(err), usage: null };
  }

  const usage = geminiUsage(response.usageMetadata);
  const blockReason = response?.promptFeedback?.blockReason;
  if (blockReason) return { kind: 'refusal', reason: String(blockReason), usage };

  const candidate = response?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const finishReason = candidate?.finishReason ?? null;

  const imagePart = parts.find((part) => part.inlineData?.data);
  if (imagePart) {
    return {
      kind: 'image',
      data: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || 'image/png',
      usage,
      finishReason,
    };
  }
  if (finishReason && GEMINI_SAFETY_REASONS.has(String(finishReason))) {
    return { kind: 'refusal', reason: String(finishReason), usage, finishReason };
  }
  const textPart = parts.find((part) => typeof part.text === 'string' && part.text.trim());
  if (textPart) return { kind: 'refusal', reason: textPart.text.trim(), usage, finishReason };
  return { kind: 'error', reason: String(finishReason ?? 'empty'), usage, finishReason };
}

function openAiUsage(response) {
  const tool = response?.tool_usage?.image_gen ?? null;
  const orchestrator = response?.usage ?? null;
  if (!tool && !orchestrator) return null;
  return {
    textInTokens: tool?.input_tokens_details?.text_tokens ?? 0,
    imageInTokens: tool?.input_tokens_details?.image_tokens ?? 0,
    textOutTokens: tool?.output_tokens_details?.text_tokens ?? 0,
    imageOutTokens: tool?.output_tokens_details?.image_tokens ?? 0,
    orchInTokens: orchestrator?.input_tokens ?? 0,
    orchCachedTokens: orchestrator?.input_tokens_details?.cached_tokens ?? 0,
    orchOutTokens: orchestrator?.output_tokens ?? 0,
  };
}

// The app discards a finished picture that arrived beside a machine-readable
// decline, and production's classifier names those declines. `resultRow` in
// run-model-evaluation.mjs keeps only the reason, and the report prints it
// through `firstSentence`, so the names go first: after the decline's own
// sentence they would never be shown.
function refusalReason({ reason, imageDiscardedBy }) {
  if (imageDiscardedBy.length === 0) return reason;
  return `(image discarded: ${imageDiscardedBy.join(', ')}) ${reason}`;
}

async function callOpenAi({
  apiKey,
  variant,
  image,
  prompt,
  systemInstruction,
  timeoutMs,
  imageToolOverrides = {},
}) {
  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  let response;
  try {
    response = await client.responses.create({
      model: ORCHESTRATOR_MODEL,
      reasoning: { effort: ORCHESTRATOR_REASONING_EFFORT },
      instructions: systemInstruction,
      // The same invariant production holds (ADR-0114). The corpus here is
      // synthetic rather than a child's drawing, so this is not the privacy
      // blocker that one is — but a bake-off run is 150-odd responses retained
      // for 30 days under whoever's key ran it, with nothing that ever reads
      // them back. "Every request" should mean every request.
      store: false,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_image', image_url: `data:${image.mimeType};base64,${image.base64}` },
            { type: 'input_text', text: prompt },
          ],
        },
      ],
      // tool_choice stays on auto: forcing the image tool would take the
      // model's ability to decline away, which is the safety behaviour this
      // whole path is chosen for.
      tools: [
        {
          type: 'image_generation',
          model: variant.model,
          quality: variant.quality,
          size: imageToolSize(image),
          // Experiment-only extra tool params (e.g. input_fidelity) from the
          // adherence lab; production parity holds when this is absent.
          ...imageToolOverrides,
        },
      ],
    });
  } catch (err) {
    // A request the safety system rejects outright never becomes a response, so
    // it has to be recovered from the thrown error to land as a refusal.
    if (isSafetyError(err)) return { kind: 'refusal', reason: 'moderation_blocked', usage: null };
    return { kind: 'error', reason: firstLine(err), usage: null };
  }

  // Production's own classifier decides the outcome, so a cell counts as a
  // refusal or an error exactly when the app would refuse it or offer a retry.
  const usage = openAiUsage(response);
  const classified = classifyOpenAiResponse(response);
  if (classified.kind === 'image') {
    const call = response.output.find((item) => item.type === 'image_generation_call');
    return {
      kind: 'image',
      data: classified.data,
      mimeType: classified.mimeType,
      usage,
      finishReason: call?.status ?? null,
      revisedPrompt: call?.revised_prompt ?? null,
    };
  }
  const finishReason = response.status ?? null;
  if (classified.kind === 'safety') {
    return { kind: 'refusal', reason: refusalReason(classified), usage, finishReason };
  }
  return { kind: 'error', reason: classified.reason, usage, finishReason };
}

const ADAPTERS = { gemini: callGemini, openai: callOpenAi };

/**
 * Run one bake-off cell and time it. Never throws: a failed call is a
 * `kind: 'error'` row so one bad cell can't lose the rest of the run.
 */
export async function callVariant(variant, context) {
  const adapter = ADAPTERS[variant.provider];
  if (!adapter) throw new Error(`Unknown provider "${variant.provider}" on ${variant.key}`);
  const apiKey = context.apiKeys[variant.provider];
  if (!apiKey) throw new Error(`No API key configured for provider "${variant.provider}"`);

  const started = performance.now();
  try {
    const result = await adapter({ ...context, apiKey, variant });
    return { ...result, ms: Math.round(performance.now() - started) };
  } catch (err) {
    return {
      kind: 'error',
      reason: firstLine(err),
      usage: null,
      ms: Math.round(performance.now() - started),
    };
  }
}
