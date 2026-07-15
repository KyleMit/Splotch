import { env } from '$env/dynamic/private';

// Server-only seam for the one thing we do with GitHub: open an issue from an
// in-app feedback report. Isolated here (mirroring the AI provider seam,
// ADR-0047) so route code never touches the token or the REST shape directly.

const GITHUB_API = 'https://api.github.com';

function targetRepo(): string {
  return env.GITHUB_ISSUE_REPO?.trim() || 'KyleMit/Splotch';
}

/** Whether a token is configured — the endpoint uses this to fail gracefully. */
export function isReportingConfigured(): boolean {
  return Boolean(env.GITHUB_ISSUE_TOKEN);
}

export interface CreateIssueInput {
  title: string;
  body: string;
  labels: string[];
}

/**
 * Create an issue in the target repo and return its web URL and number. Throws
 * if the token is missing or GitHub returns anything but 201 — the caller maps
 * that to a friendly 5xx so a child's parent never sees a raw error.
 */
export async function createIssue(
  input: CreateIssueInput
): Promise<{ url: string; number: number }> {
  const token = env.GITHUB_ISSUE_TOKEN;
  if (!token) throw new Error('GITHUB_ISSUE_TOKEN is not configured');

  const res = await fetch(`${GITHUB_API}/repos/${targetRepo()}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      // GitHub rejects API calls without a User-Agent.
      'User-Agent': 'splotch-feedback',
    },
    body: JSON.stringify(input),
  });

  if (res.status !== 201) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GitHub issue creation failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as { html_url?: string; number?: number };
  if (!data.html_url || typeof data.number !== 'number') {
    throw new Error('GitHub issue creation returned an unexpected payload');
  }
  return { url: data.html_url, number: data.number };
}
