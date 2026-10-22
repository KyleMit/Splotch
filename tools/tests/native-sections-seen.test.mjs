import { expect, it, vi } from 'vitest';
import { createSectionsSeen } from '../../src/settings/sectionsSeen.ts';
import { NATIVE_SETTINGS_SECTIONS } from '../../src/settings/settingsSections.ts';

it('tracks every shipping section stamp independently and persists only visited sections', async () => {
  let saved = null;
  const storage = {
    read: async () => saved,
    write: vi.fn(async (next) => {
      saved = next;
    }),
  };
  const owner = await createSectionsSeen(storage).load();
  expect(NATIVE_SETTINGS_SECTIONS.map(({ id }) => owner.unseen(id))).toEqual(
    NATIVE_SETTINGS_SECTIONS.map(() => true)
  );
  owner.markSeen('sound');
  expect(owner.unseen('sound')).toBe(false);
  expect(owner.unseen('appearance')).toBe(true);
  await vi.waitFor(() => expect(storage.write).toHaveBeenCalledOnce());
  expect(JSON.parse(saved)).toEqual({ sound: '2' });
  owner.markSeen('sound');
  expect(storage.write).toHaveBeenCalledOnce();
  const restored = await createSectionsSeen(storage).load();
  expect(restored.unseen('sound')).toBe(false);
});

it('restamps changed content and ignores malformed or unknown saved fields like shipping', async () => {
  const storage = {
    read: async () => '{"sound":"1","appearance":"1","unknown":"1","feedback":3}',
    write: vi.fn(async () => {}),
  };
  const owner = await createSectionsSeen(storage).load();
  expect(owner.unseen('sound')).toBe(true);
  expect(owner.unseen('appearance')).toBe(false);
  expect(owner.unseen('feedback')).toBe(true);
  owner.markSeen('sound');
  await vi.waitFor(() => expect(storage.write).toHaveBeenCalledOnce());
  expect(JSON.parse(storage.write.mock.calls[0][0])).toEqual({ sound: '2', appearance: '1' });
});
