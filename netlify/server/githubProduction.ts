import { GITHUB_REQUEST_TIMEOUT_MS } from '../../src/lib/ai/limits';
import { config } from './config';
import type { CreateIssueInput } from './github';

const GITHUB_API = 'https://api.github.com';
const GITHUB_ACCEPT = 'application/vnd.github+json';
const GITHUB_API_VERSION = '2022-11-28';
const GITHUB_USER_AGENT = 'splotch-feedback';
// Bounds the thrown message (and every log line downstream) — a GitHub error
// body can be a full HTML page.
const ERROR_DETAIL_MAX_CHARS = 300;

function targetRepo(): string {
  return config.githubIssueRepo();
}

/** Whether a token is configured — the endpoint uses this to fail gracefully. */
export function isReportingConfigured(): boolean {
  return Boolean(config.githubIssueToken());
}

/**
 * Create an issue in the target repo. Throws if the token is missing or GitHub
 * returns anything but 201 — the caller maps that to a friendly 5xx so a
 * child's parent never sees a raw error.
 */
export async function createIssue(input: CreateIssueInput): Promise<void> {
  const token = config.githubIssueToken();
  if (!token) throw new Error('GITHUB_ISSUE_TOKEN is not configured');

  const res = await fetch(`${GITHUB_API}/repos/${targetRepo()}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: GITHUB_ACCEPT,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'Content-Type': 'application/json',
      // GitHub rejects API calls without a User-Agent.
      'User-Agent': GITHUB_USER_AGENT,
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
  });

  if (res.status !== 201) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `GitHub issue creation failed (${res.status}): ${detail.slice(0, ERROR_DETAIL_MAX_CHARS)}`
    );
  }
}
