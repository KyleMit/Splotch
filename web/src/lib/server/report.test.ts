// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseDeviceField } from './report';

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
