import { compareProductBytes } from './web-host-comparison.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  WEB_HOST_PASSES,
  WEB_HOST_WRAPPER,
  WEB_HOST_UI_PACKAGES,
  WEB_HOST_UI_SCOPES,
  WEB_HOST_OUTPUT_PATHS,
} from '../../../migration/probes/web-host/host/contract.ts';
import { fileInventory } from './web-host-files.mjs';
import { sha256 } from './web-host-source.mjs';
import { appShellPrecacheUrl } from '../../../web/src/lib/pwa/appShellRoute.ts';
import { assertPinnedBuildMetadata } from './web-host-metadata.mjs';

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join() === [...keys].sort().join()
  );
}

function foreignUi(id) {
  const path = id.replace(/^\0/, '').split('?')[0];
  const installed = path.lastIndexOf('node_modules/');
  const packagePath = installed === -1 ? path : path.slice(installed + 'node_modules/'.length);
  return (
    WEB_HOST_UI_PACKAGES.some(
      (name) => packagePath === name || packagePath.startsWith(`${name}/`)
    ) || WEB_HOST_UI_SCOPES.some((scope) => packagePath.startsWith(`${scope}/`))
  );
}

function candidateUi(id) {
  const path = id.replace(/^\0/, '').split('?')[0];
  return (
    path.startsWith('migration/probes/web-host/src/') ||
    path.includes('/migration/probes/web-host/src/')
  );
}

export function assertControlGraphs(passes, { controlRoot, artifact }) {
  if (
    !Array.isArray(passes) ||
    !passes.some((pass) => pass?.ssr === true) ||
    !passes.some((pass) => pass?.ssr === false)
  )
    throw new Error('Wrapper did not record both SvelteKit server and client build passes');
  for (const pass of passes) {
    if (
      !exactKeys(pass, ['ssr', 'root', 'configFile', 'artifact', 'chunks']) ||
      typeof pass.ssr !== 'boolean' ||
      pass.root !== join(controlRoot, 'web') ||
      pass.configFile !== join(controlRoot, WEB_HOST_WRAPPER) ||
      pass.artifact !== artifact ||
      !Array.isArray(pass.chunks) ||
      pass.chunks.length === 0
    )
      throw new Error('Wrapper receipt omitted its actual build context or module graph');
    for (const chunk of pass.chunks) {
      if (
        !exactKeys(chunk, ['fileName', 'facade', 'imports', 'dynamicImports', 'modules']) ||
        typeof chunk.fileName !== 'string' ||
        !chunk.fileName ||
        !(chunk.facade === null || typeof chunk.facade === 'string') ||
        !['modules', 'imports', 'dynamicImports'].every(
          (key) =>
            Array.isArray(chunk[key]) && chunk[key].every((id) => typeof id === 'string' && id)
        )
      )
        throw new Error('Malformed retained chunk graph');
      const edges = [
        ...chunk.modules,
        ...chunk.imports,
        ...chunk.dynamicImports,
        ...(chunk.facade === null ? [] : [chunk.facade]),
      ];
      if (edges.some(foreignUi))
        throw new Error(`Retained control unexpectedly imports React/native UI: ${chunk.fileName}`);
      if (edges.some(candidateUi))
        throw new Error(`Retained control imports candidate UI: ${chunk.fileName}`);
    }
  }
}

function buildInventory(root, owner) {
  const output = join(root, 'web/.svelte-kit/output');
  const measurement = owner.bundle.measureWebBundle({
    prerenderedIndex: join(output, 'prerendered/pages/index.html'),
    clientDir: join(output, 'client'),
  });
  const worker = readFileSync(join(output, 'client/sw.js'), 'utf8');
  const appShellUrls = owner.pwa
    .precacheUrlsFromSource(worker)
    .filter((url) => owner.pwa.APP_SHELL_PRECACHE_URL_PATTERN.test(url));
  if (appShellUrls.length !== 1) throw new Error(`Expected one actual app-shell URL in ${root}`);
  return {
    appShellUrl: appShellUrls[0],
    measurement,
    outputs: Object.fromEntries(
      WEB_HOST_OUTPUT_PATHS.map((path) => [path, fileInventory(join(root, path))])
    ),
    version: JSON.parse(readFileSync(join(output, 'client/version.json'), 'utf8')),
    hostSources: Object.fromEntries(
      [
        'web/vite.config.ts',
        'web/svelte.config.js',
        'web/src/app.html',
        'web/src/hooks.server.ts',
        'web/src/routes/+page.svelte',
      ].map((path) => [path, sha256(readFileSync(join(root, path)))])
    ),
  };
}

function assertOutputShape(reference, control) {
  for (const path of Object.keys(reference.outputs)) {
    const left = reference.outputs[path].map((entry) => entry.path);
    const right = control.outputs[path].map((entry) => entry.path);
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      throw new Error(`Retained wrapper changed the emitted output path inventory: ${path}`);
    }
  }
  if (JSON.stringify(reference.measurement) !== JSON.stringify(control.measurement)) {
    throw new Error('Retained wrapper changed startup/lazy bundle measurement');
  }
  if (JSON.stringify(reference.version) !== JSON.stringify(control.version))
    throw new Error('Retained wrapper changed version.json');
  if (JSON.stringify(reference.hostSources) !== JSON.stringify(control.hostSources))
    throw new Error('Retained wrapper changed shipping host sources');
}

export function collectControlEvidence(owned, referenceRoot, controlRoot, pinned, owner, artifact) {
  assertPinnedBuildMetadata(pinned);
  const passes = JSON.parse(readFileSync(join(owned.root, WEB_HOST_PASSES), 'utf8'));
  assertControlGraphs(passes, { controlRoot, artifact });
  const reference = buildInventory(referenceRoot, owner);
  const control = buildInventory(controlRoot, owner);
  const shellUrl = appShellPrecacheUrl(pinned.appShellNonce);
  if (reference.appShellUrl !== shellUrl || control.appShellUrl !== shellUrl)
    throw new Error('Emitted app-shell URL disagrees with its owned paired nonce');
  assertOutputShape(reference, control);
  const byteComparison = compareProductBytes({ referenceRoot, controlRoot, reference, control });
  if (control.version.version !== pinned.metadata.appVersion)
    throw new Error('Emitted web version disagrees with the pinned metadata owner');
  return {
    reference,
    control,
    passes,
    byteComparison,
    structuralComparison:
      'complete output bytes with explicit copy-path normalization; output paths, startup/lazy measurements, version and host sources match',
    pending: [
      'browser release ink and mechanism early acceptance/adoption',
      'deployed CSP/PWA',
      'physical floors and performance',
      'full candidate startup accounting and React mechanics',
    ],
  };
}
