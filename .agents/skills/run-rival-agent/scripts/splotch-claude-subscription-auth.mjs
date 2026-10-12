export const API_BILLING_ENVIRONMENT_KEYS = Object.freeze([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_VERTEX',
]);

export function assertNoApiBillingEnvironment(environment = process.env) {
  const configured = API_BILLING_ENVIRONMENT_KEYS.filter((key) => environment[key]);
  if (configured.length > 0) {
    throw new Error(
      `refusing Claude invocation while API-billed authentication is configured: ${configured.join(', ')}`
    );
  }
}

export function assertClaudePlanAuthentication(status) {
  if (status?.loggedIn !== true) throw new Error('Claude is not authenticated');
  if (status.authMethod === 'api_key') {
    throw new Error('Claude reports API-key authentication instead of a plan login');
  }
}
