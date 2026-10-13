import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
import {
  adoptPaper,
  LEGACY_PAPER,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';

export { LEGACY_PAPER };

export function legacyDrawing(rainbow = 0, pageId = 'blank') {
  return { version: 5, pageId, rainbow, strokes: [] };
}

export function adoptedDrawing(frame, rainbow = 0, pageId = 'blank') {
  return {
    ...emptyDrawing(rainbow, pageId),
    paper: adoptPaper(frame.width, frame.height, frame.pixelRatio),
  };
}

export function canonicalPaper() {
  return adoptPaper(1024, 768, 1);
}
