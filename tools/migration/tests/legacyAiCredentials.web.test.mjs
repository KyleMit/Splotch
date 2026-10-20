// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { removeLegacyAiCredentials } from '../../../experiments/native-architecture/src/platform/legacyAiCredentials.web.ts';

// The keys older shipping web builds wrote (web/src/lib/storageKeys.ts), spelled out so a rename
// on either side fails here.
const LEGACY_API_KEY = 'splotch-ai-user-api-key';
const LEGACY_ACCESS_CODE = 'splotch-ai-access-token';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

it('removes both legacy plaintext AI credentials without reading them', () => {
  localStorage.setItem(LEGACY_API_KEY, 'sk-proj-legacy');
  localStorage.setItem(LEGACY_ACCESS_CODE, 'legacy-access-code');
  localStorage.setItem('splotch-drawer-open', 'true');
  const read = vi.spyOn(Storage.prototype, 'getItem');
  removeLegacyAiCredentials();
  expect(read).not.toHaveBeenCalled();
  read.mockRestore();
  expect(Object.keys(localStorage).sort()).toEqual(['splotch-drawer-open']);
});

it('leaves a launch running when the browser refuses storage', () => {
  const refused = {
    removeItem: vi.fn(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    }),
  };
  expect(() => removeLegacyAiCredentials(refused)).not.toThrow();
  expect(refused.removeItem.mock.calls).toEqual([[LEGACY_API_KEY], [LEGACY_ACCESS_CODE]]);
});

it('leaves a launch running when the browser blocks the storage getter itself', () => {
  vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
  expect(() => removeLegacyAiCredentials()).not.toThrow();
});
