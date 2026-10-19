import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const { startupResources } = await import(
  join(REPO, 'tools/migration/check-native-web-startup.mjs')
);
for (const dir of process.argv.slice(2)) {
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const { files, inlineScriptBytes, inlineStyleBytes } = startupResources(html);
  let raw = inlineScriptBytes + inlineStyleBytes,
    br = 0;
  for (const f of files) {
    const b = readFileSync(join(dir, f));
    raw += b.length;
    br += brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  }
  console.log(
    dir.split('/').pop(),
    'startup bytes',
    raw,
    'brotli',
    br,
    'files',
    files.length,
    'html',
    html.length,
    'hydrateFlag',
    html.includes('__EXPO_ROUTER_HYDRATE__')
  );
}
