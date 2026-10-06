import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PINNED_BUILD_METADATA_ENV } from '../../web/buildVersion.ts';
import { ROOT } from '../lib/proc.mjs';

const CONFIG_CHILD_TIMEOUT_MS = 30_000;
const require = createRequire(import.meta.url);
const kitConfigUrl = pathToFileURL(
  join(dirname(require.resolve('@sveltejs/kit/package.json')), 'src/core/config/index.js')
).href;
const webDirectory = join(ROOT, 'web');

function evaluatedConfig({ native, metadata, cwd = webDirectory, editor = false }) {
  const env = { ...process.env, CAPACITOR: String(native) };
  delete env[PINNED_BUILD_METADATA_ENV];
  if (metadata)
    env[PINNED_BUILD_METADATA_ENV] = JSON.stringify({ ...metadata, isCapacitor: native });
  const script = `
    const { load_config, load_svelte_config } = await import(${JSON.stringify(kitConfigUrl)});
    const config = ${editor ? `await load_svelte_config(${JSON.stringify(webDirectory)})` : `await load_config({ cwd: ${JSON.stringify(webDirectory)} })`};
    console.log(JSON.stringify({ version: config.kit.version.name, appDir: config.kit.appDir }));
  `;
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--disable-warning=ExperimentalWarning',
        '--input-type=module',
        '--eval',
        script,
      ],
      { cwd, env, encoding: 'utf8', timeout: CONFIG_CHILD_TIMEOUT_MS }
    )
  );
}

describe('SvelteKit version ownership', () => {
  it.each([
    ['web', false, '1.6.896'],
    ['native', true, '1.6.0'],
  ])('uses the actual metadata pin in evaluated %s config', (_label, native, appVersion) => {
    expect(
      evaluatedConfig({ native, metadata: { appVersion, buildTime: '2026-10-06 08:00' } })
    ).toEqual({ version: appVersion, appDir: '_app' });
  });

  it('reads the native package owner when an editor evaluates config from the repository root', () => {
    const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

    expect(evaluatedConfig({ native: true, cwd: ROOT, editor: true })).toEqual({
      version,
      appDir: '_app',
    });
  });
});
