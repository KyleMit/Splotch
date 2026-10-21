import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseAppleSize,
  parseBundletoolSizeCsv,
  parseThinningReport,
  renderMarkdown,
  selectThinningVariant,
  thinnedVariantRange,
} from '../lib/app-size.mjs';
import {
  ANDROID_REFERENCE_SPEC,
  IOS_REFERENCE_DEVICE,
  parseAppSizeArgs,
} from '../report-app-size.mjs';

const BUNDLETOOL_TOTAL = 'MIN,MAX\n5493128,6232909\n';
const BUNDLETOOL_BY_DENSITY = `INFO: The APKs will be signed with the debug keystore.
ABI,SCREEN_DENSITY,MIN,MAX
,XXXHDPI,6226673,6232909
,LDPI,5493128,5499364
`;

const THINNING_REPORT = `
App Thinning Size Report for All Variants of App

Variant: App-0A1B2C.ipa
Supported variant descriptors: [device: iPad13,8, os-version: 16.4], [device: iPad13,9, os-version: 16.4], and [device: iPad13,8, os-version: 17.0]
App + On Demand Resources size: 7.4 MB compressed, 20.2 MB uncompressed
App size: 7.4 MB compressed, 20.2 MB uncompressed
On Demand Resources size: Zero KB compressed, Zero KB uncompressed


Variant: App-3D4E5F.ipa
Supported variant descriptors: [device: iPhone17,5, os-version: 16.4], and [device: iPad13,8, os-version: 26.0]
App + On Demand Resources size: 6.9 MB compressed, 19.1 MB uncompressed
App size: 6.9 MB compressed, 19.1 MB uncompressed
On Demand Resources size: Zero KB compressed, Zero KB uncompressed

Variant: App.ipa
Supported variant descriptors: Universal
App + On Demand Resources size: 9.8 MB compressed, 27 MB uncompressed
App size: 9.8 MB compressed, 27 MB uncompressed
On Demand Resources size: Zero KB compressed, Zero KB uncompressed
`;

describe('parseBundletoolSizeCsv', () => {
  it('reads the overall min and max', () => {
    expect(parseBundletoolSizeCsv(BUNDLETOOL_TOTAL)).toEqual([
      { dimensions: {}, min: 5493128, max: 6232909 },
    ]);
  });

  it('skips log lines and keeps each dimension row', () => {
    const rows = parseBundletoolSizeCsv(BUNDLETOOL_BY_DENSITY);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      dimensions: { ABI: '', SCREEN_DENSITY: 'LDPI' },
      min: 5493128,
      max: 5499364,
    });
  });

  it('rejects output without the MIN,MAX header', () => {
    expect(() => parseBundletoolSizeCsv('5493128,6232909')).toThrow(/no MIN,MAX header/);
  });

  it('rejects a row that is not whole bytes', () => {
    expect(() => parseBundletoolSizeCsv('MIN,MAX\n5.5 MB,6 MB')).toThrow(/not whole bytes/);
  });
});

describe('parseAppleSize', () => {
  it.each([
    ['7.4 MB', 7_400_000],
    ['812 KB', 812_000],
    ['1.2 GB', 1_200_000_000],
    ['Zero KB', 0],
  ])('reads %s as decimal bytes', (text, bytes) => {
    expect(parseAppleSize(text)).toBe(bytes);
  });

  it('rejects an unknown unit', () => {
    expect(() => parseAppleSize('7.4 MiB')).toThrow(/Unrecognised size/);
  });
});

describe('thinning report', () => {
  const variants = parseThinningReport(THINNING_REPORT);

  it('reads every variant with its devices and app size', () => {
    expect(variants).toHaveLength(3);
    expect(variants[0]).toEqual({
      name: 'App-0A1B2C.ipa',
      universal: false,
      descriptors: [
        { device: 'iPad13,8', osVersion: '16.4' },
        { device: 'iPad13,9', osVersion: '16.4' },
        { device: 'iPad13,8', osVersion: '17.0' },
      ],
      compressed: 7_400_000,
      uncompressed: 20_200_000,
    });
    expect(variants[2]).toMatchObject({
      universal: true,
      descriptors: [],
      uncompressed: 27_000_000,
    });
  });

  it('selects the variant that lists the device model', () => {
    expect(selectThinningVariant(variants, 'iPhone17,5').name).toBe('App-3D4E5F.ipa');
  });

  it('selects the newest-OS variant when a model appears in several', () => {
    expect(selectThinningVariant(variants, 'iPad13,8').name).toBe('App-3D4E5F.ipa');
  });

  it('names the covered models when the device is missing', () => {
    expect(() => selectThinningVariant(variants, 'iPad99,1')).toThrow(
      /iPad13,8, iPad13,9, iPhone17,5/
    );
  });

  it('ranges over thinned variants and leaves out the universal fallback', () => {
    expect(thinnedVariantRange(variants)).toEqual({
      download: { min: 6_900_000, max: 7_400_000 },
      install: { min: 19_100_000, max: 20_200_000 },
    });
  });

  it('rejects a report with no variants', () => {
    expect(() => parseThinningReport('App Thinning Size Report')).toThrow(/no variants/);
  });
});

describe('renderMarkdown', () => {
  const result = (app, download, install) => ({
    platform: 'android',
    app,
    artifact: `${app}.aab`,
    method: 'bundletool (Play split delivery)',
    device: 'API 36, arm64-v8a, 480 dpi',
    download,
    install,
    notes: [],
  });

  it('prints a row per app and the RN-vs-shipping delta', () => {
    const markdown = renderMarkdown([
      result('shipping', 6_100_000, 7_000_000),
      result('rn', 18_300_000, 30_000_000),
    ]);
    expect(markdown).toContain(
      '| Android | Shipping | API 36, arm64-v8a, 480 dpi | 6.1 MB | 7.0 MB | — |'
    );
    expect(markdown).toContain(
      'Android, RN vs shipping: download +12.2 MB (+200%), install +23.0 MB (+329%)'
    );
  });

  it('prints no delta when only one app was measured', () => {
    expect(renderMarkdown([result('rn', 1, 1)])).not.toContain('RN vs shipping');
  });
});

describe('parseAppSizeArgs', () => {
  const artifact = join(mkdtempSync(join(tmpdir(), 'app-size-test-')), 'app.aab');
  writeFileSync(artifact, '');

  it('defaults to the reference devices', () => {
    expect(parseAppSizeArgs([`--android-rn=${artifact}`])).toMatchObject({
      inputs: [{ platform: 'android', app: 'rn', path: artifact }],
      androidDeviceSpec: ANDROID_REFERENCE_SPEC,
      iosDevice: IOS_REFERENCE_DEVICE,
    });
  });

  it('requires at least one artifact', () => {
    expect(() => parseAppSizeArgs([])).toThrow(/at least one/);
  });

  it('rejects a missing artifact by flag', () => {
    expect(() => parseAppSizeArgs(['--ios-rn=/nonexistent.xcarchive'])).toThrow(
      /--ios-rn: .* does not exist/
    );
  });

  it('rejects an unknown flag', () => {
    expect(() => parseAppSizeArgs([`--android-rn=${artifact}`, '--androd-device=x'])).toThrow(
      /Unknown option/
    );
  });
});
