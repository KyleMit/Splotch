import { spawnPreviewChild } from './lib/web-host-processes.mjs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { isMain, runMain, parseNumberFlag, TCP_PORT } from '../lib/proc.mjs';
import { WEB_HOST_ENV, WEB_HOST_WRAPPER } from '../../migration/probes/web-host/host/contract.ts';
import { readWebHostArtifact } from './lib/web-host-artifact.mjs';

export async function serveWebHost(argv) {
  parseArgs({ args: argv, strict: true, allowPositionals: false });
  const { copyRoot, artifact } = readWebHostArtifact(process.env[WEB_HOST_ENV.artifactRoot]);
  if (process.env[WEB_HOST_ENV.port] === undefined)
    throw new Error('Owned preview requires an explicit port from the candidate browser caller');
  const port = parseNumberFlag('port', process.env[WEB_HOST_ENV.port], TCP_PORT);
  if ((process.env.PUBLIC_ENABLE_DEV_HARNESS === 'true') !== (artifact === 'mechanism'))
    throw new Error('Preview harness flags disagree with its built artifact');
  const child = spawnPreviewChild(
    process.execPath,
    [
      'tools/run-web-tool.mjs',
      'vite',
      'preview',
      '--config',
      join(copyRoot, WEB_HOST_WRAPPER),
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: copyRoot, env: process.env, stdio: 'inherit' }
  );
  const stop = () => child.kill('SIGTERM');
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) =>
        code === 0 || signal === 'SIGTERM'
          ? resolve()
          : reject(new Error(`Owned preview failed: ${code ?? signal}`))
      );
    });
  } finally {
    stop();
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
  }
}

if (isMain(import.meta.url)) runMain(() => serveWebHost(process.argv.slice(2)));
