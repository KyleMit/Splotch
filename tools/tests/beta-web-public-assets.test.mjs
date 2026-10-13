import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { approvedAssetUrl } from '../../experiments/native-architecture/src/offlineLibrary/manifest.ts';

const require = createRequire(import.meta.url);
const {
  createColoringAssetsMiddleware,
} = require('../../experiments/native-architecture/scripts/serve-coloring-assets.cjs');
const fixtures = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'splotch-coloring-middleware-'));
  fixtures.push(root);
  await mkdir(join(root, 'farm'));
  return root;
}

async function request(root, url, method = 'GET') {
  const response = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
  const next = vi.fn();
  await createColoringAssetsMiddleware(root)({ url, method }, response, next);
  return { response, next };
}

describe('beta web public coloring assets', () => {
  it.each([
    ['/coloring/farm/cow-wide.light.webp', 'image/webp'],
    ['/coloring/farm/cow-wide.overlay.svg', 'image/svg+xml'],
    ['/coloring/max-1152px/farm/cow-wide.light.webp', 'image/webp'],
  ])('delivers the exact bytes for %s using the manifest vocabulary', async (path, contentType) => {
    const root = await fixture();
    const relativePath = path.slice('/coloring/'.length);
    await mkdir(join(root, relativePath, '..'), { recursive: true });
    const bytes = Buffer.from([0, 1, 127, 255]);
    await writeFile(join(root, relativePath), bytes);
    expect(() => approvedAssetUrl(path)).not.toThrow();
    const { response, next } = await request(root, `${path}?cache=1`);
    expect(response.statusCode).toBe(200);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', contentType);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', bytes.length);
    expect(response.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(response.end).toHaveBeenCalledWith(bytes);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns HEAD headers without a body', async () => {
    const root = await fixture();
    await writeFile(join(root, 'farm/cover.thumb.webp'), 'asset');
    const { response } = await request(root, '/coloring/farm/cover.thumb.webp', 'HEAD');
    expect(response.statusCode).toBe(200);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', 5);
    expect(response.end).toHaveBeenCalledWith(undefined);
  });

  it.each([
    '/coloring',
    '/coloring/',
    '/coloring/farm/',
    '/coloring/farm/../secret.webp',
    '/coloring/farm/%2e%2e.webp',
    '/coloring/farm/cow%2fsecret.webp',
    '/coloring/farm/cow\\secret.webp',
    '/coloring/Farm/cow.webp',
    '/coloring/farm/cow.png',
    '/coloring/farm/a..webp',
    '/coloring/farm/missing.webp',
  ])('rejects invalid or missing asset %s', async (path) => {
    const { response, next } = await request(await fixture(), path);
    expect(response.statusCode).toBe(404);
    expect(response.end).toHaveBeenCalledWith();
    expect(next).not.toHaveBeenCalled();
  });

  it('restricts coloring methods and delegates unrelated routes', async () => {
    const root = await fixture();
    const denied = await request(root, '/coloring/farm/cow.webp', 'POST');
    expect(denied.response.statusCode).toBe(405);
    expect(denied.response.setHeader).toHaveBeenCalledWith('Allow', 'GET, HEAD');
    const unrelated = await request(root, '/index.bundle?platform=web');
    expect(unrelated.next).toHaveBeenCalledOnce();
    expect(unrelated.response.end).not.toHaveBeenCalled();
  });

  it.each(['a..webp', 'cow.png', '%2e%2e.webp', 'cow\\secret.webp'])(
    'rejects present files outside the manifest vocabulary: %s',
    async (filename) => {
      const root = await fixture();
      await writeFile(join(root, 'farm', filename), 'private');
      const path = `/coloring/farm/${filename}`;
      expect(() => approvedAssetUrl(path)).toThrow('Unapproved coloring asset path.');
      const { response } = await request(root, path);
      expect(response.statusCode).toBe(404);
      expect(response.end).toHaveBeenCalledWith();
    }
  );

  it('never lists a directory named like an asset', async () => {
    const root = await fixture();
    await mkdir(join(root, 'farm/folder.webp'));
    const { response } = await request(root, '/coloring/farm/folder.webp');
    expect(response.statusCode).toBe(404);
    expect(response.end).toHaveBeenCalledWith();
  });

  it('rejects symbolic links at the root, directory, and file boundaries', async () => {
    const root = await fixture();
    const outside = await fixture();
    await writeFile(join(outside, 'farm/secret.webp'), 'private');
    await symlink(join(outside, 'farm/secret.webp'), join(root, 'farm/secret.webp'));
    await symlink(join(outside, 'farm'), join(root, 'escape'));
    await symlink(outside, join(root, 'linked-root'));
    const file = await request(root, '/coloring/farm/secret.webp');
    const directory = await request(root, '/coloring/escape/secret.webp');
    const linkedRoot = await request(join(root, 'linked-root'), '/coloring/farm/secret.webp');
    expect(file.response.statusCode).toBe(404);
    expect(directory.response.statusCode).toBe(404);
    expect(linkedRoot.response.statusCode).toBe(404);
  });

  it.each([true, false])(
    'composes Metro middleware with default enhancer present: %s',
    async (hasEnhancer) => {
      const source = await readFile(
        new URL('../../experiments/native-architecture/metro.config.cjs', import.meta.url),
        'utf8'
      );
      const fallback = vi.fn();
      const defaultEnhancer = vi.fn(() => fallback);
      const serveAssets = vi.fn((_request, _response, next) => next());
      const createMiddleware = vi.fn(() => serveAssets);
      const module = { exports: {} };
      runInNewContext(source, {
        module,
        __dirname: '/repository/experiments/native-architecture',
        require: (specifier) => {
          if (specifier === 'expo/metro-config')
            return {
              getDefaultConfig: () => ({
                resolver: { assetExts: ['png'] },
                server: hasEnhancer ? { enhanceMiddleware: defaultEnhancer } : {},
              }),
            };
          if (specifier === './scripts/serve-coloring-assets.cjs')
            return { createColoringAssetsMiddleware: createMiddleware };
          return require(specifier);
        },
      });
      const middleware = vi.fn();
      const metroServer = {};
      const enhanced = module.exports.server.enhanceMiddleware(middleware, metroServer);
      const req = { url: '/index.bundle' };
      const res = {};
      const next = vi.fn();
      await enhanced(req, res, next);
      expect(defaultEnhancer.mock.calls).toEqual(hasEnhancer ? [[middleware, metroServer]] : []);
      expect(createMiddleware).toHaveBeenCalledWith('/repository/web/static/coloring');
      expect(serveAssets).toHaveBeenCalledOnce();
      expect((hasEnhancer ? fallback : middleware).mock.calls).toEqual([[req, res, next]]);
      expect(module.exports.resolver.assetExts).toEqual(['png', 'woff2']);
    }
  );
});
