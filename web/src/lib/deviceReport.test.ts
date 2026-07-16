import { describe, it, expect } from 'vitest';
import { describeDeviceInfo, sanitizeDeviceInfo } from './deviceReport';

describe('describeDeviceInfo', () => {
  it('emits present fields in the canonical order with their labels', () => {
    const rows = describeDeviceInfo({
      platform: 'iOS',
      app: '1.3.45',
      os: 'iOS 17.2',
    });
    // app is declared before platform before os, regardless of input order.
    expect(rows).toEqual([
      { label: 'App version', value: '1.3.45' },
      { label: 'Platform', value: 'iOS' },
      { label: 'Operating system', value: 'iOS 17.2' },
    ]);
  });

  it('drops blank and whitespace-only values', () => {
    const rows = describeDeviceInfo({ app: '1.0', platform: '', os: '   ' });
    expect(rows).toEqual([{ label: 'App version', value: '1.0' }]);
  });
});

describe('sanitizeDeviceInfo', () => {
  it('keeps only known keys and ignores extras', () => {
    const clean = sanitizeDeviceInfo({ app: '1.0', evil: 'rm -rf', platform: 'Web' });
    expect(clean).toEqual({ app: '1.0', platform: 'Web' });
    expect('evil' in clean).toBe(false);
  });

  it('coerces numbers/booleans and strips newlines and backticks', () => {
    const clean = sanitizeDeviceInfo({
      pixelRatio: 2,
      online: true,
      os: 'line1\nline2`inject`',
    });
    expect(clean.pixelRatio).toBe('2');
    expect(clean.online).toBe('true');
    expect(clean.os).toBe('line1 line2 inject');
  });

  it('caps overly long values', () => {
    const clean = sanitizeDeviceInfo({ browser: 'x'.repeat(500) });
    expect(clean.browser?.length).toBe(200);
  });

  it('returns an empty object for non-object input', () => {
    expect(sanitizeDeviceInfo(null)).toEqual({});
    expect(sanitizeDeviceInfo('nope')).toEqual({});
  });
});
