import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { isMain, runMain, parseNumberFlag, TCP_PORT } from '../lib/proc.mjs';
import { writeOwnedJson } from './lib/web-host-ownership.mjs';
import { WEB_HOST_ENV } from '../../migration/probes/web-host/host/contract.ts';
import { readWebHostArtifact } from './lib/web-host-artifact.mjs';
import { PINNED_APP_SHELL_NONCE_ENV } from '../../web/appShellBuildNonce.ts';
import {
  copiedBuildEnvironment,
  freshBrowserEnvironment,
  runCopiedChild,
} from './lib/web-host-build.mjs';
import {
  assertBrowserRegistry,
  browserRegistryEvidence,
  createBrowserInvocation,
  requireBrowserRegistry,
  withBrowserRegistry,
} from './lib/web-host-browser.mjs';

function writeBrowserChildRecord(owned, record, registry, invocation) {
  writeOwnedJson(owned, `controls/${record.label}.json`, {
    ...record,
    borrowedBrowserRegistry: browserRegistryEvidence(registry),
    browserInvocation: invocation,
  });
}

export async function testWebHost(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'artifact-root': { type: 'string' },
      'browser-registry': { type: 'string' },
      port: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.port === undefined)
    throw new Error('Select an explicit unused --port before starting the owned control preview');
  const port = parseNumberFlag('port', values.port, TCP_PORT);
  const { owned, inputs, artifact, copyRoot, request, publicationEnvironment } =
    readWebHostArtifact(values['artifact-root']);
  const registry = requireBrowserRegistry(values['browser-registry']);
  const invocation = createBrowserInvocation(owned);
  const env = freshBrowserEnvironment(
    owned,
    withBrowserRegistry(
      {
        ...copiedBuildEnvironment(owned, copyRoot, artifact, inputs.pinned.env, request),
        ...publicationEnvironment,
        [WEB_HOST_ENV.port]: String(port),
        [WEB_HOST_ENV.browserRun]: invocation.label,
        SPLOTCH_E2E_PORT: String(port),
      },
      registry
    )
  );
  delete env[PINNED_APP_SHELL_NONCE_ENV];
  readWebHostArtifact(values['artifact-root']);
  assertBrowserRegistry(registry);
  let record;
  try {
    record = await runCopiedChild({
      owned,
      copyRoot,
      env,
      label: invocation.label,
      command: process.execPath,
      args: [
        'tools/run-web-tool.mjs',
        'playwright',
        'test',
        '--config',
        join(copyRoot, 'migration/probes/web-host/playwright.config.ts'),
        '--workers=1',
      ],
    });
  } catch (error) {
    if (error.childRecord) writeBrowserChildRecord(owned, error.childRecord, registry, invocation);
    throw error;
  }
  writeBrowserChildRecord(owned, record, registry, invocation);
  console.log(
    `${request.variant} browser smoke completed for ${artifact}; full host, deployed and physical acceptance remain pending`
  );
}

if (isMain(import.meta.url)) runMain(() => testWebHost(process.argv.slice(2)));
