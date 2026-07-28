import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// package.json (at the repo root, one dir up from web/) holds the canonical
// major.minor, bumped by scripts/release.mjs. Native keeps that exact version —
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
}): { appVersion: string; buildTime: string } {
  return {
    appVersion: isCapacitor ? packageVersion : deriveWebVersion({ packageVersion, runGit }),
    buildTime,
  };
}
