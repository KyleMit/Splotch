// @vitest-environment node
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { BETA_PLATFORM_BOOT_SCRIPT } from './src/lib/components/beta/betaPlatform';
import { SECURITY_HEADERS } from './src/lib/server/securityHeaders';
import {
  type ContentSecurityPolicyDirectives,
  APP_TEMPLATE_SCRIPT_HASH,
  BETA_PLATFORM_SCRIPT_HASH,
  nativeCspDirectives,
  nativeMetaCspDirectives,
  NATIVE_API_ORIGIN,
  RESPONSE_CSP_DIRECTIVES,
  serializeCspDirectives,
  SVELTEKIT_META_UNSUPPORTED_DIRECTIVES,
  WEB_CSP_DIRECTIVES,
} from './securityPolicy.ts';

describe('shared content security policy', () => {
  it('serializes only the meta-unsupported directives into the platform header', () => {
    expect(SECURITY_HEADERS['Content-Security-Policy']).toBe(
      serializeCspDirectives(RESPONSE_CSP_DIRECTIVES)
    );
    expect(RESPONSE_CSP_DIRECTIVES).toEqual(
      Object.fromEntries(
        Object.entries(WEB_CSP_DIRECTIVES).filter(([directive]) =>
          [...SVELTEKIT_META_UNSUPPORTED_DIRECTIVES].some(
            (metaDirective) => metaDirective === directive
          )
        )
      )
    );
    expect([...SVELTEKIT_META_UNSUPPORTED_DIRECTIVES]).toEqual([
      'frame-ancestors',
      'report-uri',
      'sandbox',
    ]);
    expect(RESPONSE_CSP_DIRECTIVES).not.toHaveProperty('default-src');
    expect(RESPONSE_CSP_DIRECTIVES).not.toHaveProperty('script-src');
  });

  it('widens native connect-src and omits reporting that a static WebView cannot configure', () => {
    const native: ContentSecurityPolicyDirectives = nativeCspDirectives();
    expect(native['connect-src']).toEqual([
      ...WEB_CSP_DIRECTIVES['connect-src'],
      NATIVE_API_ORIGIN,
    ]);
    expect(native).not.toHaveProperty('report-to');
    expect({
      ...native,
      'connect-src': WEB_CSP_DIRECTIVES['connect-src'],
      'report-to': WEB_CSP_DIRECTIVES['report-to'],
    }).toEqual(WEB_CSP_DIRECTIVES);
  });

  it('guards the beta pre-paint script hash against exact-content drift', () => {
    const hash = `sha256-${createHash('sha256').update(BETA_PLATFORM_BOOT_SCRIPT).digest('base64')}`;
    expect(BETA_PLATFORM_SCRIPT_HASH).toBe(hash);
    expect(WEB_CSP_DIRECTIVES['script-src']).toContain(hash);
  });

  it('models every directive omitted from the native meta policy', () => {
    const meta = nativeMetaCspDirectives();
    expect(meta).not.toHaveProperty('frame-ancestors');
    expect(meta).not.toHaveProperty('report-uri');
    expect(meta).not.toHaveProperty('report-to');
  });

  it("quotes SvelteKit's complete fixed source vocabulary", () => {
    expect(serializeCspDirectives({ 'script-src': ['script'] })).toBe("script-src 'script'");
    expect(serializeCspDirectives({ 'script-src': [APP_TEMPLATE_SCRIPT_HASH] })).toBe(
      `script-src '${APP_TEMPLATE_SCRIPT_HASH}'`
    );
  });

  it('keeps the canonical policy immutable', () => {
    expect(Object.isFrozen(WEB_CSP_DIRECTIVES)).toBe(true);
    for (const sources of Object.values(WEB_CSP_DIRECTIVES)) {
      expect(Object.isFrozen(sources)).toBe(true);
    }
  });
});
