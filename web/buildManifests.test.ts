// @vitest-environment node
import type { Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import config from './vite.config';

type EmittedAsset = { fileName: string; source: string };

function emitBuildManifestsPlugin(): Plugin {
  const plugins = (config.plugins ?? []).flat(Infinity) as Plugin[];
  const plugin = plugins.find((candidate) => candidate?.name === 'emit-build-manifests');
  if (!plugin) throw new Error('vite.config.ts no longer declares an emit-build-manifests plugin');
  return plugin;
}

function assetsEmittedIntoTheBuild(): EmittedAsset[] {
  const emitted: EmittedAsset[] = [];
  const { generateBundle } = emitBuildManifestsPlugin();
  const hook = typeof generateBundle === 'function' ? generateBundle : generateBundle?.handler;
  hook?.call(
    { emitFile: (asset: EmittedAsset) => emitted.push(asset) },
    // generateBundle ignores both, and the plugin emits unconditionally.
    {} as never,
    {} as never,
    { write: true }
  );
  return emitted;
}

async function assetServedInDev(pathname: string): Promise<{ status: number; body: string }> {
  const { configureServer } = emitBuildManifestsPlugin();
  const hook = typeof configureServer === 'function' ? configureServer : configureServer?.handler;
  let middleware: ((request: unknown, response: unknown, next: () => void) => void) | undefined;
  await hook?.call(
    {} as never,
    {
      middlewares: { use: (fn: typeof middleware) => (middleware = fn) },
    } as never
  );
  if (!middleware) throw new Error('emit-build-manifests registered no dev middleware');

  let status = 0;
  let body = '';
  const headers: Record<string, string> = {};
  middleware(
    { url: pathname },
    {
      setHeader: (name: string, value: string) => (headers[name] = value),
      end: (chunk: string) => {
        status = 200;
        body = chunk;
      },
    },
    () => {
      status = 404;
    }
  );
  if (status === 200) expect(headers['Content-Type']).toBe('application/json');
  return { status, body };
}

// generateBundle is a build-only hook. When these two hooks disagree, the app
// runs against files that exist in production and 404 in development — silently,
// because only the coloring-pack manager's first fetch notices.
describe('emit-build-manifests', () => {
  it('serves every built manifest in dev, byte for byte', async () => {
    const emitted = assetsEmittedIntoTheBuild();
    expect(emitted.length).toBeGreaterThan(0);

    for (const { fileName, source } of emitted) {
      await expect(assetServedInDev(`/${fileName}`)).resolves.toEqual({
        status: 200,
        body: source,
      });
    }
  });

  it('emits a version.json and a versioned coloring-pack manifest', () => {
    const fileNames = assetsEmittedIntoTheBuild().map((asset) => asset.fileName);

    expect(fileNames).toContain('version.json');
    expect(fileNames).toContainEqual(expect.stringMatching(/^coloring\/manifest-.+\.json$/));
  });

  it('passes unrelated requests through to SvelteKit', async () => {
    await expect(assetServedInDev('/privacy')).resolves.toMatchObject({ status: 404 });
  });

  it('matches on the path alone, so a cache-busting query still resolves', async () => {
    await expect(assetServedInDev('/version.json?t=1')).resolves.toMatchObject({ status: 200 });
  });
});
