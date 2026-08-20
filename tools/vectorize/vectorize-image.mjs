#!/usr/bin/env node
// Vectorizer.AI driver for Splotch.
//
// Traces a bitmap to vector art through https://api.vectorizer.ai/api/v1, and
// wraps the three things that are easy to get wrong by hand: the credit budget
// (the account is metered, a production trace costs 1 credit), the
// response headers that carry the Image Token and the per-call charge, and the
// 429/503 back-off schedule the service documents.
//
// Defaults to the FREE watermarked test mode. Spending a credit requires an
// explicit --production / --mode.
//
// Usage:
//   node tools/vectorize/vectorize-image.mjs <input> [--out file] [options]
//   node tools/vectorize/vectorize-image.mjs --download <token> [--out file]
//   node tools/vectorize/vectorize-image.mjs --delete <token>
//   node tools/vectorize/vectorize-image.mjs --account
//
// <input> is a file path, an http(s) URL, or token:<image-token>.
// See README.md for the flag table and docs/api.md for every --param name.

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'https://api.vectorizer.ai/api/v1';

// Gitignored, like the run-splotch and lighthouse-audit drivers' output dirs, so
// a trace never lands in the tree as a stray untracked file.
const DEFAULT_OUT_DIR = 'vectorized';

// A deliberately conservative OVERALL deadline, not the idle timeout the service
// asks for. Vectorizer.AI wants at least 180s without activity; AbortSignal.timeout
// measures elapsed time instead, so an active-but-slow response would be killed
// mid-stream at any 180s limit. Global fetch exposes no idle timeout without an
// undici Agent, so the substitute is a ceiling far above any real trace (observed:
// 9-20s) that still stops a genuine hang from running forever.
const REQUEST_DEADLINE_MS = 600_000;

// Documented back-off for 429: linear, 5s per consecutive failure, reset on success.
const BACKOFF_STEP_MS = 5_000;
const MAX_RETRIES = 3;

const FORMATS = ['svg', 'eps', 'pdf', 'dxf', 'png'];
const MODES = ['test', 'test_preview', 'preview', 'production'];
const FREE_MODES = ['test', 'test_preview'];

// Fields the driver derives from a dedicated flag and then reports to the user.
// A generic --param carrying one of these could make the submitted request
// disagree with the printed summary — and for `mode` that means spending a credit
// a run announced as free. Rejected by name rather than silently overridden, so
// the caller learns which flag owns the field.
const RESERVED_PARAMS = new Map([
  ['mode', '--mode / --production'],
  ['image', '<input>'],
  ['image.url', '<input>'],
  ['image.base64', '<input>'],
  ['image.token', '<input> or --download'],
  ['output.file_format', '--format / --out'],
  ['policy.retention_days', '--retain'],
  ['receipt', '--receipt'],
]);

const EXTENSION_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
};

// Importable for tests; only a direct `node vectorize-image.mjs` run executes anything.
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  // parseArgs rejects bad flags and reserved --param names, so it needs the same
  // one-line error treatment as a failed call rather than a raw stack trace.
  try {
    await main(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(`\n${err.message}`);
    process.exitCode = 1;
  }
}

export async function main(args) {
  if (args.help) {
    printUsage();
    return;
  }
  try {
    if (args.account) await printAccount();
    else if (args.delete) await runDelete(args.delete);
    else if (args.download) await runDownload(args.download, args);
    else await runVectorize(args);
  } catch (err) {
    console.error(`\n${err.message}`);
    process.exitCode = 1;
  }
}

// The single source for what a vectorize run both PRINTS and SUBMITS. Callers
// read `mode` for the summary and `form` for the request, so the two cannot
// describe different calls — see the credit-safety note on RESERVED_PARAMS.
export function buildVectorizeRequest(args) {
  const input = args._[0];
  if (!input)
    throw new Error('No input. Pass a file path, an http(s) URL, or token:<image-token>.');

  const mode = resolveMode(args);
  const format = resolveFormat(args);
  const out = resolve(args.out ?? `${DEFAULT_OUT_DIR}/vectorized.${format}`);

  const form = new FormData();
  for (const [key, value] of args.params) form.set(key, value);
  attachInput(form, input);
  form.set('mode', mode);
  form.set('output.file_format', format);
  if (args.retain !== undefined) form.set('policy.retention_days', String(args.retain));

  return { input, mode, format, out, form };
}

export function resolveMode(args) {
  const mode = args.production ? 'production' : (args.mode ?? 'test');
  if (!MODES.includes(mode)) throw new Error(`Unknown --mode ${mode}. One of: ${MODES.join(', ')}`);
  return mode;
}

async function runVectorize(args) {
  const { input, mode, out, form } = buildVectorizeRequest(args);

  console.log(`Input  : ${input}`);
  console.log(`Mode   : ${mode}${FREE_MODES.includes(mode) ? ' (free)' : ''}`);
  console.log(`Output : ${out}`);
  if (args.params.length) {
    console.log(`Params : ${args.params.map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }
  console.log('');

  const res = await request('/vectorize', form);
  await writeResult(res, out);
  await reportCredits(res, args);
}

async function runDownload(token, args) {
  const format = resolveFormat(args);
  const out = resolve(args.out ?? `${DEFAULT_OUT_DIR}/vectorized.${format}`);

  const form = new FormData();
  for (const [key, value] of args.params) form.set(key, value);
  form.set('image.token', token);
  form.set('output.file_format', format);
  if (args.receipt) form.set('receipt', args.receipt);

  console.log(`Download: ${format} from image token`);
  console.log(`Output  : ${out}\n`);

  const res = await request('/download', form);
  await writeResult(res, out);
  await reportCredits(res, args);
}

async function runDelete(token) {
  const form = new FormData();
  form.set('image.token', token);
  const res = await request('/delete', form);
  console.log(await res.text());
}

async function printAccount() {
  const account = await fetchAccount();
  console.log(JSON.stringify(account, null, 2));
}

async function fetchAccount() {
  const res = await request('/account', undefined, 'GET');
  return JSON.parse(await res.text());
}

async function writeResult(res, out) {
  const bytes = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  console.log(
    `Wrote ${out} (${bytes.length.toLocaleString()} bytes, ${res.headers.get('content-type')})`
  );
}

// The Image Token and both credit counters exist only as response headers, so a
// run that does not surface them loses the ability to download extra formats at
// the 0.1 rate — and loses the record of what the call cost.
async function reportCredits(res, args) {
  const token = res.headers.get('x-image-token');
  const receipt = res.headers.get('x-receipt');
  const charged = Number(res.headers.get('x-credits-charged') ?? 0);
  const calculated = res.headers.get('x-credits-calculated');

  if (calculated) console.log(`Would have cost: ${Number(calculated)} credits`);
  console.log(`Charged: ${charged} credits`);
  if (token) console.log(`Image token: ${token}`);
  if (receipt) console.log(`Receipt: ${receipt}`);

  // Best-effort: the credit is already spent and the result already written, so a
  // failure here must not exit non-zero. An agent that reads a paid, completed run
  // as a failure retries it and spends the credit again.
  if (charged > 0) {
    try {
      const account = await fetchAccount();
      console.log(`Credits remaining: ${account.credits}`);
    } catch (err) {
      console.warn(`Credits remaining: unavailable (${err.message})`);
    }
  }

  if (args.json) {
    console.log(
      JSON.stringify({ charged, calculated: calculated ?? null, imageToken: token, receipt })
    );
  }
}

function attachInput(form, input) {
  if (input.startsWith('token:')) {
    form.set('image.token', input.slice('token:'.length));
    return;
  }
  if (/^https?:\/\//.test(input)) {
    form.set('image.url', input);
    return;
  }
  const path = resolve(input);
  if (!existsSync(path)) throw new Error(`No such file: ${path}`);
  const type = EXTENSION_MIME[extname(path).toLowerCase()];
  if (!type) {
    throw new Error(
      `Unsupported input extension "${extname(path)}". Accepted: ${Object.keys(EXTENSION_MIME).join(', ')}`
    );
  }
  form.set('image', new Blob([readFileSync(path)], { type }), basename(path));
}

function resolveFormat(args) {
  if (args.format) {
    if (!FORMATS.includes(args.format)) {
      throw new Error(`Unknown --format ${args.format}. One of: ${FORMATS.join(', ')}`);
    }
    return args.format;
  }
  const fromOut = args.out ? extname(args.out).slice(1).toLowerCase() : '';
  if (FORMATS.includes(fromOut)) return fromOut;
  return 'svg';
}

async function request(path, body, method = 'POST') {
  const auth = resolveAuth();
  let attempt = 0;
  for (;;) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      body,
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(REQUEST_DEADLINE_MS),
    });
    if (res.ok) return res;

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < MAX_RETRIES) {
      attempt += 1;
      const waitMs = BACKOFF_STEP_MS * attempt;
      console.error(
        `HTTP ${res.status} — retrying in ${waitMs / 1000}s (attempt ${attempt}/${MAX_RETRIES})`
      );
      await new Promise((done) => setTimeout(done, waitMs));
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${await describeError(res)}`);
  }
}

async function describeError(res) {
  const text = await res.text();
  try {
    const { error } = JSON.parse(text);
    return error ? `[code ${error.code}] ${error.message}` : text;
  } catch {
    return text;
  }
}

// Credentials come from the shell like every other repo script. The .env
// fallbacks exist because these keys are most naturally kept in a gitignored
// .env, and sourcing it before every call is easy to forget.
function resolveAuth() {
  loadEnvFile(resolve('.env'));
  loadEnvFile(resolve('web/.env'));

  if (process.env.VECTORIZER_AUTHORIZATION) return process.env.VECTORIZER_AUTHORIZATION;

  const id = process.env.VECTORIZER_ID;
  const secret = process.env.VECTORIZER_SECRET;
  if (id && secret) return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;

  throw new Error(
    'Missing credentials. Set VECTORIZER_ID + VECTORIZER_SECRET (or VECTORIZER_AUTHORIZATION) ' +
      'in the environment, or put them in a gitignored .env at the repo root.'
  );
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*(VECTORIZER_[A-Z_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key]) continue;
    process.env[key] = raw.trim().replace(/^["'](.*)["']$/, '$1');
  }
}

export function parseArgs(argv) {
  const parsed = { _: [], params: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      case '--production':
        parsed.production = true;
        break;
      case '--account':
        parsed.account = true;
        break;
      case '--json':
        parsed.json = true;
        break;
      case '--param': {
        const pair = argv[++i] ?? '';
        const eq = pair.indexOf('=');
        if (eq < 1) throw new Error(`--param expects name=value, got "${pair}"`);
        const name = pair.slice(0, eq).trim();
        const owner = RESERVED_PARAMS.get(name);
        if (owner) {
          throw new Error(
            `--param ${name} is not allowed; the driver reports this field, so use ${owner} instead.`
          );
        }
        parsed.params.push([name, pair.slice(eq + 1)]);
        break;
      }
      case '--out':
      case '--format':
      case '--mode':
      case '--retain':
      case '--download':
      case '--delete':
      case '--receipt':
        parsed[arg.slice(2)] = argv[++i];
        break;
      default:
        if (arg.startsWith('-')) throw new Error(`Unknown flag ${arg}`);
        parsed._.push(arg);
    }
  }
  return parsed;
}

function printUsage() {
  console.log(`Vectorize a bitmap through Vectorizer.AI. Defaults to the free, watermarked test mode.

  node tools/vectorize/vectorize-image.mjs <input> [--out file] [options]
  node tools/vectorize/vectorize-image.mjs --download <token> [--out file] [--receipt r]
  node tools/vectorize/vectorize-image.mjs --delete <token>
  node tools/vectorize/vectorize-image.mjs --account

  <input>          file path | http(s) URL | token:<image-token>
  --out <file>     output path; its extension picks the format (default ${DEFAULT_OUT_DIR}/vectorized.svg)
  --format <fmt>   ${FORMATS.join(' | ')}
  --mode <mode>    ${MODES.join(' | ')} (default test)
  --production     shorthand for --mode production — SPENDS 1 CREDIT
  --retain <days>  policy.retention_days; > 0 returns an image token
  --param k=v      any documented API parameter, dotted name verbatim (repeatable)
  --json           also print a machine-readable summary line

Credits: test modes are free, preview 0.2, production 1.0, extra format 0.1.
See README.md and docs/api.md.`);
}
