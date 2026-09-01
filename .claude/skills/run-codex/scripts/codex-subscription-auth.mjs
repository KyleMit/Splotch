import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CODEX_HOME = process.env.CODEX_HOME ?? join(homedir(), '.codex');
export const AUTH_PATH = join(CODEX_HOME, 'auth.json');
export const CONFIG_PATH = join(CODEX_HOME, 'config.toml');

// Codex prefers an inherited credential over the stored ChatGPT login, so every one of these would
// silently move the run onto metered API billing instead of the plan's included usage. Plan usage
// reaches chatgpt.com/backend-api/codex; a bearer credential from the environment instead reaches
// api.openai.com/v1/responses, which is the billing boundary these names defend.
export const API_BILLING_ENVIRONMENT_KEYS = Object.freeze([
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_ORGANIZATION',
  'OPENAI_PROJECT',
  'CODEX_API_KEY',
  'CODEX_ACCESS_TOKEN',
  'CODEX_AUTH',
  'CODEX_AUTHAPI_BASE_URL',
  'CODEX_REFRESH_TOKEN_URL_OVERRIDE',
  'CODEX_AGENT_IDENTITY_AUTHAPI_BASE_URL',
  'CODEX_AGENT_IDENTITY_JWKS_BASE_URL',
  'OPENAI_IDENTITY_TOKEN_FILE',
  'OPENAI_FEDERATION_RULE_ID',
]);

export const SUBSCRIPTION_AUTH_MODE = 'chatgpt';
export const SUBSCRIPTION_MODEL_PROVIDER = 'openai';
// The guard validates auth.json, so the child is pinned to the same store rather than a keyring a
// project config could select — otherwise the credential checked is not the credential used.
export const SUBSCRIPTION_CREDENTIALS_STORE = 'file';
// A config-file `openai_base_url` outranks the provider pin and sends the run to the metered
// endpoint, so the plan endpoint is pinned too. Hardcoding it trades a silent billing escape for a
// loud failure if Codex ever moves the path — the safe direction of that trade.
export const SUBSCRIPTION_BASE_URL = 'https://chatgpt.com/backend-api/codex';

// Only a bare top-level assignment can retarget the default provider; one nested under a
// `[model_providers.*]` table merely defines a provider that nothing has selected yet.
const TOP_LEVEL_MODEL_PROVIDER = /^[ \t]*model_provider[ \t]*=[ \t]*["']([^"']*)["']/m;
const FIRST_TABLE_HEADER = /^[ \t]*\[/m;

export function stripApiBillingEnvironment(environment = process.env) {
  const child = { ...environment };
  const stripped = API_BILLING_ENVIRONMENT_KEYS.filter((key) => child[key] !== undefined);
  for (const key of stripped) delete child[key];
  return { env: child, stripped };
}

export function assertSubscriptionAuth(auth) {
  if (auth?.auth_mode !== SUBSCRIPTION_AUTH_MODE) {
    throw new Error(
      `Codex is authenticated as "${auth?.auth_mode ?? 'unknown'}" instead of "${SUBSCRIPTION_AUTH_MODE}"; run \`codex login\` to use the plan's included usage`
    );
  }
  if (auth.OPENAI_API_KEY) {
    throw new Error('Codex stored an API key alongside the ChatGPT login; run `codex login` again');
  }
  if (!auth.tokens?.access_token) throw new Error('Codex has no stored ChatGPT access token');
}

export function assertSubscriptionModelProvider(configToml) {
  const preamble = configToml.split(FIRST_TABLE_HEADER)[0];
  const provider = TOP_LEVEL_MODEL_PROVIDER.exec(preamble)?.[1];
  if (provider !== undefined && provider !== SUBSCRIPTION_MODEL_PROVIDER) {
    throw new Error(
      `config.toml selects model_provider "${provider}"; only "${SUBSCRIPTION_MODEL_PROVIDER}" bills against the ChatGPT plan`
    );
  }
}

function readOptional(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export function assertSubscriptionBilling() {
  const rawAuth = readOptional(AUTH_PATH);
  if (rawAuth === undefined) throw new Error(`no Codex login at ${AUTH_PATH}; run \`codex login\``);
  assertSubscriptionAuth(JSON.parse(rawAuth));
  assertSubscriptionModelProvider(readOptional(CONFIG_PATH) ?? '');
  return stripApiBillingEnvironment();
}
