import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { startupResources } from '../../../../tools/migration/check-native-web-startup.mjs';

const W = process.cwd();
const docs = [
  ['web/build', 'index.html'],
  ['web/build', 'privacy.html'],
  ['web/build', 'changelog.html'],
  ['web/build', 'beta.html'],
  ['experiments/native-architecture/dist/web', 'index.html'],
  ['experiments/native-architecture/dist/web', '404.html'],
];
const br = (b) => brotliCompressSync(b).length;
for (const [dir, file] of docs) {
  const html = readFileSync(join(W, dir, file));
  const r = startupResources(html.toString('utf8'));
  const size = (list) => list.reduce((t, f) => t + statSync(join(W, dir, f)).size, 0);
  const brSize = (list) => list.reduce((t, f) => t + br(readFileSync(join(W, dir, f))), 0);
  const blocking = r.paintFiles.filter((f) => f.endsWith('.css'));
  console.log(
    JSON.stringify({
      doc: `${dir}/${file}`,
      htmlBytes: html.length,
      htmlBrotli: br(html),
      inlineCss: r.inlineStyleBytes,
      inlineJs: r.inlineScriptBytes,
      firstPaintBytes: r.inlineStyleBytes + r.inlineScriptBytes + size(r.paintFiles),
      renderBlockingCssFiles: blocking.length,
      startupFiles: r.files.length,
      startupFileBytes: size(r.files),
      startupFileBrotli: brSize(r.files),
    })
  );
}
