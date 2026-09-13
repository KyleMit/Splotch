// Fails when the static tree the web deploy publishes no longer serves a file
// some released native app downloads by manifest path and digest (ADR-0103).
//   npm run check:coloring-pack-retention

import { fail, isMain } from '../lib/proc.mjs';
import { checkColoringPackRetention } from './lib/coloring-pack-retention.mjs';

export function runColoringPackRetentionCheck() {
  const { results, problems } = checkColoringPackRetention();
  for (const { snapshot, breaks } of results) {
    const total = snapshot.books.reduce((sum, book) => sum + Object.keys(book.files).length, 0);
    const blocked = new Set(breaks.map((entry) => entry.bookId));
    console.log(
      `[coloring-pack-retention] ${snapshot.appVersion} (${snapshot.ref}): ${breaks.length}/${total} files unserved, ${blocked.size}/${snapshot.books.length} books blocked`
    );
  }
  if (problems.length > 0) fail(problems.map((problem) => `  ${problem}`).join('\n'));
}

if (isMain(import.meta.url)) runColoringPackRetentionCheck();
