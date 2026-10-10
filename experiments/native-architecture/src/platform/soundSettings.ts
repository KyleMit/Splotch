import { Directory, File, Paths } from 'expo-file-system';
import { MAX_SETTINGS_BYTES, type SoundSettingsStorage } from '../settings/soundSettings';

const SETTINGS_DIRECTORY = 'splotch-sound-settings-v1';
const REVISION_NAME = /^sound-(\d+)\.json$/;

function directory() {
  const result = new Directory(Paths.document, SETTINGS_DIRECTORY);
  result.create({ intermediates: true, idempotent: true });
  return result;
}
function revisions(owner: Directory) {
  return owner
    .list()
    .flatMap((item) => {
      if (!(item instanceof File)) throw new Error('Unexpected sound settings directory.');
      const match = REVISION_NAME.exec(item.name);
      if (!match) {
        if (item.name.endsWith('.pending')) return [];
        throw new Error('Unexpected sound settings file.');
      }
      const revision = Number(match[1]);
      if (!Number.isSafeInteger(revision) || revision < 1)
        throw new Error('Invalid sound settings revision.');
      return [{ file: item, revision }];
    })
    .sort((a, b) => b.revision - a.revision);
}

export const soundSettingsStorage: SoundSettingsStorage = {
  async read() {
    const latest = revisions(directory())[0]?.file;
    if (!latest) return null;
    if (latest.size > MAX_SETTINGS_BYTES) throw new Error('Sound settings are too large.');
    return latest.text();
  },
  async write(snapshot) {
    const owner = directory();
    const previous = revisions(owner);
    const revision = (previous[0]?.revision ?? 0) + 1;
    if (!Number.isSafeInteger(revision)) throw new Error('Sound settings revision is exhausted.');
    const pending = new File(owner, `sound-${revision}.pending`);
    if (pending.exists) pending.delete();
    pending.create();
    pending.write(snapshot);
    if ((await pending.text()) !== snapshot)
      throw new Error('Sound settings could not be saved completely.');
    const committed = new File(owner, `sound-${revision}.json`);
    await pending.move(committed);
    if ((await committed.text()) !== snapshot)
      throw new Error('Sound settings could not be verified.');
    for (const old of previous.slice(1)) {
      try {
        old.file.delete();
      } catch {
        /* A failed prune leaves an older inert revision; the verified latest file owns the setting. */
      }
    }
  },
};
