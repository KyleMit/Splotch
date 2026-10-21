// The admin console's client for the bearer API (docs/API.md, "Admin"): POST /api/admin/login
// exchanges the admin secret for a session, /api/admin/tokens lists, adds and removes access codes
// with `Authorization: Bearer <session>`, and /api/admin/stats reads each code's generation tally
// and the free-generation grant figures under the same session. The console is served from the API's own origin,
// so every path is relative. Each body is narrowed from unknown before the console reads it.

export const ADMIN_LOGIN_PATH = '/api/admin/login';
export const ADMIN_TOKENS_PATH = '/api/admin/tokens';
export const ADMIN_STATS_PATH = '/api/admin/stats';

export type Invite = Readonly<{ token: string; url: string }>;

export type TokenSnapshot = Readonly<{
  invites: readonly Invite[];
  // false: Netlify Blobs is unavailable and the list is the env-seeded in-memory copy, which
  // refuses or loses every edit (ADR-0025).
  persistent: boolean;
}>;

// The console renders these strings as they arrive and never branches on them, so it reads the
// style and outcome categories as text instead of shipping their closed lists in its bundle.
export type CodeUsage = Readonly<{ count: number; lastUsed: string }>;

type GrantActivity = Readonly<{
  installation: string;
  successful: number;
  attempts: number;
  failures: number;
  lastFailureKind: string | null;
}>;

export type GrantStats = Readonly<{
  // false: the figures come from this server instance's memory and reset with it.
  persistent: boolean;
  dailyProviderStarts: number;
  dailyProviderStartLimit: number;
  sampledGrantCount: number;
  grantSampleLimit: number;
  grantSamplePartial: boolean;
  sampledSuccessful: number;
  sampledAttempts: number;
  sampledFailures: number;
  sampledActiveGrants: number;
  sampledExhaustedGrants: number;
  sampledActiveReservations: number;
  recent: readonly GrantActivity[];
}>;

export type AdminStats = Readonly<{
  // null: the tally store is unreachable, so no code's usage can be told from "never used".
  usage: ReadonlyMap<string, CodeUsage | null> | null;
  // null: the grant figures could not be read.
  freeGrantStats: GrantStats | null;
}>;

type Refused = Readonly<{ kind: 'refused'; message: string }>;

export type SignInResult = Readonly<{ kind: 'signedIn'; session: string }> | Refused;

// Any tokens call answered 401: the session is not (or no longer) valid.
type Unauthorized = Readonly<{ kind: 'unauthorized' }>;

export type ListResult = Readonly<{ kind: 'listed'; snapshot: TokenSnapshot }> | Unauthorized;

export type StatsResult = Readonly<{ kind: 'read'; stats: AdminStats }> | Unauthorized;

export type MutationResult =
  Readonly<{ kind: 'mutated'; snapshot: TokenSnapshot; changed: boolean }> | Unauthorized | Refused;

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

class AdminApiError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInvite(value: unknown): value is Invite {
  return isRecord(value) && typeof value.token === 'string' && typeof value.url === 'string';
}

function snapshotOf(body: unknown): TokenSnapshot {
  if (
    !isRecord(body) ||
    body.ok !== true ||
    !Array.isArray(body.invites) ||
    !body.invites.every(isInvite) ||
    typeof body.persistent !== 'boolean'
  )
    throw new AdminApiError('The token list arrived in a shape the console does not read.');
  return { invites: body.invites, persistent: body.persistent };
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

function isCodeUsage(value: unknown): value is CodeUsage {
  return isRecord(value) && isCount(value.count) && typeof value.lastUsed === 'string';
}

function codeUsageOf(entry: unknown): readonly [string, CodeUsage | null] {
  if (!isRecord(entry) || typeof entry.token !== 'string')
    throw new AdminApiError('A usage row arrived without its code.');
  if (entry.usage !== null && !isCodeUsage(entry.usage))
    throw new AdminApiError('A usage row arrived in a shape the console does not read.');
  return [
    entry.token,
    entry.usage === null ? null : { count: entry.usage.count, lastUsed: entry.usage.lastUsed },
  ];
}

const GRANT_COUNTS = [
  'dailyProviderStarts',
  'dailyProviderStartLimit',
  'sampledGrantCount',
  'grantSampleLimit',
  'sampledSuccessful',
  'sampledAttempts',
  'sampledFailures',
  'sampledActiveGrants',
  'sampledExhaustedGrants',
  'sampledActiveReservations',
] as const;

function isGrantActivity(value: unknown): value is GrantActivity {
  return (
    isRecord(value) &&
    typeof value.installation === 'string' &&
    isCount(value.successful) &&
    isCount(value.attempts) &&
    isCount(value.failures) &&
    (value.lastFailureKind === null || typeof value.lastFailureKind === 'string')
  );
}

function grantStatsOf(value: unknown): GrantStats | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.persistent !== 'boolean' ||
    typeof value.grantSamplePartial !== 'boolean' ||
    !GRANT_COUNTS.every((field) => isCount(value[field])) ||
    !Array.isArray(value.recent) ||
    !value.recent.every(isGrantActivity)
  )
    throw new AdminApiError('The free grant figures arrived in a shape the console does not read.');
  const counts = Object.fromEntries(GRANT_COUNTS.map((field) => [field, value[field]])) as Record<
    (typeof GRANT_COUNTS)[number],
    number
  >;
  return {
    ...counts,
    persistent: value.persistent,
    grantSamplePartial: value.grantSamplePartial,
    recent: value.recent.map(
      ({ installation, successful, attempts, failures, lastFailureKind }) => ({
        installation,
        successful,
        attempts,
        failures,
        lastFailureKind,
      })
    ),
  };
}

function statsOf(body: unknown): AdminStats {
  if (
    !isRecord(body) ||
    body.ok !== true ||
    typeof body.usageAvailable !== 'boolean' ||
    !Array.isArray(body.codes)
  )
    throw new AdminApiError('The usage figures arrived in a shape the console does not read.');
  return {
    usage: body.usageAvailable ? new Map(body.codes.map(codeUsageOf)) : null,
    freeGrantStats: grantStatsOf(body.freeGrantStats),
  };
}

// The API words its refusals as { ok: false, error }; anything else a refusal carries is shown as
// its status.
function refusalMessage(body: unknown, status: number): string {
  if (isRecord(body) && typeof body.error === 'string' && body.error) return body.error;
  return `The request was refused (${status}).`;
}

async function bodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function createAdminApi(request: Fetch) {
  async function tokensCall(session: string, method: 'GET' | 'POST' | 'DELETE', token?: string) {
    const authorization = { Authorization: `Bearer ${session}` };
    const response = await request(
      ADMIN_TOKENS_PATH,
      token === undefined
        ? { method, headers: authorization }
        : {
            method,
            headers: { ...authorization, ...JSON_HEADERS },
            body: JSON.stringify({ token }),
          }
    );
    return { response, body: await bodyOf(response) };
  }

  async function mutate(
    session: string,
    method: 'POST' | 'DELETE',
    token: string
  ): Promise<MutationResult> {
    const { response, body } = await tokensCall(session, method, token);
    if (response.status === 401) return { kind: 'unauthorized' };
    if (!response.ok) return { kind: 'refused', message: refusalMessage(body, response.status) };
    if (!isRecord(body) || typeof body.changed !== 'boolean')
      throw new AdminApiError('The change arrived without saying whether it wrote anything.');
    return { kind: 'mutated', snapshot: snapshotOf(body), changed: body.changed };
  }

  return {
    async signIn(key: string): Promise<SignInResult> {
      const response = await request(ADMIN_LOGIN_PATH, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ key }),
      });
      const body = await bodyOf(response);
      if (!response.ok) return { kind: 'refused', message: refusalMessage(body, response.status) };
      if (!isRecord(body) || body.ok !== true || typeof body.session !== 'string' || !body.session)
        throw new AdminApiError('The sign-in arrived without a session.');
      return { kind: 'signedIn', session: body.session };
    },
    async list(session: string): Promise<ListResult> {
      const { response, body } = await tokensCall(session, 'GET');
      if (response.status === 401) return { kind: 'unauthorized' };
      if (!response.ok) throw new AdminApiError(refusalMessage(body, response.status));
      return { kind: 'listed', snapshot: snapshotOf(body) };
    },
    async stats(session: string): Promise<StatsResult> {
      const response = await request(ADMIN_STATS_PATH, {
        method: 'GET',
        headers: { Authorization: `Bearer ${session}` },
      });
      const body = await bodyOf(response);
      if (response.status === 401) return { kind: 'unauthorized' };
      if (!response.ok) throw new AdminApiError(refusalMessage(body, response.status));
      return { kind: 'read', stats: statsOf(body) };
    },
    add: (session: string, token: string) => mutate(session, 'POST', token),
    remove: (session: string, token: string) => mutate(session, 'DELETE', token),
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
