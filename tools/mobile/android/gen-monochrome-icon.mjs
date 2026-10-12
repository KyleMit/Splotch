import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain, ROOT } from '../../lib/proc.mjs';

const MONOCHROME_RESOURCE = 'ic_launcher_monochrome';
const MONOCHROME_LAYER = `    <monochrome android:drawable="@drawable/${MONOCHROME_RESOURCE}" />`;
const LAUNCHER_FILES = ['ic_launcher.xml', 'ic_launcher_round.xml'];

export function genAndroidMonochromeIcon(root) {
  const source = readFileSync(join(root, 'assets/icon-monochrome.xml'));
  const res = join(root, 'android/app/src/main/res');
  const launchers = LAUNCHER_FILES.map((name) => {
    const path = join(res, 'mipmap-anydpi-v26', name);
    const xml = readFileSync(path, 'utf8');
    if (xml.split('</adaptive-icon>').length !== 2) {
      throw new Error(`${path}: expected one adaptive icon`);
    }
    if (xml.includes('<monochrome')) {
      if (!xml.includes(MONOCHROME_LAYER) || xml.split('<monochrome').length !== 2) {
        throw new Error(`${path}: unexpected monochrome layer`);
      }
      return { path, xml };
    }
    return { path, xml: xml.replace('</adaptive-icon>', `${MONOCHROME_LAYER}\n</adaptive-icon>`) };
  });
  mkdirSync(join(res, 'drawable'), { recursive: true });
  writeFileSync(join(res, 'drawable', `${MONOCHROME_RESOURCE}.xml`), source);
  for (const { path, xml } of launchers) writeFileSync(path, xml);
}

if (isMain(import.meta.url)) genAndroidMonochromeIcon(ROOT);
