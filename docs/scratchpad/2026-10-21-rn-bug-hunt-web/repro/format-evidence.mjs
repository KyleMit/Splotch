import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import * as prettier from 'prettier';
const out = resolve('docs/scratchpad/2026-10-21-rn-bug-hunt-web'),
  files = [];
function walk(path) {
  for (const e of readdirSync(path, { withFileTypes: true })) {
    const p = join(path, e.name);
    if (e.isDirectory()) walk(p);
    else if (['.mjs', '.json', '.html'].includes(extname(p))) files.push(p);
  }
}
walk(out);
files.push(resolve('tools/tests/native-paper-input-web.test.mjs'));
let changed = 0;
for (const path of files) {
  const info = await prettier.getFileInfo(path, { ignorePath: resolve('.prettierignore') });
  if (info.ignored) continue;
  const text = readFileSync(path, 'utf8'),
    formatted = await prettier.format(text, {
      ...(await prettier.resolveConfig(path)),
      filepath: path,
    });
  if (formatted !== text) {
    writeFileSync(path, formatted);
    changed++;
  }
}
console.log(JSON.stringify({ considered: files.length, formatted: changed }));
