import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STORE_TARGETS } from '../../../web/src/routes/dev/store-frames/lib/targets.ts';
import { STORE_PAGES, pageHasCapture } from '../../../web/src/routes/dev/store-frames/lib/pages.ts';
import { captureAssetFile } from '../../../web/src/routes/dev/store-frames/lib/paths.ts';
import { ROOT } from '../../lib/proc.mjs';

// The committed capture set must cover the full target × capture-page matrix:
// `gen:store-assets:frames` and the /dev/store-frames harness read these from
// disk, so a hole in the matrix makes the advertised frames-only fast path
// fail for whoever pulls next. A new target or scene page lands together with
// its captures (run `npm run gen:store-assets`).
describe('committed store captures', () => {
  const capturePages = STORE_PAGES.filter(pageHasCapture);

  for (const target of STORE_TARGETS) {
    for (const page of capturePages) {
      it(`${target.name}/${page.id}`, () => {
        const file = join(ROOT, 'store-assets', captureAssetFile(target.name, page.id));
        expect(existsSync(file), `${file} missing — run npm run gen:store-assets`).toBe(true);
      });
    }
  }
});
