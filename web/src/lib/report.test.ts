// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseReportKind, REPORT_KINDS } from './report';

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
