import { expect, it, vi } from 'vitest';
const clipboard = vi.hoisted(() => ({ setString: vi.fn() }));
vi.mock('react-native', () => ({ Clipboard: clipboard }));
import { copyPrivacySection } from '../../src/platform/privacySectionLink.ts';
import { sectionUrl } from '../../src/lib/privacy/sectionLink.ts';

it('writes the canonical section link through the installed native clipboard owner', async () => {
  clipboard.setString.mockReset();
  expect(await copyPrivacySection('hosting')).toBe(true);
  expect(clipboard.setString).toHaveBeenCalledWith(sectionUrl('hosting'));
});

it('preserves section navigation if the native clipboard refuses a write', async () => {
  clipboard.setString.mockImplementationOnce(() => {
    throw new Error('clipboard unavailable');
  });
  expect(await copyPrivacySection('hosting')).toBe(false);
});
