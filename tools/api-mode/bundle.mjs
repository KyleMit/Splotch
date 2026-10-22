import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';
import { ROOT } from '../lib/proc.mjs';
import { apiSelectionPlugin } from '../lib/api-mode.mjs';

export async function bundleApiMode(mode) {
  const directory = join(ROOT, 'netlify/functions');
  const input = Object.fromEntries(
    readdirSync(directory)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => [name.slice(0, -3), join(directory, name)])
  );
  const result = await build({
    configFile: false,
    envDir: false,
    root: ROOT,
    logLevel: 'silent',
    plugins: [apiSelectionPlugin(mode)],
    ssr: { noExternal: true, external: ['sharp'] },
    build: { ssr: true, write: false, rollupOptions: { input } },
  });
  const chunks = (Array.isArray(result) ? result : [result])
    .flatMap((output) => output.output)
    .filter((chunk) => chunk.type === 'chunk');
  return {
    code: chunks.map((chunk) => chunk.code).join('\n'),
    modules: chunks.flatMap((chunk) => Object.keys(chunk.modules)),
  };
}

export function assertApiBundle(mode, bundle) {
  assert.ok(bundle.code.length > 0, 'Function bundle must not be empty');
  if (mode === 'production') {
    assert.doesNotMatch(bundle.code, /FAKE_IMAGE_DELAY_MS|sk-test-success/);
    assert.ok(
      !bundle.modules.some((path) => /(?:ai\/fake|githubTest|deploymentTest)\.ts$/.test(path)),
      'Production bundle contains a fake implementation'
    );
  } else {
    assert.ok(
      !bundle.modules.some((path) =>
        /(?:node_modules\/openai\/|ai\/openai\.ts$|githubProduction\.ts$)/.test(path)
      ),
      'Test bundle contains an outside-effects implementation'
    );
    assert.doesNotMatch(bundle.code, /api\.openai\.com|api\.github\.com/);
  }
}
