import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadNetlifyFunctions, startNetlifyFunctionHost } from '../lib/netlify-function-host.mjs';
import { ROOT } from '../lib/proc.mjs';

// Loading the function's module graph transforms every server module it reaches.
const GRAPH_LOAD_TIMEOUT_MS = 60_000;
const RUNTIME_MODE_MODULE = join(ROOT, 'netlify/server/runtimeMode.ts');
const HOST_ADMIN_SECRET = 'function-host-test-secret';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('loadNetlifyFunctions', () => {
  it(
    'loads each mode as runtimeMode reads it and hands NODE_ENV back unchanged',
    async () => {
      vi.stubEnv('NODE_ENV', 'caller-value');
      for (const [mode, dev] of [
        ['development', true],
        ['production', false],
      ]) {
        const functions = await loadNetlifyFunctions(mode);
        try {
          expect((await functions.serverModule(RUNTIME_MODE_MODULE)).dev, mode).toBe(dev);
          expect(process.env.NODE_ENV, mode).toBe('caller-value');
        } finally {
          await functions.close();
        }
      }
    },
    GRAPH_LOAD_TIMEOUT_MS
  );
});

describe('startNetlifyFunctionHost', () => {
  it(
    "answers a claimed path from the function, under the caller's env, and any other with a 404",
    async () => {
      vi.stubEnv('ADMIN_ACCESS_TOKEN', '');
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const host = await startNetlifyFunctionHost({
        mode: 'development',
        port: 0,
        env: { ADMIN_ACCESS_TOKEN: HOST_ADMIN_SECRET },
      });
      try {
        const login = await fetch(`${host.origin}/api/admin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: HOST_ADMIN_SECRET }),
        });
        expect(login.status).toBe(200);
        expect((await login.json()).ok).toBe(true);

        const unclaimed = await fetch(`${host.origin}/api/not-a-function`);
        expect(unclaimed.status).toBe(404);
        expect(await unclaimed.text()).toBe('Not Found');
      } finally {
        await host.close();
      }
    },
    GRAPH_LOAD_TIMEOUT_MS
  );
});
