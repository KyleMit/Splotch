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
  reviewDescriptionDigest,
  validateCritiqueEntries,
} from './lib/page-inventory-data.mjs';
import { CHECKPOINT_SCHEMA_VERSION } from './finalize-page-critique.mjs';
import { ROOT, hasCommand, isMain, runMain } from '../lib/proc.mjs';
import {
  REVIEWER_RUNNERS,
  detectReviewerRunner,
  normalizeReviewerRunner,
  parseReviewerOutput,
  reviewerArgs,
  reviewerBinary,
  reviewerModelDefault,
  stageReviewerImage,
} from './lib/reviewer-runner.mjs';

export { reviewerArgs };

const MANIFEST_DEFAULT = join(ROOT, 'scrapbook/page-inventory/capture-manifest.json');
const WORK_DEFAULT = join(ROOT, '.scrapbook-scratch/page-inventory-critique');
const CONCURRENCY_DEFAULT = 4;
const ATTEMPTS = 2;
const REVIEW_TIMEOUT_MS = 120_000;
const REVIEW_TERMINATION_GRACE_MS = 5_000;

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
      model: { type: 'string' },
      runner: { type: 'string' },
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
  if (values.runner && !REVIEWER_RUNNERS.includes(values.runner)) {
    throw new Error(`--runner must be one of ${REVIEWER_RUNNERS.join(', ')}`);
  }
  // Resolved before the model so an unflagged run picks the model that belongs
  // to whichever reviewer is actually installed.
  const runner = values.runner ? normalizeReviewerRunner(values.runner) : detectReviewerRunner();
  return {
    manifest: resolve(ROOT, values.manifest),
    work: resolve(ROOT, values.work),
    runner,
    model: values.model ?? reviewerModelDefault(runner),
    effort: values.effort,
    concurrency: positiveInteger(values.concurrency, '--concurrency'),
    limit: values.limit ? positiveInteger(values.limit, '--limit') : Infinity,
    reviewIds: values['review-id'] ?? [],
  };
}

export function assertReviewerAvailable(binary) {
  if (!hasCommand(binary)) {
    throw new Error(`Page inventory critiques require ${binary} to be available on PATH`);
  }
}

function reviewerProcessError(message, stdout, stderr) {
  const error = new Error(message);
  error.stdout = stdout;
  error.stderr = stderr;
  return error;
}

export function runReviewerProcess({ binary, args, cwd, timeoutMs, terminationGraceMs }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(binary, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let spawnError;
    let timedOut = false;
    let forceKillTimer;
    child.stdout?.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr?.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => (spawnError = error));
    const timeout = setTimeout(() => {
      timedOut = true;
      stderr += `${stderr && !stderr.endsWith('\n') ? '\n' : ''}Reviewer timed out after ${timeoutMs} ms\n`;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => child.kill('SIGKILL'), terminationGraceMs);
    }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      clearTimeout(forceKillTimer);
      if (spawnError) {
        rejectPromise(
          reviewerProcessError(`Could not launch reviewer: ${spawnError.message}`, stdout, stderr)
        );
      } else if (timedOut) {
        rejectPromise(
          reviewerProcessError(`Reviewer timed out after ${timeoutMs} ms`, stdout, stderr)
        );
      } else if (code === 0) {
        resolvePromise({ stdout, stderr });
      } else {
        rejectPromise(
          reviewerProcessError(
            `Reviewer exited ${code ?? signal}: ${stderr.trim() || 'no stderr'}`,
            stdout,
            stderr
          )
        );
      }
    });
  });
}

function runReviewer({
  runner,
  capture,
  image,
  schema,
  schemaDocument,
  model,
  effort,
  reviewerRoot,
}) {
  const args = reviewerArgs({
    runner,
    capture,
    image: stageReviewerImage(runner, image, reviewerRoot, capture.review_id),
    schema,
    schemaDocument,
    model,
    effort,
    reviewerRoot,
  });
  return runReviewerProcess({
    binary: reviewerBinary(runner),
    args,
    cwd: reviewerRoot,
    timeoutMs: REVIEW_TIMEOUT_MS,
    terminationGraceMs: REVIEW_TERMINATION_GRACE_MS,
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
      document.schema_version !== CHECKPOINT_SCHEMA_VERSION ||
      document.review_contract !== PAGE_INVENTORY_REVIEW_CONTRACT ||
      document.review_id !== capture.review_id ||
      document.entry?.review_id !== capture.review_id ||
      document.review_description_sha256 !== reviewDescriptionDigest(capture.review_description)
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
        runner: context.runner,
        schemaDocument: REVIEW_SCHEMA,
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
      const assessment = parseReviewerOutput(result.stdout, context.runner);
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
        schema_version: CHECKPOINT_SCHEMA_VERSION,
        review_contract: PAGE_INVENTORY_REVIEW_CONTRACT,
        review_id: capture.review_id,
        review_description_sha256: reviewDescriptionDigest(capture.review_description),
        entry,
      });
      return;
    } catch (error) {
      lastError = error;
      if (error.stdout) {
        writeFileSync(
          join(context.logs, `${capture.review_id}.attempt-${attempt}.jsonl`),
          error.stdout
        );
      }
      if (error.stderr) {
        writeFileSync(
          join(context.logs, `${capture.review_id}.attempt-${attempt}.stderr`),
          error.stderr
        );
      }
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
  assertReviewerAvailable(reviewerBinary(config.runner));
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
      `Reviewing ${queue.length} capture(s) with ${reviewerBinary(config.runner)} ${config.model} at concurrency ${config.concurrency}`
    );
    await runQueue(queue, config.concurrency, (capture) =>
      reviewCapture(
        {
          manifest,
          manifestPath: config.manifest,
          runner: config.runner,
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
