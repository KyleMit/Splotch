import { exportCanvasBlob, getActiveCanvas } from './engine';
import { getActiveOverlayImage } from './overlay';
import { isNative, getPlatform } from '$lib/platform';

function timestamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

const ALBUM_NAME = 'Splotch';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// `Media` is the dynamically-imported @capacitor-community/media plugin; its
// album/photo shapes aren't worth re-declaring here, so it's loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findAlbumId(Media: any, name: string): Promise<string | undefined> {
  const { albums } = await Media.getAlbums();
  return albums.find((a: { name: string; identifier: string }) => a.name === name)?.identifier;
}

// Native: drop the PNG straight into the device photo library. Android requires
// an album identifier, so we tuck drawings into a "Splotch" album (creating it
// once); iOS saves to the camera roll with add-only permission.
async function saveToGallery(blob: Blob, baseName = 'splotch') {
  const { Media } = await import('@capacitor-community/media');
  const dataUrl = await blobToDataUrl(blob);

  if (getPlatform() === 'android') {
    let albumId = await findAlbumId(Media, ALBUM_NAME);
    if (!albumId) {
      await Media.createAlbum({ name: ALBUM_NAME });
      albumId = await findAlbumId(Media, ALBUM_NAME);
    }
    await Media.savePhoto({ path: dataUrl, albumIdentifier: albumId, fileName: `${baseName}-${timestamp()}` });
  } else {
    await Media.savePhoto({ path: dataUrl });
  }
}

// Persist a PNG blob: native drops it into the photo gallery, the web triggers a
// file download. No polaroid animation — for silent/background saves (e.g. the
// AI auto-save), where the caller owns its own feedback.
export async function saveImageBlob(blob: Blob | null, baseName = 'splotch') {
  if (!blob) return;
  if (isNative()) {
    try {
      await saveToGallery(blob, baseName);
    } catch (err) {
      console.error('Save to gallery failed:', err);
    }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}-${timestamp()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

export async function saveScreenshot() {
  const blob = await exportCanvasBlob(getActiveOverlayImage());
  if (!blob) return;

  const url = URL.createObjectURL(blob);

  if (isNative()) {
    try {
      await saveToGallery(blob);
    } catch (err) {
      console.error('Save to gallery failed:', err);
    }
  } else {
    // Browser: trigger a normal file download.
    const a = document.createElement('a');
    a.href = url;
    a.download = `splotch-${timestamp()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  playPolaroidAnimation(url);
}

const POLAROID_DURATION_MS = 1900;

function playPolaroidAnimation(imageUrl: string) {
  const overlay = document.createElement('div');
  overlay.className = 'polaroid-overlay';

  const flash = document.createElement('div');
  flash.className = 'polaroid-flash';

  const frame = document.createElement('div');
  frame.className = 'polaroid-frame';

  const img = document.createElement('img');
  img.className = 'polaroid-image';
  img.src = imageUrl;
  img.alt = '';

  // Match the polaroid photo to the drawing's aspect ratio instead of
  // cropping it to a fixed shape.
  const canvas = getActiveCanvas();
  if (canvas && canvas.width > 0 && canvas.height > 0) {
    img.style.setProperty('--polaroid-aspect', `${canvas.width} / ${canvas.height}`);
  }

  const button = document.getElementById('screenshotButton');
  if (button) {
    const rect = button.getBoundingClientRect();
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    const fromX = Math.round(cx - window.innerWidth / 2);
    const fromY = Math.round(cy - window.innerHeight / 2);
    frame.style.setProperty('--from-x', `${fromX}px`);
    frame.style.setProperty('--from-y', `${fromY}px`);
  }

  frame.appendChild(img);
  overlay.appendChild(flash);
  overlay.appendChild(frame);
  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay.remove();
    URL.revokeObjectURL(imageUrl);
  }, POLAROID_DURATION_MS);
}
