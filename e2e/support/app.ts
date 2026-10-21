import { expect, type Page, type Response } from '@playwright/test';
import {
  CONTROLS_LIVE_ATTRIBUTE,
  DRAWING_LIVE_ATTRIBUTE,
} from '../../experiments/native-architecture/src/platform/firstFrameContract.ts';

// How long the drawing screen gets to take over from its prerendered first frame: the engine and
// the controls each stamp <html> once they listen. Locally that is a few hundred milliseconds; this
// covers a cold WebKit worker parsing the core bundle on a starved CI runner.
const INTERACTIVE_TIMEOUT_MS = 20_000;

/** Waits until the drawing screen's engine and controls both answer input. */
export async function waitForDrawingScreen(page: Page): Promise<void> {
  await expect(
    page.locator(`html[${DRAWING_LIVE_ATTRIBUTE}][${CONTROLS_LIVE_ATTRIBUTE}]`)
  ).toBeAttached({ timeout: INTERACTIVE_TIMEOUT_MS });
}

/** Opens a document of the export, by its pretty URL, and answers the host's response. */
export async function openDocument(page: Page, path: string): Promise<Response> {
  const response = await page.goto(path);
  if (!response) throw new Error(`${path} answered no response`);
  return response;
}
