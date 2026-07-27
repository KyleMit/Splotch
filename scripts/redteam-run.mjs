#!/usr/bin/env node
// Red-team the AI image-generation safety safeguards (ADR-0023).
//
// MANUAL, real-token integration test — intentionally NOT part of `npm test`.
// It boots a throwaway `vite dev` (so it exercises OUR /api/generate-image
// handler, including the 422 safety classification), decrypts the fixture
// corpus, sends each crude safe/unsafe drawing to a real Gemini call, and saves
// every input + output + a report under tests/redteam/output/<runId>/.
//
// It NEVER asserts pass/fail and always exits 0: the real verification is the
// human review of the saved images at the end. Requires REDTEAM_FIXTURE_KEY and
// GEMINI_API_KEY (in .env or exported).
//
//   npm run redteam              # the whole corpus
//   npm run redteam -- block-gun # only fixtures whose id matches (iterate on one)
//   npm run redteam -- gun text  # several patterns; substring match, case-insensitive

import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, fail, openInOS, requireEnv, waitForUrl, runId as makeRunId } from './lib/utils.mjs';
import { spawnViteServer } from './lib/vite-server.mjs';
import { decryptDir } from './lib/fixtureCrypto.mjs';
import { buildReport, verdict } from './lib/redteam-report.mjs';

const PORT = Number(process.env.REDTEAM_PORT ?? 5198);
const BASE = `http://localhost:${PORT}`;
const TOKEN = 'redteam-token';

const BASE_DIR = join(ROOT, 'web', 'tests', 'redteam');
const ENCRYPTED = join(BASE_DIR, 'encrypted');
const DECRYPTED = join(BASE_DIR, 'decrypted');
const runId = makeRunId();
const OUT_DIR = join(BASE_DIR, 'output', runId);

// The fixture's filename prefix is the single source of truth for its category:
//   safe-*  → should be allowed (a refusal is a false positive)
//   block-* → should be refused (an image returned is a potential false negative)
// Cases are discovered from the encrypted corpus, so there's no manifest to keep
// in sync — add a fixture by dropping a prefixed PNG in and re-encrypting.
function discoverCases() {
  return readdirSync(ENCRYPTED)
    .filter((f) => f.endsWith('.png.enc'))
    .map((f) => f.slice(0, -'.png.enc'.length))
    .map((id) => ({ id, expectation: id.startsWith('safe-') ? 'allow-safe' : 'block' }))
    .sort((a, b) =>
      a.expectation === b.expectation
        ? a.id.localeCompare(b.id)
        : a.expectation === 'allow-safe'
          ? -1
          : 1
    );
}

// Optional CLI filters (`npm run redteam -- block-gun text`) let you iterate on a
// single known-bad drawing without re-running the whole suite (and re-prompting
// refusals that already work). A fixture matches if any pattern equals or is a
// substring of its id, case-insensitively; the `.png`/`.enc` suffix is ignored so
// you can paste a filename straight from the corpus.
function filterCases(cases, patterns) {
  if (!patterns.length) return cases;
  const norm = (s) => s.toLowerCase().replace(/\.png(\.enc)?$/, '');
  const pats = patterns.map(norm);
  return cases.filter((c) => pats.some((p) => norm(c.id) === p || norm(c.id).includes(p)));
}

async function sendCase(c) {
  const inPath = join(DECRYPTED, `${c.id}.png`);
  if (!existsSync(inPath)) return { ...c, outcome: 'missing', status: 0, detail: '' };

  const bytes = readFileSync(inPath);
  writeFileSync(join(OUT_DIR, `${c.id}.in.png`), bytes);

  let res;
  try {
    res = await fetch(`${BASE}/api/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'X-Access-Token': TOKEN },
      body: bytes,
    });
  } catch (err) {
    return { ...c, outcome: 'error', status: 0, detail: String(err) };
  }

  if (res.status === 200) {
    const out = Buffer.from(await res.arrayBuffer());
    writeFileSync(join(OUT_DIR, `${c.id}.out.png`), out);
    return { ...c, outcome: 'image', status: 200, detail: '' };
  }
  const detail = (await res.text().catch(() => '')).slice(0, 300);
  if (res.status === 422) return { ...c, outcome: 'blocked', status: 422, detail };
  return { ...c, outcome: 'error', status: res.status, detail };
}

async function main() {
  requireEnv('GEMINI_API_KEY', 'set it in .env or export it');

  const all = discoverCases();
  if (all.length === 0) {
    fail(
      'No encrypted fixtures found in tests/redteam/encrypted/. Add safe-*/block-* PNGs and run:\n  npm run redteam:encrypt'
    );
  }

  const patterns = process.argv.slice(2);
  const cases = filterCases(all, patterns);
  if (cases.length === 0) {
    fail(
      `No fixtures matched ${JSON.stringify(patterns)}.\nAvailable ids:\n  ${all.map((c) => c.id).join('\n  ')}`
    );
  }
  if (patterns.length) {
    console.log(
      `Filter ${JSON.stringify(patterns)} → ${cases.length}/${all.length} case(s): ${cases.map((c) => c.id).join(', ')}`
    );
  }

  console.log('Decrypting fixtures…');
  // Clear any stale decrypted files from a previous corpus before re-decrypting.
  rmSync(DECRYPTED, { recursive: true, force: true });
  decryptDir(ENCRYPTED, DECRYPTED);
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('Starting throwaway dev server…');
  const { stop } = spawnViteServer(PORT, {
    env: {
      ALLOWED_TOKENS_LIST: TOKEN,
      PUBLIC_ENABLE_DEV_HARNESS: 'true',
    },
  });

  const results = [];
  try {
    await waitForUrl(`${BASE}/`, 60_000);
    console.log(`Server ready on ${BASE}\n`);
    for (const c of cases) {
      process.stdout.write(`  → ${c.id} … `);
      const r = await sendCase(c);
      const v = verdict(r.expectation, r.outcome);
      console.log(`${v.tag} ${r.outcome}${r.detail ? ` (${r.detail.split('\n')[0]})` : ''}`);
      results.push(r);
    }
  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
  } finally {
    stop();
  }

  const htmlPath = buildReport({ runId, outDir: OUT_DIR, base: BASE, results });
  const link = pathToFileURL(htmlPath).href;

  const flagged = results.filter((r) => verdict(r.expectation, r.outcome).tag === '⚠');
  console.log(`\nWrote ${results.length} result(s) to tests/redteam/output/${runId}/`);
  console.log(`  ${flagged.length} row(s) flagged ⚠ for review.`);
  console.log(`\nReview report (input → output, safe cases then block cases):`);
  console.log(`  ${link}`);

  const opened = process.env.REDTEAM_NO_OPEN ? false : openInOS(htmlPath, { detached: true });
  console.log(
    opened
      ? '\nOpening it in your default browser…'
      : '\nOpen the link above in your browser to review (set REDTEAM_NO_OPEN=1 to skip auto-open).'
  );
  console.log('This script does not pass/fail — your review is the verdict.');
}

await main();
