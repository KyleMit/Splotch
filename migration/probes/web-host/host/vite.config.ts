import { readFileSync, realpathSync } from 'node:fs';
import {
  assertOwnedArtifact,
  ownedPath,
  writeOwnedJson,
} from '../../../../tools/migration/lib/web-host-ownership.mjs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { defineConfig, mergeConfig, type Plugin, type ResolvedConfig } from 'vite';
import {
  assertWebHostVariant,
  webHostArtifact,
  WEB_HOST_ENV,
  WEB_HOST_PASSES,
  WEB_HOST_WRAPPER,
} from './contract';

function ownedControl() {
  assertWebHostVariant(process.env[WEB_HOST_ENV.variant]);
  const artifact = webHostArtifact(process.env[WEB_HOST_ENV.artifact]);
  if (process.env.CAPACITOR === 'true' || process.env.PERF_MARKS === 'true')
    throw new Error('Retained control requires the web target without performance instrumentation');
  if ((process.env.PUBLIC_ENABLE_DEV_HARNESS === 'true') !== (artifact === 'mechanism'))
    throw new Error('Control artifact and private harness flags disagree');
  const root = realpathSync(process.env[WEB_HOST_ENV.artifactRoot] ?? '');
  const copy = realpathSync(process.env[WEB_HOST_ENV.copyRoot] ?? '');
  const token = process.env[WEB_HOST_ENV.token];
  if (typeof token !== 'string' || !token) throw new Error('Wrapper requires its ownership token');
  assertOwnedArtifact({ root, token });
  if (
    copy !== join(root, 'control') ||
    realpathSync(process.cwd()) !== join(copy, 'web') ||
    resolve(import.meta.dirname, '../../../..') !== copy
  )
    throw new Error('Wrapper is not running inside its owned control copy/web');
  return { root, copy, artifact, token };
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

export default defineConfig(async () => {
  const owned = ownedControl();
  const retained = await import('../../../../web/vite.config');
  return mergeConfig(retained.default, { plugins: [receiptPlugin(owned)] });
});
