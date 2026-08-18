const QUOTED_SOURCES = new Set([
  'self',
  'unsafe-eval',
  'unsafe-hashes',
  'unsafe-inline',
  'none',
  'strict-dynamic',
  'report-sample',
  'wasm-unsafe-eval',
]);

type ContentSecurityPolicyDirective =
  | 'default-src'
  | 'script-src'
  | 'style-src'
  | 'img-src'
  | 'font-src'
  | 'connect-src'
  | 'worker-src'
  | 'manifest-src'
  | 'base-uri'
  | 'form-action'
  | 'frame-ancestors'
  | 'object-src'
  | 'report-uri'
  | 'report-to';

export type ContentSecurityPolicyDirectives = Readonly<
  Partial<Record<ContentSecurityPolicyDirective, readonly string[]>>
>;

export const NATIVE_API_ORIGIN = 'https://splotch.art';

const META_UNSUPPORTED_DIRECTIVES = new Set<ContentSecurityPolicyDirective>([
  'frame-ancestors',
  'report-uri',
]);

export const WEB_CSP_DIRECTIVES = Object.freeze({
  'default-src': Object.freeze(['self']),
  'script-src': Object.freeze(['self', 'unsafe-inline']),
  'style-src': Object.freeze(['self', 'unsafe-inline']),
  'img-src': Object.freeze(['self', 'blob:', 'data:']),
  'font-src': Object.freeze(['self']),
  // blob: lets the app read its own drawing/result object URLs for picture reports.
  'connect-src': Object.freeze(['self', 'blob:']),
  'worker-src': Object.freeze(['self']),
  'manifest-src': Object.freeze(['self']),
  'base-uri': Object.freeze(['self']),
  'form-action': Object.freeze(['self']),
  'frame-ancestors': Object.freeze(['none']),
  'object-src': Object.freeze(['none']),
  'report-uri': Object.freeze(['/api/csp-report']),
  'report-to': Object.freeze(['csp']),
}) satisfies Required<ContentSecurityPolicyDirectives>;

export function nativeApiBaseFor(isCapacitor: boolean): string {
  return isCapacitor ? NATIVE_API_ORIGIN : '';
}

export function nativeCspDirectives(): ContentSecurityPolicyDirectives {
  return {
    ...WEB_CSP_DIRECTIVES,
    'connect-src': [...WEB_CSP_DIRECTIVES['connect-src'], NATIVE_API_ORIGIN],
  };
}

export function nativeMetaCspDirectives(): ContentSecurityPolicyDirectives {
  return Object.fromEntries(
    Object.entries(nativeCspDirectives()).filter(
      ([directive]) => !META_UNSUPPORTED_DIRECTIVES.has(directive as ContentSecurityPolicyDirective)
    )
  );
}

export function serializeCspDirectives(directives: ContentSecurityPolicyDirectives): string {
  return Object.entries(directives)
    .map(([directive, sources]) => {
      const serializedSources = sources.map((source) =>
        QUOTED_SOURCES.has(source) || /^(?:nonce|sha\d\d\d)-/.test(source) ? `'${source}'` : source
      );
      return [directive, ...serializedSources].join(' ');
    })
    .join('; ');
}
