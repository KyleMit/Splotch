// Fails when readReviews parses `--paginate` output without `--slurp`: two pages arrive as two
// concatenated JSON arrays, which is not JSON.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { readReviews } = await import(
  pathToFileURL(join(process.cwd(), 'tools/rival-agent/post-review.mjs')).href
);
const gh = (args) =>
  args.includes('--slurp')
    ? JSON.stringify([[{ id: 1 }], [{ id: 2 }]])
    : `${JSON.stringify([{ id: 1 }])}\n${JSON.stringify([{ id: 2 }])}\n`;
const reviews = readReviews(7, gh);
if (reviews.length !== 2) throw new Error(`expected both pages, got ${JSON.stringify(reviews)}`);
