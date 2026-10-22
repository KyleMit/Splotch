// @vitest-environment node
import { expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ getStore: vi.fn() }));
vi.mock('@netlify/blobs', () => sdk);
vi.mock('./deploymentConfig.generated', () => ({
  scopeStoreName: (name: string) => `test-${name}`,
}));
import { getStore } from './blobs';

it.each([
  'free-generation-grants',
  'access-tokens',
  'ai-generation-jobs',
  'ai-generation-attempts-v1',
  'ai-image-reports',
  'ai-usage',
  'github-issues',
])('scopes %s while preserving consistency and conditional-storage options', (name) => {
  getStore({ name, consistency: 'strong' });
  expect(sdk.getStore).toHaveBeenLastCalledWith({ name: `test-${name}`, consistency: 'strong' });
});

it('opens the maintenance namespace once even when the active deployment is already test', () => {
  getStore({ name: 'ai-image-reports', consistency: 'strong' }, 'test');
  expect(sdk.getStore).toHaveBeenLastCalledWith({
    name: 'test-ai-image-reports',
    consistency: 'strong',
  });
});
