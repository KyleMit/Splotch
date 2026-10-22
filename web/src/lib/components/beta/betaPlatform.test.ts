// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
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
  it('reads the query key and falls back to the default the module declares', () => {
    expect(BETA_PLATFORM_BOOT_SCRIPT).toContain(`get('${BETA_PLATFORM_PARAM}')`);
    expect(BETA_PLATFORM_BOOT_SCRIPT).toContain(`'${DEFAULT_BETA_PLATFORM}'`);
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
  const netlifyToml = readFileSync(new URL('../../../../../netlify.toml', import.meta.url), 'utf8');

  const rules = [...netlifyToml.matchAll(/\[\[redirects\]\]\s+from = "([^"]+)"\s+to = "([^"]+)"/g)];

  const deprecated = BETA_PLATFORMS.map((platform) => `${platform}-beta`);

  it.each(deprecated)('/%s redirects at the edge to the tab the route redirects to', (route) => {
    const platform = route.replace('-beta', '');
    expect(isBetaPlatform(platform)).toBe(true);
    const rule = rules.find(([, from]) => from === `/${route}`);
    expect(rule, `netlify.toml redirects /${route}`).toBeDefined();
    expect(rule?.[2]).toBe(betaPathFor(platform as BetaPlatform));
  });
});
