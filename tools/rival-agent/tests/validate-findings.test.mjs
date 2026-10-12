import { describe, expect, it } from 'vitest';
import { parseFindings, readFindingsSchema, validateFindings } from '../validate-findings.mjs';

const VALID = {
  summary: 'Looked at everything.',
  findings: [
    {
      path: 'web/src/a.ts',
      line: 3,
      startLine: null,
      side: 'RIGHT',
      severity: 'blocking',
      body: 'It breaks.',
    },
  ],
  unverified: [{ claim: 'c', command: 'npm test', reason: 'declined' }],
};

describe('findings schema', () => {
  it('requires every property so both vendors can enforce it strictly', () => {
    const schema = readFindingsSchema();
    expect(schema.required).toEqual(Object.keys(schema.properties));
    const finding = schema.properties.findings.items;
    expect(finding.required).toEqual(Object.keys(finding.properties));
    expect(finding.additionalProperties).toBe(false);
  });

  it('accepts a complete document and an empty review', () => {
    expect(validateFindings(VALID)).toEqual({ ok: true, errors: [] });
    expect(validateFindings({ summary: 'nothing', findings: [], unverified: [] }).ok).toBe(true);
  });

  it('names each violation by path', () => {
    const { errors } = validateFindings({
      summary: '',
      findings: [{ ...VALID.findings[0], severity: 'critical', line: 0, extra: 1 }],
      unverified: [{ claim: 'c' }],
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        '$.summary: must not be empty',
        '$.findings[0].line: must be at least 1',
        expect.stringContaining('$.findings[0].severity: expected one of'),
        '$.findings[0].extra: unexpected',
        '$.unverified[0].command: required',
        '$.unverified[0].reason: required',
      ])
    );
  });

  it('rejects a wrong type and a missing top-level field', () => {
    expect(validateFindings({ summary: 'x', findings: 'none', unverified: [] }).errors).toEqual([
      '$.findings: expected array, got string',
    ]);
    expect(validateFindings({ summary: 'x', findings: [] }).errors).toEqual([
      '$.unverified: required',
    ]);
  });

  it('parses the final message and reports non-JSON as one error', () => {
    expect(parseFindings(JSON.stringify(VALID))).toMatchObject({ ok: true, findings: VALID });
    expect(parseFindings('Here is my review:')).toMatchObject({
      ok: false,
      errors: [expect.stringContaining('not JSON')],
    });
  });
});
