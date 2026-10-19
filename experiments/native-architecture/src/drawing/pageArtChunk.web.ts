// These consumers share PageOutline; separate async roots would split it into a shared chunk that
// each of them also fetches.
export { PageArtMotion } from './PageArtMotion';
export { prepareColoringPage } from './pageArtSelection';
export { PictureCapture } from './PictureCapture';
export { RsdClearUnderlay } from '../rsdDrawing/RsdClearUnderlay';
export { FixedInkCapture } from './FixedInkCapture';
