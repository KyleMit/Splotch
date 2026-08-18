// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS } from './src/lib/server/securityHeaders';
import {
  type ContentSecurityPolicyDirectives,
  nativeApiBaseFor,
  nativeCspDirectives,
  nativeMetaCspDirectives,
  NATIVE_API_ORIGIN,
  serializeCspDirectives,
  WEB_CSP_DIRECTIVES,
} from './securityPolicy.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('shared content security policy', () => {
  it('serializes the canonical directives into the unchanged web header', () => {
    expect(SECURITY_HEADERS['Content-Security-Policy']).toBe(
      serializeCspDirectives(WEB_CSP_DIRECTIVES)
    );
  });

  it('changes only native connect-src and allows exactly self, blob URLs, and the API', () => {
    const native: ContentSecurityPolicyDirectives = nativeCspDirectives();
    expect(native['connect-src']).toEqual([
      ...WEB_CSP_DIRECTIVES['connect-src'],
      NATIVE_API_ORIGIN,
    ]);
    expect({ ...native, 'connect-src': WEB_CSP_DIRECTIVES['connect-src'] }).toEqual(
      WEB_CSP_DIRECTIVES
    );
  });

  it('uses the same hosted origin for the native API define and CSP', () => {
    expect(nativeApiBaseFor(true)).toBe(NATIVE_API_ORIGIN);
    expect(nativeApiBaseFor(false)).toBe('');
    expect(read('./vite.config.ts')).toContain('nativeApiBaseFor(isCapacitor)');
    expect(read('./svelte.config.js')).toContain('directives: nativeCspDirectives()');
  });

  it('models the directives SvelteKit cannot deliver through a meta policy', () => {
    const meta = nativeMetaCspDirectives();
    expect(meta).not.toHaveProperty('frame-ancestors');
    expect(meta).not.toHaveProperty('report-uri');
    expect(meta['report-to']).toEqual(WEB_CSP_DIRECTIVES['report-to']);
  });

  it('keeps the canonical policy immutable', () => {
    expect(Object.isFrozen(WEB_CSP_DIRECTIVES)).toBe(true);
    for (const sources of Object.values(WEB_CSP_DIRECTIVES)) {
      expect(Object.isFrozen(sources)).toBe(true);
    }
  });
});
