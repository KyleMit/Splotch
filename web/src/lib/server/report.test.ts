// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDeviceField, submitReport } from './report';
import type { CreateIssueInput } from './github';

const createIssue = vi.fn(async (_input: CreateIssueInput) => ({
  url: 'https://example.test/issues/1',
  number: 1,
}));
vi.mock('./github', async (original) => ({
  ...(await original<typeof import('./github')>()),
  isReportingConfigured: () => true,
  createIssue: (input: CreateIssueInput) => createIssue(input),
}));

// The one piece of the feedback core that only the form action reaches: a form
// post carries the device snapshot as a JSON string typed by nobody, so this is
// where hostile or absent input has to stop being a crash risk.
describe('parseDeviceField', () => {
  it('reads a device snapshot out of the form field', () => {
    expect(parseDeviceField('{"platform":"Web","app":"1.2.3"}')).toEqual({
      platform: 'Web',
      app: '1.2.3',
    });
  });

  it.each([
    ['absent', null],
    ['not a string', 42],
    ['empty', ''],
    ['whitespace', '   '],
    ['malformed JSON', '{"platform":'],
    ['a bare literal', 'undefined'],
  ])('treats %s as no device info', (_label, raw) => {
    expect(parseDeviceField(raw)).toBeNull();
  });

  it('does not pollute Object.prototype through a __proto__ key', () => {
    // JSON.parse creates an own data property rather than walking the
    // prototype, but the guarantee is worth pinning: the parsed value is fed
    // straight to sanitizeDeviceInfo, which reads arbitrary keys off it.
    parseDeviceField('{"__proto__":{"polluted":"yes"}}');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  // Shapes sanitizeDeviceInfo rejects downstream; what matters here is that
  // parsing them returns rather than throwing.
  it.each([
    ['an array', '[1,2,3]'],
    ['a JSON null', 'null'],
    ['a deeply nested object', `${'{"a":'.repeat(200)}1${'}'.repeat(200)}`],
  ])('parses %s without throwing', (_label, raw) => {
    expect(() => parseDeviceField(raw)).not.toThrow();
  });
});

// The one behaviour in submitReport that did NOT move verbatim out of
// /api/report, and so is the only part the API smoke test can't cover. It is
// also the fix for a report-losing bug: a form post with no JavaScript can
// carry the device opt-in but no snapshot, and an explicit request must not
// disappear without a word.
describe('submitReport and the device opt-in', () => {
  beforeEach(() => createIssue.mockClear());

  function issueBody(): string {
    return createIssue.mock.calls[0][0].body;
  }

  const NOTE = 'asked to attach device info';
  const base = { kind: 'bug', message: 'The crayon draws green', hp: '' };

  it('says so in the issue when the opt-in arrived with no snapshot', async () => {
    const result = await submitReport({ ...base, device: null, wantsDevice: true });

    expect(result.ok).toBe(true);
    expect(issueBody()).toContain(NOTE);
  });

  it('stays quiet when the snapshot actually arrived', async () => {
    const result = await submitReport({
      ...base,
      device: { platform: 'Web', app: '1.2.3' },
      wantsDevice: true,
    });

    expect(result.ok).toBe(true);
    expect(issueBody()).not.toContain(NOTE);
    expect(issueBody()).toContain('**Platform:** Web');
  });

  it('stays quiet when device info was never asked for', async () => {
    await submitReport({ ...base, device: null, wantsDevice: false });

    expect(issueBody()).not.toContain(NOTE);
  });

  // A snapshot whose every key is unknown sanitizes to nothing, which is
  // indistinguishable from "couldn't collect it" — and the opt-in still stands.
  it('treats a snapshot that sanitizes away as no snapshot at all', async () => {
    await submitReport({ ...base, device: { nope: 'x' }, wantsDevice: true });

    expect(issueBody()).toContain(NOTE);
  });
});
