import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The generated pictures every AI mock answers with, shared by the Playwright
// harness (tests/ai-harness.ts) and the page-inventory capture
// (tools/page-inventory/capture-page-inventory.mjs), which loads this module
// under --experimental-strip-types.
//
// There is one per canvas shape because the real endpoint asks the image model
// for a canvas matching the shape the child drew on (imageSizeFor in
// src/lib/server/ai/imageSize.ts). A portrait picture in a landscape result modal
// is a state the product cannot reach, so a mock that always answered with the
// portrait one had the modal composing around a picture it never has to hold.
//
// Both are real outputs of that endpoint, committed so a run needs no provider:
// the portrait one from the Clay style, the landscape one the wide rainbow of
// scrapbook/model-eval/prompt-adherence, resampled from the 512×341 that eval's
// contact sheet keeps up to the 1536×1024 IMAGE_SIZES.landscape the endpoint
// actually returns. That size is load-bearing rather than cosmetic: the stage
// image is never drawn past its natural size, so a fixture smaller than the box
// the card projected for it leaves the card standing open around it — the same
// unreachable state as the wrong shape, wearing different clothes.
const FIXTURE_URLS = {
  portrait: new URL('./ai-output-portrait.jpeg', import.meta.url),
  landscape: new URL('./ai-output-landscape.jpeg', import.meta.url),
} as const;

export type AiOutputOrientation = keyof typeof FIXTURE_URLS;

type ViewportSize = { width: number; height: number } | null;

/** Fixture paths by the orientation each one is filed under. */
export const AI_OUTPUT_FIXTURES = Object.fromEntries(
  Object.entries(FIXTURE_URLS).map(([orientation, url]) => [orientation, fileURLToPath(url)])
) as Record<AiOutputOrientation, string>;

const AI_OUTPUTS = Object.fromEntries(
  Object.entries(FIXTURE_URLS).map(([orientation, url]) => [orientation, readFileSync(url)])
) as Record<AiOutputOrientation, Buffer>;

/**
 * The generated picture a drawing made at this viewport comes back as. The
 * drawing canvas fills the viewport, so the viewport's shape is the shape the
 * child drew on — the same thing the endpoint derives its output canvas from.
 */
export function aiOutputFor(viewport: ViewportSize): Buffer {
  return AI_OUTPUTS[viewport && viewport.width > viewport.height ? 'landscape' : 'portrait'];
}
