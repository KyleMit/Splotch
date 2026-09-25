// A trusted HTTPS origin for iPad Safari captures. A LAN `http://` page is not a
// secure context, so the AI-waiting actions die before their first request
// (crypto.randomUUID is missing), and iOS has no `adb reverse` to reach the Mac as
// localhost. The route is a root the iPad trusts that is name-constrained to this
// Mac, in front of a preview that serves only what the page loads.
//
//   make-ca  create the constrained root, a server leaf, and a constraint probe
//   serve    the restricted HTTPS front over `npm run perf:serve`
//   check    prove a running front is safe to capture behind with nobody at the iPad
//
// The procedure, including installing and removing the root on the iPad, is in
// docs/PROFILING-IPAD.md ("A trusted HTTPS origin for iPad Safari").
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, request } from 'node:http';
import { createServer as createHttpsServer, get as httpsGet } from 'node:https';
import { homedir } from 'node:os';
import { join, normalize, resolve } from 'node:path';
import { ROOT, argFlag, capture, fail, isMain, runMain, tryCapture } from '../../lib/proc.mjs';
import { grantLogDevice } from '../lib/grant-log.mjs';

export const DEFAULT_CA_DIR = join(homedir(), '.splotch-rig', 'secure-origin-ca');
const DEFAULT_AUTHORITY_DAYS = 730;
// Apple rejects any TLS server certificate valid for more than 825 days,
// including one issued by a root the user installed.
const APPLE_MAX_LEAF_DAYS = 825;
// `perf:serve` is SvelteKit's `vite preview` with the dev harness on: it answers
// server routes, and /dev/store-frames/identity returns the host checkout path.
const DENIED_PREFIXES = ['/api', '/admin', '/dev'];
const FORWARDED_METHODS = new Set(['GET', 'HEAD']);
// An encoded slash, backslash, dot or percent survives URL parsing, so the path
// judged here and the path the upstream decodes could name different routes.
// No file the page loads needs one.
const ENCODED_SEPARATOR = /%(2f|5c|2e|25)/i;
// Only an ASCII escape (%00-%7F) always decodes; anything else may be invalid
// UTF-8, which makes decodeURIComponent throw. No build file needs one.
const UNDECODABLE_ESCAPE = /%(?![0-7][0-9a-f])/i;
// A leaf that names the constrained address AND a name outside the constraint.
// A device that enforces the root's name constraint must refuse it.
const CONSTRAINT_PROBE_OUTSIDE_NAME = 'DNS:example.com';
// An address no rig uses (TEST-NET-3, RFC 5737). The root must refuse a leaf for it.
const OUTSIDE_ADDRESS = '203.0.113.10';
// The iPadOS release on which a person watched Safari refuse the constraint
// probe (docs/scratchpad/perf/2026-09-19-ipad-secure-origin-ca/). `check` lets an
// unattended session skip that on-device look only on this release: an iPad
// update could change enforcement, so the probe is re-proven with someone at the
// iPad (docs/PROFILING-IPAD.md, "Serve and verify") before this is raised.
// secure-origin.test.mjs holds it to a `refused` row in CONSTRAINT_PROBE_LOG.
export const CONSTRAINT_PROVEN_IPADOS = '26.5';
// Every on-iPad constraint-probe verdict a person gave, one row each. Tracked
// (perf-profiles/evidence is the one un-gitignored perf path), because it is the
// committed evidence a raise of CONSTRAINT_PROVEN_IPADOS cites.
export const CONSTRAINT_PROBE_LOG = join(ROOT, 'perf-profiles', 'evidence', 'operator', 'ipad-constraint-probe.tsv');
const CONSTRAINT_PROBE_LOG_HEADER = 'timestamp\tdevice\tipados\tverdict\tdetail\n';
export const CONSTRAINT_PROBE_VERDICTS = { refused: 'refused', accepted: 'accepted' };
// A route the front refuses. A live 403 there proves the restriction is in force.
const DENIED_PROBE_PATH = '/api/verify-key';

export function frontDecision({ method, pathname, isBuildFile }) {
  if (!FORWARDED_METHODS.has(method)) return 'deny:method';
  if (ENCODED_SEPARATOR.test(pathname)) return 'deny:encoded';
  if (UNDECODABLE_ESCAPE.test(pathname)) return 'deny:encoded';
  const path = normalize(pathname);
  if (DENIED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return 'deny:prefix';
  }
  if (path === '/' || path.startsWith('/_app/')) return 'allow';
  return isBuildFile(path) ? 'allow' : 'deny:not-in-build';
}

export function authorityConfig({ host, ip, label }) {
  if (!host.endsWith('.local')) {
    throw new Error(`--host must be this Mac's .local name, got "${host}"`);
  }
  // A name type the constraint does not mention is unconstrained (RFC 5280), so a
  // DNS-only root would still vouch for every IP address. Without --ip, exclude
  // them all. A DNS constraint also admits subdomains of the name.
  const addresses = ip
    ? [`permitted;IP:${ip}/255.255.255.255`]
    : ['excluded;IP:0.0.0.0/0.0.0.0', 'excluded;IP:::/::'];
  const permitted = [`permitted;DNS:${host}`, ...addresses];
  return [
    '[req]',
    'distinguished_name=dn',
    'prompt=no',
    '[dn]',
    `CN=Splotch capture rig CA (constrained, ${label})`,
    'O=Splotch local capture',
    '[v3_ca]',
    'basicConstraints=critical,CA:TRUE,pathlen:0',
    'keyUsage=critical,keyCertSign,cRLSign',
    'subjectKeyIdentifier=hash',
    `nameConstraints=critical,${permitted.join(',')}`,
    '',
  ].join('\n');
}

export function leafExtensions(subjectAltNames) {
  return [
    'basicConstraints=critical,CA:FALSE',
    'keyUsage=critical,digitalSignature',
    'extendedKeyUsage=serverAuth',
    `subjectAltName=${subjectAltNames.join(',')}`,
    'authorityKeyIdentifier=keyid',
    '',
  ].join('\n');
}

export function leafValidityDays(authorityDays) {
  return Math.min(APPLE_MAX_LEAF_DAYS, authorityDays - 1);
}

const EC_KEY = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes'];

function issueLeaf(dir, name, subjectAltNames, days) {
  writeFileSync(join(dir, `${name}.ext`), leafExtensions(subjectAltNames));
  capture('openssl', ['req', '-new', ...EC_KEY, '-keyout', join(dir, `${name}.key`), '-out', join(dir, `${name}.csr`), '-subj', `/CN=${name}`]);
  capture('openssl', ['x509', '-req', '-in', join(dir, `${name}.csr`), '-CA', join(dir, 'ca.pem'), '-CAkey', join(dir, 'ca.key'), '-CAcreateserial', '-out', join(dir, `${name}.pem`), '-days', String(days), '-extfile', join(dir, `${name}.ext`)]);
}

// Apple's own trust engine, with the root as the only anchor. On macOS this is
// the same Security framework evaluation Safari uses; the iPad's own enforcement
// is proven on the device.
const macTrusts = (dir, leaf, name) =>
  tryCapture('security', ['verify-cert', '-c', join(dir, `${leaf}.pem`), '-r', join(dir, 'ca.pem'), '-p', 'ssl', '-s', name]).ok;

// The leaf must pass and every probe must fail.
function verifyOnMac(dir, host, ip) {
  const names = [host, ...(ip ? [ip] : [])];
  const leafOk = names.every((name) => macTrusts(dir, 'leaf', name));
  const probeRefused = !macTrusts(dir, 'constraint-probe', ip ?? host);
  const addressRefused = !macTrusts(dir, 'address-probe', OUTSIDE_ADDRESS);
  console.log(`macOS trust: leaf ${leafOk ? 'accepted' : 'REFUSED'} for ${names.join(', ')}`);
  console.log(`macOS trust: constraint probe ${probeRefused ? 'refused' : 'ACCEPTED'}`);
  console.log(`macOS trust: ${OUTSIDE_ADDRESS} probe ${addressRefused ? 'refused' : 'ACCEPTED'}`);
  if (!leafOk || !probeRefused || !addressRefused) fail('The new root does not behave as constrained; do not install it.');
}

function makeAuthority() {
  const dir = resolve(argFlag('dir', DEFAULT_CA_DIR));
  const host = argFlag('host') ?? fail('Pass --host=<this Mac>.local (scutil --get LocalHostName).');
  const ip = argFlag('ip');
  const days = Number(argFlag('days', String(DEFAULT_AUTHORITY_DAYS)));
  const label = argFlag('label', new Date().toISOString().slice(0, 7));
  if (existsSync(join(dir, 'ca.key'))) {
    fail(`${dir} already holds a root. Remove it from the iPad and delete the directory first.`);
  }
  mkdirSync(join(dir, 'public'), { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, 'ca.cnf'), authorityConfig({ host, ip, label }));
  capture('openssl', ['req', '-x509', '-new', ...EC_KEY, '-keyout', join(dir, 'ca.key'), '-out', join(dir, 'ca.pem'), '-days', String(days), '-config', join(dir, 'ca.cnf'), '-extensions', 'v3_ca']);
  const inScope = [`DNS:${host}`, ...(ip ? [`IP:${ip}`] : [])];
  issueLeaf(dir, 'leaf', inScope, leafValidityDays(days));
  issueLeaf(dir, 'constraint-probe', [CONSTRAINT_PROBE_OUTSIDE_NAME, ...inScope], leafValidityDays(days));
  issueLeaf(dir, 'address-probe', [`IP:${OUTSIDE_ADDRESS}`], leafValidityDays(days));
  capture('chmod', ['600', join(dir, 'ca.key'), join(dir, 'leaf.key'), join(dir, 'constraint-probe.key'), join(dir, 'address-probe.key')]);
  const profile = join(dir, 'public', `splotch-rig-ca-${label}.crt`);
  writeFileSync(profile, readFileSync(join(dir, 'ca.pem')));
  verifyOnMac(dir, host, ip);
  console.log(capture('openssl', ['x509', '-in', join(dir, 'ca.pem'), '-noout', '-subject', '-enddate', '-fingerprint', '-sha256']).trim());
  console.log(`Install on the iPad: ${profile}`);
}

// The request boundary. A target the URL parser cannot read is a 400, never a
// thrown error: one malformed request must not take down a capture's front.
// The upstream receives the parsed path the decision judged, never the raw
// target, so an absolute-form request cannot reach the preview unparsed.
export function createFrontHandler({ upstream, isBuildFile, log = () => {} }) {
  return (req, res) => {
    if (!URL.canParse(req.url, 'http://front')) {
      log(req.method, req.url, 'deny:unparsable');
      res.writeHead(400, { 'content-type': 'text/plain' }).end('bad request\n');
      return;
    }
    const { pathname, search } = new URL(req.url, 'http://front');
    const decision = frontDecision({ method: req.method, pathname, isBuildFile });
    log(req.method, pathname, decision);
    if (decision !== 'allow') {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden\n');
      return;
    }
    const forwarded = request(
      {
        host: '127.0.0.1',
        port: upstream,
        method: req.method,
        path: `${pathname}${search}`,
        headers: { ...req.headers, host: `127.0.0.1:${upstream}` },
      },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      }
    );
    forwarded.on('error', () => res.writeHead(502).end());
    req.pipe(forwarded);
  };
}

function serveFront() {
  const dir = resolve(argFlag('dir', DEFAULT_CA_DIR));
  const listen = argFlag('listen') ?? fail('Pass --listen=<address>:<port>.');
  const upstream = Number(argFlag('upstream') ?? fail('Pass --upstream=<perf:serve port>.'));
  const leaf = argFlag('leaf', 'leaf');
  const logFile = argFlag('log');
  const buildDir = join(ROOT, 'web', 'build');
  const isBuildFile = (path) => {
    const relative = decodeURIComponent(path).replace(/^\/+/, '');
    return [relative, `${relative}.html`, join(relative, 'index.html')].some((candidate) => {
      const full = join(buildDir, candidate);
      return full.startsWith(buildDir) && existsSync(full) && statSync(full).isFile();
    });
  };
  const log = (method, path, decision) => {
    if (logFile) appendFileSync(logFile, `${new Date().toISOString()}\t${method}\t${path}\t${decision}\n`);
  };
  const handler = createFrontHandler({ upstream, isBuildFile, log });
  const tls = !process.argv.includes('--http');
  const server = tls
    ? createHttpsServer(
        { cert: readFileSync(join(dir, `${leaf}.pem`)), key: readFileSync(join(dir, `${leaf}.key`)) },
        handler
      )
    : createHttpServer(handler);
  const separator = listen.lastIndexOf(':');
  server.listen(Number(listen.slice(separator + 1)), listen.slice(0, separator), () =>
    console.log(`restricted ${tls ? `https (${leaf})` : 'http'} front ${listen} -> 127.0.0.1:${upstream}`)
  );
}

// Fields are flattened to single-line cells so a person's note cannot break the TSV.
export function constraintProbeLine({ timestamp, device, ipadOs, verdict, detail }) {
  const cell = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  return `${[timestamp, device, ipadOs, verdict, detail].map(cell).join('\t')}\n`;
}

export function recordConstraintProbe({ udid, ipadOs, verdict, detail }, { logPath = CONSTRAINT_PROBE_LOG } = {}) {
  if (!Object.values(CONSTRAINT_PROBE_VERDICTS).includes(verdict)) throw new Error(`unknown constraint-probe verdict "${verdict}"`);
  mkdirSync(join(logPath, '..'), { recursive: true });
  if (!existsSync(logPath)) appendFileSync(logPath, CONSTRAINT_PROBE_LOG_HEADER);
  appendFileSync(logPath, constraintProbeLine({ timestamp: new Date().toISOString(), device: grantLogDevice(udid), ipadOs, verdict, detail }));
}

export function parseConstraintProbeLog(text) {
  return text
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [timestamp, device, ipadOs, verdict, detail] = line.split('\t');
      return { timestamp, device, ipadOs, verdict, detail };
    });
}

// A release counts as proven only while the log holds a person's refusal on it
// and no acceptance: one acceptance means that release does not enforce the
// constraint, whatever an earlier row said.
export function constraintProofProblem(rows, ipadOs) {
  const onRelease = rows.filter((row) => row.ipadOs === ipadOs);
  if (onRelease.some((row) => row.verdict === CONSTRAINT_PROBE_VERDICTS.accepted)) {
    return `a person saw iPadOS ${ipadOs} ACCEPT the constraint probe: that release does not enforce the name constraint`;
  }
  if (!onRelease.some((row) => row.verdict === CONSTRAINT_PROBE_VERDICTS.refused)) {
    return `no person has recorded iPadOS ${ipadOs} refusing the constraint probe`;
  }
  return null;
}

// What to do with a verdict a person just recorded: raise the constant from the
// committed row, or keep the unattended check refusing.
export function constraintProbeFollowUp({ ipadOs, verdict, logPath = CONSTRAINT_PROBE_LOG }) {
  const log = logPath.startsWith(ROOT) ? logPath.slice(ROOT.length + 1) : logPath;
  if (verdict === CONSTRAINT_PROBE_VERDICTS.accepted) {
    return `iPadOS ${ipadOs} accepted the constraint probe. Commit the row in ${log}, remove the rig CA profile from the iPad, and leave CONSTRAINT_PROVEN_IPADOS at ${CONSTRAINT_PROVEN_IPADOS}.`;
  }
  if (ipadOs === CONSTRAINT_PROVEN_IPADOS) {
    return `iPadOS ${ipadOs} is already CONSTRAINT_PROVEN_IPADOS; commit the row in ${log} as a repeat proof.`;
  }
  return `Commit the row in ${log}, then raise CONSTRAINT_PROVEN_IPADOS in tools/perf/ios/secure-origin.mjs from ${CONSTRAINT_PROVEN_IPADOS} to ${ipadOs}, citing that row (secure-origin.test.mjs fails a raise the log does not back). Until then \`perf:ios:secure-origin check\` refuses this iPad.`;
}

export function secureOriginProblems({ ipadOs, leafTrusted, probeRefused, pageStatus, deniedStatus }) {
  return [
    ipadOs !== CONSTRAINT_PROVEN_IPADOS &&
      `the iPad reports iPadOS ${ipadOs ?? 'unknown'}, but the name constraint is proven only on ${CONSTRAINT_PROVEN_IPADOS}. Prove the constraint probe on the iPad with someone present (perf:session:person visit 2 records the verdict in the constraint-probe log; docs/PROFILING-IPAD.md, "Serve and verify"), then raise CONSTRAINT_PROVEN_IPADOS citing that row.`,
    !leafTrusted && 'macOS trust refuses the leaf for this host; the root or leaf does not name it.',
    !probeRefused && 'macOS trust ACCEPTS the constraint probe: the root is not name-constrained. Do not capture.',
    pageStatus !== 200 && `the front answered ${pageStatus} for the page, not 200 with the rig CA.`,
    deniedStatus !== 403 &&
      `the front answered ${deniedStatus} for ${DENIED_PROBE_PATH}, not 403${typeof deniedStatus === 'number' ? ': it is not restricting routes' : ''}.`,
  ].filter(Boolean);
}

// A transport failure is reported by its code in place of a status.
function statusWithRigCa(url, ca) {
  return new Promise((resolveStatus) => {
    httpsGet(url, { ca }, (response) => {
      response.resume();
      resolveStatus(response.statusCode);
    }).on('error', (error) => resolveStatus(error.code ?? error.message));
  });
}

async function checkFront() {
  const dir = resolve(argFlag('dir', DEFAULT_CA_DIR));
  const url = new URL(argFlag('url') ?? fail('Pass --url=https://<mac>.local:<port>/ (the running leaf front).'));
  const udid = argFlag('device-id') ?? fail('Pass --device-id=<iPad UDID>.');
  const ca = readFileSync(join(dir, 'ca.pem'));
  const version = tryCapture('ideviceinfo', ['-u', udid, '-k', 'ProductVersion']);
  const facts = {
    ipadOs: version.ok ? version.stdout.trim() : null,
    leafTrusted: macTrusts(dir, 'leaf', url.hostname),
    probeRefused: !macTrusts(dir, 'constraint-probe', url.hostname),
    pageStatus: await statusWithRigCa(url, ca),
    deniedStatus: await statusWithRigCa(new URL(DENIED_PROBE_PATH, url), ca),
  };
  const problems = secureOriginProblems(facts);
  if (problems.length > 0) fail(problems.map((problem) => `✗ ${problem}`).join('\n'));
  console.log(
    `✓ iPadOS ${facts.ipadOs}; macOS trust accepts the leaf and refuses the constraint probe; ${url.href} answers 200 and ${DENIED_PROBE_PATH} 403`
  );
}

if (isMain(import.meta.url)) {
  const command = process.argv[2];
  if (command === 'make-ca') makeAuthority();
  else if (command === 'serve') serveFront();
  else if (command === 'check') runMain(checkFront);
  else fail('Usage: secure-origin.mjs make-ca --host=<name>.local [--ip=] [--days=] [--dir=] | serve --listen=<lan address>:<port> --upstream= [--leaf=constraint-probe] [--http] [--log=] [--dir=] | check --url=https://<name>.local:<port>/ --device-id=<udid> [--dir=]');
}
