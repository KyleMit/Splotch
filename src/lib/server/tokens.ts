import { env } from '$env/dynamic/private';
import { getStore } from '@netlify/blobs';

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

function seedFromEnv(): string[] {
  const raw = env.ALLOWED_TOKENS_LIST || '';
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Resolve the current token list and the backing store (if available).
 * Returns `{ store, list }` where `store` is null when Blobs is unavailable.
 */
async function readStore() {
  if (!blobsUnavailable) {
    try {
      const store = getStore(STORE_NAME);
      const list = await store.get(KEY, { type: 'json' });
      if (Array.isArray(list)) return { store, list };
      // First run against Blobs: seed from the env var so nothing is lost.
      const seeded = seedFromEnv();
      await store.setJSON(KEY, seeded);
      return { store, list: seeded };
    } catch (err) {
      const detail = err instanceof Error ? err.message : err;
      console.warn('[tokens] Netlify Blobs unavailable, using in-memory list:', detail);
      blobsUnavailable = true;
    }
  }
  if (memoryTokens === null) memoryTokens = seedFromEnv();
  return { store: null, list: memoryTokens };
}

async function persist(store: TokenStore | null, list: string[]) {
  if (store) {
    await store.setJSON(KEY, list);
  } else {
    memoryTokens = list;
  }
}

/** All currently allowed access tokens. */
export async function getTokens() {
  const { list } = await readStore();
  return [...list];
}

/** Whether `token` is currently allowed. */
export async function isAllowedToken(token: unknown) {
  if (typeof token !== 'string') return false;
  const { list } = await readStore();
  return list.includes(token);
}

/** Add a token. Returns `{ ok, error?, tokens? }`. */
export async function addToken(token: unknown) {
  const t = String(token ?? '').trim();
  if (!t) return { ok: false, error: 'Token cannot be empty' };
  const { store, list } = await readStore();
  if (list.includes(t)) return { ok: false, error: 'Token already exists' };
  const next = [...list, t];
  await persist(store, next);
  return { ok: true, tokens: next };
}

/** Remove a token. Returns `{ ok, tokens }`. */
export async function removeToken(token: unknown) {
  const t = String(token ?? '').trim();
  const { store, list } = await readStore();
  const next = list.filter((x: string) => x !== t);
  await persist(store, next);
  return { ok: true, tokens: next };
}
