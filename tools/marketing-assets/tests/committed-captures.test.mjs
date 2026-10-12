import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { STORE_TARGETS } from '../../../web/src/routes/dev/store-frames/lib/targets.ts';
import { frameGeometry } from '../../../web/src/routes/dev/store-frames/lib/geometry.ts';
import { STORE_PAGES, pageHasCapture } from '../../../web/src/routes/dev/store-frames/lib/pages.ts';
import { captureAssetFile } from '../../../web/src/routes/dev/store-frames/lib/paths.ts';
import { ROOT } from '../../lib/proc.mjs';

// The committed capture set must cover the full target × capture-page matrix
// AND each capture must be pixel-exact for its target's frame slot:
// `gen:store-assets:frames` and the /dev/store-frames harness read these from
// disk, and StoreFrame stretches whatever it gets to --frame-w/--frame-h, so
// a missing file breaks the advertised frames-only fast path while a
// wrong-size one silently distorts the store output. A new target, scene
// page, or geometry change lands together with regenerated captures (run
// `npm run gen:store-assets`).
describe('committed store captures', () => {
  const capturePages = STORE_PAGES.filter(pageHasCapture);

  for (const target of STORE_TARGETS) {
    const { frame } = frameGeometry(target);
    for (const page of capturePages) {
      it(`${target.name}/${page.id}`, async () => {
        const file = join(ROOT, 'store-assets', captureAssetFile(target.name, page.id));
        expect(existsSync(file), `${file} missing — run npm run gen:store-assets`).toBe(true);
        const { width, height } = await sharp(file).metadata();
        expect(
          { width, height },
          `${file} does not match frameGeometry(${target.name}).frame — regenerate with npm run gen:store-assets`
        ).toEqual({ width: frame.width, height: frame.height });
      });
    }
  }
});
