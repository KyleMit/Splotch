// The slice of the GitHub Actions REST API the flaky digest reads. Everything the harvester needs
// from outside goes through this object, so its tests substitute a fake instead of the network.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API_ORIGIN = 'https://api.github.com';
const HOUR_MS = 60 * 60 * 1000;

// How far the artifact list's id order was observed to stray from creation order is a few hours; a
// day of margin costs one or two extra pages per harvest.
const ARTIFACT_ORDER_SLACK_HOURS = 24;
const PAGE_SIZE = 100;

// Requests held back from artifact downloads, so the next scheduled run inside the same rate-limit
// hour can still list runs and download the history it continues. Every /actions endpoint and every
// artifact zip draws on one bucket (a workflow's GITHUB_TOKEN gets 1,000 an hour), and /rate_limit
// does not report it: observed at 5,000 remaining there while /actions answered 403 with 0.
export const RATE_LIMIT_RESERVE_REQUESTS = 60;

// `unzip` exits 11 when the archive holds no member matching the requested name.
const UNZIP_NO_MATCHING_MEMBER_EXIT = 11;

// execFileSync's 1 MiB default is smaller than a history of a busy quarter's runs.
const UNZIP_MAX_BUFFER_BYTES = 512 * 1024 * 1024;

function fatalError(message) {
  return Object.assign(new Error(message), { fatal: true });
}

function rateLimitedError(path) {
  return Object.assign(new Error(`GitHub rate limit exhausted at ${path}`), { rateLimited: true });
}

function isRateLimited(response, remaining) {
  return response.status === 429 || (response.status === 403 && remaining === 0);
}

function readRemaining(response, previous) {
  const header = response.headers.get('x-ratelimit-remaining');
  return header === null ? previous : Number(header);
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function createGithubActionsApi({ repo, token, fetchImpl = fetch }) {
  let remaining = Infinity;
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
  };

  async function json(path) {
    const response = await fetchImpl(`${API_ORIGIN}${path}`, { headers });
    remaining = readRemaining(response, remaining);
    if (response.status === 401) throw fatalError(`GitHub rejected the token (401) for ${path}`);
    if (isRateLimited(response, remaining)) {
      throw rateLimitedError(path);
    }
    if (!response.ok) throw new Error(`GitHub ${response.status} for ${path}`);
    return response.json();
  }

  async function* pages(path, key) {
    const separator = path.includes('?') ? '&' : '?';
    for (let page = 1; ; page += 1) {
      const body = await json(`${path}${separator}per_page=${PAGE_SIZE}&page=${page}`);
      yield body[key];
      if (body[key].length < PAGE_SIZE) return;
    }
  }

  // The redirect is taken by hand: the rate-limit headers are on GitHub's redirect, not on the storage
  // response it points to, so a followed redirect would leave every download uncounted. The signed
  // storage URL also needs no token.
  async function downloadZip(artifactId) {
    const path = `/repos/${repo}/actions/artifacts/${artifactId}/zip`;
    let response = await fetchImpl(`${API_ORIGIN}${path}`, { headers, redirect: 'manual' });
    remaining = readRemaining(response, remaining);
    if (response.status === 401) throw fatalError(`GitHub rejected the token (401) for ${path}`);
    if (isRateLimited(response, remaining)) {
      throw rateLimitedError(path);
    }
    if (REDIRECT_STATUSES.has(response.status)) {
      response = await fetchImpl(response.headers.get('location'));
    }
    if (!response.ok) throw new Error(`GitHub ${response.status} for ${path}`);
    return Buffer.from(await response.arrayBuffer());
  }

  return {
    hasBudgetForDownload: () => remaining > RATE_LIMIT_RESERVE_REQUESTS,

    async listWorkflowRuns(workflowFile, since) {
      const runs = [];
      const path = `/repos/${repo}/actions/workflows/${workflowFile}/runs?created=${encodeURIComponent(
        `>=${since.toISOString()}`
      )}`;
      for await (const page of pages(path, 'workflow_runs')) runs.push(...page);
      return runs;
    },

    async listJobs(runId) {
      const jobs = [];
      for await (const page of pages(
        `/repos/${repo}/actions/runs/${runId}/jobs?filter=all`,
        'jobs'
      )) {
        jobs.push(...page);
      }
      return jobs;
    },

    /**
     * Every artifact created since `since`. The list is ordered by id, which only roughly follows
     * creation time, so paging stops at the first page created entirely before the slack margin.
     */
    async listArtifacts(since) {
      const artifacts = [];
      const cutoff = since.toISOString();
      const stopBefore = new Date(
        since.getTime() - ARTIFACT_ORDER_SLACK_HOURS * HOUR_MS
      ).toISOString();
      for await (const page of pages(`/repos/${repo}/actions/artifacts`, 'artifacts')) {
        artifacts.push(...page.filter((artifact) => artifact.created_at >= cutoff));
        if (page.every((artifact) => artifact.created_at < stopBefore)) break;
      }
      return artifacts;
    },

    async findLatestArtifact(name) {
      const body = await json(
        `/repos/${repo}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=${PAGE_SIZE}`
      );
      return (
        body.artifacts
          .filter((artifact) => !artifact.expired)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
      );
    },

    /** The named member of an artifact's zip as text, or null when the archive has none. */
    async readArtifactFile(artifactId, filename) {
      const dir = mkdtempSync(join(tmpdir(), 'flaky-digest-'));
      try {
        const archive = join(dir, 'artifact.zip');
        writeFileSync(archive, await downloadZip(artifactId));
        try {
          return execFileSync('unzip', ['-p', archive, filename], {
            encoding: 'utf8',
            maxBuffer: UNZIP_MAX_BUFFER_BYTES,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch (error) {
          if (error.status === UNZIP_NO_MATCHING_MEMBER_EXIT) return null;
          throw new Error(`unzip failed: ${String(error.stderr).trim() || error.message}`, {
            cause: error,
          });
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
