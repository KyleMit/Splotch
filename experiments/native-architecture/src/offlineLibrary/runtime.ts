import { createLibrary } from './createLibrary';
import { createDeferredLibrary } from './deferredLibrary';
import { afterDrawingPaint } from '../product/afterDrawingPaint';

export const offlineLibrary = createDeferredLibrary(
  async () => createLibrary(),
  afterDrawingPaint,
  async () => 'resume'
);
