import { randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import {
  assertOwnedArtifact,
  canonicalDirectory,
} from '../tools/migration/lib/web-host-ownership.mjs';
import {
  assertWebHostVariant,
  webHostArtifact,
  WEB_HOST_COPY_ROLES,
  WEB_HOST_ENV,
} from '../migration/probes/web-host/host/contract.ts';

export const PINNED_APP_SHELL_NONCE_ENV = 'SPLOTCH_PINNED_APP_SHELL_NONCE';
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BUILD_SOURCE_ROOT = resolve(import.meta.dirname, '..');

export function assertAppShellBuildNonce(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !UUID_V4_PATTERN.test(value))
    throw new Error('App-shell build nonce must be a canonical UUIDv4');
}

function requiredContext(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (typeof value !== 'string' || !value)
    throw new Error('App-shell nonce pin requires its complete owned paired-control context');
  return value;
}

export function assertAppShellNonceOwnership(env: Record<string, string | undefined>): void {
  const pin = env[PINNED_APP_SHELL_NONCE_ENV];
  if (pin === undefined) return;
  assertAppShellBuildNonce(pin);
  assertWebHostVariant(requiredContext(env, WEB_HOST_ENV.variant));
  const artifact = webHostArtifact(requiredContext(env, WEB_HOST_ENV.artifact));
  const root = requiredContext(env, WEB_HOST_ENV.artifactRoot);
  const copy = requiredContext(env, WEB_HOST_ENV.copyRoot);
  const token = requiredContext(env, WEB_HOST_ENV.token);
  if (
    !isAbsolute(root) ||
    !isAbsolute(copy) ||
    canonicalDirectory(copy) !== copy ||
    !WEB_HOST_COPY_ROLES.some((role) => copy === join(root, role))
  )
    throw new Error('App-shell nonce pin requires its canonical owned copy');
  assertOwnedArtifact({ root, token });
  const cwd = canonicalDirectory(process.cwd());
  if (
    BUILD_SOURCE_ROOT !== copy ||
    (cwd !== copy && cwd !== join(copy, 'web')) ||
    env.CAPACITOR === 'true' ||
    env.PERF_MARKS === 'true' ||
    (env.PUBLIC_ENABLE_DEV_HARNESS === 'true') !== (artifact === 'mechanism')
  )
    throw new Error('App-shell nonce pin is outside its owned paired web build');
}

export function appShellBuildNonce({ env }: { env: Record<string, string | undefined> }): string {
  const pin = env[PINNED_APP_SHELL_NONCE_ENV];
  if (pin !== undefined) {
    assertAppShellNonceOwnership(env);
    return pin;
  }
  const nonce = randomUUID();
  assertAppShellBuildNonce(nonce);
  return nonce;
}
