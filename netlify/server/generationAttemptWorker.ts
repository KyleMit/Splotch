import {
  RECOVERY_MAX_IMAGE_BYTES,
  RECOVERY_MAX_REASON_BYTES,
  RecoveryFault,
  isRecoveryMime,
} from '../../src/lib/ai/generationAttempt';
import {
  attemptDigest,
  bindAttemptCredential,
  type GenerationAttempts,
  type AttemptOutcome,
} from './generationAttempts';
import type { AiImageProvider } from './ai/provider';
import {
  RECOVERY_COMPLETION_ATTEMPTS,
  RECOVERY_WORK_DEADLINE_MS,
  RECOVERY_WORK_TICKET_HEADER,
  RECOVERY_WORKER_PATH,
} from './generationAttemptPolicy';
import {
  openRecoveryWork,
  readRecoveryWorkBody,
  requireRecoveryWorkRecord,
  verifyRecoveryWork,
  type RecoveryWork,
} from './generationAttemptWork';
import { recordByokUsageMetric, recordManagedUsageMetric } from './usageTelemetry';
import type { UsageOutcome } from '../../src/lib/usageRecord';
export interface RecoveryWorkerDependencies {
  enabled(): boolean;
  secret(): string | undefined;
  projectKey(): string | undefined;
  usageSecret(): string | undefined;
  attempts(): GenerationAttempts;
  provider: AiImageProvider;
  now(): number;
}
function boundedReason(reason: string, secrets: readonly string[]): string {
  let safe = reason;
  for (const secret of secrets) if (secret) safe = safe.replaceAll(secret, '<credential>');
  if (!safe.trim()) safe = 'That drawing was declined for safety';
  const bytes = Buffer.from(safe);
  return bytes.byteLength <= RECOVERY_MAX_REASON_BYTES
    ? safe
    : 'That drawing was declined for safety';
}
function providerOutcome(
  result: Awaited<ReturnType<AiImageProvider['generateImage']>>,
  work: RecoveryWork,
  key: string
): {
  outcome: AttemptOutcome;
  bytes: Uint8Array | null;
  usage: UsageOutcome;
} {
  if (result.kind === 'refusal')
    return {
      outcome: {
        phase: 'refusal',
        reason: boundedReason(result.reason, [work.credential.identity, key]),
      },
      bytes: null,
      usage: 'refused',
    };
  if (result.kind === 'error')
    return {
      outcome: { phase: 'error', reason: 'That creation could not be completed' },
      bytes: null,
      usage: 'failed',
    };
  if (
    !isRecoveryMime(result.mimeType) ||
    result.data.length > Math.ceil(RECOVERY_MAX_IMAGE_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(result.data)
  )
    throw new RecoveryFault('RECOVERY_INVALID');
  const bytes = new Uint8Array(Buffer.from(result.data, 'base64'));
  if (!bytes.byteLength || bytes.byteLength > RECOVERY_MAX_IMAGE_BYTES)
    throw new RecoveryFault('RECOVERY_INVALID');
  return {
    outcome: {
      phase: 'image',
      image: { digest: attemptDigest(bytes), byteLength: bytes.byteLength, mime: result.mimeType },
    },
    bytes,
    usage: 'succeeded',
  };
}
async function completeClaim(
  attempts: GenerationAttempts,
  id: string,
  claimId: string,
  outcome: AttemptOutcome,
  bytes: Uint8Array | null
): Promise<void> {
  for (let attempt = 0; attempt < RECOVERY_COMPLETION_ATTEMPTS; attempt++) {
    try {
      await attempts.complete(id, claimId, outcome, bytes);
      return;
    } catch {
      console.warn('[recovery-worker] raw outcome persistence was not confirmed');
    }
  }
}
async function recordClaimUsage(
  deps: RecoveryWorkerDependencies,
  work: RecoveryWork,
  style: Parameters<typeof recordByokUsageMetric>[0],
  outcome: UsageOutcome
): Promise<void> {
  try {
    if (work.credential.kind === 'byok') recordByokUsageMetric(style, outcome);
    if (work.credential.kind === 'managed')
      await recordManagedUsageMetric(deps.usageSecret(), work.credential.identity, {
        style,
        outcome,
      });
  } catch {
    console.warn('[recovery-worker] best-effort usage was not recorded');
  }
}
class RecoveryWorker {
  constructor(private readonly deps: RecoveryWorkerDependencies) {}
  async handle(request: Request): Promise<Response> {
    if (request.method !== 'POST')
      return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    if (!this.deps.enabled()) return new Response(null, { status: 503 });
    if (
      new URL(request.url).pathname !== RECOVERY_WORKER_PATH ||
      new URL(request.url).search ||
      request.headers.get('content-type') !== 'application/json'
    )
      return new Response(null, { status: 400 });
    const raw = await readRecoveryWorkBody(request);
    const secret = this.deps.secret();
    if (raw === null) return new Response(null, { status: 413 });
    if (
      !secret ||
      !verifyRecoveryWork(raw, request.headers.get(RECOVERY_WORK_TICKET_HEADER), secret)
    )
      return new Response(null, { status: 403 });
    let work: RecoveryWork;
    try {
      work = openRecoveryWork(raw, secret, this.deps.now());
    } catch {
      return new Response(null, { status: 400 });
    }
    // Platform retries can revisit the function, but a permanent winning claim is never taken over.
    try {
      await this.run(work, secret);
    } catch {
      console.warn(
        '[recovery-worker] work could not be completed; no provider retry is authorized'
      );
    }
    return new Response(null, { status: 200 });
  }
  private async run(work: RecoveryWork, secret: string): Promise<void> {
    const attempts = this.deps.attempts();
    const lookup = {
      id: work.id,
      createdAt: work.createdAt,
      credentialBinding: bindAttemptCredential(
        secret,
        work.credential.kind,
        work.credential.identity
      ),
    };
    const record = await attempts.read(lookup);
    requireRecoveryWorkRecord(work, record, secret);
    const key = work.credential.kind === 'byok' ? work.credential.identity : this.deps.projectKey();
    if (!key) return;
    const claim = await attempts.claim(work.id);
    if (!claim) return;
    requireRecoveryWorkRecord(
      work,
      { phase: 'pending', admission: claim.admission, funding: claim.funding },
      secret
    );
    let result: ReturnType<typeof providerOutcome>;
    try {
      result = providerOutcome(
        await this.deps.provider.generateImage({
          apiKey: key,
          image: { bytes: claim.bytes, mimeType: claim.admission.input.mime },
          prompt: claim.admission.input.prompt,
          deadlineMs: RECOVERY_WORK_DEADLINE_MS,
        }),
        work,
        key
      );
    } catch {
      result = {
        outcome: { phase: 'error', reason: 'That creation could not be completed' },
        bytes: null,
        usage: 'failed',
      };
    }
    await completeClaim(attempts, claim.id, claim.claimId, result.outcome, result.bytes);
    // This is one best-effort invocation per winning claim, and can be lost if the worker dies.
    await recordClaimUsage(this.deps, work, claim.admission.input.style, result.usage);
  }
}
// Injected provider/configuration are unit-test seams; production uses the fixed Netlify entrypoint.
export function createRecoveryWorker(
  deps: RecoveryWorkerDependencies
): (request: Request) => Promise<Response> {
  const worker = new RecoveryWorker(deps);
  return worker.handle.bind(worker);
}
