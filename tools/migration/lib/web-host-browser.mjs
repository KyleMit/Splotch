import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { ownedPath } from './web-host-ownership.mjs';

const BROWSER_REGISTRY_ENV = 'PLAYWRIGHT_BROWSERS_PATH';
const BROWSER_INVOCATION_LABEL =
  /^browser-control-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function requireBrowserRegistry(requested) {
  if (typeof requested !== 'string' || !isAbsolute(requested))
    throw new Error(
      'Supply --browser-registry as an existing absolute installed registry directory'
    );
  const path = realpathSync(requested);
  const stat = lstatSync(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error(`Browser registry must be a directory, not a link: ${requested}`);
  return { path, dev: stat.dev, ino: stat.ino, mode: stat.mode & 0o777 };
}

export function assertBrowserRegistry(registry) {
  try {
    const actual = requireBrowserRegistry(registry.path);
    if (JSON.stringify(actual) === JSON.stringify(registry)) return;
  } catch (error) {
    throw new Error('Browser registry changed before the copied child', { cause: error });
  }
  throw new Error('Browser registry changed before the copied child');
}

export function withBrowserRegistry(env, registry) {
  return { ...env, [BROWSER_REGISTRY_ENV]: registry.path };
}

export function browserRegistryEvidence(registry) {
  return { ...registry, standardHostValidationMayWrite: 'DEPENDENCIES_VALIDATED' };
}

export function browserInvocationPaths(owned, label) {
  if (typeof label !== 'string' || !BROWSER_INVOCATION_LABEL.test(label))
    throw new Error('Browser evidence requires its explicit per-invocation label');
  return {
    label,
    outputDir: ownedPath(owned, `browser-results/${label}`),
    reportDir: ownedPath(owned, `browser-report/${label}`),
  };
}

export function createBrowserInvocation(owned) {
  const invocation = browserInvocationPaths(owned, `browser-control-${randomUUID()}`);
  for (const parent of ['browser-results', 'browser-report'])
    mkdirSync(ownedPath(owned, parent), { recursive: true });
  mkdirSync(invocation.outputDir);
  mkdirSync(invocation.reportDir);
  return invocation;
}
