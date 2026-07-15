import { env } from '$env/dynamic/private';
import { getStore } from '@netlify/blobs';
import { deleteUsage } from './usage';

// Access tokens used to be a static comma-separated env var (ALLOWED_TOKENS_LIST).
// They now live in Netlify Blobs so they can be added/removed at runtime from the
// admin page. The env var is only used as a one-time seed on first read, which
// keeps existing tokens working through the migration and during local dev.
const STORE_NAME = 'access-tokens';
const KEY = 'list';

// In-memory fallback for environments where Netlify Blobs isn't wired up
// (e.g. plain `vite dev`). Mutations there won't survive a restart.
let memoryTokens: string[] | null = null;
// Once Blobs fails once, skip retrying it for the lifetime of this instance.
let blobsUnavailable = false;

type TokenStore = ReturnType<typeof getStore>;
type StoreRead =
  | { source: 'blobs'; store: TokenStore; list: string[]; etag?: string }
  | { source: 'memory'; store: null; list: string[]; etag?: undefined }
  | { source: 'unconfirmed'; store: TokenStore; list: []; etag?: undefined };

const SEED_CONFIRMATION_ATTEMPTS = 3;
// Backoff before each confirmation reread. A `modified: false` means the write
// landed on a replica this one hasn't caught up to yet, so rereading instantly
// just re-hits the same lag; a short, growing pause gives eventual consistency a
// moment to converge. A strong-consistency read would confirm deterministically,
// but it throws BlobsConsistencyError in this SSR Blobs context (ADR-0025) — which
// would make every lost seed race fail to confirm, strictly worse than pacing
// eventual reads — so we stay on eventual and just space the attempts.
const SEED_CONFIRMATION_BACKOFF_MS = 50;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function seedFromEnv(): string[] {
  const raw = env.ALLOWED_TOKENS_LIST || '';
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

// Open the Blobs store, or null when Blobs isn't configured at all (e.g. plain
// `vite dev`, where getStore throws MissingBlobsEnvironmentError). That's a
// permanent property of the instance, so we latch it to avoid retrying. A
// transient *operation* failure must NOT latch — see readStore.
function openStore(): TokenStore | null {
  if (blobsUnavailable) return null;
  try {
    return getStore(STORE_NAME);
  } catch (err) {
    const detail = err instanceof Error ? err.message : err;
    console.warn('[tokens] Netlify Blobs unavailable, using in-memory list:', detail);
    blobsUnavailable = true;
    return null;
  }
}

/**
 * Resolve the current token list and the backing store (if available).
 * `source` distinguishes confirmed Blobs data, the explicit local-memory
 * fallback, and a lost seed race whose winning value could not be confirmed.
 * `etag` identifies the exact blob version the list came from so mutations can
 * compare-and-set against it; read-only callers ignore it.
 */
async function readStore(): Promise<StoreRead> {
  const store = openStore();
  if (store) {
    try {
      // Eventual consistency (the default) is sufficient here and sidesteps the
      // strong-read context requirements entirely (ADR-0025). Its one cost: a
      // replica lagging the latest write can report the key as absent and trip
      // the seed-on-empty branch below — which the `onlyIfNew` write makes atomic
      // so it can never clobber an existing list.
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
      for (let attempt = 1; attempt <= SEED_CONFIRMATION_ATTEMPTS; attempt++) {
        await sleep(SEED_CONFIRMATION_BACKOFF_MS * attempt);
        try {
          const winner = await store.getWithMetadata(KEY, { type: 'json' });
          if (winner && Array.isArray(winner.data)) {
            return { source: 'blobs', store, list: winner.data, etag: winner.etag };
          }
        } catch {
          // Keep trying so a single transient read failure does not deny a current token.
        }
      }
      console.warn('[tokens] Lost env-seed race but could not confirm the current list');
      return { source: 'unconfirmed', store, list: [] };
    } catch (err) {
      // Transient Blobs error: degrade to memory for THIS request only. Do not
      // latch blobsUnavailable, or one blip would make the warm instance
      // silently drop every future write.
      const detail = err instanceof Error ? err.message : err;
      console.warn('[tokens] Netlify Blobs read failed, using in-memory list:', detail);
    }
  }
  if (memoryTokens === null) memoryTokens = seedFromEnv();
  return { source: 'memory', store: null, list: memoryTokens };
}

// Compare-and-set write, same pattern as usage.ts's recordTokenUsage: two
// concurrent mutations (web /admin form action + native /api/admin/tokens, or
// two admins) must serialize instead of one silently clobbering the other.
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

/** All currently allowed access tokens. */
export async function getTokens() {
  const { list } = await readStore();
  return [...list];
}

/**
 * Like getTokens, but also reports whether the list is durably backed by Netlify
 * Blobs (`persistent: true`) or came from the per-instance in-memory fallback
 * seeded from ALLOWED_TOKENS_LIST (`persistent: false`). A null store from
 * readStore is exactly the fallback case — Blobs is unconfigured or a read
 * failed — so edits won't survive a cold start. The /admin page surfaces this as
 * a banner so an operator isn't fooled by env-seeded data that looks live.
 */
export async function getTokensStatus(): Promise<{ tokens: string[]; persistent: boolean }> {
  const read = await readStore();
  return { tokens: [...read.list], persistent: read.source === 'blobs' };
}

/** Whether `token` is currently allowed. */
export async function isAllowedToken(token: unknown) {
  if (typeof token !== 'string') return false;
  const read = await readStore();
  return read.source !== 'unconfirmed' && read.list.includes(token);
}

// Each attempt re-runs the whole read-modify cycle (dup-check/filter included)
// so a lost CAS race retries against the winner's list, not the stale one.
// Unlike usage.ts we do NOT concede after the retries: under eventual
// consistency (ADR-0025) they can exhaust, and an admin mutation that quietly
// did nothing is as bad as the clobber the CAS prevents — so it surfaces as
// `{ ok: false, error }` for the /admin form action and /api/admin/tokens to
// report.
const MUTATION_ATTEMPTS = 3;
export const TOKEN_CONFLICT_ERROR = 'The token list changed while saving — please try again';

type MutationResult = { ok: true; tokens: string[] } | { ok: false; error: string };

/** Add a token. Returns `{ ok, tokens }` or `{ ok: false, error }`. */
export async function addToken(token: unknown): Promise<MutationResult> {
  const t = String(token ?? '').trim();
  if (!t) return { ok: false, error: 'Token cannot be empty' };
  for (let attempt = 1; attempt <= MUTATION_ATTEMPTS; attempt++) {
    const read = await readStore();
    if (read.source === 'unconfirmed') return { ok: false, error: TOKEN_CONFLICT_ERROR };
    const { store, list, etag } = read;
    if (list.includes(t)) return { ok: false, error: 'Token already exists' };
    const next = [...list, t];
    if (await persist(store, next, etag)) return { ok: true, tokens: next };
  }
  return { ok: false, error: TOKEN_CONFLICT_ERROR };
}

/** Remove a token. Returns `{ ok, tokens }` or `{ ok: false, error }`. */
export async function removeToken(token: unknown): Promise<MutationResult> {
  const t = String(token ?? '').trim();
  for (let attempt = 1; attempt <= MUTATION_ATTEMPTS; attempt++) {
    const read = await readStore();
    if (read.source === 'unconfirmed') return { ok: false, error: TOKEN_CONFLICT_ERROR };
    const { store, list, etag } = read;
    const next = list.filter((x: string) => x !== t);
    // A no-op remove must not rewrite the blob: under eventual consistency the
    // list may be a stale replica read, and persisting it would clobber a token
    // another admin just added.
    if (next.length === list.length) return { ok: true, tokens: next };
    if (await persist(store, next, etag)) {
      await deleteUsage(t);
      return { ok: true, tokens: next };
    }
  }
  return { ok: false, error: TOKEN_CONFLICT_ERROR };
}
