import { randomUUID } from 'node:crypto';
import { parseNumberFlag, TCP_PORT } from '../tools/lib/proc.mjs';
import { contractServerEnv } from '../tools/api-smoke/lib/server-env.mjs';
import { startTestApiEnvironment } from '../tools/api-smoke/lib/test-api-environment.mjs';
import { startNetlifySite } from './server/netlifySite.ts';
import { test as base } from './fixtures.ts';
import { forbidRequestStubs } from './support/real-api-routing.ts';

export { expect } from '@playwright/test';
type ApiEnvironment = Awaited<ReturnType<typeof startTestApiEnvironment>>;

export const test = base.extend<{ apiEnvironment: ApiEnvironment; apiOrigin: string }>({
  apiEnvironment: async ({ browserName }, use) => {
    const environment = await startTestApiEnvironment(
      contractServerEnv(`${browserName}-${randomUUID()}`, 'test')
    );
    try {
      await use(environment);
    } finally {
      await environment.close();
    }
  },
  apiOrigin: async ({ apiEnvironment }, use) => {
    const port = parseNumberFlag('SPLOTCH_E2E_PORT', process.env.SPLOTCH_E2E_PORT ?? '', TCP_PORT);
    const site = await startNetlifySite({ port, env: apiEnvironment.env });
    try {
      await use(site.origin);
    } finally {
      await site.close();
    }
  },
  baseURL: async ({ apiOrigin }, use) => {
    await use(apiOrigin);
  },
  context: async ({ context }, use) => {
    forbidRequestStubs(context);
    context.on('page', forbidRequestStubs);
    await use(context);
  },
});
