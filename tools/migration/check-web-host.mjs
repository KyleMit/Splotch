import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { isMain, runMain } from '../lib/proc.mjs';
import { readWebHostArtifact } from './lib/web-host-artifact.mjs';
import { copiedBuildEnvironment, runCopiedChild } from './lib/web-host-build.mjs';
import { collectWebHostEvidence } from './lib/web-host-evidence.mjs';

export async function checkWebHost(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { 'artifact-root': { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  const { owned, inputs, artifact, copyRoot, request, publicationEnvironment } =
    readWebHostArtifact(values['artifact-root']);
  const env = {
    ...copiedBuildEnvironment(owned, copyRoot, artifact, inputs.pinned.env, request),
    ...publicationEnvironment,
  };
  await runCopiedChild({
    owned,
    copyRoot,
    env,
    label: `recheck-types-${Date.now()}`,
    command: process.execPath,
    args: [
      'tools/run-web-tool.mjs',
      'tsc',
      '--project',
      join(copyRoot, 'migration/probes/web-host/tsconfig.json'),
    ],
  });
  readWebHostArtifact(values['artifact-root']);
  if (request.variant === 'neutral-embedded') {
    await runCopiedChild({
      owned,
      copyRoot,
      env,
      label: `recheck-svelte-types-${Date.now()}`,
      command: process.execPath,
      args: [
        'tools/run-web-tool.mjs',
        'svelte-check',
        '--tsconfig',
        join(copyRoot, 'migration/probes/web-host/tsconfig.json'),
        '--fail-on-warnings',
      ],
    });
    readWebHostArtifact(values['artifact-root']);
  }
  const [bundle, pwa] = await Promise.all([
    import(pathToFileURL(join(copyRoot, 'tools/check-bundle-budgets.mjs')).href),
    import(pathToFileURL(join(copyRoot, 'tools/check-pwa-precache.mjs')).href),
  ]);
  const owner = { bundle, pwa };
  collectWebHostEvidence(owned, inputs, owner);
  readWebHostArtifact(values['artifact-root']);
  console.log(
    `Structural ${request.variant} checked: ${owned.root}; ${inputs.snapshot.provisional ? 'provisional source' : 'committed source'}; remaining acceptance stays pending`
  );
}

if (isMain(import.meta.url)) runMain(() => checkWebHost(process.argv.slice(2)));
