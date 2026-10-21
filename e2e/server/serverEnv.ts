// Every private env name the /api function reads, declared rather than inherited, so the suite's
// server answers the same wherever it runs: a developer's exported credential never reaches it,
// and a spec never passes on a secret CI does not hold. tools/tests/e2e-server-env.test.mjs fails
// when the function reads a name this object lacks.

/**
 * The admin key the suite's server accepts, never a real secret. An admin console spec signs in
 * with it rather than spelling it.
 * @public
 */
export const ADMIN_ACCESS_TOKEN = 'test-admin-secret';

/** A managed access code the server's allowlist holds. */
export const MANAGED_ACCESS_CODE = 'daycare-club';

// Non-empty on purpose: with no key the managed-code path answers 503 before the request guards a
// generation spec exercises. The provider refuses this one, so no spec reaches a model.
const UNUSABLE_PROVIDER_KEY = 'not-a-usable-openai-key';

// A repo that does not exist. Blank would not do: the function falls back to the real repo.
const NOWHERE_ISSUE_REPO = 'splotch-tests/nowhere';

export const E2E_SERVER_ENV = {
  ADMIN_ACCESS_TOKEN,
  ALLOWED_TOKENS_LIST: MANAGED_ACCESS_CODE,
  OPENAI_API_KEY: UNUSABLE_PROVIDER_KEY,
  // Blank: the shipped generation deadline is what a spec exercises.
  GENERATE_DEADLINE_MS_OVERRIDE: '',
  // Blank: reporting stays unconfigured, so a feedback spec never files a real issue.
  GITHUB_ISSUE_TOKEN: '',
  GITHUB_ISSUE_REPO: NOWHERE_ISSUE_REPO,
  // Non-blank: a free-tier report needs generate-image to mint a token report-image accepts.
  REPORT_TOKEN_SECRET: 'test-report-token-secret',
  USAGE_GRANT_ID_SECRET: 'test-usage-grant-id-secret',
  AI_RECOVERY_V1_ENABLED: '',
} satisfies Record<string, string>;
