// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BETA_PLATFORM_ATTRIBUTE,
  BETA_PLATFORM_BOOT_SCRIPT,
  BETA_PLATFORM_PARAM,
  betaPathFor,
  BETA_PLATFORMS,
  DEFAULT_BETA_PLATFORM,
  isBetaPlatform,
  resolveBetaPlatform,
  type BetaPlatform,
} from './betaPlatform';

// The device sniff itself is covered end to end (tests/beta.spec.ts drives the
// page under an iPad and an Android user agent); what needs pinning here is the
// precedence, because a link's `?os=` losing to the device would send a tester
// handed the iOS instructions to the Play Store ones.

describe('resolveBetaPlatform', () => {
  it('honours an explicit parameter over the detected device', () => {
    expect(resolveBetaPlatform('ios', 'android')).toBe('ios');
    expect(resolveBetaPlatform('android', 'ios')).toBe('android');
  });

  it('falls back to the detected device when no parameter is given', () => {
    expect(resolveBetaPlatform(null, 'ios')).toBe('ios');
  });

  it('falls back to the prerendered default on a desktop browser', () => {
    expect(resolveBetaPlatform(null, null)).toBe(DEFAULT_BETA_PLATFORM);
  });

  it('ignores a parameter naming no platform we have instructions for', () => {
    expect(resolveBetaPlatform('windows', 'ios')).toBe('ios');
    expect(resolveBetaPlatform('', null)).toBe(DEFAULT_BETA_PLATFORM);
  });
});

describe('isBetaPlatform', () => {
  it.each(['android', 'ios'])('accepts %s', (value) => {
    expect(isBetaPlatform(value)).toBe(true);
  });

  it.each(['Android', 'web', '', null])('rejects %s', (value) => {
    expect(isBetaPlatform(value)).toBe(false);
  });
});

describe('betaPathFor', () => {
  it('builds the deep link the deprecated solo routes redirect to', () => {
    expect(betaPathFor('ios')).toBe(`/beta?${BETA_PLATFORM_PARAM}=ios`);
    expect(new URL(betaPathFor('android'), 'https://splotch.art').pathname).toBe('/beta');
  });
});

// The <head> stamp is inline boot code, so it can import nothing: it restates
// the device sniff $lib/platform makes, and the page's CSS restates the
// attribute it writes. Both are the duplication a "keep in sync" comment would
// only describe — this reads every side and fails on divergence.
describe('the pre-hydration stamp', () => {
  const sourceFile = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const platformSource = sourceFile('../../platform/index.ts');
  const pageSource = sourceFile('../../../routes/beta/+page.svelte');

  it.each([
    ['iPad|iPhone|iPod', 'isIosDevice'],
    ["navigator.platform === 'MacIntel'", 'isIosDevice'],
    ['navigator.maxTouchPoints > 1', 'isIosDevice'],
    ['/android/i', 'isAndroidBrowser'],
  ])('makes the same %s test as $lib/platform', (needle) => {
    expect(platformSource, `$lib/platform still tests ${needle}`).toContain(needle);
    expect(BETA_PLATFORM_BOOT_SCRIPT.replace(/ /g, '')).toContain(needle.replace(/ /g, ''));
  });

  it('reads the query key and falls back to the default the module declares', () => {
    expect(BETA_PLATFORM_BOOT_SCRIPT).toContain(`get('${BETA_PLATFORM_PARAM}')`);
    expect(BETA_PLATFORM_BOOT_SCRIPT).toContain(`'${DEFAULT_BETA_PLATFORM}'`);
  });

  it('writes the attribute the page styles the panels off', () => {
    expect(BETA_PLATFORM_BOOT_SCRIPT).toContain(`setAttribute('${BETA_PLATFORM_ATTRIBUTE}'`);
    for (const platform of BETA_PLATFORMS) {
      expect(pageSource).toContain(`html[${BETA_PLATFORM_ATTRIBUTE}='${platform}']`);
      expect(pageSource).toContain(`data-platform='${platform}'`);
      expect(pageSource).toContain(`data-platform="${platform}"`);
    }
    expect(pageSource).toContain(`html[${BETA_PLATFORM_ATTRIBUTE}]`);
  });

  // Without JavaScript the panels are reached by anchor instead, so each one's
  // id, the link that points at it, and the rule that marks that link live are
  // three spellings of the same platform. A typo in any of them is a link that
  // scrolls nowhere, and nothing else would notice.
  it.each(BETA_PLATFORMS)('anchors the %s panel for the scripting-off jump list', (platform) => {
    expect(pageSource).toContain(`id="beta-${platform}"`);
    expect(pageSource).toContain(`href="#beta-${platform}"`);
    expect(pageSource).toContain(`#beta-${platform}:target`);
  });
});

// The deprecated /android-beta and /ios-beta paths are retired twice over: at
// the edge by netlify.toml (so a deploy answers them without invoking the SSR
// function) and in the route's own load (so dev, `vite preview`, and the E2E
// suite answer them at all). netlify.toml has to stay literal TOML for Netlify
// to read it at deploy time, so it cannot import betaPathFor — this is the
// drift guard.
describe('the deprecated solo paths', () => {
  // The unit runner (`node tools/run-web-tool.mjs vitest run`) runs with cwd = web/,
  // so the deploy config is one level up at the repo root.
  const netlifyToml = readFileSync(resolve(process.cwd(), '..', 'netlify.toml'), 'utf8');

  const rules = [...netlifyToml.matchAll(/\[\[redirects\]\]\s+from = "([^"]+)"\s+to = "([^"]+)"/g)];

  // Read off the route tree rather than listed here, so retiring another path
  // without an edge rule fails instead of quietly costing an invocation.
  const deprecated = readdirSync(resolve(process.cwd(), 'src', 'routes'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('-beta'))
    .map((entry) => entry.name);

  it('are the ones this module has tabs for', () => {
    expect(deprecated.map((route) => route.replace('-beta', '')).sort()).toEqual([
      ...BETA_PLATFORMS,
    ]);
  });

  it.each(deprecated)('/%s redirects at the edge to the tab the route redirects to', (route) => {
    const platform = route.replace('-beta', '');
    expect(isBetaPlatform(platform)).toBe(true);
    const rule = rules.find(([, from]) => from === `/${route}`);
    expect(rule, `netlify.toml redirects /${route}`).toBeDefined();
    expect(rule?.[2]).toBe(betaPathFor(platform as BetaPlatform));
  });
});
