// The headless-browser alternative to the Node render (react-snap style): load the real export in
// Chromium at each first-frame viewport and theme, let the client render and settle, and save the
// root's DOM and React Native Web's runtime sheet. The snapshots replace the Node-rendered templates
// in a copy of the export, so both mechanisms run through the same shell, boot script and checks.
// node snapshot-prerender.mjs <origin of the served export> <exportDir> <outDir>
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const require = createRequire(join(REPO, 'package.json'));
const { chromium } = require('playwright');
const { FIRST_FRAME_THEMES, FIRST_FRAME_VIEWPORTS, criticalSheetText, variantKey } = await import(
  join(REPO, 'tools/migration/prerender-native-web.mjs')
);
const [origin, exportDir, outDir] = process.argv.slice(2);
// How long the fresh client render gets to settle (settings, measurement, fonts) before the DOM is
// saved. A snapshot takes whatever the page shows at that moment.
const SETTLE_MS = 3000;
const notFoundShell = readFileSync(join(exportDir, '404.html'), 'utf8');

async function snapshot(viewport, theme) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.scale,
    colorScheme: theme,
    isMobile: Math.min(viewport.width, viewport.height) < 600,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.route(`${origin}/`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: notFoundShell })
  );
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SETTLE_MS);
  const result = await page.evaluate(() => ({
    html: document.getElementById('root').innerHTML,
    // React Native Web inserts its rules through the CSSOM, which the element's text never shows.
    sheet: [...(document.getElementById('react-native-stylesheet')?.sheet?.cssRules ?? [])]
      .map((rule) => rule.cssText)
      .join('\n'),
  }));
  await browser.close();
  return result;
}

const started = Date.now();
const snapshots = [];
for (const viewport of FIRST_FRAME_VIEWPORTS)
  for (const theme of FIRST_FRAME_THEMES)
    snapshots.push({ key: variantKey(viewport, theme), ...(await snapshot(viewport, theme)) });
const elapsedMs = Date.now() - started;

cpSync(exportDir, outDir, { recursive: true });
let shell = readFileSync(join(outDir, 'index.html'), 'utf8');
for (const { key, html } of snapshots) {
  const template = new RegExp(`(<template id="first-frame-${key}"[^>]*>)[\\s\\S]*?(</template>)`);
  if (!template.test(shell)) throw new Error(`The export has no template for ${key}`);
  shell = shell.replace(template, (_, open, close) => `${open}${html}${close}`);
}
const markup = snapshots.map(({ html }) => html).join('');
shell = shell.replace(
  /<style id="react-native-stylesheet">[\s\S]*?<\/style>/,
  `<style id="react-native-stylesheet">${criticalSheetText(snapshots[0].sheet, markup)}</style>`
);
writeFileSync(join(outDir, 'index.html'), shell);
console.log(
  JSON.stringify({ variants: snapshots.length, elapsedMs, shellBytes: Buffer.byteLength(shell) })
);
