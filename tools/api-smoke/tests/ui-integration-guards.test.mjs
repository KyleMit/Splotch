import { describe, expect, it } from 'vitest';
import { requireTestApiEnvironment } from '../lib/test-api-environment.mjs';
import { contractServerEnv } from '../lib/server-env.mjs';
import { forbidRequestStubs } from '../../../e2e/support/real-api-routing.ts';

describe('real-handler UI lane boundaries', () => {
  it('accepts only the isolated fake environment', () => {
    expect(() => requireTestApiEnvironment(contractServerEnv('local', 'test'))).not.toThrow();
  });
  it.each([
    { SPLOTCH_API_MODE: 'production' },
    { SPLOTCH_API_MODE: '' },
    { OPENAI_API_KEY: 'outside-provider-key' },
    { GITHUB_ISSUE_TOKEN: 'outside-github-token' },
  ])('rejects an unsafe environment as a negative control: %j', (override) => {
    expect(() =>
      requireTestApiEnvironment({ ...contractServerEnv('local', 'test'), ...override })
    ).toThrow('requires test mode');
  });
  it.each(['route', 'routeFromHAR', 'routeWebSocket'])(
    'rejects %s registration and replacement as negative controls',
    (method) => {
      const target = { [method]: () => 'stubbed' };
      forbidRequestStubs(target);
      expect(() => target[method]()).toThrow('forbids request stubs');
      expect(() => {
        target[method] = () => 'replacement';
      }).toThrow();
    }
  );
});
