import { error, isHttpError } from '@sveltejs/kit';
import {
  ACCESS_TOKEN_HEADER,
  API_KEY_HEADER,
  FREE_GENERATIONS_REMAINING_HEADER,
  INSTALLATION_ID_HEADER,
  REPORT_TOKEN_HEADER,
} from '$lib/apiHeaders';
import { issueReportToken, type ReportTokenBinding } from '$lib/server/reportToken';
import {
  FREE_DAILY_LIMIT_EXHAUSTED_CODE,
  FREE_GENERATION_LIMIT,
  FREE_GRANT_EXHAUSTED_CODE,
  type FreeGenerationDailyLimitExhausted,
  type FreeGenerationFailureKind,
  type FreeGenerationGrantExhausted,
} from '$lib/freeGenerations';
import { recordByokUsage, recordTokenUsage } from '$lib/server/usage';
import { aiProvider } from '$lib/server/ai/provider';
import {
  authorizeGenerationRequest,
  type GenerationAuthorization,
} from '$lib/server/generationAuthorization';
import {
  isAllowedImageType,
  MAX_IMAGE_BYTES,
  resolveGenerationPrompt,
} from '$lib/server/generateImagePolicy';
import { apiHandler, contentTypeOf, fail, readBodyWithinLimit } from '$lib/server/http';
import {
  clientAcceptsBackgroundGeneration,
  freeSettlement,
  startBackgroundGeneration,
  synchronousDeadlineMs,
} from '$lib/server/generationStart';
import { SAFETY_REFUSAL_STATUS } from '$lib/drawing/aiImageResponse';
import {
  completeFreeGeneration,
  failFreeGeneration,
  reserveDailyFreeGeneration,
  reserveFreeGeneration,
} from '$lib/server/freeGenerationGrants';
import type { RequestHandler } from './$types';

// A safety refusal is the model declining the drawing on policy grounds — the
// child should try a *different* drawing, not retry the same one. We surface it
// as a distinct 422 (vs 502 for genuine upstream failures) so the client can
// show the right guidance. See ADR-0023.
function reportTokenBinding(authorization: GenerationAuthorization): ReportTokenBinding {
  switch (authorization.kind) {
    case 'byok':
      return { kind: 'byok', credential: authorization.effectiveKey };
    case 'managed':
      return { kind: 'managed', credential: authorization.managedToken };
    case 'free':
      return { kind: 'free', credential: authorization.installationId };
  }
}

function safetyRefusal(reason: string, authorization: GenerationAuthorization): Response {
  const headers: Record<string, string> = {};
  const reportToken = issueReportToken(reportTokenBinding(authorization), {
    kind: 'false-positive-refusal',
    refusalReason: reason,
  });
  if (reportToken) headers[REPORT_TOKEN_HEADER] = reportToken;
  return fail(SAFETY_REFUSAL_STATUS, `Drawing was blocked for safety: ${reason}`, headers);
}

function assertAllowedImageType(mimeType: string): void {
  if (mimeType && !isAllowedImageType(mimeType)) {
    throw error(415, 'Unsupported image type');
  }
}

// The credentials ride in headers, not the query string: the managed access
// token and (especially) a parent's BYO API key are secrets, and query
// strings leak into server/CDN access logs, browser history, and Referer
// headers. The non-secret style enum is a plain query param. See ADR-0064.
const asString = (value: FormDataEntryValue | null): string | null =>
  typeof value === 'string' ? value : null;

interface GenerationRequest {
  token: string | null;
  apiKey: string | null;
  installationId: string | null;
  style: string | null;
  // Deferred so the ≤15 MB body isn't read or validated until authorization
  // succeeds — the thunk can throw 400, 413, or 415. (The multipart shape has
  // already buffered by necessity; only the raw path actually saves the read.)
  readValidatedImage: () => Promise<{ bytes: Buffer; mimeType: string }>;
}

// Two request shapes are accepted (ADR-0064):
//   • raw body  — the current contract: image bytes as the body, credentials in
//                 headers, style in the query string. One arrayBuffer read, no
//                 multipart parse or copy.
//   • multipart — the legacy contract (token/apiKey/image/style form fields).
//                 Shipped native builds and PWA clients on a stale service worker
//                 predate the raw-body switch and still send this; native apps
//                 can't be updated in lockstep with a server deploy, so we keep
//                 accepting it rather than 403 them for missing credential
//                 headers. Remove this branch once the oldest supported client
//                 sends the raw body.
async function readGenerationRequest(request: Request, url: URL): Promise<GenerationRequest> {
  if (contentTypeOf(request) === 'multipart/form-data') {
    // Credentials live in the body here, so the whole envelope is buffered and
    // parsed up front — the cost the raw path exists to skip.
    const form = await request.formData();
    const imageFile = form.get('image');
    return {
      token: asString(form.get('token')),
      apiKey: asString(form.get('apiKey')),
      installationId: asString(form.get('installationId')),
      style: asString(form.get('style')),
      readValidatedImage: async () => {
        if (!(imageFile instanceof Blob)) throw error(400, 'Missing image');
        if (imageFile.size > MAX_IMAGE_BYTES) throw error(413, 'Image is too large');
        assertAllowedImageType(imageFile.type);
        return { bytes: Buffer.from(await imageFile.arrayBuffer()), mimeType: imageFile.type };
      },
    };
  }
  return {
    token: request.headers.get(ACCESS_TOKEN_HEADER),
    apiKey: request.headers.get(API_KEY_HEADER),
    installationId: request.headers.get(INSTALLATION_ID_HEADER),
    style: url.searchParams.get('style'),
    readValidatedImage: async () => {
      const mimeType = contentTypeOf(request);
      assertAllowedImageType(mimeType);
      const body = await readBodyWithinLimit(request, MAX_IMAGE_BYTES);
      if (!body.ok) throw error(413, 'Image is too large');
      const { bytes } = body;
      if (bytes.byteLength === 0) throw error(400, 'Missing image');
      return { bytes, mimeType };
    },
  };
}

function recordGenerationUsage(
  authorization: GenerationAuthorization,
  style: string | null,
  finalPrompt: string,
  platform?: App.Platform
): void {
  // Only the managed tokens are worth a per-token tally (to spot one going
  // rogue). BYOK requests run on the parent's own quota, so just log them.
  if (authorization.kind === 'byok') {
    recordByokUsage(style, finalPrompt);
  } else if (authorization.kind === 'managed') {
    // The synchronous audit log inside recordTokenUsage runs immediately; only
    // the Blobs write is async, and we don't make the image wait on it. waitUntil
    // keeps the function alive long enough to finish on Netlify; without it
    // (local dev) it's a fire-and-forget whose errors are caught internally.
    const usage = recordTokenUsage(authorization.managedToken, {
      style,
      prompt: finalPrompt,
    });
    platform?.context?.waitUntil?.(usage);
  }
}

function freeFailureKind(cause: unknown): FreeGenerationFailureKind {
  if (!isHttpError(cause)) return 'upstream';
  if (cause.status === SAFETY_REFUSAL_STATUS) return 'safety';
  if (cause.status >= 500) return 'upstream';
  return 'invalid-request';
}

async function recordFreeGenerationFailure(
  installationId: string,
  kind: FreeGenerationFailureKind,
  reservationId?: string
): Promise<void> {
  try {
    await failFreeGeneration(installationId, kind, reservationId);
  } catch (trackingError) {
    console.warn(
      '[free-generation] failed to record unsuccessful attempt:',
      trackingError instanceof Error ? trackingError.message : trackingError
    );
  }
}

function exhaustedGrant(): Response {
  const body: FreeGenerationGrantExhausted = {
    ok: false,
    code: FREE_GRANT_EXHAUSTED_CODE,
    error: `Your ${FREE_GENERATION_LIMIT} free creations are used up. Add your own OpenAI key to keep creating.`,
    remaining: 0,
  };
  return Response.json(body, { status: 403 });
}

function exhaustedDailyLimit(): Response {
  const body: FreeGenerationDailyLimitExhausted = {
    ok: false,
    code: FREE_DAILY_LIMIT_EXHAUSTED_CODE,
    error: 'Free creations are unavailable today. Add your own OpenAI key to keep creating.',
  };
  return Response.json(body, { status: 503 });
}

// Spend the reserved slot now that an image exists, and answer with what is left.
// The picture is already made and already paid for, so a ledger write that fails
// anyway must not turn it into an error the child sees: the reservation lapses on
// its own, the daily provider-start ceiling still bounds spending, and the
// response simply omits the remaining-count header.
async function recordFreeGeneration(
  installationId: string,
  reservationId: string
): Promise<number | null> {
  try {
    return (await completeFreeGeneration(installationId, reservationId)).remaining;
  } catch (cause) {
    console.warn(
      '[free-generation] failed to record a completed generation:',
      cause instanceof Error ? cause.message : cause
    );
    return null;
  }
}

const generateImage: RequestHandler = async ({ request, url, platform, getClientAddress }) => {
  const source = await readGenerationRequest(request, url);

  const authorization = await authorizeGenerationRequest({
    apiKey: source.apiKey,
    token: source.token,
    installationId: source.installationId,
    clientAddress: getClientAddress(),
  });
  if (!authorization.authorized) return authorization.response;

  let reservationId: string | undefined;
  try {
    const { bytes: inputBytes, mimeType } = await source.readValidatedImage();
    const style = source.style;
    const finalPrompt = resolveGenerationPrompt(style);

    if (authorization.kind === 'free') {
      const reservation = await reserveFreeGeneration(authorization.installationId);
      if (!reservation.reserved) return exhaustedGrant();
      reservationId = reservation.reservationId;
      const daily = await reserveDailyFreeGeneration();
      if (!daily.reserved) {
        await failFreeGeneration(authorization.installationId, 'daily-limit', reservationId);
        reservationId = undefined;
        return exhaustedDailyLimit();
      }
    }

    recordGenerationUsage(authorization, style, finalPrompt, platform);

    const imageBase64 = inputBytes.toString('base64');
    const imageMimeType = mimeType || 'image/png';

    // Hand the long half to the background worker when the caller can wait for
    // it in a later request and there is a worker to hand it to (ADR-0115). The
    // fallback is not a fallback in name only: a `null` here means the handoff
    // genuinely failed, and answering in-line is better than leaving a child
    // watching a job nobody is working on — even though it will usually outrun
    // the deadline.
    if (clientAcceptsBackgroundGeneration(request)) {
      const started = await startBackgroundGeneration(
        url.origin,
        { free: freeSettlement(authorization, reservationId), style },
        {
          bytes: inputBytes.buffer.slice(
            inputBytes.byteOffset,
            inputBytes.byteOffset + inputBytes.byteLength
          ) as ArrayBuffer,
          mimeType: imageMimeType,
        },
        { apiKey: authorization.effectiveKey, prompt: finalPrompt }
      );
      if (started) {
        // The reservation now belongs to the job; the catch below must not
        // release it on this request's way out.
        reservationId = undefined;
        return Response.json({ ok: true, ...started }, { status: 202 });
      }
    }

    const result = await aiProvider.generateImage({
      apiKey: authorization.effectiveKey,
      image: { base64: imageBase64, mimeType: imageMimeType },
      prompt: finalPrompt,
      deadlineMs: synchronousDeadlineMs(),
    });
    if (result.kind === 'refusal') {
      if (authorization.kind === 'free') {
        await recordFreeGenerationFailure(authorization.installationId, 'safety', reservationId);
      }
      return safetyRefusal(result.reason, authorization);
    }
    if (result.kind === 'error') throw error(502, result.reason);

    let freeRemaining: number | null = null;
    if (authorization.kind === 'free' && reservationId) {
      const settled = reservationId;
      reservationId = undefined;
      freeRemaining = await recordFreeGeneration(authorization.installationId, settled);
    }

    const headers: Record<string, string> = {
      'Content-Type': result.mimeType,
      'Cache-Control': 'no-store',
    };
    if (freeRemaining !== null) {
      headers[FREE_GENERATIONS_REMAINING_HEADER] = String(freeRemaining);
    }
    // The free tier's proof that this AI attempt ran here, so its result can be
    // reported. Refusals receive the same proof in safetyRefusal above. Minted
    // off the authorized installation id, never off request-body data.
    if (authorization.kind === 'free') {
      const reportToken = issueReportToken(reportTokenBinding(authorization));
      if (reportToken) headers[REPORT_TOKEN_HEADER] = reportToken;
    }
    return new Response(Buffer.from(result.data, 'base64'), { headers });
  } catch (cause) {
    if (authorization.kind === 'free') {
      await recordFreeGenerationFailure(
        authorization.installationId,
        freeFailureKind(cause),
        reservationId
      );
    }
    throw cause;
  }
};

export const POST: RequestHandler = apiHandler(generateImage);
