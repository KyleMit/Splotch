import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// package.json (at the repo root, one dir up from web/) holds the canonical
// major.minor, bumped by tools/release/cut-release.mjs. Native keeps that exact version —
// store submissions need deliberate, controlled numbers. The web build instead
// auto-derives the patch from git so every push to main gets a fresh version
// (so /version.json moves and the PWA stuck-client recovery stays live):
//   major.minor.<commits since the last release tag>   e.g. 1.2.45
// Netlify's deploy uses a blobless clone (full history + tags, only file blobs
// deferred), so `git describe` works on prod. If history/tags are ever missing
// we fall back to major.minor.0+<sha> — still unique per commit, never a stale
// bare version. The build time is kept separately for debugging. (ADR-0030)

// e.g. "v1.2.0-45-gabc1234" — 45 commits since the last release tag.
const GIT_DESCRIBE_SUFFIX = /-(\d+)-g[0-9a-f]+$/;

type Git = (args: string) => string | undefined;

function gitDescribeCommitCount(gitDescribe: string | undefined): string | undefined {
  return gitDescribe?.match(GIT_DESCRIBE_SUFFIX)?.[1];
}

export function deriveWebVersion({
  packageVersion,
  runGit,
}: {
  packageVersion: string;
  runGit: Git;
}): string {
  const [major, minor] = packageVersion.split('.');
  const gitDescribe = runGit('describe --tags --long --match "v*"');
  const commitCount = gitDescribeCommitCount(gitDescribe);

  if (commitCount !== undefined) return `${major}.${minor}.${commitCount}`;
  const shortSha = runGit('rev-parse --short HEAD');
  if (shortSha) return `${major}.${minor}.0+${shortSha}`;
  return packageVersion;
}

function git(args: string): string | undefined {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

function readPackageVersion(): string {
  return (JSON.parse(readFileSync('../package.json', 'utf8')) as { version: string }).version;
}

// Deliberately expose the build time as minute-resolution YYYY-MM-DD HH:MM.
function currentBuildTime(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

type BuildMetadata = { appVersion: string; buildTime: string };

// SvelteKit's client build re-evaluates vite.config.ts in the same process, so
// each evaluation would otherwise ask git again: a commit landing mid-build (or
// the clock crossing a minute) splits one build across two versions — the SSR
// bundle on one, the client chunks, version.json, and sw.js on the other.
// process.env is the only state that survives the re-evaluation, and child
// processes such as the prerenderer inherit it. The platform is recorded so a
// Capacitor build spawned from a web build's process never reuses the web version.
export const PINNED_BUILD_METADATA_ENV = 'SPLOTCH_PINNED_BUILD_METADATA';

function pinnedBuildMetadata(
  pinned: string | undefined,
  isCapacitor: boolean
): BuildMetadata | undefined {
  if (!pinned) return undefined;
  try {
    const parsed: unknown = JSON.parse(pinned);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const { appVersion, buildTime, isCapacitor: pinnedFor } = parsed as Record<string, unknown>;
    if (typeof appVersion !== 'string' || typeof buildTime !== 'string') return undefined;
    return pinnedFor === isCapacitor ? { appVersion, buildTime } : undefined;
  } catch {
    return undefined;
  }
}

export function buildMetadataOncePerProcess({
  isCapacitor,
  env,
  derive = () => buildMetadata({ isCapacitor }),
}: {
  isCapacitor: boolean;
  env: Record<string, string | undefined>;
  // Test seam: production derives from git and the clock through buildMetadata.
  derive?: () => BuildMetadata;
}): BuildMetadata {
  const pinned = pinnedBuildMetadata(env[PINNED_BUILD_METADATA_ENV], isCapacitor);
  if (pinned) return pinned;
  const metadata = derive();
  env[PINNED_BUILD_METADATA_ENV] = JSON.stringify({ ...metadata, isCapacitor });
  return metadata;
}

export function buildMetadata({
  isCapacitor,
  packageVersion = readPackageVersion(),
  buildTime = currentBuildTime(),
  runGit = git,
}: {
  isCapacitor: boolean;
  packageVersion?: string;
  buildTime?: string;
  runGit?: Git;
}): BuildMetadata {
  return {
    appVersion: isCapacitor ? packageVersion : deriveWebVersion({ packageVersion, runGit }),
    buildTime,
  };
}
