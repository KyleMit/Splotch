import { describe, expect, it } from 'vitest';
import { BROWSER_TARGETS } from '../../web/browserTargets.ts';
import {
  baselineWidelyAvailableFloor,
  classifyProbes,
  compareVersions,
  featureStatus,
  floorQuery,
  guardInventory,
  parseBrowserTarget,
  probeSites,
  probesInLine,
  registerSection,
  usageReport,
} from '../report-browser-floor.mjs';

describe('floor parsing', () => {
  it('splits a target into engine and version', () => {
    expect(parseBrowserTarget('safari16.4')).toEqual({ engine: 'safari', version: '16.4' });
  });

  it('rejects an engine the report cannot map to usage data', () => {
    expect(() => parseBrowserTarget('opera97')).toThrow('Unrecognized browser target');
  });

  it('applies each engine floor to its desktop and mobile browserslist agents', () => {
    expect(floorQuery(['chrome111', 'ios16.4'])).toBe(
      'chrome >= 111, and_chr >= 111, ios_saf >= 16.4'
    );
  });

  it('parses every declared floor target', () => {
    expect(() => BROWSER_TARGETS.map(parseBrowserTarget)).not.toThrow();
  });

  it('compares dotted versions numerically', () => {
    expect(compareVersions('16.4', '16.10')).toBeLessThan(0);
    expect(compareVersions('17', '17.0')).toBe(0);
  });

  it('reads the oldest desktop version per engine out of a browserslist resolution', () => {
    const resolved = [
      'chrome 130',
      'chrome 123',
      'and_chr 140',
      'safari 17.4',
      'ios_saf 17.4-17.7',
    ];
    expect(baselineWidelyAvailableFloor(resolved)).toEqual({
      chrome: '123',
      safari: '17.4',
      ios: '17.4',
    });
  });
});

describe('probe detection', () => {
  it.each([
    ["if (typeof AudioContext === 'undefined') return null;", ['AudioContext']],
    [
      "if (typeof screenOrientation?.addEventListener === 'function')",
      ['screenOrientation.addEventListener'],
    ],
    ["if ('wakeLock' in navigator) {", ['navigator.wakeLock']],
    ['const angle = window.screen?.orientation?.angle;', ['window.screen.orientation']],
    ['const coalesced = e.getCoalescedEvents?.() ?? [];', ['e.getCoalescedEvents()']],
  ])('finds the platform probe in %s', (line, probes) => {
    expect(probesInLine(line)).toEqual(probes);
  });

  it.each([
    ["const base = typeof __NATIVE_API_BASE__ !== 'undefined' ? __NATIVE_API_BASE__ : '';"],
    ["const activate = () => (typeof current === 'function' ? current() : current.activate());"],
    ['const id = document.activeElement?.id;'],
    ['callbacks.onStrokeEnd?.();'],
    ["if (typeof body !== 'object' || body === null) return null;"],
  ])('ignores the non-probe %s', (line) => {
    expect(probesInLine(line)).toEqual([]);
  });

  it('classifies a probe of SSR or test-environment globals as environment', () => {
    expect(classifyProbes(['document'])).toBe('environment');
    expect(classifyProbes(['window.matchMedia()'])).toBe('environment');
  });

  it('classifies a probe naming any platform feature as feature', () => {
    expect(classifyProbes(['Worker', 'OffscreenCanvas'])).toBe('feature');
  });

  it('skips probes that only appear in comments', () => {
    const source = "// typeof OffscreenCanvas !== 'undefined'\nconst x = 1;";
    expect(probeSites('lib/example.ts', source, '')).toEqual([]);
  });

  it('reports whether the register cites the probing file', () => {
    const source = "if (typeof OffscreenCanvas !== 'undefined') run();";
    const [site] = probeSites('lib/a.ts', source, '| x | `lib/a.ts` → `run` |');
    expect(site).toMatchObject({ line: 1, kind: 'feature', registered: true });
  });
});

describe('register section', () => {
  it('stops at the next second-level heading', () => {
    const doc = '# T\n## API risk register\nrow\n## Polyfills\nlater';
    expect(registerSection(doc)).toBe('## API risk register\nrow');
  });
});

describe('web-features lookups', () => {
  it('marks a long-baseline feature within the floor', () => {
    expect(featureStatus('font-loading').aboveFloor).toEqual([]);
  });

  it('names each engine that has never shipped a feature', () => {
    expect(featureStatus('requestidlecallback').aboveFloor).toContain('safari never');
  });

  it('flags an unknown id instead of throwing', () => {
    expect(featureStatus('not-a-feature')).toEqual({
      id: 'not-a-feature',
      missing: true,
      suggestions: [],
    });
  });

  it('suggests the feature whose compat keys name an interface', () => {
    expect(featureStatus('DOMMatrix').suggestions).toContain('dom-geometry');
  });
});

describe('live repository', () => {
  it('computes floor coverage from the installed usage data', () => {
    const report = usageReport();
    expect(report.current).toBeGreaterThan(0);
    expect(report.current).toBeLessThanOrEqual(100);
  });

  it('finds feature probes in shipped web/src and none from tests or server code', () => {
    const sites = guardInventory();
    expect(sites.some((site) => site.kind === 'feature')).toBe(true);
    expect(sites.some((site) => /\.test\.ts$|^lib\/server\//.test(site.file))).toBe(false);
  });
});
