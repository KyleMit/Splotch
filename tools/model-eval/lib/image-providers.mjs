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
import { ORCHESTRATOR_MODEL } from './model-eval.mjs';

// Tighten every configurable Gemini harm category to its most aggressive
// setting, matching the production adapter.
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

// The three canonical OpenAI image sizes, keyed by the shape of the input
// canvas. Gemini infers the aspect from the drawing it is handed; the image tool
// has to be told, and an aspect mismatch would letterbox the child's own
// composition, so the harness measures the same mapping production will send.
const OPENAI_SIZES = { square: '1024x1024', wide: '1536x1024', tall: '1024x1536' };
// Aspect ratios within this band of 1:1 are treated as square rather than
// pushed to a 3:2 canvas the drawing never filled.
const SQUARE_ASPECT_TOLERANCE = 0.15;

export function sizeForAspect(width, height) {
  if (!width || !height) return OPENAI_SIZES.square;
  const aspect = width / height;
  if (Math.abs(aspect - 1) <= SQUARE_ASPECT_TOLERANCE) return OPENAI_SIZES.square;
  return aspect > 1 ? OPENAI_SIZES.wide : OPENAI_SIZES.tall;
}

const firstLine = (err) => (err?.message || String(err)).split('\n')[0];

// Gemini can throw on blocked content rather than answering with a block reason,
// and the production adapter routes that to its refusal path. Mirrored here so a
// refused drawing is not counted as an upstream error — which would understate
// the refusal column the safety headline is read off.
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

// The prose the orchestrator answers with when it declines to call the image
// tool. A `refusal` content part is the SDK's typed decline; a plain `text` part
// is the model following the system instruction's "reply with one short
// sentence" — both mean the same thing to the child.
function openAiMessageText(response) {
  return (response?.output ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .map((part) => part.refusal ?? part.text ?? '')
    .join(' ')
    .trim();
}

async function callOpenAi({ apiKey, variant, image, prompt, systemInstruction, timeoutMs }) {
  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  let response;
  try {
    response = await client.responses.create({
      model: ORCHESTRATOR_MODEL,
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
          size: sizeForAspect(image.width, image.height),
        },
      ],
    });
  } catch (err) {
    // A request the safety system rejects outright never becomes a response, so
    // it has to be recovered from the thrown error to land as a refusal.
    if (err?.code === 'moderation_blocked') {
      return { kind: 'refusal', reason: 'moderation_blocked', usage: null };
    }
    return { kind: 'error', reason: firstLine(err), usage: null };
  }

  const usage = openAiUsage(response);
  const call = (response.output ?? []).find((item) => item.type === 'image_generation_call');
  if (call?.result) {
    return {
      kind: 'image',
      data: call.result,
      mimeType: `image/${call.output_format || 'png'}`,
      usage,
      finishReason: call.status ?? null,
      revisedPrompt: call.revised_prompt ?? null,
    };
  }

  const text = openAiMessageText(response);
  if (text) return { kind: 'refusal', reason: text, usage, finishReason: response.status ?? null };
  // Neither a picture nor a sentence. Name the output items that did come back —
  // an image call that stopped short reads very differently from an empty
  // output list, and "completed" alone tells you neither.
  const shape = (response.output ?? [])
    .map((item) => `${item.type}${item.status ? `:${item.status}` : ''}`)
    .join(', ');
  return {
    kind: 'error',
    reason:
      response.error?.message ??
      `no image and no text (status ${response.status ?? 'unknown'}; output: ${shape || 'none'})`,
    usage,
    finishReason: response.status ?? null,
  };
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
