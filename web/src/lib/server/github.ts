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

/**
 * Neutralize GitHub-flavoured Markdown in untrusted text before it is embedded
 * in an issue body. `/api/report` is unauthenticated, so a submitter must not be
 * able to make the issue notify people or embed remote content: we backslash-
 * escape the trigger characters (all ASCII-punctuation escapes GitHub honours),
 * which renders the literal text the user typed, minus the powers:
 *
 *  - `@name` / `@org/team` → no user or team mention (which would fire a notification)
 *  - `#123`               → no issue/PR back-reference (also a notification)
 *  - `![alt](url)`        → no image embed (plain `[text](url)` links are left intact)
 *  - `<img …>` / `<a …>`  → no raw HTML tags at all
 *
 * Applied to the free-text message and to every device value (both fully
 * attacker-controlled). Issue *titles* need no escaping — GitHub renders them as
 * plain text, so a mention or ref there neither links nor notifies.
 */
export function escapeIssueMarkdown(text: string): string {
  return text
    .replace(/</g, '\\<')
    .replace(/@(?=[A-Za-z0-9_-])/g, '\\@')
    .replace(/#(?=\d)/g, '\\#')
    .replace(/!(?=\[)/g, '\\!');
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
