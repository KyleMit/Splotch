// watch-run.mjs — live view of a running burndown. Ctrl-C to exit.
//   npm run audit:watch            tail -f the run log
//   npm run audit:watch -- --dash  refreshing status summary every 10s

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { sleep } from '../lib/proc.mjs';
import { chdirRoot, LOGS } from './lib/burndown-core.mjs';

chdirRoot();

const log = join(LOGS, 'run.log');
if (!existsSync(log)) {
  console.error('no run log yet — start npm run audit:burndown first');
  process.exit(1);
}

if (process.argv[2] === '--dash') {
  while (true) {
    process.stdout.write('\x1b[2J\x1b[H');
    spawnSync(process.execPath, ['tools/audit-burndown/show-status.mjs'], { stdio: 'inherit' });
    await sleep(10_000);
  }
}

console.log(`tailing ${log}  (--dash for a refreshing summary instead)\n`);
spawnSync('tail', ['-f', log], { stdio: 'inherit' });
