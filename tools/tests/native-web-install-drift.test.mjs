import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  INSTALL_BANNER_COPY,
  INSTALL_GUIDE_COPY,
  installGuideSteps,
  iosBannerSteps,
} from '../../experiments/native-architecture/src/install/installCopy.ts';
import {
  APP_LIKE_DISPLAY_MODE_QUERIES,
  INSTALL_REPROMPT_SESSION_MILESTONES,
  SETTLED_IN_STROKES,
  STROKES_BEFORE_AUTO_CLEAR,
} from '../../experiments/native-architecture/src/install/installPolicy.ts';
import { PARTING_MESSAGE_MS } from '../../experiments/native-architecture/src/install/useInstallBanner.ts';

// The shipping banner and Settings guide author their steps as Svelte markup around
// inline icons, and their thresholds live in rune modules React Native cannot
// import, so both sides are read from source here.
const source = (path) =>
  readFileSync(new URL(`../../web/src/lib/${path}`, import.meta.url), 'utf8');
const SHARE_LOCATION = '{shareLocation}';

// What the markup reads as: tags, icons, comments and control blocks removed, the
// share-location expression kept as a placeholder, and whitespace collapsed.
function markupText(svelte) {
  const markup = svelte.slice(svelte.indexOf('</script>'), svelte.indexOf('<style>'));
  return markup
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<span class="step-number"[^>]*>\d<\/span>/g, ' ')
    .replace(/\{[#:/@][^}]*\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,])/g, '$1');
}

const banner = markupText(source('components/InstallBanner.svelte'));
const guide = markupText(source('components/settings/SetupInstructions.svelte'));
const bannerScript = source('components/InstallBanner.svelte');

it('keeps the banner button labels', () => {
  expect(bannerScript).toContain(
    `{showHint ? '${INSTALL_BANNER_COPY.hideHint}' : '${INSTALL_BANNER_COPY.showHint}'}`
  );
  expect(bannerScript).toMatch(
    new RegExp(
      `<Icon name="install-homescreen"[^>]*/>\\s*${INSTALL_BANNER_COPY.install}\\s*{:else}`
    )
  );
});

it('keeps the banner dismiss label', () => {
  expect(bannerScript).toContain(`aria-label="${INSTALL_BANNER_COPY.dismiss}"`);
});

it('keeps the banner parting message, hint sentences and Safari steps', () => {
  expect(banner).toContain(INSTALL_BANNER_COPY.parting);
  expect(banner).toContain(INSTALL_BANNER_COPY.androidHint);
  for (const step of iosBannerSteps(SHARE_LOCATION)) expect(banner).toContain(step);
});

it('keeps the Settings install guide', () => {
  for (const os of ['ios', 'android', 'desktop']) {
    for (const step of installGuideSteps(os, SHARE_LOCATION)) expect(guide).toContain(step);
    expect(source('components/settings/SetupInstructions.svelte')).toContain(
      `${os}: '${INSTALL_GUIDE_COPY.osLabel[os]}'`
    );
  }
  for (const copy of [
    INSTALL_GUIDE_COPY.title,
    INSTALL_GUIDE_COPY.oneTap,
    INSTALL_GUIDE_COPY.oneTapHint,
    INSTALL_GUIDE_COPY.openInSafari,
    INSTALL_GUIDE_COPY.desktopNote,
  ])
    expect(guide).toContain(copy);
});

it('detects a negative control: changed copy is not found in the shipping markup', () => {
  expect(banner).not.toContain(INSTALL_BANNER_COPY.androidHint.replace('three-dot', 'three dot'));
});

it('keeps the shipping thresholds and timings', () => {
  expect(source('state/canvas.svelte.ts')).toContain(
    `export const SETTLED_IN_STROKES = ${SETTLED_IN_STROKES};`
  );
  expect(source('state/install.svelte.ts')).toContain(
    `export const STROKES_BEFORE_AUTO_CLEAR = ${STROKES_BEFORE_AUTO_CLEAR};`
  );
  expect(source('state/sessionCounters.svelte.ts')).toContain(
    `export const INSTALL_REPROMPT_SESSION_MILESTONES = [${INSTALL_REPROMPT_SESSION_MILESTONES.join(', ')}] as const;`
  );
  expect(bannerScript).toContain(`const PARTING_MESSAGE_MS = ${PARTING_MESSAGE_MS};`);
});

it('treats the same display modes as an installed launch', () => {
  const platform = source('platform/index.ts');
  const fullscreen = /FULLSCREEN_DISPLAY_MODE_QUERY = '([^']+)'/.exec(
    source('breakpoints.ts') + platform
  )?.[1];
  const shipping = /APP_LIKE_DISPLAY_MODE_QUERIES = \[([^\]]+)\]/
    .exec(platform)[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry === 'FULLSCREEN_DISPLAY_MODE_QUERY' ? fullscreen : entry.slice(1, -1)));
  expect(shipping).toEqual([...APP_LIKE_DISPLAY_MODE_QUERIES]);
});
