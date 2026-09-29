import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { getStore } from '@netlify/blobs';
import { sleep } from './sleep';
import { deleteUsage } from './usage';

// Access tokens live in Netlify Blobs so they can be added/removed at runtime from the
// admin page. ALLOWED_TOKENS_LIST is only a one-time seed on first read, which keeps
// pre-Blobs deployments and local dev working.
const STORE_NAME = 'access-tokens';
const KEY = 'list';

// In-memory fallback for reads when Netlify Blobs isn't wired up. Only Vite dev
// may mutate it; every production-shaped runtime must fail closed.
let memoryTokens: string[] | null = null;
// Once Blobs fails once, skip retrying it for the lifetime of this instance.
let blobsUnavailable = false;

type TokenStore = ReturnType<typeof getStore>;
// Why the seed-race winner stayed unknown. Reads allow nothing either way, but a store
// that never once answered is the same unreachable condition as `degraded`, so
// a mutation must report it as such rather than as a losable race.
type UnconfirmedCause = 'stale' | 'unreachable';
// Why a production-shaped read fell back to the env seed. With no Blobs in the
// runtime the seed is the only list this instance has; after a Blobs read threw,
// the durable list still exists and holds codes the seed never had.
type DegradedCause = 'unconfigured' | 'unreachable';
type StoreRead =
  | { source: 'blobs'; store: TokenStore; list: string[]; etag?: string }
  | { source: 'memory'; store: null; list: string[]; etag?: undefined }
  | { source: 'degraded'; cause: DegradedCause; store: null; list: string[]; etag?: undefined }
  | {
      source: 'unconfirmed';
      cause: UnconfirmedCause;
      store: TokenStore;
      list: [];
      etag?: undefined;
    };

const SEED_CONFIRMATION_ATTEMPTS = 3;
// Backoff before each confirmation reread. A `modified: false` means the write
// landed on a replica this one hasn't caught up to yet, so rereading instantly
// just re-hits the same lag; a short, growing pause gives eventual consistency a
// moment to converge.
const SEED_CONFIRMATION_BACKOFF_MS = 50;

function seedFromEnv(): string[] {
  const raw = env.ALLOWED_TOKENS_LIST || '';
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

// Open the Blobs store, or null when Blobs isn't configured. That's a permanent
// property of the instance, so we latch it to avoid retrying. A transient
// *operation* failure must NOT latch — see readStore.
function openStore(): TokenStore | null {
  if (blobsUnavailable) return null;
  try {
    // Eventual reads suffice because no request here depends on reading its own
    // write (ADR-0025); a store whose requests do reads strongly (ADR-0105).
    return getStore({ name: STORE_NAME, consistency: 'eventual' });
  } catch (err) {
    const detail = err instanceof Error ? err.message : err;
    console.warn('[tokens] Netlify Blobs unavailable, using in-memory reads:', detail);
    blobsUnavailable = true;
    return null;
  }
}

async function confirmSeedRaceWinner(store: TokenStore): Promise<StoreRead> {
  // An attempt that resolves — even to an absent key — proves the store is
  // answering, so only an all-throws exhaustion counts as unreachable.
  let answered = false;
  for (let attempt = 1; attempt <= SEED_CONFIRMATION_ATTEMPTS; attempt++) {
    await sleep(SEED_CONFIRMATION_BACKOFF_MS * attempt);
    try {
      const winner = await store.getWithMetadata(KEY, { type: 'json' });
      answered = true;
      if (winner && Array.isArray(winner.data)) {
        return { source: 'blobs', store, list: winner.data, etag: winner.etag };
      }
    } catch {
      // Keep trying so a single transient read failure does not deny a current token.
    }
  }
  console.warn('[tokens] Lost env-seed race but could not confirm the current list');
  return { source: 'unconfirmed', cause: answered ? 'stale' : 'unreachable', store, list: [] };
}

// The in-memory list stands in for Blobs in two situations reads may treat
// alike but writes may not. `memory` is the intentional writable Vite-dev mode.
// `degraded` covers every production-shaped getStore failure and any Blobs read
// failure, where accepting a mutation would report success without durability.
// Reads serve the seed in both; only checkAccessToken tells a miss apart.
function memoryList(): string[] {
  if (memoryTokens === null) memoryTokens = seedFromEnv();
  return memoryTokens;
}

function degradedRead(cause: DegradedCause): StoreRead {
  return { source: 'degraded', cause, store: null, list: memoryList() };
}

/**
 * Resolve the current token list and the backing store (if available).
 * `source` distinguishes confirmed Blobs data, the two in-memory stand-ins
 * (`memory`/`degraded`, see above), and a lost seed race whose winning value
 * could not be confirmed. `etag` identifies the exact blob version the list
 * came from so mutations can compare-and-set against it; read-only callers
 * ignore it.
 */
async function readStore(): Promise<StoreRead> {
  const store = openStore();
  if (store) {
    try {
      // The one cost of an eventual read here: a replica lagging the latest
      // write can report the key as absent and trip the seed-on-empty branch
      // below — which the `onlyIfNew` write makes atomic so it can never
      // clobber an existing list.
      const existing = await store.getWithMetadata(KEY, { type: 'json' });
      if (existing && Array.isArray(existing.data)) {
        return { source: 'blobs', store, list: existing.data, etag: existing.etag };
      }
      // First run against Blobs (or a stale-empty read): seed from the env var,
      // but only if the key truly doesn't exist yet, so a lagging replica can't
      // overwrite tokens the admin already saved.
      const seeded = seedFromEnv();
      const seededWrite = await store.setJSON(KEY, seeded, { onlyIfNew: true });
      if (seededWrite.modified) {
        return { source: 'blobs', store, list: seeded, etag: seededWrite.etag };
      }
      return confirmSeedRaceWinner(store);
    } catch (err) {
      // Transient Blobs error: degrade to memory for THIS request only. Do not
      // latch blobsUnavailable, or one blip would make the warm instance
      // silently drop every future write.
      const detail = err instanceof Error ? err.message : err;
      console.warn('[tokens] Netlify Blobs read failed, using in-memory list:', detail);
      return degradedRead('unreachable');
    }
  }
  return dev ? { source: 'memory', store: null, list: memoryList() } : degradedRead('unconfigured');
}

// Compare-and-set write, same pattern as usage.ts's recordTokenUsage: two
// concurrent mutations (the /admin form action + /api/admin/tokens, or two
// admins) must serialize instead of one silently clobbering the other.
// Returns whether the write landed; a `modified: false` result means the blob
// changed since our read and the caller must re-run its read-modify cycle.
async function persist(store: TokenStore | null, list: string[], etag: string | undefined) {
  if (!store) {
    memoryTokens = list;
    return true;
  }
  const condition = etag ? { onlyIfMatch: etag } : { onlyIfNew: true as const };
  const { modified } = await store.setJSON(KEY, list, condition);
  return modified;
}

/**
 * All currently allowed access tokens, plus whether the list is durably backed
 * by Netlify Blobs (`persistent: true`) or came from the per-instance in-memory
 * fallback seeded from ALLOWED_TOKENS_LIST (`persistent: false`). A null store from
 * readStore is exactly the fallback case — `getStore()` failed, or this read
 * did. Edits are accepted only when SvelteKit identifies the runtime as Vite
 * dev; every production-shaped fallback refuses them (see mutateList). The
 * /admin page surfaces the shared signal as a banner so an operator isn't
 * fooled by env-seeded data that looks live.
 */
export async function getTokensStatus(): Promise<{ tokens: string[]; persistent: boolean }> {
  const read = await readStore();
  return { tokens: [...read.list], persistent: read.source === 'blobs' };
}

// `spendsGuess` is whether the answer told the caller anything about this
// token, which is what the shared failed-guess budget (ADR-0014) meters. Only
// this module knows, so callers charge on the flag instead of on the verdict.
type AccessTokenCheck =
  | { verdict: 'allowed' }
  | { verdict: 'denied'; spendsGuess: true }
  | { verdict: 'unavailable'; spendsGuess: boolean };

/**
 * What the allowlist says about `token`. `unavailable` means the durable list
 * could not be read, so a miss is not a wrong code; it never allows anything.
 */
export async function checkAccessToken(token: unknown): Promise<AccessTokenCheck> {
  if (typeof token !== 'string') return { verdict: 'denied', spendsGuess: true };
  const read = await readStore();
  // No list at all: every token gets this same answer, so it reveals nothing.
  if (read.source === 'unconfirmed') return { verdict: 'unavailable', spendsGuess: false };
  if (read.list.includes(token)) return { verdict: 'allowed' };
  // The seed lacks every code added in /admin, so this miss is not a wrong
  // code. It still spends a guess: the seed hit above answers differently, so
  // an uncharged miss would let a caller enumerate the seed during an outage.
  if (read.source === 'degraded' && read.cause === 'unreachable') {
    return { verdict: 'unavailable', spendsGuess: true };
  }
  return { verdict: 'denied', spendsGuess: true };
}

// Each attempt re-runs the whole read-modify cycle (dup-check/filter included)
// so a lost CAS race retries against the winner's list, not the stale one.
// Unlike usage.ts we do NOT concede after the retries: under eventual
// consistency (ADR-0025) they can exhaust, and an admin mutation that quietly
// did nothing is as bad as the clobber the CAS prevents — so it surfaces as
// `{ ok: false, error }` for the /admin form action and /api/admin/tokens to
// report.
const MUTATION_ATTEMPTS = 3;
// Same rationale as SEED_CONFIRMATION_BACKOFF_MS above: a lost CAS race means the
// write landed on a replica this instance hasn't caught up to yet, so rereading
// instantly just re-hits the same lag. Only retries (attempt > 1) pace themselves —
// the first, uncontended attempt always fires immediately.
const MUTATION_BACKOFF_MS = 50;
export const TOKEN_CONFLICT_ERROR = 'The token list changed while saving — please try again';
export const TOKEN_UNAVAILABLE_ERROR =
  'Token storage is unavailable right now — nothing was saved. Please try again.';

// `reason` is what callers branch on (HTTP status, form handling) — the `error`
// string is UX copy and rewording it must never change behaviour.
export type MutationFailure = {
  ok: false;
  error: string;
  reason: 'invalid' | 'conflict' | 'unavailable';
};

// Both front doors — the /admin form action and /api/admin/tokens — must answer
// the same underlying failure with the same status, so the mapping is declared
// once here instead of restated at each door. A caller-fault validation failure
// is the caller's to correct; a conflict and an unreachable store are both
// transient and worth retrying as-is.
export const MUTATION_FAILURE_STATUS = {
  invalid: 400,
  conflict: 409,
  unavailable: 503,
} as const satisfies Record<MutationFailure['reason'], number>;

// A mutation carries one short token; the remainder is framing headroom. Both
// front doors read their body under it.
export const MAX_TOKEN_MUTATION_BODY_BYTES = 8 * 1024;

// `persistent` rides along because mutateList already knows it: it refuses to
// write unless the read came from Blobs or the Vite-dev memory stand-in, so the
// durability of the list it returns is settled by the same read. A caller that
// re-derived it would be asking the store a question it has just been answered,
// and racing its own write to do so. `changed` is false when the transform had
// nothing to do, so a caller never confirms a removal that matched no token.
export type MutationResult =
  { ok: true; tokens: string[]; persistent: boolean; changed: boolean } | MutationFailure;

function unconfirmedFailure(cause: UnconfirmedCause): MutationFailure {
  return cause === 'unreachable'
    ? { ok: false, error: TOKEN_UNAVAILABLE_ERROR, reason: 'unavailable' }
    : { ok: false, error: TOKEN_CONFLICT_ERROR, reason: 'conflict' };
}

type Transform = (
  list: string[]
) => { next: string[] } | { error: string; reason: 'invalid' } | { noop: true };

async function mutateList(
  transform: Transform,
  afterPersist?: (next: string[]) => Promise<void>
): Promise<MutationResult> {
  for (let attempt = 1; attempt <= MUTATION_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(MUTATION_BACKOFF_MS * attempt);
    const read = await readStore();
    // Neither exit knows the durable list, so neither may write. They differ
    // only in what to tell the caller: a store that answered is a race worth
    // retrying as-is, a store that never answered is an outage.
    if (read.source === 'unconfirmed') return unconfirmedFailure(read.cause);
    // A degraded read hands back the in-memory stand-in for a list that is
    // still durably stored elsewhere. Persisting into it would report a
    // revocation the blob never saw — one recovery silently undoes, leaving the
    // token valid — so fail loudly instead.
    if (read.source === 'degraded')
      return { ok: false, error: TOKEN_UNAVAILABLE_ERROR, reason: 'unavailable' };
    const { store, list, etag } = read;
    const persistent = read.source === 'blobs';
    const result = transform(list);
    if ('error' in result) return { ok: false, error: result.error, reason: result.reason };
    if ('noop' in result) return { ok: true, tokens: [...list], persistent, changed: false };
    if (await persist(store, result.next, etag)) {
      if (afterPersist) await afterPersist(result.next);
      return { ok: true, tokens: result.next, persistent, changed: true };
    }
  }
  return { ok: false, error: TOKEN_CONFLICT_ERROR, reason: 'conflict' };
}

/** Add a token. Returns `{ ok, tokens, changed: true }` or `{ ok: false, error }`. */
export async function addToken(token: unknown): Promise<MutationResult> {
  const t = String(token ?? '').trim();
  if (!t) return { ok: false, error: 'Token cannot be empty', reason: 'invalid' };
  return mutateList((list) =>
    list.includes(t) ? { error: 'Token already exists', reason: 'invalid' } : { next: [...list, t] }
  );
}

/**
 * Remove a token. Returns `{ ok, tokens, changed }`, where `changed: false`
 * means no token matched and nothing was written, or `{ ok: false, error }`.
 */
export async function removeToken(token: unknown): Promise<MutationResult> {
  const t = String(token ?? '').trim();
  return mutateList(
    (list) => {
      // Empty/no-match input isn't a special case: it just never matches, so it
      // falls into the same no-op path below as a real, unmatched token.
      const next = list.filter((x) => x !== t);
      // A no-op remove must not rewrite the blob: under eventual consistency the
      // list may be a stale replica read, and persisting it would clobber a token
      // another admin just added.
      return next.length === list.length ? { noop: true } : { next };
    },
    () => deleteUsage(t)
  );
}
