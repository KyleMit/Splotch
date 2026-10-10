import type { View } from 'react-native';
import { paperFrame, type PaperFrame } from './paperGeometry';

export function measurePaper(host: View | null, complete: (frame: PaperFrame | null) => void) {
  if (!host) {
    complete(null);
    return;
  }
  try {
    host.measure((_x, _y, width, height, pageX, pageY) => {
      complete(paperFrame(width, height, pageX, pageY));
    });
  } catch {
    complete(null);
  }
}
