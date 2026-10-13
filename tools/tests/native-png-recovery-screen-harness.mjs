// @vitest-environment happy-dom
import { createScreen, files } from './native-drawing-screen-harness.mjs';

files.recoveryRead = files.pngRead;
files.recoveryWrite = files.pngWrite;

export { createScreen, files };
