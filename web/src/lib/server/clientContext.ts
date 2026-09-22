import { CLIENT_PLATFORM_HEADER, CLIENT_VERSION_HEADER } from '$lib/apiHeaders';

// Which build and platform an /api/* request came from, read off the headers
// every client attaches (apiClientHeaders in lib/api.ts). Both values are
// attacker-controlled strings, so they are validated to a closed shape before
// anything reads them: a version is the ADR-0030 form (a store semver, or the
// per-commit web form with its optional +sha fallback), a platform is one of
// the three deployment targets, and anything else reads as absent — which is
// also what every client shipped before these headers existed sends.
export type ClientPlatform = 'android' | 'ios' | 'web';

export interface ClientContext {
  version: string | null;
  platform: ClientPlatform | null;
}

const CLIENT_PLATFORMS: readonly ClientPlatform[] = ['android', 'ios', 'web'];
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:\+[0-9a-f]{7,40})?$/;

export function readClientContext(request: Request): ClientContext {
  const version = request.headers.get(CLIENT_VERSION_HEADER) ?? '';
  const platform = request.headers.get(CLIENT_PLATFORM_HEADER) ?? '';
  return {
    version: VERSION_PATTERN.test(version) ? version : null,
    platform: CLIENT_PLATFORMS.includes(platform as ClientPlatform)
      ? (platform as ClientPlatform)
      : null,
  };
}

/** One token for a log line: `ios/1.6.0`, `web/1.6.12`, or `unidentified`. */
export function describeClient(context: ClientContext): string {
  if (!context.platform && !context.version) return 'unidentified';
  return `${context.platform ?? '?'}/${context.version ?? '?'}`;
}
