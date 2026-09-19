import { describe, expect, it } from 'vitest';
import {
  authorityConfig,
  frontDecision,
  leafExtensions,
  leafValidityDays,
} from '../ios/secure-origin.mjs';

const noBuildFiles = () => false;

describe('frontDecision', () => {
  it.each([
    ['GET', '/'],
    ['HEAD', '/'],
    ['GET', '/_app/immutable/entry/start.abc.js'],
  ])('forwards %s %s', (method, pathname) => {
    expect(frontDecision({ method, pathname, isBuildFile: noBuildFiles })).toBe('allow');
  });

  it('forwards a file that exists in the served build', () => {
    expect(
      frontDecision({
        method: 'GET',
        pathname: '/favicon.ico',
        isBuildFile: (p) => p === '/favicon.ico',
      })
    ).toBe('allow');
  });

  it.each([
    '/api/generate-image',
    '/api',
    '/admin',
    '/admin/session',
    '/dev',
    '/dev/store-frames/identity',
    '/dev/store-frames/assets/file.png',
  ])('refuses the server-route prefix %s even when a build file matches it', (pathname) => {
    expect(frontDecision({ method: 'GET', pathname, isBuildFile: () => true })).toBe('deny:prefix');
  });

  it.each(['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])('refuses the %s method', (method) => {
    expect(frontDecision({ method, pathname: '/', isBuildFile: noBuildFiles })).toBe('deny:method');
  });

  it('refuses a path that is neither the page, an app chunk, nor a build file', () => {
    expect(frontDecision({ method: 'GET', pathname: '/coloring', isBuildFile: noBuildFiles })).toBe(
      'deny:not-in-build'
    );
  });

  it('refuses an /_app path that normalizes into a denied prefix', () => {
    expect(
      frontDecision({ method: 'GET', pathname: '/_app/../dev/x', isBuildFile: noBuildFiles })
    ).toBe('deny:prefix');
  });
});

describe('authorityConfig', () => {
  const config = authorityConfig({ host: 'rig-mac.local', ip: '192.168.1.20', label: 'test' });

  it('constrains the root to exactly the named host and one address', () => {
    expect(config).toContain(
      'nameConstraints=critical,permitted;DNS:rig-mac.local,permitted;IP:192.168.1.20/255.255.255.255'
    );
  });

  it('forbids intermediate authorities', () => {
    expect(config).toContain('basicConstraints=critical,CA:TRUE,pathlen:0');
  });

  it('omits the address constraint when no address is given', () => {
    expect(authorityConfig({ host: 'rig-mac.local', label: 'test' })).toContain(
      'nameConstraints=critical,permitted;DNS:rig-mac.local\n'
    );
  });

  it('rejects a host outside .local', () => {
    expect(() => authorityConfig({ host: 'example.com', label: 'test' })).toThrow(/\.local/);
  });
});

describe('leafExtensions', () => {
  it('names the constrained host and address as a server certificate', () => {
    const ext = leafExtensions(['DNS:rig-mac.local', 'IP:192.168.1.20']);
    expect(ext).toContain('subjectAltName=DNS:rig-mac.local,IP:192.168.1.20');
    expect(ext).toContain('extendedKeyUsage=serverAuth');
    expect(ext).toContain('basicConstraints=critical,CA:FALSE');
  });
});

describe('leafValidityDays', () => {
  it('stays inside the 825-day limit Apple applies to every TLS server certificate', () => {
    expect(leafValidityDays(3650)).toBe(825);
  });

  it('ends no later than its authority', () => {
    expect(leafValidityDays(730)).toBe(729);
  });
});
