// Fails when `---`/`+++` lines inside a hunk are read as file headers, which loses the anchors of
// the real file.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { parseDiffAnchors } = await import(
  pathToFileURL(join(process.cwd(), 'tools/rival-agent/post-review.mjs')).href
);
const patch = [
  'diff --git a/db/schema.sql b/db/schema.sql',
  'index 1111111..2222222 100644',
  '--- a/db/schema.sql',
  '+++ b/db/schema.sql',
  '@@ -1,3 +1,3 @@',
  ' create table t (',
  '--- legacy column',
  '+++ replacement column',
  ' );',
].join('\n');
const anchors = [...parseDiffAnchors(patch)].map(([path, sides]) => ({
  path,
  RIGHT: [...sides.RIGHT],
  LEFT: [...sides.LEFT],
}));
const expected = JSON.stringify([{ path: 'db/schema.sql', RIGHT: [1, 2, 3], LEFT: [1, 2, 3] }]);
if (JSON.stringify(anchors) !== expected) throw new Error(`anchors ${JSON.stringify(anchors)}`);
