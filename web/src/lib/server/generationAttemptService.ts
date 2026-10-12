import {
  ACCESS_TOKEN_HEADER,
  API_KEY_HEADER,
  INSTALLATION_ID_HEADER,
  FREE_GENERATIONS_REMAINING_HEADER,
  REPORT_TOKEN_HEADER,
} from '../apiHeaders';
import {
  RECOVERY_PROTOCOL,
  RECOVERY_VERSION_HEADER,
  RECOVERY_NONCE_HEADER,
  RECOVERY_CREATED_HEADER,
  RECOVERY_INPUT_DIGEST_HEADER,
  RECOVERY_EXPIRES_HEADER,
  RECOVERY_DIGEST_HEADER,
  RECOVERY_RECEIPT_HEADER,
  RECOVERY_MAX_INPUT_BYTES,
  RECOVERY_MAX_JSON_BYTES,
  RecoveryFault,
  parseRecoveryAdmissionHeaders,
  parseRecoveryLookupHeaders,
  parseRecoveryMutation,
  recoveryCapability,
  recoveryStatus,
  isRecoveryMime,
  recoveryTerminalRequested,
  parseRecoveryTerminalReply,
  RECOVERY_TERMINAL_STATUS,
  RECOVERY_TERMINAL_CODE,
  isRecoveryHex,
  type RecoveryTerminalOutcome,
} from '../ai/generationAttempt';
import {
  attemptDigest,
  attemptRequestFingerprint,
  bindAttemptCredential,
  deriveAttemptId,
  outcomeOf,
  type AttemptRecord,
  type AttemptLookup,
  type GenerationAttempts,
} from './generationAttempts';
import { type RecoveryAccounting, type RecoveryRawRecord } from './generationAttemptAccounting';
import {
  recoveryCredential,
  recoveryStyleQuery,
  requireRecoveryNoQuery,
  type RecoveryCredential,
} from './generationAttemptRequest';
import { RECOVERY_PROMPT_POLICY_REVISION } from './generationAttemptPolicy';
import { resolveGenerationPrompt } from './generateImagePolicy';
import { contentTypeOf, fail, readBodyWithinLimit, readJsonBody } from './http';
import type { authorizeGenerationRequest } from './generationAuthorization';
import type { prepareDeliveredImage } from './generationDelivery';
import type { issueReportToken } from './reportToken';
export interface RecoveryEvent {
  request: Request;
  url: URL;
  getClientAddress(): string;
}
export interface RecoveryServiceDependencies {
  enabled(): boolean;
  secret(): string | undefined;
  attempts(): GenerationAttempts;
  accounting(): RecoveryAccounting;
  authorize: typeof authorizeGenerationRequest;
  validateInput(
    bytes: Uint8Array,
    mime: Parameters<GenerationAttempts['admit']>[0]['input']['mime']
  ): Promise<void>;
  dispatch(
    origin: string,
    record: AttemptRecord,
    credential: RecoveryCredential,
    secret: string
  ): Promise<void>;
  prepare: typeof prepareDeliveredImage;
  reportToken: typeof issueReportToken;
  limit(event: RecoveryEvent): Response | null;
}
const RECOVERY_FAULT_STATUS = {
  RECOVERY_INVALID: 400,
  RECOVERY_ABSENT: 404,
  RECOVERY_EXPIRED: 404,
  RECOVERY_CONFLICT: 409,
  RECOVERY_UNAVAILABLE: 503,
  RECOVERY_NOT_READY: 503,
} as const;
function failedRecovery(cause: RecoveryFault): Response {
  const message =
    cause.code === 'RECOVERY_CONFLICT'
      ? 'That creation does not match the saved attempt'
      : 'That creation could not be recovered just now';
  return Response.json(
    { ok: false, error: message, code: cause.code },
    { status: RECOVERY_FAULT_STATUS[cause.code] }
  );
}
function recordLookup(record: AttemptRecord): AttemptLookup {
  return {
    id: record.admission.identity.id,
    createdAt: record.admission.identity.createdAt,
    credentialBinding: record.admission.credentialBinding,
  };
}
function pendingResponse(record: AttemptRecord): Response {
  return Response.json(
    recoveryStatus(record.admission.identity.id, record.admission.expiresAt, record.phase),
    {
      status: 202,
      headers: {
        [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
        [RECOVERY_EXPIRES_HEADER]: String(record.admission.expiresAt),
      },
    }
  );
}
function terminalResponse(
  identity: Readonly<{ id: string; createdAt: number }>,
  expiresAt: number,
  outcome: RecoveryTerminalOutcome,
  error: string,
  extraHeaders: HeadersInit = {}
): Response {
  const confirmed = parseRecoveryTerminalReply(
    RECOVERY_TERMINAL_STATUS[outcome],
    {
      ok: false,
      error,
      code: RECOVERY_TERMINAL_CODE,
      protocol: RECOVERY_PROTOCOL,
      id: identity.id,
      createdAt: identity.createdAt,
      expiresAt,
      outcome,
    },
    { ...identity, expiry: { kind: 'known', expiresAt } }
  );
  const headers = new Headers(extraHeaders);
  headers.set(RECOVERY_VERSION_HEADER, RECOVERY_PROTOCOL);
  headers.set(RECOVERY_EXPIRES_HEADER, String(expiresAt));
  return Response.json(confirmed.body, { status: confirmed.status, headers });
}
class RecoveryService {
  constructor(private readonly deps: RecoveryServiceDependencies) {}
  private async boundary(
    event: RecoveryEvent,
    action: (secret: string) => Promise<Response>
  ): Promise<Response> {
    if (!this.deps.enabled() || !this.deps.secret())
      return failedRecovery(new RecoveryFault('RECOVERY_UNAVAILABLE'));
    const limited = this.deps.limit(event);
    if (limited) return limited;
    const secret = this.deps.secret();
    if (!secret) return failedRecovery(new RecoveryFault('RECOVERY_UNAVAILABLE'));
    try {
      return await action(secret);
    } catch (cause) {
      if (cause instanceof RecoveryFault) return failedRecovery(cause);
      throw cause;
    }
  }
  get(event: RecoveryEvent): Promise<Response> {
    return this.boundary(event, async (secret) => {
      requireRecoveryNoQuery(event.url);
      const headers = parseRecoveryLookupHeaders(event.request.headers);
      const checkedTerminal = recoveryTerminalRequested(event.request.headers);
      if (headers.kind === 'capability') {
        if (checkedTerminal) throw new RecoveryFault('RECOVERY_INVALID');
        if (
          [ACCESS_TOKEN_HEADER, API_KEY_HEADER, INSTALLATION_ID_HEADER].some((name) =>
            event.request.headers.has(name)
          )
        )
          throw new RecoveryFault('RECOVERY_INVALID');
        return Response.json(recoveryCapability());
      }
      const credential = recoveryCredential(event.request.headers);
      const lookup = {
        id: deriveAttemptId(headers.nonce, headers.createdAt),
        createdAt: headers.createdAt,
        credentialBinding: bindAttemptCredential(secret, credential.kind, credential.identity),
      };
      const attempts = this.deps.attempts();
      const status = checkedTerminal ? await attempts.lookupStatus(lookup) : null;
      if (status?.kind === 'expired')
        return terminalResponse(
          status.identity,
          status.expiresAt,
          'expired',
          'That creation has expired'
        );
      const record = status?.kind === 'live' ? status.record : await attempts.read(lookup);
      return record.phase === 'delivery'
        ? this.delivery(attempts, lookup)
        : pendingResponse(record);
    });
  }
  post(event: RecoveryEvent): Promise<Response> {
    return this.boundary(event, async (secret) => {
      if (event.request.headers.get(RECOVERY_VERSION_HEADER) !== RECOVERY_PROTOCOL)
        throw new RecoveryFault('RECOVERY_INVALID');
      const checkedTerminal = recoveryTerminalRequested(event.request.headers);
      const credential = recoveryCredential(event.request.headers);
      if (contentTypeOf(event.request) === 'application/json')
        return this.mutate(event, credential, secret, checkedTerminal);
      return this.admit(event, credential, secret, checkedTerminal);
    });
  }
  private async admit(
    event: RecoveryEvent,
    credential: RecoveryCredential,
    secret: string,
    checkedTerminal: boolean
  ): Promise<Response> {
    const headers = parseRecoveryAdmissionHeaders(
      event.request.headers,
      recoveryStyleQuery(event.url)
    );
    const identity = {
      id: deriveAttemptId(headers.nonce, headers.createdAt),
      nonce: headers.nonce,
      createdAt: headers.createdAt,
    };
    const credentialBinding = bindAttemptCredential(secret, credential.kind, credential.identity);
    const lookup = { id: identity.id, createdAt: identity.createdAt, credentialBinding };
    const attempts = this.deps.attempts();
    let existing: AttemptRecord | null = null;
    try {
      existing = await attempts.read(lookup);
    } catch (cause) {
      if (!(cause instanceof RecoveryFault) || cause.code !== 'RECOVERY_ABSENT') throw cause;
    }
    if (!existing) {
      const authorization = await this.deps.authorize({
        apiKey: credential.kind === 'byok' ? credential.identity : null,
        token: credential.kind === 'managed' ? credential.identity : null,
        installationId: credential.kind === 'free' ? credential.identity : null,
        clientAddress: event.getClientAddress(),
      });
      if (!authorization.authorized) return authorization.response;
    }
    let input: Awaited<ReturnType<typeof readBodyWithinLimit>>;
    try {
      input = await readBodyWithinLimit(event.request, RECOVERY_MAX_INPUT_BYTES);
    } catch {
      return fail(400, 'That drawing could not be read');
    }
    if (!input.ok) return fail(413, 'Image is too large');
    if (!input.bytes.byteLength || attemptDigest(input.bytes) !== headers.inputDigest)
      throw new RecoveryFault('RECOVERY_INVALID');
    await this.deps.validateInput(input.bytes, headers.mime);
    const metadata = existing?.admission.input;
    if (
      metadata &&
      (metadata.inputDigest !== headers.inputDigest ||
        metadata.inputByteLength !== input.bytes.byteLength ||
        metadata.mime !== headers.mime ||
        metadata.style !== headers.style)
    )
      throw new RecoveryFault('RECOVERY_CONFLICT');
    const derived = {
      inputDigest: headers.inputDigest,
      inputByteLength: input.bytes.byteLength,
      mime: headers.mime,
      style: headers.style,
      promptPolicyRevision: RECOVERY_PROMPT_POLICY_REVISION,
      prompt: resolveGenerationPrompt(headers.style),
    };
    const record = await attempts.admit(
      {
        identity,
        credentialBinding,
        input: metadata ?? { ...derived, requestFingerprint: attemptRequestFingerprint(derived) },
      },
      input.bytes
    );
    return this.resume(event.url.origin, attempts, record, credential, secret, checkedTerminal);
  }
  private async mutate(
    event: RecoveryEvent,
    credential: RecoveryCredential,
    secret: string,
    checkedTerminal: boolean
  ): Promise<Response> {
    requireRecoveryNoQuery(event.url);
    if (
      [RECOVERY_NONCE_HEADER, RECOVERY_CREATED_HEADER, RECOVERY_INPUT_DIGEST_HEADER].some((name) =>
        event.request.headers.has(name)
      )
    )
      throw new RecoveryFault('RECOVERY_INVALID');
    const json = await readJsonBody(event.request, RECOVERY_MAX_JSON_BYTES);
    if (!json.ok) return json.response;
    const mutation = parseRecoveryMutation(json.body);
    const lookup = {
      id: mutation.id,
      createdAt: mutation.createdAt,
      credentialBinding: bindAttemptCredential(secret, credential.kind, credential.identity),
    };
    const attempts = this.deps.attempts();
    if (mutation.operation === 'ack') {
      if (checkedTerminal) throw new RecoveryFault('RECOVERY_INVALID');
      return Response.json(await attempts.acknowledge(lookup, mutation.digest, mutation.receipt));
    }
    const status = checkedTerminal ? await attempts.lookupStatus(lookup) : null;
    if (status?.kind === 'expired')
      return terminalResponse(
        status.identity,
        status.expiresAt,
        'expired',
        'That creation has expired'
      );
    const record = status?.kind === 'live' ? status.record : await attempts.read(lookup);
    if (record.phase === 'image' || record.phase === 'refusal' || record.phase === 'error')
      return this.reconcile(attempts, record, credential, checkedTerminal);
    return this.resume(event.url.origin, attempts, record, credential, secret, checkedTerminal);
  }
  private async resume(
    origin: string,
    attempts: GenerationAttempts,
    original: AttemptRecord,
    credential: RecoveryCredential,
    secret: string,
    checkedTerminal: boolean
  ): Promise<Response> {
    const lookup = recordLookup(original);
    let record = original;
    try {
      if (record.phase === 'preparing')
        record = await attempts.markFunded(
          lookup,
          await this.deps.accounting().fund(record, credential)
        );
      if (record.phase === 'funded') record = await attempts.markPending(lookup);
    } catch (cause) {
      if (!(cause instanceof RecoveryFault) || cause.code !== 'RECOVERY_CONFLICT') throw cause;
      record = await attempts.read(lookup);
    }
    if (record.phase === 'image' || record.phase === 'refusal' || record.phase === 'error')
      return this.reconcile(attempts, record, credential, checkedTerminal);
    if (record.phase === 'pending') await this.deps.dispatch(origin, record, credential, secret);
    return record.phase === 'delivery' ? this.delivery(attempts, lookup) : pendingResponse(record);
  }
  private async delivery(attempts: GenerationAttempts, lookup: AttemptLookup): Promise<Response> {
    const result = await attempts.readDelivery(lookup);
    const headers = new Headers({
      'Content-Type': result.delivery.image.mime,
      [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
      [RECOVERY_EXPIRES_HEADER]: String(result.admission.expiresAt),
      [RECOVERY_DIGEST_HEADER]: result.delivery.image.digest,
      [RECOVERY_RECEIPT_HEADER]: result.delivery.receipt,
    });
    if (result.delivery.reportToken !== null)
      headers.set(REPORT_TOKEN_HEADER, result.delivery.reportToken);
    if (result.delivery.remaining !== null)
      headers.set(FREE_GENERATIONS_REMAINING_HEADER, String(result.delivery.remaining));
    return new Response(Buffer.from(result.bytes), { headers });
  }
  private async reconcile(
    attempts: GenerationAttempts,
    record: RecoveryRawRecord,
    credential: RecoveryCredential,
    checkedTerminal: boolean
  ): Promise<Response> {
    if (record.phase !== 'image') {
      const settlement = await this.deps.accounting().settle(record, credential);
      if (checkedTerminal) {
        const failureKind = record.phase === 'refusal' ? 'safety' : 'upstream';
        if (
          settlement.outcome.kind !== 'failure' ||
          settlement.outcome.failureKind !== failureKind ||
          !isRecoveryHex(settlement.receiptDigest)
        )
          throw new RecoveryFault('RECOVERY_UNAVAILABLE');
        const current = await attempts.read(recordLookup(record));
        if (attemptDigest(JSON.stringify(current)) !== attemptDigest(JSON.stringify(record)))
          throw new RecoveryFault('RECOVERY_CONFLICT');
      }
      if (record.phase === 'error')
        return checkedTerminal
          ? terminalResponse(
              record.admission.identity,
              record.admission.expiresAt,
              'error',
              record.reason
            )
          : fail(502, record.reason);
      const token = this.deps.reportToken(
        { kind: credential.kind, credential: credential.identity },
        { kind: 'false-positive-refusal', refusalReason: record.reason }
      );
      if (checkedTerminal)
        return terminalResponse(
          record.admission.identity,
          record.admission.expiresAt,
          'refusal',
          `Drawing was blocked for safety: ${record.reason}`,
          token ? { [REPORT_TOKEN_HEADER]: token } : {}
        );
      return fail(
        422,
        `Drawing was blocked for safety: ${record.reason}`,
        token ? { [REPORT_TOKEN_HEADER]: token } : undefined
      );
    }
    const lookup = recordLookup(record);
    const raw = await attempts.readRawImage(lookup);
    let prepared: Awaited<ReturnType<typeof prepareDeliveredImage>>;
    try {
      prepared = await this.deps.prepare(
        record.admission.input.style,
        raw,
        record.image.mime,
        'generation-result'
      );
    } catch (cause) {
      await this.deps.accounting().settle(record, credential, false);
      throw cause;
    }
    if (!isRecoveryMime(prepared.mimeType)) throw new RecoveryFault('RECOVERY_INVALID');
    const settlement = await this.deps.accounting().settle(record, credential);
    const reportToken =
      credential.kind === 'free'
        ? this.deps.reportToken({ kind: 'free', credential: credential.identity })
        : null;
    try {
      await attempts.stageDelivery(
        lookup,
        {
          sourceOutcomeDigest: attemptDigest(JSON.stringify(outcomeOf(record))),
          settlementReceiptDigest: settlement.receiptDigest,
          mime: prepared.mimeType,
          reportToken,
          remaining: settlement.remaining,
        },
        prepared.bytes
      );
    } catch (cause) {
      const current = await attempts.read(lookup);
      if (current.phase !== 'delivery') throw cause;
    }
    return this.delivery(attempts, lookup);
  }
}
// Configuration/provider seams exist for CAS-backed unit fixtures; production creates one fixed service.
export function createRecoveryAttemptHandlers(deps: RecoveryServiceDependencies) {
  const service = new RecoveryService(deps);
  return { GET: service.get.bind(service), POST: service.post.bind(service) };
}
