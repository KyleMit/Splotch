import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const temporary = mkdtempSync(join(tmpdir(), 'rn-slider-control-'));
const config = join(temporary, 'vitest.config.mjs');
const original = resolve('tools/migration/rsd-drawing-vitest.config.mjs');
writeFileSync(
  config,
  `import base from ${JSON.stringify(original)};
export default {...base, plugins:[...(base.plugins ?? []), {
name:'deliberate-slider-contact-break', enforce:'pre',
transform(code,id) {
if (!id.endsWith('/rsdDrawing/RsdSlider.tsx')) return;
const before='if (String(point.identifier) === touch) return point.pageX;';
if (!code.includes(before)) throw new Error('Negative-control seam changed');
return {code:code.replace(before,'return point.pageX;'),map:null};
}}]};\n`
);
try {
  const result = spawnSync(
    resolve('node_modules/.bin/vitest'),
    [
      'run',
      '--config',
      config,
      'rsd-native-settings-sliders.test.mjs',
      '--maxWorkers=1',
      '--no-file-parallelism',
    ],
    { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 }
  );
  writeFileSync(
    'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence/android-run2-slider-contact-negative-control.log.txt',
    `${result.stdout ?? ''}\n${result.stderr ?? ''}\nexit=${result.status}\n`
  );
  if (result.status !== 1 || !result.stdout.includes('2 failed'))
    throw new Error(`Expected two regression failures; exit ${result.status}`);
  console.log(
    'Negative control rejected wrong-finger movement: two failures, exit 1. Product source untouched.'
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
