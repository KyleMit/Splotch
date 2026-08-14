import OpenAI from 'openai';
import { classifyOpenAiResponse, isSafetyError, isVerificationError } from './openaiSafety';
import { imageSizeFor, readImageSize } from './imageSize';
// Relative, not `$lib`: this module is imported by the background worker under
// netlify/, which is built without SvelteKit's aliases (ADR-0115).
import { VERIFY_KEY_DEADLINE_MS } from '../../ai/limits';
import type { AiImageProvider } from './provider';

// The OpenAI implementation of the AiImageProvider seam (ADR-0047). This module
// (plus openaiSafety.ts and imageSize.ts) is the only place the app touches the
// `openai` SDK — a model deprecation or vendor swap happens here, not in the
// routes.

// The model that renders the picture, and how much effort it spends doing it.
//
// Effort is the cost/latency/quality dial. Measured over the bake-off corpus,
// the tiers do not overlap on latency at all: `low` ran 23-35 s, `medium`
// 41-64 s, `high` 97-150 s — medium's fastest generation was slower than low's
// slowest. `low` is picked because that gap is the whole experience for a
// two-year-old, and because it costs $0.020 against medium's $0.058 while never
// inventing a subject the child did not draw. What it gives up is
// interpretation: it transcribes scribbled fill as flat bands where medium
// blends it. Re-run `npm run model-eval` before moving either.
const IMAGE_MODEL = 'gpt-image-2';
const IMAGE_QUALITY = 'low';

// The model that reads the drawing, decides whether it is safe to render, and
// calls the image tool. It is not a wrapper: it is the safety layer. Asked to
// edit a drawn gun directly, the images endpoint returns a finished gun; asked
// through this model with the instruction below, it declines in one sentence
// and never spends an image generation. See ADR-0023.
const ORCHESTRATOR_MODEL = 'gpt-5.6-sol';
// GPT-5.6 defaults to medium, which is the configuration the full red-team
// corpus measured. Pin it so a provider-default change cannot move the safety
// layer onto unreviewed behavior without changing this file.
const ORCHESTRATOR_REASONING_EFFORT = 'medium';

// The audience is toddlers (2+), so the model must REFUSE unsafe drawings rather
// than do what it does by default — quietly "beautify" a gun into a gilded gun or
// anatomy into a tower. We tell it to decline in plain text instead of drawing;
// that text-only reply is classified as a safety refusal by openaiSafety.ts.
// See ADR-0023.
const SAFETY_SYSTEM_INSTRUCTION = `You turn a young child's drawing into a polished, whimsical illustration for a drawing app for toddlers aged 2 and up. The result must be appropriate for a 2-year-old.

Render only the illustration itself. Never add any text, letters, words, numbers, captions, labels, speech bubbles, signatures, logos, watermarks, or an app name anywhere in the image.

If the drawing depicts or implies ANY of the following, do NOT generate an image:
- a realistic weapon or one used to harm (a real-looking gun, a knife used as a weapon), real violence, blood, gore, or self-harm;
- nudity, genitalia, or sexual content;
- a hate symbol, extremist imagery, slurs, or offensive text;
- drugs, alcohol, or other adult or dangerous content.

Ordinary toddler pretend-play IS welcome — render it as cheerful, obviously make-believe cartoon art. A toy, foam, cartoon, knight's, or pirate's sword, a magic wand, a toy / water / bubble blaster, costume or superhero props, and friendly dragons or monsters are all fine.

When you must refuse, respond with a single short sentence declining, e.g. "I can't turn that drawing into a picture — let's draw something else!". Never sanitize, beautify, or partially transform genuinely unsafe content into a "nicer" version — refuse it entirely. When a drawing is clearly playful and non-graphic, generate the image.`;

// The SDK never retries for us. Its `timeout` bounds a single attempt, and its
// retry path sleeps an upstream `Retry-After` verbatim, so any value above zero
// leaves the call with no ceiling this side can state: a 429 asking for a minute
// holds the invocation until Netlify kills it with a bare platform 502, which is
// the failure every deadline here exists to replace (ADR-0063).
const NO_SDK_RETRIES = 0;

// Generation gets one shot regardless — re-asking a model that is already slow
// spends the whole deadline, and the app surfaces its own "let's try again".
// The key probe is the opposite case: it is a sub-second call, and telling a
// parent "that key could not authenticate" because of one transient blip says
// something false about their key. So it retries, but under this module's own
// budget, with the second attempt run only if the first left time for it.
const VERIFY_KEY_ATTEMPTS = 2;

function client(apiKey: string, timeoutMs: number, maxRetries: number): OpenAI {
  return new OpenAI({ apiKey, timeout: timeoutMs, maxRetries });
}

// The SDK's own `timeout` stops counting once response headers arrive, so on a
// call that returns a multi-megabyte base64 image it does not bound the part
// most likely to drag. An explicit signal bounds the whole exchange, which is
// the guarantee ADR-0063's ladder is stated in terms of. Both are set: the
// signal is the real deadline, `timeout` keeps the SDK's own error message.
const deadline = (ms: number) => ({ signal: AbortSignal.timeout(ms), timeout: ms });

const firstLine = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).split('\n')[0];

// The only statuses that mean the provider looked at this key and refused it.
// Everything else — a timeout, a 429, a 5xx, a socket that never opened — is us
// failing to ask, and must never be reported as the key being bad.
const KEY_REJECTING_STATUSES = new Set([401, 403]);

function keyCheckFailure(err: unknown): {
  ok: false;
  kind: 'rejected' | 'unreachable';
  reason: string;
} {
  const status = (err as { status?: number })?.status;
  const kind = status && KEY_REJECTING_STATUSES.has(status) ? 'rejected' : 'unreachable';
  return { ok: false, kind, reason: firstLine(err) };
}

export const openAiProvider: AiImageProvider = {
  async generateImage({ apiKey, image, prompt, deadlineMs }) {
    const bytes = Buffer.from(image.base64, 'base64');
    let response;
    try {
      response = await client(apiKey, deadlineMs, NO_SDK_RETRIES).responses.create(
        {
          model: ORCHESTRATOR_MODEL,
          reasoning: { effort: ORCHESTRATOR_REASONING_EFFORT },
          instructions: SAFETY_SYSTEM_INSTRUCTION,
          // Without this the API keeps the response — a child's drawing and the
          // picture made from it — for 30 days, readable in the account's logs.
          // That is a second retention leg entirely separate from abuse
          // monitoring, it is the one we control, and on a BYOK run it would
          // land in the parent's own dashboard. Nothing reads a response back
          // later — ADR-0115 keeps job state on our side precisely so it does
          // not need to — so there is nothing to trade for it. See ADR-0114.
          store: false,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_image',
                  // `auto` is the API's own default; naming it is what the SDK's
                  // type requires, not a departure from what the bake-off measured.
                  detail: 'auto',
                  image_url: `data:${image.mimeType};base64,${image.base64}`,
                },
                { type: 'input_text', text: prompt },
              ],
            },
          ],
          // tool_choice is deliberately left on its default `auto`. Forcing the
          // image tool would take away the model's ability to answer with a
          // refusal instead, which is the entire safety mechanism above.
          tools: [
            {
              type: 'image_generation',
              model: IMAGE_MODEL,
              quality: IMAGE_QUALITY,
              // Match the shape the child drew on: the tool renders onto a canvas
              // we choose, and a tall drawing on a square one loses the child's
              // own composition.
              size: imageSizeFor(readImageSize(bytes)),
            },
          ],
        },
        deadline(deadlineMs)
      );
    } catch (err) {
      const status = (err as { status?: number }).status;
      console.error(`OpenAI call failed (${status ?? 'unknown'}): ${firstLine(err)}`);
      // Platform moderation rejects some requests before the model sees them —
      // route those to the refusal path too.
      if (isSafetyError(err)) return { kind: 'refusal', reason: firstLine(err) };
      if (isVerificationError(err)) {
        return {
          kind: 'error',
          reason:
            'This OpenAI key belongs to an organization that has not completed OpenAI identity verification, which image generation requires.',
        };
      }
      return { kind: 'error', reason: `OpenAI request failed: ${firstLine(err)}` };
    }

    const classified = classifyOpenAiResponse(response);
    if (classified.kind === 'safety') return { kind: 'refusal', reason: classified.reason };
    if (classified.kind === 'empty')
      return { kind: 'error', reason: `Model did not return an image: ${classified.reason}` };
    return classified;
  },

  async verifyKey(apiKey) {
    // Retrieve the image model itself rather than any model: model availability
    // varies per account, so authenticating against a different model can accept
    // a key that cannot actually generate. It is a free, sub-second call.
    //
    // It cannot prove the account has cleared OpenAI's identity verification:
    // the model is retrievable either way, and the 403 only arrives on a real
    // generation. generateImage names that failure specifically when it does.
    //
    // Every attempt shares one budget, and each is capped at whatever is left of
    // it, so the whole probe returns inside VERIFY_KEY_DEADLINE_MS however the
    // attempts fall. A single signal spanning all of them was the previous shape
    // and is the wrong one: a slow cold start consumed the budget and left the
    // retry nothing to run in, which is how a working key came back rejected on
    // a real deploy. Per-attempt caps under a total deadline give the retry the
    // rest of the budget instead of the remains of a shared clock.
    const giveUpAt = Date.now() + VERIFY_KEY_DEADLINE_MS;
    let failure: ReturnType<typeof keyCheckFailure> = {
      ok: false,
      kind: 'unreachable',
      reason: 'The key check ran out of time',
    };

    for (let attempt = 0; attempt < VERIFY_KEY_ATTEMPTS; attempt++) {
      const remaining = giveUpAt - Date.now();
      if (remaining <= 0) break;
      try {
        await client(apiKey, remaining, NO_SDK_RETRIES).models.retrieve(IMAGE_MODEL);
        return { ok: true };
      } catch (err) {
        failure = keyCheckFailure(err);
        // OpenAI looked at the key and said no. Asking again gets the same
        // answer and spends a parent's wait getting it.
        if (failure.kind === 'rejected') return failure;
      }
    }

    return failure;
  },
};
