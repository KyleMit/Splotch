import { vi } from 'vitest';
import { ACCESS_TOKEN_HEADER, API_KEY_HEADER, INSTALLATION_ID_HEADER } from '../apiHeaders';
import {
  RECOVERY_PROTOCOL,
  RECOVERY_PATH,
  RECOVERY_VERSION_HEADER,
  RECOVERY_NONCE_HEADER,
  RECOVERY_CREATED_HEADER,
  RECOVERY_INPUT_DIGEST_HEADER,
} from '../ai/generationAttempt';
import {
  ADMITTED_AT,
  INSTALLATION,
  createRecoveryLedgerTestFixture,
} from './freeGenerationRecoveryTestHarness';
import {
  AttemptCasHarness,
  ATTEMPT_TEST_INPUT,
  ATTEMPT_TEST_OUTPUT,
} from './generationAttemptsTestHarness';
import {
  createGenerationAttempts,
  attemptDigest,
  bindAttemptCredential,
  deriveAttemptId,
  type AttemptRecord,
} from './generationAttempts';
import { RecoveryAccounting } from './generationAttemptAccounting';
import {
  reserveRecoveryFreeGeneration,
  reserveRecoveryDailyFreeGeneration,
  settleRecoveryFreeGeneration,
} from './freeGenerationGrants';
import { createRecoveryAttemptHandlers } from './generationAttemptService';
import { createRecoveryWorker } from './generationAttemptWorker';
import type { RecoveryCredential } from './generationAttemptRequest';
import type { AiImageProvider } from './ai/provider';
import type { authorizeGenerationRequest } from './generationAuthorization';
import type { prepareDeliveredImage } from './generationDelivery';
import {
  RECOVERY_WORK_DOMAIN,
  RECOVERY_WORKER_PATH,
  RECOVERY_WORK_TICKET_HEADER,
} from './generationAttemptPolicy';
import { sealRecoveryWork, signRecoveryWork, type RecoveryWork } from './generationAttemptWork';
import { apiHandler } from './http';
export const SERVICE_TEST_SECRET = 'fixture-report-secret';
export const SERVICE_TEST_NONCE = 'b'.repeat(64);
export const SERVICE_TEST_TIME = Date.parse(ADMITTED_AT);
export const SERVICE_TEST_CREDENTIAL: RecoveryCredential = { kind: 'free', identity: INSTALLATION };
function credentialHeaders(credential: RecoveryCredential) {
  const names = {
    free: INSTALLATION_ID_HEADER,
    managed: ACCESS_TOKEN_HEADER,
    byok: API_KEY_HEADER,
  };
  return { [names[credential.kind]]: credential.identity };
}
function fixtureHeaders(base: HeadersInit, replacements: HeadersInit): Headers {
  const headers = new Headers(base);
  new Headers(replacements).forEach((value, name) => headers.set(name, value));
  return headers;
}
class FixtureRequests {
  constructor(
    private readonly invoke: (request: Request) => Promise<Response>,
    private readonly identity: { id: string; nonce: string; createdAt: number },
    private readonly credential: RecoveryCredential
  ) {}
  raw(extraHeaders: HeadersInit = {}, query = '?style=Magical') {
    return this.invoke(
      new Request(`https://splotch.test${RECOVERY_PATH}${query}`, {
        method: 'POST',
        headers: fixtureHeaders(
          {
            'Content-Type': 'image/png',
            [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
            [RECOVERY_NONCE_HEADER]: this.identity.nonce,
            [RECOVERY_CREATED_HEADER]: String(this.identity.createdAt),
            [RECOVERY_INPUT_DIGEST_HEADER]: attemptDigest(ATTEMPT_TEST_INPUT),
            ...credentialHeaders(this.credential),
          },
          extraHeaders
        ),
        body: new Uint8Array(ATTEMPT_TEST_INPUT),
      })
    );
  }
  get(extraHeaders: HeadersInit = {}, query = '') {
    return this.invoke(
      new Request(`https://splotch.test${RECOVERY_PATH}${query}`, {
        headers: fixtureHeaders(
          {
            [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
            [RECOVERY_NONCE_HEADER]: this.identity.nonce,
            [RECOVERY_CREATED_HEADER]: String(this.identity.createdAt),
            ...credentialHeaders(this.credential),
          },
          extraHeaders
        ),
      })
    );
  }
  mutate(body: unknown) {
    return this.invoke(
      new Request(`https://splotch.test${RECOVERY_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
          ...credentialHeaders(this.credential),
        },
        body: JSON.stringify(body),
      })
    );
  }
  reconcile() {
    return this.mutate({
      operation: 'reconcile',
      id: this.identity.id,
      createdAt: this.identity.createdAt,
    });
  }
  workRequest(record: AttemptRecord, workChanges: Partial<RecoveryWork> = {}) {
    const payload: RecoveryWork = {
      domain: RECOVERY_WORK_DOMAIN,
      protocol: RECOVERY_PROTOCOL,
      id: this.identity.id,
      createdAt: this.identity.createdAt,
      issuedAt: Date.now(),
      expiresAt: record.admission.expiresAt,
      requestFingerprint: record.admission.input.requestFingerprint,
      credential: this.credential,
      ...workChanges,
    };
    const body = sealRecoveryWork(payload, SERVICE_TEST_SECRET);
    return new Request(`https://splotch.test${RECOVERY_WORKER_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [RECOVERY_WORK_TICKET_HEADER]: signRecoveryWork(body, SERVICE_TEST_SECRET) ?? '',
      },
      body,
    });
  }
}
function fixtureAuthorization(credential: RecoveryCredential) {
  return vi.fn<typeof authorizeGenerationRequest>().mockImplementation(async () => {
    if (credential.kind === 'free')
      return {
        authorized: true,
        kind: 'free',
        effectiveKey: 'fixture-provider-key',
        installationId: credential.identity,
      };
    if (credential.kind === 'managed')
      return {
        authorized: true,
        kind: 'managed',
        effectiveKey: 'fixture-provider-key',
        managedToken: credential.identity,
      };
    return { authorized: true, kind: 'byok', effectiveKey: credential.identity };
  });
}
function fixtureProvider(): AiImageProvider {
  return {
    generateImage: vi.fn<AiImageProvider['generateImage']>().mockResolvedValue({
      kind: 'image',
      data: Buffer.from(ATTEMPT_TEST_OUTPUT).toString('base64'),
      mimeType: 'image/png',
    }),
    verifyKey: vi.fn<AiImageProvider['verifyKey']>(),
  };
}
export function recoveryServiceFixture(credential = SERVICE_TEST_CREDENTIAL) {
  const storage = new AttemptCasHarness();
  let sequence = 0;
  const attempts = createGenerationAttempts(storage, Date.now, () =>
    (++sequence).toString(16).padStart(64, '0')
  );
  const ledger = createRecoveryLedgerTestFixture();
  const accounting = new RecoveryAccounting({
    reserve: reserveRecoveryFreeGeneration,
    reserveDaily: reserveRecoveryDailyFreeGeneration,
    settle: settleRecoveryFreeGeneration,
  });
  const authorize = fixtureAuthorization(credential);
  const prepare = vi
    .fn<typeof prepareDeliveredImage>()
    .mockImplementation(async (_style, bytes, mimeType) => ({ bytes, mimeType }));
  const reportToken = vi.fn(() => 'fixture-bound-report-token');
  const dispatch = vi.fn(async () => {});
  const dependencies = {
    enabled: () => true,
    secret: () => SERVICE_TEST_SECRET,
    attempts: () => attempts,
    accounting: () => accounting,
    authorize,
    prepare,
    reportToken,
    dispatch,
    validateInput: vi.fn(async () => {}),
    limit: () => null,
  };
  const handlers = createRecoveryAttemptHandlers(dependencies);
  const wrapped = { GET: apiHandler(handlers.GET), POST: apiHandler(handlers.POST) };
  const identity = {
    id: deriveAttemptId(SERVICE_TEST_NONCE, SERVICE_TEST_TIME),
    nonce: SERVICE_TEST_NONCE,
    createdAt: SERVICE_TEST_TIME,
  };
  const lookup = {
    id: identity.id,
    createdAt: identity.createdAt,
    credentialBinding: bindAttemptCredential(
      SERVICE_TEST_SECRET,
      credential.kind,
      credential.identity
    ),
  };
  const provider = fixtureProvider();
  const worker = createRecoveryWorker({
    enabled: () => true,
    secret: () => SERVICE_TEST_SECRET,
    projectKey: () => 'fixture-provider-key',
    usageSecret: () => 'fixture-usage-secret',
    attempts: () => attempts,
    provider,
    now: Date.now,
  });
  function invoke(request: Request) {
    const event = { request, url: new URL(request.url), getClientAddress: () => '192.0.2.1' };
    return request.method === 'GET' ? wrapped.GET(event) : wrapped.POST(event);
  }
  const requests = new FixtureRequests(invoke, identity, credential);
  async function runWorker() {
    return worker(requests.workRequest(await attempts.read(lookup)));
  }
  return {
    storage,
    ledger,
    attempts,
    accounting,
    authorize,
    prepare,
    reportToken,
    dispatch,
    dependencies,
    handlers,
    identity,
    lookup,
    provider,
    worker,
    invoke,
    raw: requests.raw.bind(requests),
    get: requests.get.bind(requests),
    mutate: requests.mutate.bind(requests),
    reconcile: requests.reconcile.bind(requests),
    workRequest: requests.workRequest.bind(requests),
    runWorker,
    credential,
  };
}
export type RecoveryServiceFixture = ReturnType<typeof recoveryServiceFixture>;
