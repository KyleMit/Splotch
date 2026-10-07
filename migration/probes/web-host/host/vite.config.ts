import { readFileSync, realpathSync } from 'node:fs';
import {
  assertOwnedArtifact,
  ownedPath,
  writeOwnedJson,
} from '../../../../tools/migration/lib/web-host-ownership.mjs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { defineConfig, mergeConfig, type Plugin, type ResolvedConfig } from 'vite';
import { readRenderRequest, readRenderedChrome } from './chromeHtml.ts';
import { pageOverlayPlugin, type PageOverlayBinding } from './pageOverlay.ts';
import { captureReactGraph, assertReactGraph } from './reactGraph.ts';
import {
  webHostRequest,
  WEB_HOST_ENV,
  WEB_HOST_PASSES,
  WEB_HOST_WRAPPER,
  WEB_HOST_NEUTRAL_COPY_ROLE,
  WEB_HOST_JSX,
  WEB_HOST_CHROME_VIRTUAL_ID,
  WEB_HOST_NEUTRAL_PASSES,
  WEB_HOST_REACT_RENDERER_GRAPH,
} from './contract.ts';

function ownedControl() {
  const request = webHostRequest({
    variant: process.env[WEB_HOST_ENV.variant],
    artifact: process.env[WEB_HOST_ENV.artifact],
    fixture: process.env[WEB_HOST_ENV.fixture],
    capacitor: process.env.CAPACITOR,
    perfMarks: process.env.PERF_MARKS,
    harness: process.env.PUBLIC_ENABLE_DEV_HARNESS,
  });
  const artifact = request.artifact;
  const root = realpathSync(process.env[WEB_HOST_ENV.artifactRoot] ?? '');
  const copy = realpathSync(process.env[WEB_HOST_ENV.copyRoot] ?? '');
  const token = process.env[WEB_HOST_ENV.token];
  if (typeof token !== 'string' || !token) throw new Error('Wrapper requires its ownership token');
  assertOwnedArtifact({ root, token });
  if (
    copy !==
      join(root, request.variant === 'retained-control' ? 'control' : WEB_HOST_NEUTRAL_COPY_ROLE) ||
    realpathSync(process.cwd()) !== join(copy, 'web') ||
    resolve(import.meta.dirname, '../../../..') !== copy
  )
    throw new Error('Wrapper is not running inside its owned control copy/web');
  return { root, copy, artifact, token, request };
}

function moduleIdentity(id: string, copy: string): string {
  const unwrapped = id.replace(/^\0/, '');
  const raw = unwrapped.split('?')[0];
  if (!isAbsolute(raw)) return id;
  const absolute = realpathSync(raw);
  const path = relative(copy, absolute);
  if (path.startsWith('../') || isAbsolute(path))
    throw new Error(`Build imported outside the owned source/dependency copy: ${id}`);
  return `${id.startsWith('\0') ? '\0' : ''}${path}${unwrapped.slice(raw.length)}`;
}

function receiptPlugin(owned: ReturnType<typeof ownedControl>): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'splotch-retained-web-host-receipt',
    apply: 'build',
    configResolved(resolved) {
      if (
        realpathSync(resolved.root) !== join(owned.copy, 'web') ||
        realpathSync(String(resolved.configFile)) !== join(owned.copy, WEB_HOST_WRAPPER)
      )
        throw new Error('Kit build did not keep the retained root and candidate-only wrapper');
      config = resolved;
    },
    generateBundle(_options, bundle) {
      const path = ownedPath(owned, WEB_HOST_PASSES);
      let prior: unknown = [];
      try {
        prior = JSON.parse(readFileSync(path, 'utf8'));
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      if (!Array.isArray(prior)) throw new Error('Invalid wrapper pass receipt');
      const chunks = Object.values(bundle)
        .filter((item) => item.type === 'chunk')
        .map((chunk) => ({
          fileName: chunk.fileName,
          facade: chunk.facadeModuleId ? moduleIdentity(chunk.facadeModuleId, owned.copy) : null,
          imports: chunk.imports,
          dynamicImports: chunk.dynamicImports,
          modules: Object.keys(chunk.modules)
            .map((id) => moduleIdentity(id, owned.copy))
            .sort(),
        }));
      const receipt = {
        ssr: !!config.build.ssr,
        root: config.root,
        configFile: config.configFile,
        artifact: owned.artifact,
        chunks,
      };
      writeOwnedJson(owned, WEB_HOST_PASSES, [...prior, receipt]);
    },
  };
}

function neutralPlugins(owned: ReturnType<typeof ownedControl>): Plugin[] {
  const request = readRenderRequest(
    owned,
    owned.copy,
    process.env[WEB_HOST_ENV.renderRequestSha256]
  );
  if (JSON.stringify(request.request) !== JSON.stringify(owned.request))
    throw new Error('Neutral wrapper invocation disagrees with its published SSR request');
  assertReactGraph(
    owned.copy,
    JSON.parse(readFileSync(join(owned.copy, WEB_HOST_REACT_RENDERER_GRAPH), 'utf8')),
    'ssr-renderer'
  );
  const chrome = readRenderedChrome(
    owned,
    owned.copy,
    process.env[WEB_HOST_ENV.chromeSha256],
    process.env[WEB_HOST_ENV.renderRequestSha256]
  );
  let overlay: PageOverlayBinding | undefined;
  let config: ResolvedConfig | undefined;
  const virtualId = `\0${WEB_HOST_CHROME_VIRTUAL_ID}`;
  return [
    pageOverlayPlugin(owned.copy, (binding) => {
      overlay = binding;
    }),
    {
      name: 'splotch-neutral-chrome-html',
      enforce: 'pre',
      apply: 'build',
      resolveId(id) {
        return id === WEB_HOST_CHROME_VIRTUAL_ID ? virtualId : null;
      },
      load(id) {
        if (id !== virtualId) return null;
        return `export const html = ${JSON.stringify(chrome.html)};\nexport const fixture = ${JSON.stringify(request.request.fixture)};\n`;
      },
    },
    {
      name: 'splotch-neutral-web-host-receipt',
      apply: 'build',
      configResolved(resolved) {
        if (
          realpathSync(resolved.root) !== join(owned.copy, 'web') ||
          realpathSync(String(resolved.configFile)) !== join(owned.copy, WEB_HOST_WRAPPER)
        )
          throw new Error('Neutral wrapper changed the real Kit root/configuration');
        config = resolved;
      },
      async writeBundle(_options, bundle) {
        if (!config || !overlay)
          throw new Error('Kit pass omitted its actual configuration or page overlay');
        const graph = await captureReactGraph({
          copyRoot: owned.copy,
          outputDirectory: resolve(config.root, config.build.outDir),
          stage: config.build.ssr ? 'kit-server' : 'kit-client',
          overlay,
          bundle,
          plugin: this,
          context: {
            mode: config.mode,
            nodeEnv: process.env.NODE_ENV,
            isProduction: config.isProduction,
            perfMarks: process.env.PERF_MARKS,
            jsx: config.oxc === false ? false : config.oxc.jsx,
          },
        });
        const path = ownedPath(owned, WEB_HOST_NEUTRAL_PASSES);
        let prior: unknown = [];
        try {
          prior = JSON.parse(readFileSync(path, 'utf8'));
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
        if (!Array.isArray(prior)) throw new Error('Invalid neutral pass receipt');
        writeOwnedJson(owned, WEB_HOST_NEUTRAL_PASSES, [...prior, graph]);
      },
    },
  ];
}

export default defineConfig(async () => {
  const owned = ownedControl();
  const plugins =
    owned.request.variant === 'retained-control' ? [receiptPlugin(owned)] : neutralPlugins(owned);
  const retained = await import('../../../../web/vite.config');
  return mergeConfig(retained.default, {
    plugins,
    ...(owned.request.variant === 'neutral-embedded' ? { oxc: { jsx: WEB_HOST_JSX } } : {}),
  });
});
