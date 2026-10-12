import type { View } from 'react-native';
import { paperFrame, type PaperFrame } from './paperGeometry';

export function measurePaper(host: View | null, complete: (frame: PaperFrame | null) => void) {
  const element: unknown = host;
  if (
    typeof element !== 'object' ||
    element === null ||
    !('getBoundingClientRect' in element) ||
    typeof element.getBoundingClientRect !== 'function' ||
    !('ownerDocument' in element)
  ) {
    complete(null);
    return;
  }
  try {
    const rect: unknown = Reflect.apply(element.getBoundingClientRect, element, []);
    const owner: unknown = element.ownerDocument;
    const viewport: unknown =
      typeof owner === 'object' && owner !== null && 'defaultView' in owner
        ? owner.defaultView
        : null;
    if (
      typeof rect !== 'object' ||
      rect === null ||
      !('width' in rect) ||
      !('height' in rect) ||
      !('left' in rect) ||
      typeof rect.left !== 'number' ||
      !('top' in rect) ||
      typeof rect.top !== 'number' ||
      typeof viewport !== 'object' ||
      viewport === null ||
      !('scrollX' in viewport) ||
      typeof viewport.scrollX !== 'number' ||
      !('scrollY' in viewport) ||
      typeof viewport.scrollY !== 'number'
    ) {
      complete(null);
      return;
    }
    complete(
      paperFrame(rect.width, rect.height, rect.left + viewport.scrollX, rect.top + viewport.scrollY)
    );
  } catch {
    complete(null);
  }
}
