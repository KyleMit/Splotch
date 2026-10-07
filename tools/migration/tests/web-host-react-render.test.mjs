import { expect, it, onTestFinished } from 'vitest';
import { build } from 'vite';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { createOwnedArtifact } from '../lib/web-host-ownership.mjs';
import {
  WEB_HOST_ENV,
  WEB_HOST_JSX,
  WEB_HOST_REACT_EXTERNALS,
  WEB_HOST_REACT_SOURCE_PATHS,
  WEB_HOST_REACT_RENDERER_DIRECTORY,
  WEB_HOST_REACT_RENDERER,
  WEB_HOST_REACT_RENDERER_GRAPH,
} from '../../../migration/probes/web-host/host/contract.ts';
import {
  makeRenderRequest,
  writeRenderRequest,
  readRenderedChrome,
  chromeDigest,
  REACT_PRODUCTION_CONTEXT,
} from '../../../migration/probes/web-host/host/chromeHtml.ts';

const RENDER_TIMEOUT_MS = 10_000;
const RENDER_SOURCE = 'migration/probes/web-host/host/renderChrome.ts';
const OWNERSHIP_SOURCE = 'tools/migration/lib/web-host-ownership.mjs';

async function rendererFixture(inheritedCaller = false) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-render-cache-test-')));
  onTestFinished(() => rmSync(parent, { recursive: true, force: true }));
  const owned = createOwnedArtifact(parent);
  const copyRoot = join(owned.root, 'neutral');
  mkdirSync(copyRoot);
  for (const path of [...WEB_HOST_REACT_SOURCE_PATHS, OWNERSHIP_SOURCE]) {
    const target = join(copyRoot, path);
    mkdirSync(join(target, '..'), { recursive: true });
    let bytes = readFileSync(join(ROOT, path));
    if (inheritedCaller && path === RENDER_SOURCE) {
      const current = 'collectLoadedReactFiles(copyRoot, loadedCachePaths)';
      const text = bytes.toString();
      expect(text.split(current)).toHaveLength(2);
      bytes = Buffer.from(
        text.replace(
          current,
          'collectLoadedReactFiles(copyRoot, Object.keys(createRequire(import.meta.url).cache))'
        )
      );
    }
    writeFileSync(target, bytes);
  }
  mkdirSync(join(copyRoot, 'node_modules'));
  for (const name of ['react', 'react-dom']) {
    cpSync(join(ROOT, 'node_modules', name), join(copyRoot, 'node_modules', name), {
      recursive: true,
    });
  }
  const outDir = join(copyRoot, WEB_HOST_REACT_RENDERER_DIRECTORY);
  await build({
    root: copyRoot,
    configFile: false,
    mode: 'production',
    oxc: { jsx: WEB_HOST_JSX },
    logLevel: 'silent',
    build: {
      ssr: join(copyRoot, RENDER_SOURCE),
      outDir,
      emptyOutDir: false,
      sourcemap: false,
      rolldownOptions: {
        external: [...WEB_HOST_REACT_EXTERNALS],
        output: { format: 'es', entryFileNames: 'renderer.mjs' },
      },
    },
  });
  writeFileSync(
    join(copyRoot, WEB_HOST_REACT_RENDERER_GRAPH),
    '{"fixture":"renderer-cache-only"}\n'
  );
  const request = makeRenderRequest(
    copyRoot,
    { variant: 'neutral-embedded', artifact: 'release', fixture: 'matching' },
    REACT_PRODUCTION_CONTEXT
  );
  const requestSha256 = writeRenderRequest(owned, request);
  return { owned, copyRoot, request, requestSha256 };
}

function render(fixture, nodeEnv) {
  const { owned, copyRoot, requestSha256 } = fixture;
  return spawnSync(process.execPath, [WEB_HOST_REACT_RENDERER], {
    cwd: copyRoot,
    timeout: RENDER_TIMEOUT_MS,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      NODE_ENV: nodeEnv,
      CAPACITOR: 'false',
      PERF_MARKS: 'false',
      PUBLIC_ENABLE_DEV_HARNESS: 'false',
      [WEB_HOST_ENV.artifactRoot]: owned.root,
      [WEB_HOST_ENV.copyRoot]: copyRoot,
      [WEB_HOST_ENV.token]: owned.token,
      [WEB_HOST_ENV.artifact]: 'release',
      [WEB_HOST_ENV.variant]: 'neutral-embedded',
      [WEB_HOST_ENV.fixture]: 'matching',
      [WEB_HOST_ENV.renderRequestSha256]: requestSha256,
    },
  });
}

it('publishes actual production React despite unevaluated Node CJS cache placeholders', async () => {
  const fixture = await rendererFixture();
  const result = render(fixture, 'production');
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const bytes = readFileSync(join(fixture.owned.root, 'react-chrome.json'));
  const chrome = readRenderedChrome(
    fixture.owned,
    fixture.copyRoot,
    chromeDigest(bytes),
    fixture.requestSha256
  );
  expect(chrome.html).toContain(fixture.request.pendingLabel);
  expect(chrome.loadedReactFiles.map((row) => row.path)).toContain(
    'node_modules/react/cjs/react.production.js'
  );
  expect(chrome.loadedReactFiles.some((row) => row.path.includes('.development.js'))).toBe(false);
});

it('rejects the inherited caller when it includes unevaluated cache entries', async () => {
  const result = render(await rendererFixture(true), 'production');
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    'Development React module participated: react/cjs/react.development.js'
  );
});

it('rejects genuinely loaded development React through the real renderer', async () => {
  const result = render(await rendererFixture(), 'development');
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    'Development React module participated: react/cjs/react.development.js'
  );
});

it('restores actual production rendering after the seeded caller failure', async () => {
  const negative = render(await rendererFixture(true), 'production');
  expect(negative.status).toBe(1);
  const positive = render(await rendererFixture(), 'production');
  expect(positive.error).toBeUndefined();
  expect(positive.status, positive.stderr).toBe(0);
});
