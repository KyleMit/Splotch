import {
  buildMetadataOncePerProcess,
  PINNED_BUILD_METADATA_ENV,
} from '../../../web/buildVersion.ts';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { sourceGit } from './web-host-source.mjs';

export function freezeGitMetadata(snapshot) {
  let describe;
  let tagSha = null;
  try {
    describe = sourceGit(snapshot.root, [
      'describe',
      '--tags',
      '--long',
      '--match',
      'v*',
      snapshot.sha,
    ]).trim();
    const tag = sourceGit(snapshot.root, [
      'describe',
      '--tags',
      '--abbrev=0',
      '--match',
      'v*',
      snapshot.sha,
    ]).trim();
    tagSha = sourceGit(snapshot.root, ['rev-parse', '--verify', `${tag}^{commit}`]).trim();
  } catch {
    describe = undefined;
  }
  const shortSha = sourceGit(snapshot.root, ['rev-parse', '--short', snapshot.sha]).trim();
  return { describe: describe ?? null, tagSha, shortSha };
}

export async function pinBuildMetadata(copyRoot, gitMetadata) {
  const owner = await import(pathToFileURL(join(copyRoot, 'web/buildVersion.ts')).href);
  const { version: packageVersion } = JSON.parse(
    readFileSync(join(copyRoot, 'package.json'), 'utf8')
  );
  if (typeof packageVersion !== 'string' || !/^\d+\.\d+\.\d+/.test(packageVersion)) {
    throw new Error(`Invalid package version in copied source: ${copyRoot}`);
  }
  const runGit = (command) => {
    if (command === 'describe --tags --long --match "v*"') return gitMetadata.describe ?? undefined;
    if (command === 'rev-parse --short HEAD') return gitMetadata.shortSha;
    throw new Error(`Unregistered build-metadata Git query: ${command}`);
  };
  const metadata = owner.buildMetadata({ isCapacitor: false, packageVersion, runGit });
  const env = {};
  owner.buildMetadataOncePerProcess({ isCapacitor: false, env, derive: () => metadata });
  const parsed = JSON.parse(env[owner.PINNED_BUILD_METADATA_ENV]);
  if (
    parsed.appVersion !== metadata.appVersion ||
    parsed.buildTime !== metadata.buildTime ||
    parsed.isCapacitor !== false
  ) {
    throw new Error('Copied metadata owner rejected the frozen web metadata');
  }
  return { metadata, env };
}

export function assertPinnedBuildMetadata(pinned) {
  if (
    !pinned ||
    !pinned.env ||
    typeof pinned.metadata?.appVersion !== 'string' ||
    typeof pinned.metadata?.buildTime !== 'string' ||
    Object.keys(pinned.env).length !== 1 ||
    typeof pinned.env[PINNED_BUILD_METADATA_ENV] !== 'string'
  ) {
    throw new Error(
      'Artifact must contain only its actual pinned build-metadata environment value'
    );
  }
  const metadata = buildMetadataOncePerProcess({
    isCapacitor: false,
    env: { ...pinned.env },
    derive: () => {
      throw new Error('Artifact contains invalid web build metadata');
    },
  });
  if (
    metadata.appVersion !== pinned.metadata.appVersion ||
    metadata.buildTime !== pinned.metadata.buildTime
  ) {
    throw new Error('Artifact pinned metadata disagrees with its frozen metadata record');
  }
}
