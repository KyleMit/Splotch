import { getActiveCanvas } from './engine';

const POLAROID_DURATION_MS = 1900;

function getPolaroidFrameOffset(buttonRect: DOMRect): { fromX: number; fromY: number } {
  const cx = (buttonRect.left + buttonRect.right) / 2;
  const cy = (buttonRect.top + buttonRect.bottom) / 2;
  const fromX = Math.round(cx - window.innerWidth / 2);
  const fromY = Math.round(cy - window.innerHeight / 2);
  return { fromX, fromY };
}

export function playPolaroidAnimation(imageUrl: string) {
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
    const { fromX, fromY } = getPolaroidFrameOffset(button.getBoundingClientRect());
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
