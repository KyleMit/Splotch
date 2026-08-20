#!/usr/bin/env node

import {
  access,
  constants as fsConstants,
  copyFile,
  link,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isMain } from '../lib/proc.mjs';
import {
  DEFAULT_OUTPUT_FORMAT,
  ElevenLabsSoundEffectsClient,
  normalizeSoundEffectRequest,
  outputExtension,
} from './lib/sound-effects-client.mjs';

const API_KEY_ENV_NAME = 'ELEVENLABS_API_KEY';
const ENV_FILE_PATHS = ['.env.local', '.env', 'web/.env'];

if (isMain(import.meta.url)) {
  runSoundEffectsCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export async function runSoundEffectsCli(argv, effects = {}) {
  const args = parseSoundEffectArgs(argv);
  if (args.help) {
    printUsage();
    return;
  }

  const plan = await buildGenerationPlan(args, effects);
  printPlan(plan, args.dryRun);
  if (args.dryRun) return;

  const client =
    effects.client ??
    new ElevenLabsSoundEffectsClient({
      apiKey: effects.apiKey ?? (await resolveApiKey(effects)),
      maxRetries: args.retries,
      fetchImpl: effects.fetchImpl,
      sleepImpl: effects.sleepImpl,
      onRetry: ({ attempt, delayMs, error }) =>
        console.warn(
          `${error.message}; retry ${attempt}/${args.retries} in ${(delayMs / 1_000).toFixed(1)}s.`
        ),
    });
  const result = await runGenerationPlan(plan, {
    client,
    overwrite: args.overwrite,
    log: effects.log ?? console.log,
  });

  console.log(`Complete: ${result.generated} generated, ${result.skipped} skipped.`);
  console.log(`OUTPUT_DIR=${plan.outputDir}`);
  if (result.failures.length > 0) {
    throw new Error(
      `${result.failures.length} generation(s) failed:\n${result.failures
        .map(({ file, error }) => `- ${file}: ${error.message}`)
        .join('\n')}`
    );
  }
}

export function parseSoundEffectArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: false,
      strict: true,
      options: {
        text: { type: 'string' },
        input: { type: 'string' },
        out: { type: 'string' },
        'out-dir': { type: 'string' },
        duration: { type: 'string' },
        'auto-duration': { type: 'boolean' },
        influence: { type: 'string' },
        loop: { type: 'boolean' },
        format: { type: 'string' },
        overwrite: { type: 'boolean' },
        retries: { type: 'string', default: '3' },
        'dry-run': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    }).values;
  } catch (error) {
    throw new Error(error.message, { cause: error });
  }

  const retries = parseInteger(parsed.retries, '--retries');
  if (retries < 0) throw new Error('--retries must be a non-negative integer.');
  return {
    text: parsed.text,
    input: parsed.input,
    out: parsed.out,
    outDir: parsed['out-dir'],
    duration: parsed.duration,
    autoDuration: parsed['auto-duration'] ?? false,
    influence: parsed.influence,
    loop: parsed.loop ?? false,
    format: parsed.format,
    overwrite: parsed.overwrite ?? false,
    retries,
    dryRun: parsed['dry-run'] ?? false,
    help: parsed.help ?? false,
  };
}

export async function buildGenerationPlan(args, effects = {}) {
  if (args.help) return null;
  if (Boolean(args.text) === Boolean(args.input)) {
    throw new Error('Pass exactly one of --text or --input.');
  }
  if (args.text) validateSingleArgs(args);

  const outputDir = args.outDir
    ? resolve(args.outDir)
    : args.out
      ? dirname(resolve(args.out))
      : join(tmpdir(), `splotch-elevenlabs-sfx-${crypto.randomUUID()}`);

  if (args.text) return buildSinglePlan(args, outputDir);
  rejectBatchOnlyFlags(args);

  const inputPath = resolve(args.input);
  const read = effects.readFile ?? readFile;
  let document;
  try {
    document = JSON.parse(await read(inputPath, 'utf8'));
  } catch (error) {
    throw new Error(`${inputPath}: ${error.message}`, { cause: error });
  }
  return buildBatchPlan(document, outputDir, inputPath);
}

export async function runGenerationPlan(plan, { client, overwrite = false, log = console.log }) {
  const failures = [];
  let generated = 0;
  let skipped = 0;

  for (const candidate of plan.candidates) {
    if (!overwrite && (await pathExists(candidate.out))) {
      log(`Skip  ${candidate.out} (already exists)`);
      skipped += 1;
      continue;
    }

    try {
      log(`Start ${candidate.out}`);
      const audio = await client.generateSoundEffect(candidate.request);
      const wrote = await writeAudioFile(candidate.out, audio.bytes, overwrite);
      if (wrote) {
        log(
          `Wrote ${candidate.out} (${audio.bytes.length.toLocaleString()} bytes${
            audio.characterCost === null ? '' : `, character-cost ${audio.characterCost}`
          })`
        );
        generated += 1;
      } else {
        log(`Skip  ${candidate.out} (created by another process)`);
        skipped += 1;
      }
    } catch (error) {
      failures.push({ file: candidate.out, error });
      log(`Fail  ${candidate.out}: ${error.message}`);
    }
  }

  return { failures, generated, skipped };
}

function buildSinglePlan(args, outputDir) {
  const outputFormat = args.format ?? DEFAULT_OUTPUT_FORMAT;
  const request = {
    text: args.text,
    durationSeconds: args.autoDuration ? null : parseNumber(args.duration, '--duration'),
    loop: args.loop,
    promptInfluence:
      args.influence === undefined ? undefined : parseNumber(args.influence, '--influence'),
    outputFormat,
  };
  normalizeSoundEffectRequest(request);

  const out = args.out
    ? resolve(args.out)
    : join(outputDir, `sound-effect${outputExtension(outputFormat)}`);
  validateOutputExtension(out, outputFormat, '--out');
  return { outputDir, candidates: [{ out, request }] };
}

function validateSingleArgs(args) {
  if (args.duration !== undefined && args.autoDuration) {
    throw new Error('Pass only one of --duration or --auto-duration.');
  }
  if (args.duration === undefined && !args.autoDuration) {
    throw new Error('Choose --duration <seconds> or --auto-duration explicitly.');
  }
  if (args.out && args.outDir) throw new Error('Pass only one of --out or --out-dir.');
}

function buildBatchPlan(document, outputDir, inputPath) {
  const candidates = Array.isArray(document) ? document : document?.candidates;
  const defaults = Array.isArray(document) ? {} : (document?.defaults ?? {});
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(`${inputPath}: expected a non-empty candidates array.`);
  }
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) {
    throw new Error(`${inputPath}: defaults must be an object.`);
  }

  const seen = new Set();
  const planned = candidates.map((candidate, index) => {
    const label = `${inputPath}: candidates[${index}]`;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`${label} must be an object.`);
    }
    if (typeof candidate.file !== 'string' || !candidate.file.trim()) {
      throw new Error(`${label}.file must be a non-empty string.`);
    }
    if (
      !Object.hasOwn(candidate, 'durationSeconds') &&
      !Object.hasOwn(defaults, 'durationSeconds')
    ) {
      throw new Error(`${label} must choose durationSeconds (number or null for automatic).`);
    }

    const outputFormat = candidate.outputFormat ?? defaults.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
    const request = {
      text: candidate.text,
      durationSeconds: Object.hasOwn(candidate, 'durationSeconds')
        ? candidate.durationSeconds
        : defaults.durationSeconds,
      loop: candidate.loop ?? defaults.loop,
      promptInfluence: candidate.promptInfluence ?? defaults.promptInfluence,
      modelId: candidate.modelId ?? defaults.modelId,
      outputFormat,
    };
    try {
      normalizeSoundEffectRequest(request);
    } catch (error) {
      throw new Error(`${label}: ${error.message}`, { cause: error });
    }

    const out = resolveOutputPath(outputDir, candidate.file, label);
    validateOutputExtension(out, outputFormat, `${label}.file`);
    if (seen.has(out))
      throw new Error(`${label}.file duplicates another output: ${candidate.file}`);
    seen.add(out);
    return { out, request };
  });

  return { outputDir, candidates: planned };
}

function rejectBatchOnlyFlags(args) {
  const unsupported = [
    ['--out', args.out],
    ['--duration', args.duration],
    ['--auto-duration', args.autoDuration],
    ['--influence', args.influence],
    ['--loop', args.loop],
    ['--format', args.format],
  ].filter(([, value]) => value !== undefined && value !== false);
  if (unsupported.length > 0) {
    throw new Error(
      `With --input, put generation settings and file names in JSON; unsupported: ${unsupported
        .map(([flag]) => flag)
        .join(', ')}.`
    );
  }
}

function resolveOutputPath(outputDir, file, label) {
  if (isAbsolute(file)) throw new Error(`${label}.file must be relative to --out-dir.`);
  const out = resolve(outputDir, file);
  const fromOutputDir = relative(outputDir, out);
  if (
    fromOutputDir === '..' ||
    fromOutputDir.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  ) {
    throw new Error(`${label}.file must stay inside --out-dir.`);
  }
  return out;
}

function validateOutputExtension(path, outputFormat, label) {
  const expected = outputExtension(outputFormat);
  if (extname(path).toLowerCase() !== expected) {
    throw new Error(`${label} must end in ${expected} for output format ${outputFormat}.`);
  }
}

async function writeAudioFile(path, bytes, overwrite) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${crypto.randomUUID()}`;
  await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
  try {
    if (overwrite) {
      await rename(temporary, path);
      return true;
    }
    try {
      await link(temporary, path);
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') return false;
      if (error.code !== 'EXDEV' && error.code !== 'EPERM') throw error;
      try {
        await copyFile(temporary, path, fsConstants.COPYFILE_EXCL);
        return true;
      } catch (copyError) {
        if (copyError.code === 'EEXIST') return false;
        throw copyError;
      }
    }
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function resolveApiKey(effects) {
  const env = effects.env ?? process.env;
  if (env[API_KEY_ENV_NAME]?.trim()) return env[API_KEY_ENV_NAME].trim();
  const read = effects.readFile ?? readFile;
  const cwd = effects.cwd ?? process.cwd();
  for (const relativePath of ENV_FILE_PATHS) {
    const path = resolve(cwd, relativePath);
    try {
      const value = parseEnvValue(await read(path, 'utf8'), API_KEY_ENV_NAME);
      if (value) return value;
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`${path}: ${error.message}`, { cause: error });
    }
  }
  throw new Error(
    `Missing ${API_KEY_ENV_NAME}. Set it in the environment or a gitignored .env.local, .env, or web/.env file.`
  );
}

function parseEnvValue(source, name) {
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || match[1] !== name) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2').trim();
    return value || null;
  }
  return null;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function parseNumber(value, flag) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${flag} must be a number.`);
  return number;
}

function parseInteger(value, flag) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${flag} must be an integer.`);
  return number;
}

function printPlan(plan, dryRun) {
  console.log(`${dryRun ? 'Validated' : 'Generating'} ${plan.candidates.length} sound effect(s):`);
  for (const candidate of plan.candidates) {
    const duration =
      candidate.request.durationSeconds === null ? 'auto' : `${candidate.request.durationSeconds}s`;
    console.log(
      `- ${candidate.out} (${duration}, ${candidate.request.outputFormat}, loop=${candidate.request.loop ?? false})`
    );
  }
}

function printUsage() {
  console.log(`Generate sound effects through ElevenLabs.

One effect:
  npm run gen:sound-effect -- --text "Soft cartoon bubble pop" --duration 0.5 --out /tmp/pop.mp3
  npm run gen:sound-effect -- --text "Steady rain ambience" --auto-duration --loop

Batch:
  npm run gen:sound-effect -- --input candidates.json [--out-dir /tmp/sfx]

Options:
  --text TEXT          Generate one effect from TEXT
  --input FILE         Generate a JSON batch (see tools/elevenlabs/README.md)
  --out FILE           Single-effect output (default: a new temporary directory)
  --out-dir DIR        Batch directory or single-effect directory
  --duration SECONDS   Fixed duration from 0.5 to 30 seconds
  --auto-duration      Let ElevenLabs choose the duration
  --influence N        Prompt influence from 0 to 1 (default: 0.3)
  --loop               Ask for a seamless loop
  --format FORMAT      ElevenLabs output format (default: mp3_44100_128)
  --overwrite          Regenerate and atomically replace existing outputs
  --retries N          Retries for HTTP 429/5xx (default: 3)
  --dry-run            Validate and print the plan without an API key or API call
  -h, --help           Show this help`);
}
