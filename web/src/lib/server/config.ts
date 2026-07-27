import { env } from '$env/dynamic/private';

export const config = {
  geminiApiKey: () => env.GEMINI_API_KEY,
  githubIssueToken: () => env.GITHUB_ISSUE_TOKEN,
  githubIssueRepo: () => env.GITHUB_ISSUE_REPO?.trim() || 'KyleMit/Splotch',
};
