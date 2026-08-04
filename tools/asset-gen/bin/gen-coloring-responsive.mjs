import { BOOKS, responsiveColoringAssets } from '../../../web/src/lib/state/books.ts';
import { fail } from '../lib/cli.mjs';
import { WEB_STATIC } from '../lib/paths.mjs';
import { generateResponsiveColoringAssets } from '../lib/responsive-coloring.mjs';

const filters = process.argv.slice(2);
const unknown = filters.filter((filter) => !BOOKS.some((book) => book.id === filter));
if (unknown.length > 0) fail(`Unknown coloring book(s): ${unknown.join(', ')}`);

const books = filters.length > 0 ? BOOKS.filter((book) => filters.includes(book.id)) : BOOKS;
const assets = books.flatMap(responsiveColoringAssets);
const { count, sourceBytes, outputBytes } = await generateResponsiveColoringAssets(
  WEB_STATIC,
  assets
);
const savedBytes = sourceBytes - outputBytes;

console.log(
  `[gen:coloring-responsive] wrote ${count} image(s) across ${books.length} book(s), ` +
    `${(outputBytes / 1048576).toFixed(2)} MB total; saved ` +
    `${(savedBytes / 1048576).toFixed(2)} MB (${((savedBytes / sourceBytes) * 100).toFixed(1)}%).`
);
