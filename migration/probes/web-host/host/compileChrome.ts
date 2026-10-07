import { mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { build, rolldownVersion, type Plugin, type ResolvedConfig } from 'vite';
import {
  assertOwnedArtifact,
  ownedPath,
} from '../../../../tools/migration/lib/web-host-ownership.mjs';
import {
  WEB_HOST_ENV,
  WEB_HOST_JSX,
  WEB_HOST_REACT_EXTERNALS,
  WEB_HOST_NEUTRAL_COPY_ROLE,
  WEB_HOST_REACT_RENDERER_DIRECTORY,
  WEB_HOST_REACT_RENDERER_GRAPH,
  webHostRequest,
} from './contract.ts';
import { captureReactGraph, assertReactGraph, type ReactGraph } from './reactGraph.ts';
import { createRolldownRuntimeCapture } from './rolldownRuntime.ts';
import { assertStandaloneReactCompilerConfig, REACT_SSR_SOURCE_PATH } from './reactProduction.ts';

async function compileOwnedChrome(): Promise<void> {
  const root = realpathSync(process.env[WEB_HOST_ENV.artifactRoot] ?? '');
  const copyRoot = realpathSync(process.env[WEB_HOST_ENV.copyRoot] ?? '');
  const token = process.env[WEB_HOST_ENV.token];
  const request = webHostRequest({
    variant: process.env[WEB_HOST_ENV.variant],
    artifact: process.env[WEB_HOST_ENV.artifact],
    fixture: process.env[WEB_HOST_ENV.fixture],
    capacitor: process.env.CAPACITOR,
    perfMarks: process.env.PERF_MARKS,
    harness: process.env.PUBLIC_ENABLE_DEV_HARNESS,
  });
  if (
    typeof token !== 'string' ||
    !token ||
    request.variant !== 'neutral-embedded' ||
    copyRoot !== join(root, WEB_HOST_NEUTRAL_COPY_ROLE) ||
    realpathSync(process.cwd()) !== copyRoot ||
    realpathSync(import.meta.dirname) !== join(copyRoot, 'migration/probes/web-host/host')
  )
    throw new Error('SSR compiler is not running inside its owned neutral copy');
  const owned = { root, token };
  assertOwnedArtifact(owned);
  const outputDirectory = ownedPath(
    owned,
    relative(root, join(copyRoot, WEB_HOST_REACT_RENDERER_DIRECTORY))
  );
  mkdirSync(outputDirectory);
  const runtime = createRolldownRuntimeCapture(copyRoot, rolldownVersion);
  let config: ResolvedConfig | undefined;
  let graph: ReactGraph | undefined;
  const receiptPlugin: Plugin = {
    name: 'splotch-react-ssr-receipt',
    apply: 'build',
    configResolved(resolved) {
      assertStandaloneReactCompilerConfig(resolved, copyRoot);
      config = resolved;
    },
    async writeBundle(_options, bundle) {
      if (!config || graph)
        throw new Error('SSR compiler omitted or duplicated its actual configuration');
      graph = await captureReactGraph({
        copyRoot,
        outputDirectory,
        stage: 'ssr-renderer',
        overlay: null,
        bundle,
        plugin: this,
        runtime,
        context: {
          mode: config.mode,
          nodeEnv: process.env.NODE_ENV,
          isProduction: config.isProduction,
          perfMarks: process.env.PERF_MARKS,
          jsx: config.oxc === false ? false : config.oxc.jsx,
        },
      });
    },
  };
  await build({
    root: copyRoot,
    configFile: false,
    mode: 'production',
    oxc: { jsx: WEB_HOST_JSX },
    plugins: [runtime.plugin, receiptPlugin],
    build: {
      ssr: join(copyRoot, REACT_SSR_SOURCE_PATH),
      outDir: outputDirectory,
      emptyOutDir: false,
      sourcemap: false,
      rolldownOptions: {
        external: [...WEB_HOST_REACT_EXTERNALS],
        output: { format: 'es', entryFileNames: 'renderer.mjs' },
      },
    },
  });
  if (!graph || readdirSync(outputDirectory).join() !== 'renderer.mjs')
    throw new Error('SSR compiler did not emit its one owned renderer entry');
  assertReactGraph(copyRoot, graph, 'ssr-renderer');
  writeFileSync(
    join(copyRoot, WEB_HOST_REACT_RENDERER_GRAPH),
    `${JSON.stringify(graph, null, 2)}\n`,
    { flag: 'wx' }
  );
}

await compileOwnedChrome();
