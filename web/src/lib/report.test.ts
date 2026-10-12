// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { attachesDevice, parseReportKind, REPORT_KINDS } from './report';

describe('parseReportKind', () => {
  it.each(REPORT_KINDS.map(({ value }) => value))('reads the offered kind %s', (kind) => {
    expect(parseReportKind(kind)).toBe(kind);
  });

  it.each([
    ['an unknown kind', 'question'],
    ['a label instead of a value', "Something's broken"],
    ['a differently cased kind', 'Bug'],
    ['an absent field', null],
    ['a non-string', 1],
  ])('refuses %s', (_label, raw) => {
    expect(parseReportKind(raw)).toBeNull();
  });
});

describe('attachesDevice', () => {
  it('attaches device info to a bug report the parent opted into', () => {
    expect(attachesDevice('bug', true)).toBe(true);
  });

  it.each([
    ['a bug report without the opt-in', 'bug', false],
    ['a feature request with the opt-in', 'feature', true],
    ['a feature request without it', 'feature', false],
  ] as const)('attaches nothing to %s', (_label, kind, optedIn) => {
    expect(attachesDevice(kind, optedIn)).toBe(false);
  });
});
