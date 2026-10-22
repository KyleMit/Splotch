import type { Drawing, History } from '../drawing/model';

export const DEFAULT_COLORING_BOOK_ENABLED = true;

function coloringBookDrawing(drawing: Drawing, enabled: boolean): Drawing {
  return enabled || drawing.pageId === 'blank' ? drawing : { ...drawing, pageId: 'blank' };
}

export function coloringBookHistory(history: History, enabled: boolean): History {
  const drawing = coloringBookDrawing(history.drawing, enabled);
  return drawing === history.drawing ? history : { ...history, drawing };
}
