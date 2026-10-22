import { SITE_ORIGIN } from '../src/lib/siteUrl.ts';

const QUOTED_SOURCES = new Set([
  'self',
  'unsafe-eval',
  'unsafe-hashes',
  'unsafe-inline',
  'none',
  'strict-dynamic',
  'report-sample',
  'script',
  'wasm-unsafe-eval',
]);

const CRYPTO_SOURCE = /^(?:nonce|sha\d\d\d)-/;
const EXECUTABLE_SCRIPT_TYPE =
  /^(?:module|importmap|speculationrules|(?:text|application)\/(?:x-)?(?:java|ecma)script|text\/javascript1\.[0-5]|text\/(?:jscript|livescript))$/i;

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
  | 'report-to'
  | 'sandbox';

export type ContentSecurityPolicyDirectives = Readonly<
  Partial<Record<ContentSecurityPolicyDirective, readonly string[]>>
>;

export const NATIVE_API_ORIGIN = SITE_ORIGIN;

// The recorded API contract trusts these legacy native origins for multipart requests. Requests
// still authenticate independently; the API uses bearer credentials rather than cookies.
export const CSRF_TRUSTED_ORIGINS: readonly string[] = [
  'https://localhost',
  'capacitor://localhost',
];

// Legacy template hashes remain part of the recorded policy contract. The RN exporter hashes
// its own exact inline scripts; native-web-csp.test.mjs verifies the produced documents.
export const APP_TEMPLATE_SCRIPT_HASH = 'sha256-1pjHdfh26XA4hXd3HptBbskVTUHN00rhO0SeMv6OuEw=';

// /beta injects one other pre-paint script from BETA_PLATFORM_BOOT_SCRIPT.
// securityPolicy.test.ts guards this hash against that source constant.
export const BETA_PLATFORM_SCRIPT_HASH = 'sha256-WvgdDI1VX7Gk+PbiIGa5DjGz1ifTAj0qXp/mhUP/W54=';

// A static WebView cannot define the Reporting API group through a response header.
const NATIVE_UNSUPPORTED_DIRECTIVES = new Set<ContentSecurityPolicyDirective>(['report-to']);

export const SVELTEKIT_META_UNSUPPORTED_DIRECTIVES: ReadonlySet<ContentSecurityPolicyDirective> =
  new Set(['frame-ancestors', 'report-uri', 'sandbox']);

export const WEB_CSP_DIRECTIVES = Object.freeze({
  'default-src': Object.freeze(['self']),
  'script-src': Object.freeze(['self', APP_TEMPLATE_SCRIPT_HASH, BETA_PLATFORM_SCRIPT_HASH]),
  // The export emits inline component CSS and motion styles.
  'style-src': Object.freeze(['self', 'unsafe-inline']),
  // blob: covers generated previews; data: covers the in-memory placeholder image.
  'img-src': Object.freeze(['self', 'blob:', 'data:']),
  // Quicksand is shipped with the app rather than loaded from a font service.
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
}) satisfies ContentSecurityPolicyDirectives;

// Header-only directives compose with the prerendered document's hash-bearing meta policy.
// Omitting default-src and script-src prevents this subset from blocking scripts it authorizes.
export const RESPONSE_CSP_DIRECTIVES = Object.freeze(
  Object.fromEntries(
    Object.entries(WEB_CSP_DIRECTIVES).filter(([directive]) =>
      SVELTEKIT_META_UNSUPPORTED_DIRECTIVES.has(directive as ContentSecurityPolicyDirective)
    )
  )
) satisfies ContentSecurityPolicyDirectives;

export function nativeApiBaseFor(isCapacitor: boolean): string {
  return isCapacitor ? NATIVE_API_ORIGIN : '';
}

export function nativeCspDirectives(): ContentSecurityPolicyDirectives {
  return {
    ...Object.fromEntries(
      Object.entries(WEB_CSP_DIRECTIVES).filter(
        ([directive]) =>
          !NATIVE_UNSUPPORTED_DIRECTIVES.has(directive as ContentSecurityPolicyDirective)
      )
    ),
    'connect-src': [...WEB_CSP_DIRECTIVES['connect-src'], NATIVE_API_ORIGIN],
  };
}

export function nativeMetaCspDirectives(): ContentSecurityPolicyDirectives {
  return Object.fromEntries(
    Object.entries(nativeCspDirectives()).filter(
      ([directive]) =>
        !SVELTEKIT_META_UNSUPPORTED_DIRECTIVES.has(directive as ContentSecurityPolicyDirective)
    )
  );
}

// What a static web document's meta tag carries: the site's policy, less the directives a meta
// policy cannot hold, which netlify.toml's response policy delivers. Its connect-src is the page's
// own origin, whose host serves the /api function.
export function webMetaCspDirectives(): ContentSecurityPolicyDirectives {
  return Object.fromEntries(
    Object.entries(WEB_CSP_DIRECTIVES).filter(
      ([directive]) =>
        !SVELTEKIT_META_UNSUPPORTED_DIRECTIVES.has(directive as ContentSecurityPolicyDirective)
    )
  );
}

function scriptAttribute(attributes: string, name: 'src' | 'type'): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, 'i').exec(
    attributes
  );
  return match ? (match[1] ?? match[2]) : undefined;
}

export function inlineExecutableScriptBodies(html: string): string[] {
  // JSON and other script data blocks are not executable and need no script-src hash.
  return [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .filter((match) => scriptAttribute(match[1] ?? '', 'src') === undefined)
    .filter((match) => {
      const type = scriptAttribute(match[1] ?? '', 'type')?.trim();
      return type === undefined || type === '' || EXECUTABLE_SCRIPT_TYPE.test(type);
    })
    .map((match) => match[2])
    .filter(Boolean);
}

export function serializeCspDirectives(directives: ContentSecurityPolicyDirectives): string {
  return Object.entries(directives)
    .map(([directive, sources]) => {
      const serializedSources = sources.map((source) =>
        QUOTED_SOURCES.has(source) || CRYPTO_SOURCE.test(source) ? `'${source}'` : source
      );
      return [directive, ...serializedSources].join(' ');
    })
    .join('; ');
}
