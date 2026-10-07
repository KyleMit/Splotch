import { spawnOwnedChild, terminateOwnedChild } from './web-host-processes.mjs';
import {
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  WEB_HOST_NEUTRAL_COPY_ROLE,
  WEB_HOST_NEUTRAL_PASSES,
  webHostCopyRoles,
  webHostCopyRequest,
  webHostRequest,
  WEB_HOST_ENV,
  WEB_HOST_VARIANT,
  WEB_HOST_WRAPPER,
} from '../../../migration/probes/web-host/host/contract.ts';
import { canonicalDirectory, ownedPath } from './web-host-ownership.mjs';
import { assertCopyInputs, freezeCopyInputs } from './web-host-inputs.mjs';
import { stagedBuildScripts } from './web-host-generated.mjs';
import { sha256 } from './web-host-source.mjs';
import { PINNED_APP_SHELL_NONCE_ENV } from '../../../web/appShellBuildNonce.ts';

const BUILD_CHILD_TIMEOUT_MS = 600_000;
const CHILD_ENV_NAMES = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TZ', 'SYSTEMROOT'];

export function copiedBuildEnvironment(
  owned,
  copyRoot,
  artifact,
  pinnedMetadata,
  request = { variant: WEB_HOST_VARIANT, artifact, fixture: 'matching' }
) {
  const checked = webHostRequest({
    ...request,
    capacitor: 'false',
    perfMarks: 'false',
    harness: artifact === 'mechanism' ? 'true' : 'false',
  });
  if (checked.artifact !== artifact) throw new Error('Copied build artifact and request disagree');
  const metadata = { ...pinnedMetadata };
  if (checked.variant === 'neutral-embedded') delete metadata[PINNED_APP_SHELL_NONCE_ENV];
  const inherited = Object.fromEntries(
    CHILD_ENV_NAMES.filter((name) => process.env[name] !== undefined).map((name) => [
      name,
      process.env[name],
    ])
  );
  const cache = ownedPath(owned, 'runtime/cache');
  mkdirSync(cache, { recursive: true });
  const temporary = ownedPath(owned, 'runtime/tmp');
  mkdirSync(temporary, { recursive: true });
  canonicalDirectory(cache);
  canonicalDirectory(temporary);
  const npmConfigs = {};
  for (const kind of ['user', 'global']) {
    const path = ownedPath(owned, `runtime/empty-${kind}-npmrc`);
    try {
      writeFileSync(path, '', { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (readFileSync(path).length !== 0)
        throw new Error(`Owned empty npm ${kind} configuration changed`, { cause: error });
    }
    npmConfigs[kind] = path;
  }
  return {
    ...inherited,
    ...metadata,
    CAPACITOR: 'false',
    PERF_MARKS: 'false',
    PUBLIC_ENABLE_DEV_HARNESS: artifact === 'mechanism' ? 'true' : 'false',
    TMPDIR: temporary,
    NPM_CONFIG_CACHE: cache,
    NPM_CONFIG_USERCONFIG: npmConfigs.user,
    NPM_CONFIG_GLOBALCONFIG: npmConfigs.global,
    XDG_CACHE_HOME: cache,
    [WEB_HOST_ENV.artifactRoot]: owned.root,
    [WEB_HOST_ENV.copyRoot]: copyRoot,
    [WEB_HOST_ENV.token]: owned.token,
    [WEB_HOST_ENV.artifact]: artifact,
    [WEB_HOST_ENV.variant]: checked.variant,
    [WEB_HOST_ENV.fixture]: checked.fixture,
    ...(checked.variant === 'neutral-embedded' ? { NODE_ENV: 'production' } : {}),
  };
}

export async function runCopiedChild({ owned, copyRoot, env, label, command, args }) {
  const logPath = ownedPath(owned, `controls/${label}.log.txt`);
  mkdirSync(join(owned.root, 'controls'), { recursive: true });
  const log = createWriteStream(logPath, { flags: 'wx' });
  const started = new Date().toISOString();
  const child = spawnOwnedChild(command, args, {
    cwd: copyRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let timedOut = false;
  let interruptionSignal = null;
  let failure;
  let stopping;
  const requestStop = (signal = null) => {
    interruptionSignal ??= signal;
    stopping ??= terminateOwnedChild(child).catch((error) => {
      failure ??= error;
      return { groupPid: child.pid ?? null, failed: true };
    });
    return stopping;
  };
  const onInterrupt = () => requestStop('SIGINT');
  const onTerminate = () => requestStop('SIGTERM');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  const timeout = setTimeout(() => {
    timedOut = true;
    requestStop();
  }, BUILD_CHILD_TIMEOUT_MS);
  let outcome = { code: null, signal: null };
  let termination;
  try {
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    outcome = await new Promise((resolve, reject) => {
      child.once('error', reject);
      log.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
  } catch (error) {
    failure ??= error;
  } finally {
    clearTimeout(timeout);
    try {
      termination = await requestStop();
      if (!log.destroyed && !log.writableEnded) await new Promise((resolve) => log.end(resolve));
    } finally {
      process.off('SIGINT', onInterrupt);
      process.off('SIGTERM', onTerminate);
    }
  }
  const record = {
    label,
    command,
    args,
    started,
    finished: new Date().toISOString(),
    ...outcome,
    timedOut,
    interrupted: interruptionSignal !== null,
    interruptionSignal,
    termination,
    logPath,
    ownedRuntime: Object.fromEntries(
      ['TMPDIR', 'NPM_CONFIG_CACHE', 'XDG_CACHE_HOME', 'PWTEST_CACHE_DIR']
        .filter((name) => env[name] !== undefined)
        .map((name) => [name, env[name]])
    ),
  };
  if (failure || outcome.code !== 0 || timedOut || record.interrupted)
    throw Object.assign(
      new Error(
        `Copied ${label} failed (${interruptionSignal ?? outcome.code ?? outcome.signal}); see ${logPath}`,
        { cause: failure }
      ),
      { childRecord: record }
    );
  return record;
}

export function freshBrowserEnvironment(owned, env) {
  const parent = ownedPath(owned, 'runtime/cache');
  mkdirSync(parent, { recursive: true });
  canonicalDirectory(parent);
  const transform = mkdtempSync(join(parent, 'playwright-transform-'));
  if (canonicalDirectory(transform) !== transform || readdirSync(transform).length)
    throw new Error('Playwright transform cache must start empty and owned');
  return { ...env, PWTEST_CACHE_DIR: transform };
}

export async function buildControlCopies({
  owned,
  copies,
  artifact,
  pinnedMetadata,
  bindings,
  request = { variant: WEB_HOST_VARIANT, artifact, fixture: 'matching' },
}) {
  const children = [];
  const scriptOwners = {};
  let current = bindings;
  let neutral;
  if (bindings.variant !== request.variant)
    throw new Error('Build copies disagree with their bound variant');
  const roles = webHostCopyRoles(request.variant);
  if (Object.keys(copies).sort().join() !== [...roles].sort().join())
    throw new Error('Build omitted or added a requested copy role');
  try {
    for (const role of roles) {
      const copyRoot = copies[role];
      assertCopyInputs(owned, current, role);
      scriptOwners[role] = stagedBuildScripts(copyRoot);
      let env = copiedBuildEnvironment(
        owned,
        copyRoot,
        artifact,
        pinnedMetadata,
        webHostCopyRequest(request, role)
      );
      children.push(
        await runCopiedChild({
          owned,
          copyRoot,
          env,
          label: `${role}-prebuild`,
          command: 'npm',
          args: ['run', 'prebuild'],
        })
      );
      assertCopyInputs(owned, current, role);
      if (role === WEB_HOST_NEUTRAL_COPY_ROLE) {
        const { prepareReactChrome } = await import('./web-host-react.mjs');
        const prepared = await prepareReactChrome({ owned, bindings: current, copyRoot, env });
        current = prepared.bindings;
        children.push(...prepared.children);
        neutral = { requestSha256: prepared.requestSha256, chromeSha256: prepared.chromeSha256 };
        env = prepared.env;
      }
      const args = ['--ignore-scripts', 'run', 'build'];
      if (role !== 'reference') args.push('--', '--config', join(copyRoot, WEB_HOST_WRAPPER));
      children.push(
        await runCopiedChild({ owned, copyRoot, env, label: `${role}-build`, command: 'npm', args })
      );
      current = freezeCopyInputs(owned, current, role);
      if (role === WEB_HOST_NEUTRAL_COPY_ROLE)
        neutral = {
          ...neutral,
          passesSha256: sha256(readFileSync(ownedPath(owned, WEB_HOST_NEUTRAL_PASSES))),
        };
      children.push(
        await runCopiedChild({
          owned,
          copyRoot,
          env,
          label: `${role}-postbuild`,
          command: 'npm',
          args: ['run', 'postbuild'],
        })
      );
      assertCopyInputs(owned, current, role);
    }
    if (
      roles.some(
        (role) => JSON.stringify(scriptOwners[role]) !== JSON.stringify(scriptOwners.reference)
      )
    )
      throw new Error('Reference, control and neutral lifecycle owners differ');
    for (const role of roles.filter((role) => role !== 'reference')) {
      const copyRoot = copies[role];
      assertCopyInputs(owned, current, role);
      const env = copiedBuildEnvironment(
        owned,
        copyRoot,
        artifact,
        pinnedMetadata,
        webHostCopyRequest(request, role)
      );
      children.push(
        await runCopiedChild({
          owned,
          copyRoot,
          env,
          label: `${role}-types`,
          command: process.execPath,
          args: [
            'tools/run-web-tool.mjs',
            'tsc',
            '--project',
            join(copyRoot, 'migration/probes/web-host/tsconfig.json'),
          ],
        })
      );
      if (role === WEB_HOST_NEUTRAL_COPY_ROLE) {
        assertCopyInputs(owned, current, role);
        children.push(
          await runCopiedChild({
            owned,
            copyRoot,
            env,
            label: 'neutral-svelte-types',
            command: process.execPath,
            args: [
              'tools/run-web-tool.mjs',
              'svelte-check',
              '--tsconfig',
              join(copyRoot, 'migration/probes/web-host/tsconfig.json'),
              '--fail-on-warnings',
            ],
          })
        );
      }
    }
    for (const role of roles) assertCopyInputs(owned, current, role);
  } catch (error) {
    error.webHostBuild = {
      children,
      bindings: current,
      scriptOwners,
      neutral,
      failedChild: error.childRecord ?? null,
    };
    throw error;
  }
  return {
    children,
    bindings: current,
    scriptOwners,
    neutral,
    invocation:
      'every requested copy: actual npm prebuild; input guard; neutral-only reviewed SSR preparation; npm --ignore-scripts run build (wrapped copies add --config); freeze inputs; actual npm postbuild; input guard; scoped types',
  };
}
