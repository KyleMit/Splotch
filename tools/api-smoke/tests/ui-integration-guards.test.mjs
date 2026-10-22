import { describe, expect, it } from 'vitest';
import {
  requireTestApiEnvironment,
  startTestApiEnvironment,
} from '../lib/test-api-environment.mjs';
import { contractServerEnv } from '../lib/server-env.mjs';
import { forbidRequestStubs } from '../../../e2e/support/real-api-routing.ts';

describe('real-handler UI lane boundaries', () => {
  it('accepts only the isolated fake environment', () => {
    expect(() => requireTestApiEnvironment(contractServerEnv('local', 'test'))).not.toThrow();
  });
  it('hands the host an immutable copy of the environment it validated', async () => {
    const input = contractServerEnv('local', 'test');
    const environment = await startTestApiEnvironment(input);
    try {
      expect(environment.env).toEqual(input);
      input.SPLOTCH_API_MODE = 'production';
      expect(environment.env.SPLOTCH_API_MODE).toBe('test');
      expect(() => {
        environment.env.SPLOTCH_API_MODE = 'production';
      }).toThrow();
    } finally {
      await environment.close();
    }
  });
  it.each([
    { SPLOTCH_API_MODE: 'production' },
    { SPLOTCH_API_MODE: '' },
    { OPENAI_API_KEY: 'outside-provider-key' },
    { GITHUB_ISSUE_TOKEN: 'outside-github-token' },
  ])('rejects unsafe startup as a negative control: %j', async (override) => {
    await expect(
      startTestApiEnvironment({ ...contractServerEnv('local', 'test'), ...override })
    ).rejects.toThrow('requires test mode');
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
