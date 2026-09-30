import { error, isHttpError } from '@sveltejs/kit';
import { ACCESS_TOKEN_HEADER, API_KEY_HEADER, INSTALLATION_ID_HEADER } from '$lib/apiHeaders';
import { GENERATION_STYLE_PARAM } from '$lib/apiParams';
import type { ReportTokenBinding } from '$lib/server/reportToken';
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
  pictureResponse,
  prepareDeliveredImage,
  safetyRefusalResponse,
} from '$lib/server/generationDelivery';
import {
  authorizeGenerationRequest,
  type GenerationAuthorization,
} from '$lib/server/generationAuthorization';
import {
  type AllowedImageType,
  isAllowedImageType,
  MAX_IMAGE_BYTES,
  resolveGenerationPrompt,
  resolveGenerationStyle,
} from '$lib/server/generateImagePolicy';
import { apiHandler, contentTypeOf, readBodyWithinLimit, readFormBody } from '$lib/server/http';
import { loggableError } from '$lib/server/logRedaction';
import {
  clientAcceptsBackgroundGeneration,
  deadlineAfterFailedHandoffMs,
  freeSettlement,
  startBackgroundGeneration,
  synchronousDeadlineMs,
} from '$lib/server/generationStart';
import {
  GENERATION_ACCEPTED_STATUS,
  SAFETY_REFUSAL_STATUS,
  type GenerationStartedBody,
} from '$lib/ai/generationResult';
import {
  completeFreeGeneration,
  failFreeGeneration,
  reserveDailyFreeGeneration,
  reserveFreeGeneration,
} from '$lib/server/freeGenerationGrants';
import type { RequestHandler } from './$types';

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

// A missing type is refused like any other: the server does not sniff, so
// labelling unknown bytes would forward them to the paid provider unchecked.
function assertAllowedImageType(mimeType: string): asserts mimeType is AllowedImageType {
  if (!isAllowedImageType(mimeType)) {
    throw error(415, 'Unsupported image type');
  }
}

// The credentials ride in headers, not the query string: the managed access
// token and (especially) a parent's BYO API key are secrets, and query
// strings leak into server/CDN access logs, browser history, and Referer
// headers. The non-secret style enum is a plain query param. See ADR-0064.
const asString = (value: FormDataEntryValue | null): string | null =>
  typeof value === 'string' ? value : null;

// Covers legacy credential/style fields plus multipart headers and boundaries.
const LEGACY_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_LEGACY_GENERATION_REQUEST_BYTES = MAX_IMAGE_BYTES + LEGACY_MULTIPART_OVERHEAD_BYTES;

interface GenerationRequest {
  token: string | null;
  apiKey: string | null;
  installationId: string | null;
  style: string | null;
  // Deferred so the ≤15 MB body isn't read or validated until authorization
  // succeeds — the thunk can throw 400, 413, or 415. (The multipart shape has
  // already buffered by necessity; only the raw path actually saves the read.)
  readValidatedImage: () => Promise<{ bytes: Buffer; mimeType: AllowedImageType }>;
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
    const body = await readFormBody(request, MAX_LEGACY_GENERATION_REQUEST_BYTES);
    if (!body.ok) {
      throw body.reason === 'too-large'
        ? error(413, 'Image is too large')
        : error(400, 'Expected multipart form data');
    }
    const { form } = body;
    const imageFile = form.get('image');
    return {
      token: asString(form.get('token')),
      apiKey: asString(form.get('apiKey')),
      installationId: asString(form.get('installationId')),
      style: asString(form.get('style')),
      readValidatedImage: async () => {
        if (!(imageFile instanceof Blob)) throw error(400, 'Missing image');
        if (imageFile.size > MAX_IMAGE_BYTES) throw error(413, 'Image is too large');
        const mimeType = imageFile.type;
        assertAllowedImageType(mimeType);
        return { bytes: Buffer.from(await imageFile.arrayBuffer()), mimeType };
      },
    };
  }
  return {
    token: request.headers.get(ACCESS_TOKEN_HEADER),
    apiKey: request.headers.get(API_KEY_HEADER),
    installationId: request.headers.get(INSTALLATION_ID_HEADER),
    style: url.searchParams.get(GENERATION_STYLE_PARAM),
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
  style: ReturnType<typeof resolveGenerationStyle>,
  outcome: Parameters<typeof recordByokUsage>[1],
  platform?: App.Platform
): void {
  // Only the managed tokens are worth a per-token tally (to spot one going
  // rogue). BYOK requests run on the parent's own quota, so just log them.
  if (authorization.kind === 'byok') {
    recordByokUsage(style, outcome);
  } else if (authorization.kind === 'managed') {
    // The synchronous audit log inside recordTokenUsage runs immediately; only
    // the Blobs write is async, and we don't make the image wait on it. waitUntil
    // keeps the function alive long enough to finish on Netlify; without it
    // (local dev) it's a fire-and-forget whose errors are caught internally.
    const usage = recordTokenUsage(authorization.managedToken, {
      style,
      outcome,
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
      loggableError(trackingError)
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
      loggableError(cause)
    );
    return null;
  }
}

const generateImage: RequestHandler = async ({ request, url, platform, getClientAddress }) => {
  const requestStartedAt = Date.now();
  const source = await readGenerationRequest(request, url);

  const authorization = await authorizeGenerationRequest({
    apiKey: source.apiKey,
    token: source.token,
    installationId: source.installationId,
    clientAddress: getClientAddress(),
  });
  if (!authorization.authorized) return authorization.response;

  let reservationId: string | undefined;
  let usageAttempted = false;
  let usageRecorded = false;
  let usageStyle: ReturnType<typeof resolveGenerationStyle> = null;
  try {
    const { bytes: inputBytes, mimeType } = await source.readValidatedImage();
    const style = resolveGenerationStyle(source.style);
    usageStyle = style;
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

    // Hand the long half to the background worker when the caller can wait for
    // it in a later request and there is a worker to hand it to (ADR-0115). The
    // fallback is not a fallback in name only: a `null` here means the handoff
    // genuinely failed, and answering in-line is better than leaving a child
    // watching a job nobody is working on — even though it will usually outrun
    // the deadline.
    //
    // A request that never asked for the handoff keeps the full deadline: its
    // routine pre-work is charged to the margin under the platform ceiling, since
    // charging it to the deadline would cut every direct call short (ADR-0063's
    // pre-work amendment).
    let deadlineMs = synchronousDeadlineMs();
    if (clientAcceptsBackgroundGeneration(request)) {
      const handoffStartedAt = Date.now();
      const started = await startBackgroundGeneration(
        url.origin,
        { free: freeSettlement(authorization, reservationId), style },
        {
          bytes: new Uint8Array(inputBytes).buffer,
          mimeType,
        },
        { apiKey: authorization.effectiveKey, prompt: finalPrompt }
      );
      if (started) {
        recordGenerationUsage(authorization, style, 'accepted', platform);
        usageRecorded = true;
        // The reservation now belongs to the job; the catch below must not
        // release it on this request's way out.
        reservationId = undefined;
        return Response.json({ ok: true, ...started } satisfies GenerationStartedBody, {
          status: GENERATION_ACCEPTED_STATUS,
        });
      }
      const fallbackStartedAt = Date.now();
      const elapsedMs = fallbackStartedAt - requestStartedAt;
      const remainingMs = deadlineAfterFailedHandoffMs(elapsedMs);
      if (remainingMs === null) {
        console.warn(
          `[generate-image] ${elapsedMs} ms spent, ${fallbackStartedAt - handoffStartedAt} ms of it in the failed handoff; not answering in-line`
        );
        // The daily provider-start slot reserved above stays spent. Giving it
        // back would add a write on the one key every free start serializes
        // on, in the branch that exists to answer before the platform ceiling,
        // during the stall that led here. The over-count errs toward spending
        // less (ADR-0063's pre-work amendment).
        throw error(502, 'There was not enough time left to make that creation');
      }
      deadlineMs = remainingMs;
    }

    usageAttempted = true;
    const result = await aiProvider.generateImage({
      apiKey: authorization.effectiveKey,
      image: { bytes: inputBytes, mimeType },
      prompt: finalPrompt,
      deadlineMs,
    });
    if (result.kind === 'refusal') {
      recordGenerationUsage(authorization, style, 'refused', platform);
      usageRecorded = true;
      if (authorization.kind === 'free') {
        await recordFreeGenerationFailure(authorization.installationId, 'safety', reservationId);
      }
      return safetyRefusalResponse(result.reason, reportTokenBinding(authorization));
    }
    if (result.kind === 'error') throw error(502, result.reason);

    const prepared = await prepareDeliveredImage(
      style,
      Buffer.from(result.data, 'base64'),
      result.mimeType,
      'generate-image'
    );

    recordGenerationUsage(authorization, style, 'succeeded', platform);
    usageRecorded = true;

    let freeRemaining: number | null = null;
    if (authorization.kind === 'free' && reservationId) {
      const settled = reservationId;
      reservationId = undefined;
      freeRemaining = await recordFreeGeneration(authorization.installationId, settled);
    }

    // Minted off the authorized installation id, never off request-body data.
    return pictureResponse(prepared, {
      freeRemaining,
      freeReportBinding: authorization.kind === 'free' ? reportTokenBinding(authorization) : null,
    });
  } catch (cause) {
    if (usageAttempted && !usageRecorded) {
      recordGenerationUsage(authorization, usageStyle, 'failed', platform);
    }
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
