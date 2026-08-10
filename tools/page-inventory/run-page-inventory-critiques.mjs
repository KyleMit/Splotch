import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import {
  PAGE_INVENTORY_REVIEW_CONTRACT,
  readCaptureManifest,
  validateCritiqueEntries,
} from './lib/page-inventory-data.mjs';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';

const MANIFEST_DEFAULT = join(ROOT, 'scrapbook/page-inventory/capture-manifest.json');
const WORK_DEFAULT = join(ROOT, '.scrapbook-scratch/page-inventory-critique');
const MODEL_DEFAULT = 'gpt-5.6-terra';
const CONCURRENCY_DEFAULT = 4;
const ATTEMPTS = 2;

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['severity', 'critique', 'recommendation', 'tags'],
  properties: {
    severity: { type: 'string', enum: ['pass', 'low', 'medium', 'high'] },
    critique: { type: 'string', minLength: 1 },
    recommendation: {
      anyOf: [{ type: 'null' }, { type: 'string', minLength: 1 }],
    },
    tags: { type: 'array', items: { type: 'string' } },
  },
};

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function options(argv) {
  const values = parseArgs({
    args: argv,
    options: {
      manifest: { type: 'string', default: MANIFEST_DEFAULT },
      work: { type: 'string', default: WORK_DEFAULT },
      model: { type: 'string', default: MODEL_DEFAULT },
      effort: { type: 'string', default: 'low' },
      concurrency: { type: 'string', default: String(CONCURRENCY_DEFAULT) },
      limit: { type: 'string' },
      'review-id': { type: 'string', multiple: true },
    },
    strict: true,
  }).values;
  if (!['low', 'medium', 'high'].includes(values.effort)) {
    throw new Error('--effort must be low, medium, or high');
  }
  return {
    manifest: resolve(ROOT, values.manifest),
    work: resolve(ROOT, values.work),
    model: values.model,
    effort: values.effort,
    concurrency: positiveInteger(values.concurrency, '--concurrency'),
    limit: values.limit ? positiveInteger(values.limit, '--limit') : Infinity,
    reviewIds: values['review-id'] ?? [],
  };
}

export function readStructuredOutput(stdout) {
  const messages = stdout
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const event = JSON.parse(line);
        return event.type === 'item.completed' && event.item?.type === 'agent_message'
          ? [event.item.text]
          : [];
      } catch {
        return [];
      }
    });
  if (!messages.length) throw new Error('reviewer returned no structured message');
  try {
    return JSON.parse(messages.at(-1));
  } catch (error) {
    throw new Error(`reviewer returned invalid JSON: ${error.message}`, { cause: error });
  }
}

export function reviewerArgs({ capture, image, schema, model, effort, reviewerRoot }) {
  return [
    'exec',
    '--json',
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--cd',
    reviewerRoot,
    '--image',
    image,
    '--output-schema',
    schema,
    '--model',
    model,
    '-c',
    `model_reasoning_effort="${effort}"`,
    '-c',
    'approval_policy="never"',
    '-c',
    'features.multi_agent=false',
    '-c',
    'features.multi_agent_v2=false',
    capture.review_description,
  ];
}

function runReviewer({ capture, image, schema, model, effort, reviewerRoot }) {
  const args = reviewerArgs({ capture, image, schema, model, effort, reviewerRoot });
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('codex', args, { cwd: reviewerRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(new Error(`reviewer exited ${code}: ${stderr.trim() || 'no stderr'}`));
    });
  });
}

function writeJsonAtomically(path, document) {
  mkdirSync(dirname(path), { recursive: true });
  const staging = mkdtempSync(join(dirname(path), `.${basename(path)}-staging-`));
  const candidate = join(staging, basename(path));
  try {
    writeFileSync(candidate, `${JSON.stringify(document, null, 2)}\n`);
    renameSync(candidate, path);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function currentCheckpoint(path, capture, manifest) {
  if (!existsSync(path)) return false;
  try {
    const document = JSON.parse(readFileSync(path, 'utf8'));
    if (
      document.schema_version !== 3 ||
      document.review_contract !== PAGE_INVENTORY_REVIEW_CONTRACT ||
      document.review_id !== capture.review_id ||
      document.entry?.review_id !== capture.review_id
    ) {
      return false;
    }
    validateCritiqueEntries([document.entry], manifest, { allowPartial: true });
    return true;
  } catch {
    return false;
  }
}

async function reviewCapture(context, capture) {
  const checkpoint = join(context.reviews, `${capture.review_id}.json`);
  const image = join(dirname(context.manifestPath), capture.image);
  if (!existsSync(image)) throw new Error(`missing review image: ${image}`);
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const result = await runReviewer({
        capture,
        image,
        schema: context.schema,
        model: context.model,
        effort: context.effort,
        reviewerRoot: context.reviewerRoot,
      });
      writeFileSync(join(context.logs, `${capture.review_id}.jsonl`), result.stdout);
      if (result.stderr)
        writeFileSync(join(context.logs, `${capture.review_id}.stderr`), result.stderr);
      const assessment = readStructuredOutput(result.stdout);
      const entry = {
        review_id: capture.review_id,
        image: capture.image,
        sha256: capture.sha256,
        severity: assessment.severity,
        critique: assessment.critique,
        recommendation: assessment.recommendation,
        tags: assessment.tags,
      };
      validateCritiqueEntries([entry], context.manifest, { allowPartial: true });
      writeJsonAtomically(checkpoint, {
        schema_version: 3,
        review_contract: PAGE_INVENTORY_REVIEW_CONTRACT,
        review_id: capture.review_id,
        entry,
      });
      return;
    } catch (error) {
      lastError = error;
      console.warn(`${capture.review_id} attempt ${attempt}/${ATTEMPTS} failed: ${error.message}`);
    }
  }
  throw lastError;
}

async function runQueue(queue, concurrency, worker) {
  let cursor = 0;
  let completed = 0;
  const failures = [];
  async function consume() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= queue.length) return;
      const capture = queue[index];
      try {
        await worker(capture);
        completed += 1;
        console.log(`[${completed}/${queue.length}] ${capture.review_id}`);
      } catch (error) {
        failures.push(`${capture.review_id}: ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, consume));
  if (failures.length) {
    throw new Error(
      `Failed ${failures.length} review(s):\n${failures.map((error) => `- ${error}`).join('\n')}`
    );
  }
}

export async function runPageInventoryCritiques(argv = process.argv.slice(2)) {
  const config = options(argv);
  const manifest = readCaptureManifest(config.manifest);
  const reviews = join(config.work, 'reviews');
  const logs = join(config.work, 'logs');
  mkdirSync(reviews, { recursive: true });
  mkdirSync(logs, { recursive: true });
  const reviewerRoot = mkdtempSync(join(tmpdir(), 'splotch-page-inventory-review-'));
  try {
    const schema = join(reviewerRoot, 'review-output.schema.json');
    writeFileSync(schema, `${JSON.stringify(REVIEW_SCHEMA, null, 2)}\n`);
    const selected = config.reviewIds.length
      ? manifest.captures.filter((capture) => config.reviewIds.includes(capture.review_id))
      : manifest.captures;
    if (config.reviewIds.length && selected.length !== new Set(config.reviewIds).size) {
      throw new Error('One or more --review-id values are absent from the capture manifest');
    }
    const queue = selected
      .filter(
        (capture) =>
          !currentCheckpoint(join(reviews, `${capture.review_id}.json`), capture, manifest)
      )
      .slice(0, config.limit);
    if (!queue.length) {
      console.log('All selected page-inventory reviews are current.');
      return;
    }
    console.log(
      `Reviewing ${queue.length} capture(s) with ${config.model} at concurrency ${config.concurrency}`
    );
    await runQueue(queue, config.concurrency, (capture) =>
      reviewCapture(
        {
          manifest,
          manifestPath: config.manifest,
          reviews,
          logs,
          reviewerRoot,
          schema,
          model: config.model,
          effort: config.effort,
        },
        capture
      )
    );
  } finally {
    rmSync(reviewerRoot, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) runMain(runPageInventoryCritiques);
