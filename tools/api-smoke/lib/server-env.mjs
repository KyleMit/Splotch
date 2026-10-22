export function contractServerEnv(adminSecret, apiMode = 'production') {
  return {
    ADMIN_ACCESS_TOKEN: adminSecret,
    ALLOWED_TOKENS_LIST: 'alpha,beta',
    OPENAI_API_KEY: apiMode === 'test' ? '' : 'not-a-usable-openai-key',
    GENERATE_DEADLINE_MS_OVERRIDE: '',
    GITHUB_ISSUE_TOKEN: '',
    GITHUB_ISSUE_REPO: 'splotch-tests/nowhere',
    REPORT_TOKEN_SECRET: 'smoke-report-token-secret',
    USAGE_GRANT_ID_SECRET: 'smoke-usage-grant-id-secret',
    AI_RECOVERY_V1_ENABLED: '',
    SPLOTCH_API_MODE: apiMode,
  };
}
