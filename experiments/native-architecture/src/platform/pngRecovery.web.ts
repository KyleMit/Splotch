import {
  heldPngFilename,
  MAX_HELD_PNG_ARCHIVE_CHARACTERS,
  serializeHeldPngStorage,
  type HeldPngDelivery,
} from '../export/heldPng';

const RECOVERY_KEY = 'splotch-candidate:png-recovery-v1';

const storage = serializeHeldPngStorage({
  async read() {
    const snapshot = localStorage.getItem(RECOVERY_KEY);
    if (snapshot !== null && snapshot.length > MAX_HELD_PNG_ARCHIVE_CHARACTERS)
      throw new Error('PNG recovery data is too large.');
    return snapshot;
  },
  async write(snapshot) {
    if (snapshot.length > MAX_HELD_PNG_ARCHIVE_CHARACTERS)
      throw new Error('PNG recovery data is too large.');
    localStorage.setItem(RECOVERY_KEY, snapshot);
    if (localStorage.getItem(RECOVERY_KEY) !== snapshot)
      throw new Error('PNG recovery could not be verified.');
  },
});

const deliver: HeldPngDelivery = async (picture, isCurrent) => {
  if (picture.filename !== heldPngFilename(picture.id)) throw new Error('Invalid PNG export name.');
  const link = document.createElement('a');
  link.href = `data:image/png;base64,${picture.base64}`;
  link.download = picture.filename;
  if (!isCurrent()) throw new Error('PNG export was cancelled. Your drawing is still here.');
  link.click();
  return 'download-requested';
};

export const pngRecoveryPlatform = { storage, deliver } as const;
