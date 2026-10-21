// The suite's web server: the published export and its functions on one loopback origin, until
// Playwright stops it. `node e2e/server/serve.ts --port <port>`.

import { parseArgs } from 'node:util';
import { parseNumberFlag, TCP_PORT } from '../../tools/lib/proc.mjs';
import { startNetlifySite } from './netlifySite.ts';
import { E2E_SERVER_ENV } from './serverEnv.ts';

const { values } = parseArgs({ options: { port: { type: 'string' } } });
if (values.port === undefined) throw new Error('serve.ts needs --port <port>');
const site = await startNetlifySite({
  port: parseNumberFlag('port', values.port, TCP_PORT),
  env: E2E_SERVER_ENV,
});
console.log(`[rn-e2e] serving the export at ${site.origin}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => void site.close().then(() => process.exit(0)));
