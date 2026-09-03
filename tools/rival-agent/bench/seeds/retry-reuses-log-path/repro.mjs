// Fails when the second attempt's stream log resolves to the first attempt's path: the log is
// opened exclusively, so the retry after a pruned resume dies on EEXIST.
import { createWriteStream, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { logPathForAttempt } = await import(
  pathToFileURL(join(process.cwd(), 'tools/rival-agent/launch.mjs')).href
);
const session = mkdtempSync(join(tmpdir(), 'rival-bench-retry-'));
const openExclusively = (attempt) =>
  new Promise((resolve, reject) => {
    const stream = createWriteStream(logPathForAttempt(session, attempt), { flags: 'wx' });
    stream.on('open', () => stream.end(resolve));
    stream.on('error', reject);
  });
await openExclusively(1);
await openExclusively(2);
