// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({
  setJSON: vi.fn().mockResolvedValue({ modified: true }),
  getStore: vi.fn(),
}));
vi.mock('@netlify/blobs', () => ({
  getStore: sdk.getStore.mockImplementation(() => ({ setJSON: sdk.setJSON })),
}));
vi.mock('./deploymentConfig.generated', () => import('./deploymentTest'));
vi.mock('./testDataRetention', () => ({ maintainTestData: vi.fn().mockResolvedValue(undefined) }));
import { createIssue, isReportingConfigured } from './githubTest';

afterEach(() => vi.unstubAllGlobals());

it('records the complete issue in isolated storage without a GitHub request or token', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const issue = { title: '[Bug] Test', body: 'Test feedback body', labels: ['user-report'] };
  expect(isReportingConfigured()).toBe(true);
  await createIssue(issue);
  expect(sdk.getStore).toHaveBeenCalledWith({ name: 'test-github-issues', consistency: 'strong' });
  expect(sdk.setJSON).toHaveBeenCalledWith(expect.stringMatching(/^\d+-[a-f0-9-]{36}$/), {
    ...issue,
    recordedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
  });
  expect(fetch).not.toHaveBeenCalled();
});
