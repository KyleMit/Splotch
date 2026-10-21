// The suite's `test` and `expect`. Every spec imports them from here rather than from
// @playwright/test, so a fixture added here reaches every spec without touching one.
import { test as base } from '@playwright/test';
import { openDrawingScreen, type DrawingScreen } from './support/drawing.ts';

export { expect } from '@playwright/test';

export const test = base.extend<{ drawingScreen: DrawingScreen }>({
  /** The drawing screen at `/`, opened and answering input. */
  drawingScreen: async ({ page }, use) => {
    await use(await openDrawingScreen(page));
  },
});
