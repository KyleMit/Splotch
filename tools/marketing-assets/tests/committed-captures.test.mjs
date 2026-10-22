import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { STORE_TARGETS } from '../lib/storeFrames/targets.ts';
import { frameGeometry } from '../lib/storeFrames/geometry.ts';
import { STORE_PAGES, pageHasCapture } from '../lib/storeFrames/pages.ts';
import { storeCaptureFile } from '../lib/store-frame-document.mjs';

// The committed capture set must cover the full target × capture-page matrix
// AND each capture must be pixel-exact for its target's frame slot:
// `gen:store-assets:frames` reads these from disk, and the frame document
// stretches whatever it gets to --frame-w/--frame-h, so
// a missing file breaks the advertised frames-only fast path while a
// wrong-size one silently distorts the store output. A target, scene page, or geometry change must carry a matching committed capture set.
describe('committed store captures', () => {
  const capturePages = STORE_PAGES.filter(pageHasCapture);

  for (const target of STORE_TARGETS) {
    const { frame } = frameGeometry(target);
    for (const page of capturePages) {
      it(`${target.name}/${page.id}`, async () => {
        const file = storeCaptureFile(target.name, page.id);
        expect(existsSync(file), `${file} missing — restore the committed capture`).toBe(true);
        const { width, height } = await sharp(file).metadata();
        expect(
          { width, height },
          `${file} does not match frameGeometry(${target.name}).frame — update the committed capture`
        ).toEqual({ width: frame.width, height: frame.height });
      });
    }
  }
});
