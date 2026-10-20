import type { UnsavedPictureStore } from '../export/saveFailure';
import { readUnsavedPictures } from '../export/unsavedPictures';

const DIRECTORY = 'splotch-unsaved-pictures-v1';
const REVISION = /^held-(\d+)\.json$/;
const RETAINED_REVISIONS = 2;

async function files() {
  const { Directory, File, Paths } = await import('expo-file-system');
  const owner = new Directory(Paths.document, DIRECTORY);
  owner.create({ intermediates: true, idempotent: true });
  const previous = owner
    .list()
    .flatMap((item) => {
      if (!(item instanceof File)) return [];
      const match = REVISION.exec(item.name);
      if (!match) return [];
      const revision = Number(match[1]);
      if (!Number.isSafeInteger(revision) || revision < 1) return [];
      return [{ file: item, revision }];
    })
    .sort((a, b) => b.revision - a.revision);
  return { owner, previous, File };
}

export const unsavedPictureStore: UnsavedPictureStore = {
  async read() {
    const file = (await files()).previous[0]?.file;
    return file ? readUnsavedPictures(JSON.parse(await file.text())) : null;
  },
  async write(pictures) {
    const { owner, previous, File } = await files();
    const revision = (previous[0]?.revision ?? 0) + 1;
    if (!Number.isSafeInteger(revision))
      throw new Error('Unsaved picture revisions are exhausted.');
    const snapshot = JSON.stringify(pictures);
    const pending = new File(owner, `held-${revision}.pending`);
    if (pending.exists) pending.delete();
    pending.create();
    await pending.write(snapshot);
    if ((await pending.text()) !== snapshot)
      throw new Error('Unsaved picture write was incomplete.');
    const committed = new File(owner, `held-${revision}.json`);
    await pending.move(committed);
    if ((await committed.text()) !== snapshot)
      throw new Error('Unsaved picture write could not be verified.');
    for (const old of previous.slice(RETAINED_REVISIONS - 1)) {
      try {
        old.file.delete();
      } catch {
        /* A verified revision owns the held pictures. */
      }
    }
  },
};
