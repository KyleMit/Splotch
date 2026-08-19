import { glob } from 'node:fs/promises';
import { join } from 'node:path';
import { FILL_SRC_DIR } from '/home/user/Splotch/tools/asset-gen/lib/asset-paths.mjs';
import { punchFill } from '/home/user/Splotch/tools/asset-gen/lib/punch-fill.mjs';
let n = 0;
for await (const rel of glob('**/*.night.raw.webp', { cwd: FILL_SRC_DIR })) {
  await punchFill(join(FILL_SRC_DIR, rel));
  n++;
}
console.log('re-punched', n, 'night pages');
