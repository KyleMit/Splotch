import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ResolvedConfig } from 'vite';
import { chromeDigest } from './chromeHtml.ts';
import {
  assertReactFileBindings,
  bindReactFile,
  type ReactFileBinding,
} from './reactProduction.ts';

const KIT_ENV_ID = '\0virtual:__sveltekit/env';
const KIT_VERSION = '2.70.3';
const KIT_ENV_GENERATED_SHA256 = '3d31b247580a8cd7a2d8db9ba1461d86d1f3fd8771f888fdce12280895349eb5';
const KIT_ROOT = 'node_modules/@sveltejs/kit';
const PRODUCER_PATHS = [
  `${KIT_ROOT}/package.json`,
  `${KIT_ROOT}/src/exports/vite/module_ids.js`,
  `${KIT_ROOT}/src/exports/vite/index.js`,
  `${KIT_ROOT}/src/core/env.js`,
  `${KIT_ROOT}/src/constants.js`,
  `${KIT_ROOT}/src/core/sync/utils.js`,
  `${KIT_ROOT}/src/utils/filesystem.js`,
  `${KIT_ROOT}/src/exports/internal/env.js`,
  `${KIT_ROOT}/src/core/config/options.js`,
  'web/svelte.config.js',
  'web/vite.config.ts',
] as const;
export type KitEnvConfig = {
  sourceDirectory: 'web/src';
  explicitEnvironmentVariables: false;
  entry: null;
};
export type KitEnvSource = {
  kind: 'kit-env';
  config: KitEnvConfig;
  producer: ReactFileBinding[];
  code: string;
  sha256: string;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed Kit env producer');
  return value as Record<string, unknown>;
}
function api(copyRoot: string, member: string): Record<string, unknown> {
  const path = resolve(copyRoot, KIT_ROOT, member);
  const require = createRequire(join(copyRoot, 'package.json'));
  if (require.resolve(path) !== path)
    throw new Error('Kit env API resolved outside its bound producer');
  const value: unknown = require(path);
  return record(value);
}
function noEntry(copyRoot: string): void {
  const resolver = api(copyRoot, 'src/utils/filesystem.js').resolve_entry;
  if (typeof resolver !== 'function' || resolver(join(copyRoot, 'web/src/env')) !== null)
    throw new Error('Kit env fixed slice requires actual explicit entry absence');
}
export function captureKitEnvConfig(copyRoot: string, resolved: ResolvedConfig): KitEnvConfig {
  assertProducer(
    copyRoot,
    PRODUCER_PATHS.map((path) => bindReactFile(copyRoot, path))
  );
  const setup = resolved.plugins.filter((plugin) => plugin.name === 'vite-plugin-sveltekit-setup');
  if (setup.length !== 1) throw new Error('Kit env capture omitted the actual setup plugin');
  const kit = record(record(record(setup[0].api).options).kit);
  if (
    relative(copyRoot, String(record(kit.files).src)) !== 'web/src' ||
    record(kit.experimental).explicitEnvironmentVariables !== false
  )
    throw new Error('Kit env capture is outside the fixed normalized config');
  noEntry(copyRoot);
  return { sourceDirectory: 'web/src', explicitEnvironmentVariables: false, entry: null };
}

// Synchronous readback pins the complete fixed producer because its generator imports asynchronous modules.
const PRODUCER_IDENTITIES = [
  [4741, '4a12466ff8570bd0a141c8082e6acb6673af30ec53f6b5a38aa7718abe6e715f'],
  [1118, '3366774d74de536a5ae5dd5ea852345b294d7930e78ce4fdddf8debff3f80857'],
  [55411, '48a56f687eeb0429ee4a2138fe15e4ab4d93621d07e47c5dacc44647ea4215f6'],
  [11668, '95f4c3419ed4b33657c4b86450fc839f3795e2c46f73f2d9524521b79f92a000'],
  [516, '4c81a11176aa91f80fd6405737ff0cb5029eace9d27c5caff2c41d625297daf5'],
  [2158, '3f0e416a10ae1eba49426a9515e69ff82272dd958af94f2ce8a3de26b3d090f3'],
  [4893, 'b0a45f24637484a35278afd9feb9e81c53759d05f8325e5b0744a5655d8fe559'],
  [1662, '87ecc45f9aafa5023de892cd3b9c0be9aa1c88e45377616d585ef0733983d2dd'],
  [14534, 'eeee7e3bb0010ea5e3925204cdb61b7aea40ca104aafe82a80c3f222e7f5fdbb'],
  [3321, '13c3546e93f98f0a3359575d3fd9e2952512d7dfdc712c9cea1e7dc7770bf459'],
  [12930, '09bba06be8c6b9a36440d58905ccb3c77471b8fab569c3189ebd715cd24d35ff'],
] as const;

function assertProducer(copyRoot: string, producer: ReactFileBinding[]): void {
  if (
    JSON.stringify(producer.map((file) => file.path)) !== JSON.stringify(PRODUCER_PATHS) ||
    PRODUCER_IDENTITIES.some(
      ([bytes, sha256], index) =>
        producer[index].bytes !== bytes || producer[index].sha256 !== sha256
    )
  )
    throw new Error('Kit env source omitted, aliased or changed its exact installed producer');
  const manifest = record(JSON.parse(readFileSync(join(copyRoot, PRODUCER_PATHS[0]), 'utf8')));
  if (
    manifest.name !== '@sveltejs/kit' ||
    manifest.version !== KIT_VERSION ||
    api(copyRoot, 'src/exports/vite/module_ids.js').sveltekit_env !== KIT_ENV_ID
  )
    throw new Error('Kit env package/API identity disagrees');
  noEntry(copyRoot);
}

export async function assertActualKitEnvGenerator(copyRoot: string, code: string): Promise<void> {
  const value = record(
    await import(pathToFileURL(join(copyRoot, KIT_ROOT, 'src/core/env.js')).href)
  );
  const generate = value.create_sveltekit_env;
  if (typeof generate !== 'function' || generate(null, {}, null) !== code)
    throw new Error('Kit env actual generator disagrees with captured source');
}

export function bindKitEnvSource(
  copyRoot: string,
  id: string,
  code: string | null,
  config: KitEnvConfig | null
): KitEnvSource | null {
  if (id !== KIT_ENV_ID) return null;
  if (
    !config ||
    config.sourceDirectory !== 'web/src' ||
    config.explicitEnvironmentVariables !== false ||
    config.entry !== null
  )
    throw new Error('Kit env source omitted its actual normalized config');
  const producer = PRODUCER_PATHS.map((path) => bindReactFile(copyRoot, path));
  assertProducer(copyRoot, producer);
  if (typeof code !== 'string' || chromeDigest(code) !== KIT_ENV_GENERATED_SHA256)
    throw new Error('Kit env source disagrees with the bound generator/config');
  return { kind: 'kit-env', config, producer, code, sha256: chromeDigest(code) };
}

export function assertKitEnvSource(copyRoot: string, id: string, input: unknown): KitEnvSource {
  const value = record(input);
  const config = record(value.config);
  if (
    Object.keys(value).sort().join() !==
      ['kind', 'config', 'producer', 'code', 'sha256'].sort().join() ||
    Object.keys(config).sort().join() !==
      ['sourceDirectory', 'explicitEnvironmentVariables', 'entry'].sort().join() ||
    value.kind !== 'kit-env' ||
    id !== KIT_ENV_ID ||
    typeof value.code !== 'string' ||
    value.sha256 !== chromeDigest(value.code)
  )
    throw new Error('Malformed Kit env source binding');
  const files = assertReactFileBindings(copyRoot, value.producer);
  if (files.length !== PRODUCER_PATHS.length)
    throw new Error('Kit env source omitted or aliased its producer');
  const producer = PRODUCER_PATHS.map((path) => {
    const file = files.find((candidate) => candidate.path === path);
    if (!file) throw new Error('Kit env source omitted or aliased its producer');
    return file;
  });
  if (
    config.sourceDirectory !== 'web/src' ||
    config.explicitEnvironmentVariables !== false ||
    config.entry !== null
  )
    throw new Error('Kit env source changed its fixed normalized config');
  const source = bindKitEnvSource(copyRoot, id, value.code, {
    sourceDirectory: config.sourceDirectory,
    explicitEnvironmentVariables: false,
    entry: null,
  });
  if (!source || JSON.stringify(source.producer) !== JSON.stringify(producer))
    throw new Error('Kit env source producer drifted');
  return source;
}
