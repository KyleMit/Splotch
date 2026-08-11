import { env } from '$env/dynamic/private';

// The private feedback repo user reports land in (ADR-0060). .env.example's
// PAT setup steps re-type this value as prose they can't import; config.test.ts
// is the drift guard that fails when either side diverges.
export const DEFAULT_GITHUB_ISSUE_REPO = 'KyleMit/splotch-feedback';

export const config = {
  geminiApiKey: () => env.GEMINI_API_KEY,
  githubIssueToken: () => env.GITHUB_ISSUE_TOKEN,
  githubIssueRepo: () => env.GITHUB_ISSUE_REPO?.trim() || DEFAULT_GITHUB_ISSUE_REPO,
};
