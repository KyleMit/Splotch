import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const originalUrl = new URL(
  '../../../../tools/device-parity/lib/crash-verdict.mjs',
  import.meta.url
);
const original = readFileSync(originalUrl, 'utf8');
const target = "`'${startStamp}'`";
assert.equal(original.split(target).length, 2, 'Repo verdict timestamp argument changed');
let source = original.replace(target, 'startStamp');
source = source.replace(
  /from (['"])(\.\.?\/[^'"]+)\1/g,
  (_, quote, path) => `from ${JSON.stringify(new URL(path, originalUrl).href)}`
);
const helper = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);
export const repoVerdictSourceSha256 = createHash('sha256').update(original).digest('hex');
export const androidNow = helper.androidNow;
export const androidPssMb = helper.androidPssMb;
export function androidVerdict(options) {
  assert.match(options.startStamp, /^\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  return helper.androidVerdict(options);
}
