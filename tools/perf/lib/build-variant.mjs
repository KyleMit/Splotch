// Which kind of build is sitting in `web/build`.
//
// `build:cap` writes the native static export into the SAME directory the web
// build uses, so any native build — `build:cap`, `ios:run:device`, `android:run` —
// silently replaces what the preview server serves. A capture against the export
// does not fail, it HANGS: the drawing route never reports ready and the runner
// waits.
//
// Lives here rather than beside `perf:serve` because both the server entry and the
// per-capture assertion need it, and importing an entry module for a predicate
// drags its `isMain` block into every driver's module graph.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { WEB_ONLY_STATIC_FILES } from '../../mobile/lib/static-export.mjs';

// The export is defined by what it DROPS, so the web-only files are the
// discriminator — read from the list the strip itself works from rather than
// duplicated here.
export function buildDirHoldsNativeExport(buildDir = join(ROOT, 'web', 'build')) {
  if (!existsSync(join(buildDir, 'index.html'))) return false;
  return WEB_ONLY_STATIC_FILES.every((file) => !existsSync(join(buildDir, file)));
}
