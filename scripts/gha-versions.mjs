// Surveys the GitHub Actions pinned across .github/workflows/ and reports
// version drift — the GHA half of the dependency-update flow (issue #231), so
// the dependency-update-audit skill can bump outdated Action pins alongside the
// npm packages `npm outdated` surfaces.
//
//   node scripts/gha-versions.mjs                 offline: inventory + flag pins
//                                                 stuck at inconsistent versions
//   node scripts/gha-versions.mjs --check-latest  also query each action's latest
//                                                 upstream release tag (network)
//   node scripts/gha-versions.mjs --json          machine-readable inventory
//
// Two findings need no network and are always reported:
//   * inconsistent pins — the same action pinned at >1 version across workflows
//     (e.g. actions/checkout at @v7 in most files but @v4 in one).
// With --check-latest it additionally flags any pin whose major trails the
// latest published release. The GitHub API is hit best-effort per action; a
// lookup that fails (rate limit, no releases, offline) degrades to "unknown"
// rather than aborting the report. GITHUB_TOKEN, if set, raises the rate limit.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/utils.mjs';

const WORKFLOWS_DIR = join(ROOT, '.github', 'workflows');

// Pull the `owner/repo[/subpath]@ref` out of one `uses:` value. Returns null for
// local (`./...`) and docker (`docker://...`) actions, which have no upstream
// release to track. An inline `# v1.2.3` comment (how SHA pins record their tag)
// is captured as `hint`.
export function parseUses(value) {
  const cleaned = value
    .trim()
    .replace(/^-\s*/, '')
    .replace(/^uses:\s*/, '');
  const match = cleaned.match(/^([\w.-]+\/[\w./-]+)@(\S+)(?:\s+#\s*(.+?))?\s*$/);
  if (!match) return null;
  const [, slug, ref, hint] = match;
  if (slug.startsWith('./') || slug.startsWith('docker:')) return null;
  const [owner, repo] = slug.split('/');
  return { action: `${owner}/${repo}`, slug, ref, hint: hint?.trim() };
}

// Collect every `uses:` pin from a single workflow file's text.
export function collectPins(text) {
  const pins = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!/^\s*(-\s*)?uses:\s*\S/.test(line)) return;
    const parsed = parseUses(line);
    if (parsed) pins.push({ ...parsed, line: i + 1 });
  });
  return pins;
}

// Highest leading integer (major) in a ref like `v7`, `v7.1.2`, or `7`.
function majorOf(ref) {
  const m = ref.match(/^v?(\d+)/);
  return m ? Number(m[1]) : null;
}

function listWorkflowFiles() {
  if (!existsSync(WORKFLOWS_DIR)) return [];
  return readdirSync(WORKFLOWS_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort();
}

// action -> { refs: Map<ref, [{file, line}]> }
export function buildInventory(files) {
  const inventory = new Map();
  for (const file of files) {
    const pins = collectPins(readFileSync(join(WORKFLOWS_DIR, file), 'utf8'));
    for (const pin of pins) {
      if (!inventory.has(pin.action)) inventory.set(pin.action, { refs: new Map() });
      const refs = inventory.get(pin.action).refs;
      if (!refs.has(pin.ref)) refs.set(pin.ref, []);
      refs.get(pin.ref).push({ file, line: pin.line });
    }
  }
  return inventory;
}

async function fetchLatestTag(action) {
  const headers = { 'user-agent': 'splotch-gha-versions', accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${action}/releases/latest`, { headers });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body.tag_name === 'string' ? body.tag_name : null;
  } catch {
    return null;
  }
}

function refSummary(refs) {
  return [...refs.entries()].map(([ref, uses]) => `${ref} (${uses.length}×)`).join(', ');
}

async function main() {
  const args = process.argv.slice(2);
  const checkLatest = args.includes('--check-latest');
  const asJson = args.includes('--json');

  const files = listWorkflowFiles();
  const inventory = buildInventory(files);

  if (inventory.size === 0) {
    console.log('No GitHub Actions pins found under .github/workflows/.');
    return;
  }

  const actions = [...inventory.keys()].sort();
  const inconsistent = actions.filter((a) => inventory.get(a).refs.size > 1);

  const latest = new Map();
  if (checkLatest) {
    console.error(`Checking ${actions.length} actions against their latest releases…`);
    for (const action of actions) latest.set(action, await fetchLatestTag(action));
  }

  if (asJson) {
    const out = actions.map((action) => ({
      action,
      refs: [...inventory.get(action).refs.entries()].map(([ref, uses]) => ({ ref, uses })),
      latest: checkLatest ? (latest.get(action) ?? null) : undefined,
    }));
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log(
    `\nGitHub Actions pinned across .github/workflows/ (${actions.length} actions, ${files.length} files)\n`
  );
  for (const action of actions) {
    const { refs } = inventory.get(action);
    let line = `  ${action.padEnd(42)} ${refSummary(refs)}`;
    if (refs.size > 1) line += '  ⚠ inconsistent';
    if (checkLatest) {
      const tag = latest.get(action);
      if (!tag) {
        line += '   latest: unknown';
      } else {
        const latestMajor = majorOf(tag);
        const behind = [...refs.keys()].filter((r) => {
          const m = majorOf(r);
          return m !== null && latestMajor !== null && m < latestMajor;
        });
        line += behind.length
          ? `   ⚠ behind latest ${tag} (${behind.join(', ')})`
          : `   latest ${tag} ✓`;
      }
    }
    console.log(line);
  }

  if (inconsistent.length) {
    console.log(`\n⚠ ${inconsistent.length} action(s) pinned at multiple versions:`);
    for (const action of inconsistent) {
      const { refs } = inventory.get(action);
      for (const [ref, uses] of refs.entries()) {
        console.log(
          `    ${action}@${ref}  —  ${uses.map((u) => `${u.file}:${u.line}`).join(', ')}`
        );
      }
    }
  }

  if (!checkLatest) {
    console.log(
      '\nRun with --check-latest to compare each pin against its latest upstream release.'
    );
  }
  console.log('');
}

// Only drive the CLI when run directly — importing this module for its parsing
// helpers (e.g. tests) must not print a report.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
