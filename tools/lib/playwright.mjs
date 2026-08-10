import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Cloud sessions cache Chromium under PLAYWRIGHT_BROWSERS_PATH, but the pinned
// revision can drift from what playwright-core resolves (e.g. the env installed
// 1223 while this Playwright wants 1228), so `chromium.launch()` fails with
// "Executable doesn't exist". Mirror the self-heal in web/playwright.config.ts:
// if the resolved binary is missing, fall back to any Chromium under the
// browsers path. `PLAYWRIGHT_CHROMIUM` (or its alias `PLAYWRIGHT_CHROMIUM_PATH`)
// overrides; returning undefined lets Playwright use its own (correct) binary.
// Pass the `chromium` browser type in so this module doesn't import
// @playwright/test for scripts that never use it.
export function chromiumExecutablePath(chromium) {
  if (process.env.PLAYWRIGHT_CHROMIUM || process.env.PLAYWRIGHT_CHROMIUM_PATH)
    return process.env.PLAYWRIGHT_CHROMIUM || process.env.PLAYWRIGHT_CHROMIUM_PATH;
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {}
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const chromiumPrefix = 'chromium-';
  try {
    const builds = readdirSync(base)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort(
        (a, b) => Number(b.slice(chromiumPrefix.length)) - Number(a.slice(chromiumPrefix.length))
      );
    for (const build of builds) {
      for (const sub of ['chrome-linux', 'chrome-linux64']) {
        const p = join(base, build, sub, 'chrome');
        if (existsSync(p)) return p;
      }
    }
  } catch {}
  return undefined;
}
