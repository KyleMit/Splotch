import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authorityConfig,
  CONSTRAINT_PROBE_LOG,
  CONSTRAINT_PROVEN_IPADOS,
  constraintProbeFollowUp,
  constraintProbeVerdict,
  constraintProofProblem,
  createFrontHandler,
  frontDecision,
  leafExtensions,
  leafValidityDays,
  parseConstraintProbeLog,
  recordConstraintProbe,
  secureOriginProblems,
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

describe('frontDecision on encoded paths', () => {
  it.each([
    '/_app/..%2fdev/store-frames/identity',
    '/_app/..%2Fdev/store-frames/identity',
    '/_app/%2e%2e%2fdev/store-frames/identity',
    '/_app/..%5cdev/store-frames/identity',
    '/_app/..%252fdev/store-frames/identity',
  ])('refuses %s rather than forward a path the upstream may resolve differently', (pathname) => {
    expect(frontDecision({ method: 'GET', pathname, isBuildFile: noBuildFiles })).toBe(
      'deny:encoded'
    );
  });

  it.each(['/%FF', '/%c3', '/_app/%e2%82'])(
    'refuses the non-ASCII escape %s, which may not decode as UTF-8',
    (pathname) => {
      expect(frontDecision({ method: 'GET', pathname, isBuildFile: noBuildFiles })).toBe(
        'deny:encoded'
      );
    }
  );

  it('refuses a malformed escape instead of throwing', () => {
    expect(frontDecision({ method: 'GET', pathname: '/%zz', isBuildFile: noBuildFiles })).toBe(
      'deny:encoded'
    );
  });

  it('still forwards an app chunk whose name carries no encoded separator', () => {
    expect(
      frontDecision({
        method: 'GET',
        pathname: '/_app/immutable/chunks/a%20b.js',
        isBuildFile: noBuildFiles,
      })
    ).toBe('allow');
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

  it('excludes every IPv4 and IPv6 address when no address is given', () => {
    expect(authorityConfig({ host: 'rig-mac.local', label: 'test' })).toContain(
      'nameConstraints=critical,permitted;DNS:rig-mac.local,excluded;IP:0.0.0.0/0.0.0.0,excluded;IP:::/::\n'
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

describe('secureOriginProblems', () => {
  const safe = {
    ipadOs: CONSTRAINT_PROVEN_IPADOS,
    leafTrusted: true,
    probeRefused: true,
    pageStatus: 200,
    deniedStatus: 403,
  };

  it('clears a front on the proven iPadOS whose trust and routes behave', () => {
    expect(secureOriginProblems(safe)).toEqual([]);
  });

  it('refuses an iPad on a release where nobody has watched Safari refuse the probe', () => {
    const [problem] = secureOriginProblems({ ...safe, ipadOs: '27.0' });
    expect(problem).toContain(`proven only on ${CONSTRAINT_PROVEN_IPADOS}`);
  });

  it('refuses when the iPad version cannot be read', () => {
    expect(secureOriginProblems({ ...safe, ipadOs: null })).toHaveLength(1);
  });

  it('refuses a root that accepts the constraint probe', () => {
    const [problem] = secureOriginProblems({ ...safe, probeRefused: false });
    expect(problem).toContain('Do not capture');
  });

  it('blames route restriction only when the front answered', () => {
    const [refused] = secureOriginProblems({ ...safe, deniedStatus: 'ECONNREFUSED' });
    const [forwarded] = secureOriginProblems({ ...safe, deniedStatus: 200 });
    expect(refused).not.toContain('not restricting routes');
    expect(forwarded).toContain('not restricting routes');
  });

  it('refuses a front that forwards a denied route or fails TLS', () => {
    expect(
      secureOriginProblems({
        ...safe,
        pageStatus: 'DEPTH_ZERO_SELF_SIGNED_CERT',
        deniedStatus: 200,
      })
    ).toHaveLength(2);
  });
});

describe('the constraint-probe log', () => {
  it('holds CONSTRAINT_PROVEN_IPADOS to a committed refusal on that release', () => {
    const rows = parseConstraintProbeLog(readFileSync(CONSTRAINT_PROBE_LOG, 'utf8'));
    expect(constraintProofProblem(rows, CONSTRAINT_PROVEN_IPADOS)).toBeNull();
  });

  it('refuses a release with no refusal, and one a person saw accept the probe', () => {
    const refused = { ipadOs: '26.6', verdict: 'refused' };
    const accepted = { ipadOs: '26.6', verdict: 'accepted' };
    expect(constraintProofProblem([], '26.6')).toMatch(/no person has recorded/);
    expect(constraintProofProblem([refused], '26.6')).toBeNull();
    expect(constraintProofProblem([refused, accepted], '26.6')).toMatch(/ACCEPT/);
  });

  it('appends a pseudonymized, single-line row a later read returns', () => {
    const dir = mkdtempSync(join(tmpdir(), 'constraint-probe-'));
    const logPath = join(dir, 'operator', 'log.tsv');
    try {
      recordConstraintProbe(
        { udid: 'UDID-1', ipadOs: '26.6', verdict: 'refused', detail: 'leaf\tloaded\nfine' },
        { logPath }
      );
      const text = readFileSync(logPath, 'utf8');
      expect(text).not.toContain('UDID-1');
      const [row] = parseConstraintProbeLog(text);
      expect(row).toMatchObject({ ipadOs: '26.6', verdict: 'refused', detail: 'leaf loaded fine' });
      expect(row.device).toMatch(/^device-[0-9a-f]{12}$/);
      expect(() =>
        recordConstraintProbe({ udid: 'x', ipadOs: '26.6', verdict: 'maybe' }, { logPath })
      ).toThrow(/unknown/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records a refusal only once the leaf loads, and nothing for a probe that neither warned nor loaded', () => {
    expect(constraintProbeVerdict({ probeWarned: true, leafLoaded: true })).toBe('refused');
    expect(constraintProbeVerdict({ probeWarned: true, leafLoaded: false })).toBeNull();
    expect(constraintProbeVerdict({ probeWarned: false, probeLoaded: true })).toBe('accepted');
    expect(constraintProbeVerdict({ probeWarned: false, probeLoaded: false })).toBeNull();
  });

  it('names the exact raise after a refusal on a new release, and no raise otherwise', () => {
    expect(constraintProbeFollowUp({ ipadOs: '26.6', verdict: 'refused' })).toContain(
      `raise CONSTRAINT_PROVEN_IPADOS in tools/perf/ios/secure-origin.mjs from ${CONSTRAINT_PROVEN_IPADOS} to 26.6`
    );
    expect(constraintProbeFollowUp({ ipadOs: '26.6', verdict: 'accepted' })).toMatch(
      /leave CONSTRAINT_PROVEN_IPADOS/
    );
    expect(
      constraintProbeFollowUp({ ipadOs: CONSTRAINT_PROVEN_IPADOS, verdict: 'refused' })
    ).toMatch(/already/);
  });
});

describe('createFrontHandler against a live upstream', () => {
  const listen = (server) =>
    new Promise((done) => server.listen(0, '127.0.0.1', () => done(server.address().port)));
  // Raw socket, so malformed and absolute-form targets reach the front unmodified.
  const send = (port, target) =>
    new Promise((done) => {
      const socket = connect(port, '127.0.0.1', () =>
        socket.write(`GET ${target} HTTP/1.1\r\nHost: front\r\nConnection: close\r\n\r\n`)
      );
      let reply = '';
      socket.on('data', (chunk) => (reply += chunk));
      socket.on('end', () => done(Number(reply.split(' ')[1])));
      socket.on('error', () => done(null));
    });

  let upstream;
  let front;
  let frontPort;
  const seen = [];
  beforeAll(async () => {
    upstream = createServer((req, res) => {
      seen.push(req.url);
      res.writeHead(200).end('ok');
    });
    const upstreamPort = await listen(upstream);
    front = createServer(
      createFrontHandler({
        upstream: upstreamPort,
        isBuildFile: (path) => decodeURIComponent(path) === '/build-file',
      })
    );
    frontPort = await listen(front);
  });
  afterAll(() => {
    upstream.close();
    front.close();
  });

  it('answers a malformed escape without dying, then keeps serving', async () => {
    expect(await send(frontPort, '/%')).toBe(403);
    expect(await send(frontPort, '/%FF')).toBe(403);
    expect(await send(frontPort, '/')).toBe(200);
  });

  it('forwards the parsed path of an absolute-form target, never the raw target', async () => {
    seen.length = 0;
    expect(await send(frontPort, 'http://elsewhere/_app/chunk.js?v=1')).toBe(200);
    expect(seen).toEqual(['/_app/chunk.js?v=1']);
  });

  it('refuses an absolute-form target naming a denied route', async () => {
    seen.length = 0;
    expect(await send(frontPort, 'http://elsewhere/dev/store-frames/identity')).toBe(403);
    expect(seen).toEqual([]);
  });
});
