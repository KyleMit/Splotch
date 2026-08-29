// @vitest-environment node
import { describe, expect, it } from 'vitest';
import config from './vite.config';

type EmittedAsset = { fileName: string; source: string };
type PluginLike = { name?: unknown; generateBundle?: unknown; configureServer?: unknown };
type Handler = (this: unknown, ...args: unknown[]) => unknown;

// Vite's own plugin and hook types are recursive enough that flattening them
// with their real types makes tsc give up ("type instantiation is excessively
// deep"), so this walks the tree structurally and narrows only what it uses.
function flatten(values: readonly unknown[]): unknown[] {
  return values.flatMap((value) => (Array.isArray(value) ? flatten(value) : [value]));
}

function isPlugin(value: unknown): value is PluginLike {
  return typeof value === 'object' && value !== null;
}

function emitBuildManifestsPlugin(): PluginLike {
  const plugin = flatten(config.plugins ?? []).find(
    (candidate) => isPlugin(candidate) && candidate.name === 'emit-build-manifests'
  );
  if (!isPlugin(plugin)) {
    throw new Error('vite.config.ts no longer declares an emit-build-manifests plugin');
  }
  return plugin;
}

// A hook is either the function itself or an object wrapping it under `handler`.
function hookHandler(hook: unknown): Handler | undefined {
  if (typeof hook === 'function') return hook as Handler;
  if (isPlugin(hook) && typeof (hook as { handler?: unknown }).handler === 'function') {
    return (hook as { handler: Handler }).handler;
  }
  return undefined;
}

function assetsEmittedIntoTheBuild(): EmittedAsset[] {
  const emitted: EmittedAsset[] = [];
  const handler = hookHandler(emitBuildManifestsPlugin().generateBundle);
  handler?.call(
    { emitFile: (asset: EmittedAsset) => emitted.push(asset) },
    // generateBundle ignores both, and the plugin emits unconditionally.
    {},
    {},
    { write: true }
  );
  return emitted;
}

async function assetServedInDev(pathname: string): Promise<{ status: number; body: string }> {
  const handler = hookHandler(emitBuildManifestsPlugin().configureServer);
  let middleware: ((request: unknown, response: unknown, next: () => void) => void) | undefined;
  await handler?.call(
    {},
    {
      middlewares: { use: (fn: typeof middleware) => (middleware = fn) },
    }
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
