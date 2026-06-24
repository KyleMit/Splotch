import { getStore } from '@netlify/blobs';

// Per-token AI generation tally. The writer (recordTokenUsage) runs on every
// managed /api/generate-image call; the reader (getUsage) backs the /admin
// console. It lives in its own Netlify Blobs store ("ai-usage", dashboard →
// Blobs), keyed by the raw access token, separate from the token allowlist
// ("access-tokens") so audit writes never contend with allowlist mutations.
const STORE_NAME = 'ai-usage';

export interface TokenUsage {
  count: number;
  firstUsed: string;
  lastUsed: string;
  lastStyle: string | null;
  lastPrompt: string;
}

// Show only the last 4 chars of a token in logs — the full secret should never
// land in the function log or any downstream log drain.
function maskToken(token: unknown) {
  const t = String(token ?? '');
  return t.length <= 4 ? '****' : `…${t.slice(-4)}`;
}

/**
 * Record that a token generated an image, so we can spot a token going rogue.
 * Logs to the Netlify function log (real-time, synchronous) and keeps a durable
 * per-token tally in Blobs that the /admin console reads and we use to decide
 * which token to pull. Best-effort: a Blobs failure (e.g. plain `vite dev` with
 * no Blobs wired up) is logged, not thrown — usage tracking must never fail the
 * generation request.
 */
export async function recordTokenUsage(
  token: string,
  { style, prompt }: { style: string | null; prompt: string }
) {
  const now = new Date().toISOString();
  console.log(
    `[ai-usage] token=${maskToken(token)} style=${style || 'none'} prompt=${JSON.stringify(prompt)} at=${now}`
  );

  try {
    const store = getStore(STORE_NAME);
    const prev = ((await store.get(token, { type: 'json' })) as Partial<TokenUsage> | null) || {};
    await store.setJSON(token, {
      count: (prev.count || 0) + 1,
      firstUsed: prev.firstUsed || now,
      lastUsed: now,
      lastStyle: style || null,
      lastPrompt: prompt
    } satisfies TokenUsage);
  } catch (err) {
    console.warn(
      '[ai-usage] failed to persist usage to Netlify Blobs:',
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Read the usage tally for each token, as a map keyed by token. Tokens with no
 * recorded usage are omitted (so the caller can distinguish "never used" from a
 * Blobs outage). Eventual consistency (the default) is sufficient — slightly-stale
 * counts are fine here, and it sidesteps the strong-read context requirements
 * entirely (ADR-0025). Best-effort: any read failure yields an empty map rather
 * than throwing, so a Blobs hiccup never 500s the admin page.
 */
export async function getUsage(tokens: string[]): Promise<Record<string, TokenUsage>> {
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    console.warn(
      '[ai-usage] Netlify Blobs unavailable, no usage stats:',
      err instanceof Error ? err.message : err
    );
    return {};
  }

  const entries = await Promise.all(
    tokens.map(async (token) => {
      try {
        const usage = (await store.get(token, { type: 'json' })) as TokenUsage | null;
        return usage && typeof usage.count === 'number' ? ([token, usage] as const) : null;
      } catch (err) {
        console.warn(
          `[ai-usage] failed to read usage for a token:`,
          err instanceof Error ? err.message : err
        );
        return null;
      }
    })
  );

  const map: Record<string, TokenUsage> = {};
  for (const entry of entries) {
    if (entry) map[entry[0]] = entry[1];
  }
  return map;
}
