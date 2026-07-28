// Locks in the docs/AUDIT.md surgery in scripts/audit-burndown/lib.mjs — the
// only code allowed to edit the backlog during a burndown run (hundreds of
// sequential edits against one ~19k-line file), so a parsing or seam
// regression here corrupts it silently. The invariants under test: an entry is
// the block from its `### [` heading to the next `### [`/`## ` boundary,
// deletion is a pure block removal that leaves every other byte intact, and
// the file stays dprint-clean (no runs of blank lines) after every deletion.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  briefIsStale,
  commandFailureOutput,
  countEntries,
  DEFAULT_MAX_ISSUES,
  deferralReason,
  deleteEntryByTitle,
  deleteFirstEntry,
  draftPatchPath,
  findingPriority,
  getEntry,
  incompleteAuditCommitPlan,
  implementationCommitMessage,
  launchCommand,
  lintablePaths,
  needsRulerApply,
  normalizeDraftPatch,
  protectedImplementationPaths,
  reachedHandledLimit,
  removeNewUntrackedPaths,
  renderDeferralNotes,
  resolveImplSha,
} from '../audit-burndown/lib.mjs';

// Built from a line array so the fenced code block inside the first finding
// doesn't fight the template literal.
const FIXTURE_LINES = [
  '# Audit',
  '',
  '> Transient staging for audit findings — test fixture.',
  '',
  '## Source: Code audit — Area one',
  '',
  '### [P1][complexity] First finding',
  '',
  '**File(s):** `web/src/a.ts` — pinned at SHA abc1234',
  '',
  '#### Problem',
  '',
  'First body with a code fence:',
  '',
  '```ts',
  'const kept = 1;',
  '',
  '',
  'const twoBlankLinesAboveAreLegal = true;',
  '```',
  '',
  '---',
  '',
  '### [P2][dead-code] Second finding',
  '',
  '#### Problem',
  '',
  'Second body.',
  '',
  '---',
  '',
  '## Source: Code audit — Area two',
  '',
  '### [P3][readability] Third finding',
  '',
  '#### Problem',
  '',
  'Third body.',
  '',
];
const FIXTURE = FIXTURE_LINES.join('\n');

let dir;
let file;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'audit-lib-'));
  file = join(dir, 'AUDIT.md');
  writeFileSync(file, FIXTURE);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const content = () => readFileSync(file, 'utf8');
const missing = () => join(dir, 'nope.md');

describe('countEntries', () => {
  it('counts the bracketed level-3 headings', () => {
    expect(countEntries(file)).toBe(3);
  });

  it('returns null for a missing file', () => {
    expect(countEntries(missing())).toBeNull();
  });
});

describe('getEntry', () => {
  it('returns the first block up to the next entry heading, separator included', () => {
    const entry = getEntry(1, file);
    expect(entry.startsWith('### [P1][complexity] First finding')).toBe(true);
    expect(entry).toContain('pinned at SHA abc1234');
    expect(entry).toContain('twoBlankLinesAboveAreLegal');
    expect(entry).toContain('\n---');
    expect(entry).not.toContain('### [P2]');
  });

  it('ends an entry at a section boundary, not just at the next entry', () => {
    const entry = getEntry(2, file);
    expect(entry.startsWith('### [P2][dead-code] Second finding')).toBe(true);
    expect(entry).not.toContain('## Source');
  });

  it('runs the last entry to end of file', () => {
    expect(getEntry(3, file)).toContain('Third body.');
  });

  it('returns null out of range and for a missing file', () => {
    expect(getEntry(0, file)).toBeNull();
    expect(getEntry(4, file)).toBeNull();
    expect(getEntry(1, missing())).toBeNull();
  });
});

describe('deleteFirstEntry', () => {
  it('is a pure block removal — the next entry is promoted byte-for-byte', () => {
    const secondBefore = getEntry(2, file);
    expect(deleteFirstEntry(file)).toBe(true);
    expect(countEntries(file)).toBe(2);
    expect(getEntry(1, file)).toBe(secondBefore);
    expect(content()).not.toContain('First finding');
  });

  it('leaves headers, section headings, and other findings intact', () => {
    deleteFirstEntry(file);
    const after = content();
    expect(after.startsWith('# Audit\n')).toBe(true);
    expect(after).toContain('## Source: Code audit — Area one');
    expect(after).toContain('## Source: Code audit — Area two');
    expect(after).toContain('Second body.');
    expect(after).toContain('Third body.');
  });

  it('keeps the file dprint-clean after every deletion — no blank-line runs', () => {
    while (countEntries(file) > 0) {
      deleteFirstEntry(file);
      expect(content()).not.toContain('\n\n\n');
    }
  });

  it('drains in order and ends drained files with a single newline', () => {
    deleteFirstEntry(file);
    deleteFirstEntry(file);
    expect(getEntry(1, file).startsWith('### [P3]')).toBe(true);
    deleteFirstEntry(file);
    expect(countEntries(file)).toBe(0);
    expect(content().endsWith('\n')).toBe(true);
    expect(content().endsWith('\n\n')).toBe(false);
  });

  it('returns false and changes nothing on a drained or missing file', () => {
    for (let i = 0; i < 3; i++) deleteFirstEntry(file);
    const drained = content();
    expect(deleteFirstEntry(file)).toBe(false);
    expect(content()).toBe(drained);
    expect(deleteFirstEntry(missing())).toBe(false);
  });
});

// The driver deletes by title, never by position. A role that deletes the entry
// itself used to make the driver's positional delete fall through onto the next,
// never-verified finding and destroy it — three times in five on the 2026-07-25
// canary. These lock the identity keying that makes that impossible.
describe('deleteEntryByTitle', () => {
  const SECOND = '[P2][dead-code] Second finding';

  it('removes the named entry from the middle, leaving its neighbours intact', () => {
    const first = getEntry(1, file);
    const third = getEntry(3, file);
    expect(deleteEntryByTitle(SECOND, file)).toBe(true);
    expect(countEntries(file)).toBe(2);
    expect(getEntry(1, file)).toBe(first);
    expect(getEntry(2, file)).toBe(third);
    expect(content()).not.toContain('Second body.');
  });

  it('is a no-op when the entry is already gone — it never falls through to another', () => {
    deleteEntryByTitle(SECOND, file);
    const after = content();
    expect(deleteEntryByTitle(SECOND, file)).toBe(false);
    expect(content()).toBe(after);
    expect(countEntries(file)).toBe(2);
  });

  it('matches the whole title exactly, not a prefix or substring', () => {
    expect(deleteEntryByTitle('[P2][dead-code] Second', file)).toBe(false);
    expect(deleteEntryByTitle('Second finding', file)).toBe(false);
    expect(deleteEntryByTitle(`### ${SECOND}`, file)).toBe(false);
    expect(countEntries(file)).toBe(3);
  });

  // The fixture's first entry holds two blank lines inside a code fence, which
  // are legal and must survive — so this drains it too rather than asserting
  // against a file that still contains them.
  it('keeps the file dprint-clean and returns false on a missing file', () => {
    deleteEntryByTitle(SECOND, file);
    expect(deleteEntryByTitle('[P1][complexity] First finding', file)).toBe(true);
    expect(content()).not.toContain('\n\n\n');
    expect(countEntries(file)).toBe(1);
    expect(deleteEntryByTitle(SECOND, missing())).toBe(false);
  });
});

// Drives impl-model tiering in burndown.mjs: P4/P5 route to the cheaper model,
// everything else (including an untagged title) stays on the stronger one. A
// regression here silently downgrades the model for consequential findings.
describe('findingPriority', () => {
  it('reads the priority off a normal finding title', () => {
    expect(findingPriority('[P1][complexity] Split initDrawingCanvas')).toBe(1);
    expect(findingPriority('[P4][naming] Comments point to storage.js')).toBe(4);
    expect(findingPriority('[P5][dead-code] Unused export')).toBe(5);
  });

  it('returns null for a title with no [P<n>] tag, so the caller keeps the safe model', () => {
    expect(findingPriority('[dead-code] Unused export')).toBeNull();
    expect(findingPriority('Split initDrawingCanvas')).toBeNull();
    expect(findingPriority('')).toBeNull();
    expect(findingPriority(undefined)).toBeNull();
  });

  it('only reads a leading tag, not a [P<n>] appearing later in the title', () => {
    expect(findingPriority('[dedupe] see the [P2] finding above')).toBeNull();
  });
});

// A missing sha used to mean "roll back and defer", which twice discarded a
// complete, committed, test-passing fix because the implementer just left the
// optional field out of its structured output (~$4 of Opus work in one case).
// git is the source of truth for whether a commit happened; the envelope is not.
describe('resolveImplSha', () => {
  const baseSha = 'a'.repeat(40);
  const head = 'b'.repeat(40);

  it('prefers the sha the implementer reported', () => {
    expect(resolveImplSha({ reported: head, head: 'c'.repeat(40), baseSha })).toBe(head);
  });

  it('recovers a committed fix whose sha the implementer forgot to report', () => {
    expect(resolveImplSha({ reported: '', head, baseSha })).toBe(head);
  });

  it('stays empty when HEAD never moved, so a genuine no-op still defers', () => {
    expect(resolveImplSha({ reported: '', head: baseSha, baseSha })).toBe('');
    expect(resolveImplSha({ reported: '', head: '', baseSha })).toBe('');
  });
});

describe('Codex driver-owned commits', () => {
  it('keeps the finding identity in the deterministic commit message', () => {
    const title = '[P3][maintainability] Name the shared ring width';
    expect(implementationCommitMessage(title)).toBe(
      `fix(audit): Name the shared ring width\n\nAudit: ${title}`
    );
    expect(implementationCommitMessage(title, 2)).toContain(
      'fix(audit): address review round 2 for Name the shared ring width'
    );
  });

  it('blocks model edits to driver-owned audit state while allowing source changes', () => {
    expect(
      protectedImplementationPaths([
        'web/src/lib/example.ts',
        'docs/AUDIT.md',
        'docs/AUDIT-DEFERRED.md',
        'docs/audit-deferred/rejected.patch',
      ])
    ).toEqual(['docs/AUDIT.md', 'docs/AUDIT-DEFERRED.md', 'docs/audit-deferred/rejected.patch']);
  });

  it('regenerates agent outputs only when a Ruler source changed', () => {
    expect(needsRulerApply(['web/src/app.css', '.ruler/skills/design/SKILL.md'])).toBe(true);
    expect(needsRulerApply(['.ruler'])).toBe(true);
    expect(needsRulerApply(['.agents/skills/design/SKILL.md', 'web/src/app.css'])).toBe(false);
  });
});

describe('lint gate file selection', () => {
  const present = (kept) => (path) => kept.includes(path);

  it('keeps lintable source files that still exist', () => {
    const paths = ['web/src/a.ts', 'web/src/B.svelte', 'scripts/c.mjs', 'scripts/d.cjs', 'e.js'];
    expect(lintablePaths(paths, present(paths))).toEqual(paths);
  });

  it('drops non-lintable extensions', () => {
    expect(
      lintablePaths(['docs/AUDIT.md', 'a/b.json', 'a/c.webp', 'web/src/d.ts'], () => true)
    ).toEqual(['web/src/d.ts']);
  });

  // A rename reports both sides; only the destination is on disk. Passing the
  // rename-from path to eslint exits 2 and reddens the gate unrecoverably.
  it('drops the rename-from path so a rename-only fix can pass the gate', () => {
    expect(
      lintablePaths(
        ['idea/code/tmp-rects.mjs', 'idea/code/rects.mjs'],
        present(['idea/code/rects.mjs'])
      )
    ).toEqual(['idea/code/rects.mjs']);
  });

  it('drops deleted files, leaving nothing to lint for a delete-only fix', () => {
    expect(lintablePaths(['idea/code/gone.mjs'], () => false)).toEqual([]);
  });
});

describe('failed implementation cleanup', () => {
  it('removes only untracked paths introduced by the current implementation', () => {
    const removed = [];
    const added = removeNewUntrackedPaths(
      ['notes/local.txt', 'scratch/existing.txt'],
      [
        'notes/local.txt',
        'scratch/existing.txt',
        'web/src/new-helper.ts',
        'web/src/new-helper.test.ts',
      ],
      (path) => removed.push(path)
    );

    expect(added).toEqual(['web/src/new-helper.ts', 'web/src/new-helper.test.ts']);
    expect(removed).toEqual(added);
  });
});

describe('incomplete audit commit recovery', () => {
  const title = '[P3][maintainability] Name the shared ring width';
  const otherTitle = '[P4][readability] Rename the palette helper';
  const baseSha = 'a'.repeat(40);
  const initialSha = 'b'.repeat(40);
  const roundOneSha = 'c'.repeat(40);
  const roundTwoSha = 'd'.repeat(40);
  const previousSha = 'e'.repeat(40);
  const pendingAudit = `${FIXTURE}\n### ${title}\n\n#### Problem\n\nRepeated magic number.\n`;

  const plan = (headSha, commits, auditBody = pendingAudit) =>
    incompleteAuditCommitPlan({
      headSha,
      auditBody,
      commitAt: (sha) => commits.get(sha),
    });

  it('rewinds a clean initial implementation whose exact finding remains pending', () => {
    const commits = new Map([
      [
        initialSha,
        {
          message: implementationCommitMessage(title),
          parentSha: baseSha,
        },
      ],
      [baseSha, { message: 'chore: previous work', parentSha: previousSha }],
    ]);

    expect(plan(initialSha, commits)).toEqual({ title, baseSha, count: 1 });
  });

  it('rewinds the complete contiguous repair chain to the finding base', () => {
    const commits = new Map([
      [
        roundTwoSha,
        {
          message: implementationCommitMessage(title, 2),
          parentSha: roundOneSha,
        },
      ],
      [
        roundOneSha,
        {
          message: implementationCommitMessage(title, 1),
          parentSha: initialSha,
        },
      ],
      [
        initialSha,
        {
          message: implementationCommitMessage(title),
          parentSha: baseSha,
        },
      ],
      [
        baseSha,
        {
          message: implementationCommitMessage(otherTitle),
          parentSha: previousSha,
        },
      ],
    ]);

    expect(plan(roundTwoSha, commits)).toEqual({ title, baseSha, count: 3 });
  });

  it('preserves an approved commit after its exact audit entry was removed', () => {
    const commits = new Map([
      [
        initialSha,
        {
          message: implementationCommitMessage(title),
          parentSha: baseSha,
        },
      ],
    ]);

    expect(plan(initialSha, commits, FIXTURE)).toBeNull();
  });

  it('does not confuse a title mentioned in prose with a pending entry heading', () => {
    const commits = new Map([
      [
        initialSha,
        {
          message: implementationCommitMessage(title),
          parentSha: baseSha,
        },
      ],
    ]);

    expect(plan(initialSha, commits, `${FIXTURE}\nSee ${title} for context.\n`)).toBeNull();
  });
});

describe('gate failure output', () => {
  it('strips terminal color and keeps the actionable tail within the prompt budget', () => {
    const output = commandFailureOutput(
      {
        status: 1,
        stdout: `prefix\n\u001b[31mExpected ring width 4.5px\u001b[0m\n${'x'.repeat(40)}`,
        stderr: 'trace tail',
      },
      60
    );
    expect(output).not.toContain('\u001b');
    expect(output).toContain('trace tail');
    expect(output.length).toBe(61);
    expect(output.startsWith('…')).toBe(true);
  });

  it('reports an exit status when a command produced no text', () => {
    expect(commandFailureOutput({ status: 2, stdout: '', stderr: '' })).toBe('command exited 2');
  });
});

// The reason lands in a docs/AUDIT-DEFERRED.md commit message that someone
// reads months later to decide whether to re-stage the finding. Attributing a
// tooling failure to the reviewer sends them hunting a quality problem that
// never existed — the same bug class that already bit this driver twice.
// Guards the seam where a VALID verdict with no brief write would hand the
// implementer the PREVIOUS finding's brief — the failure that destroys an
// unrelated backlog entry by title, which deleteEntryByTitle cannot detect.
describe('briefIsStale', () => {
  const issueWrittenAt = 1_000;

  it('accepts a brief the verifier wrote after this finding was staged', () => {
    expect(briefIsStale(issueWrittenAt, issueWrittenAt + 1)).toBe(false);
  });

  it('rejects a brief left over from the previous finding', () => {
    expect(briefIsStale(issueWrittenAt, issueWrittenAt - 1)).toBe(true);
  });

  it('treats an untouched brief as stale rather than assuming a same-ms rewrite', () => {
    expect(briefIsStale(issueWrittenAt, issueWrittenAt)).toBe(true);
  });

  it('treats a missing brief as stale', () => {
    expect(briefIsStale(issueWrittenAt, null)).toBe(true);
    expect(briefIsStale(issueWrittenAt, undefined)).toBe(true);
  });
});

describe('deferralReason', () => {
  const gateRed = { reason: 'fix broke the test suite', detail: 'npm run test:unit is red' };

  it('blames the reviewer only for a genuine rejection', () => {
    expect(deferralReason({})).toBe('failed adversarial review');
  });

  it('says the reviewer never ran rather than calling the work rejected', () => {
    expect(deferralReason({ reviewUnavailable: true })).toBe('reviewer unavailable');
  });

  it('names the gate that stayed red', () => {
    expect(deferralReason({ gateRed })).toBe('fix broke the test suite');
  });

  it('names a failed implementer round ahead of an earlier round’s gate result', () => {
    expect(deferralReason({ implFailed: true, gateRed })).toBe(
      'implementer failed to deliver a fix round'
    );
  });

  it('reports an unavailable reviewer ahead of every other cause', () => {
    expect(deferralReason({ reviewUnavailable: true, implFailed: true, gateRed })).toBe(
      'reviewer unavailable'
    );
  });
});

// The launch command is the one fact about a run that cannot be recovered from
// git, the PR, or docs/AUDIT.md — and it cannot be scraped from `ps` either,
// because `env VAR=… node …` execs node and the overrides never enter argv. The
// driver records this at startup; the PreCompact hook reads it back.
describe('launchCommand', () => {
  // The bare case must render the driver's own canary default, not a full-run
  // number: an unset MAX_ISSUES means burndown.mjs runs 5 findings, and a recorded
  // command reading `-- 600` would relaunch a run 120x longer than the one it
  // claims to reproduce.
  it('emits a bare relaunch at the driver default when nothing was overridden', () => {
    expect(launchCommand({})).toBe(`npm run audit:burndown:overnight -- ${DEFAULT_MAX_ISSUES}`);
  });

  it('carries MAX_ISSUES through as the run length argument', () => {
    expect(launchCommand({ MAX_ISSUES: '50' })).toBe('npm run audit:burndown:overnight -- 50');
  });

  // How the driver actually calls it: it passes the count it already resolved,
  // so the recorded command cannot drift from the run in progress.
  it('prefers an explicitly passed count over the environment', () => {
    expect(launchCommand({ MAX_ISSUES: '600' }, 5)).toBe('npm run audit:burndown:overnight -- 5');
  });

  // Dropped from the forwarded job env once already: preflight inherits the full
  // env and passes, so a missing knob only surfaces as the driver burning down
  // the wrong file, unattended.
  it('records AUDIT_FILE, which retargets the whole run', () => {
    expect(launchCommand({ AUDIT_FILE: 'docs/OTHER.md' })).toContain("AUDIT_FILE='docs/OTHER.md'");
  });

  // Same failure shape: a relaunch that forgets the store writes its per-commit
  // comments somewhere the agent draining them is not looking.
  it('records COMMENT_STORE, which relocates the pending-comment records', () => {
    expect(launchCommand({ COMMENT_STORE: 'docs/PENDING.jsonl' })).toContain(
      "COMMENT_STORE='docs/PENDING.jsonl'"
    );
  });

  it('records the agent runner so a Codex run never resumes through Claude', () => {
    expect(launchCommand({ AGENT_RUNNER: 'codex' })).toContain("AGENT_RUNNER='codex'");
  });

  it('records the handled-outcome checkpoint for bounded detached segments', () => {
    expect(launchCommand({ MAX_HANDLED: '5' })).toContain("MAX_HANDLED='5'");
  });

  it('records every non-default knob as a shell-quoted assignment', () => {
    expect(launchCommand({ MAX_ISSUES: '600', BRANCH: 'audit/other', EFFORT_REVIEW: 'high' })).toBe(
      "BRANCH='audit/other' EFFORT_REVIEW='high' npm run audit:burndown:overnight -- 600"
    );
  });

  it('quotes a command knob containing spaces so it survives a copy-paste relaunch', () => {
    expect(launchCommand({ E2E_CMD: 'npm run test:e2e -- --retries=1' })).toContain(
      "E2E_CMD='npm run test:e2e -- --retries=1'"
    );
  });

  it('escapes an embedded single quote rather than terminating the assignment', () => {
    expect(launchCommand({ PUSH_TEST_CMD: "sh -c 'npm test'" })).toContain(
      "PUSH_TEST_CMD='sh -c '\\''npm test'\\'''"
    );
  });

  it('ignores env vars that are not run knobs', () => {
    expect(launchCommand({ HOME: '/root', PATH: '/usr/bin' })).toBe(
      `npm run audit:burndown:overnight -- ${DEFAULT_MAX_ISSUES}`
    );
  });
});

describe('reachedHandledLimit', () => {
  it('counts fixes, drops, and deferrals toward one segment boundary', () => {
    expect(reachedHandledLimit({ fixed: 2, dropped: 1, deferred: 2, maxHandled: 5 })).toBe(true);
    expect(reachedHandledLimit({ fixed: 4, dropped: 0, deferred: 0, maxHandled: 5 })).toBe(false);
  });

  it('keeps zero, invalid, and omitted limits unbounded', () => {
    expect(reachedHandledLimit({ fixed: 20, maxHandled: 0 })).toBe(false);
    expect(reachedHandledLimit({ fixed: 20, maxHandled: 'nope' })).toBe(false);
    expect(reachedHandledLimit({ fixed: 20 })).toBe(false);
  });
});

describe('draftPatchPath', () => {
  it('slugs a tagged finding title into a patch path under the draft dir', () => {
    expect(draftPatchPath('[P2][type-safety] Native page hand-rolls type guards')).toBe(
      'docs/audit-deferred/p2-type-safety-native-page-hand-rolls-type-guards.patch'
    );
  });

  it('strips backticks and punctuation rather than emitting them into a filename', () => {
    expect(draftPatchPath('[P4] `COLOR_ICONS` is a 24-entry allowlist!')).toBe(
      'docs/audit-deferred/p4-color-icons-is-a-24-entry-allowlist.patch'
    );
  });

  it('never ends the slug on a separator when the title is truncated', () => {
    const path = draftPatchPath(`[P1] ${'word '.repeat(40)}`);
    expect(path).not.toMatch(/-\.patch$/);
  });

  it('falls back to a placeholder rather than producing a dotfile', () => {
    expect(draftPatchPath('!!!')).toBe('docs/audit-deferred/untitled.patch');
  });
});

describe('normalizeDraftPatch', () => {
  it('removes whitespace-only context rows without changing substantive patch lines', () => {
    const patch = ['diff --git a/a b/a', ' unchanged', ' ', '+added  ', '', ''].join('\n');

    expect(normalizeDraftPatch(patch)).toBe(
      ['diff --git a/a b/a', ' unchanged', '', '+added  ', ''].join('\n')
    );
  });
});

describe('renderDeferralNotes', () => {
  it('records the reviewer objections that actually stopped the fix', () => {
    const notes = renderDeferralNotes({
      why: 'failed adversarial review after 2 fix rounds',
      catches: ['`Icon.svelte:61` — widening `class` lets an array render as `a,b`'],
    });
    expect(notes).toContain('#### Why it was deferred');
    expect(notes).toContain('failed adversarial review after 2 fix rounds');
    expect(notes).toContain("Reviewer's unresolved objections:");
    expect(notes).toContain('- `Icon.svelte:61`');
  });

  it('numbers each round when more than one was tried, so the order is legible', () => {
    const notes = renderDeferralNotes({ why: 'x', tried: ['first pass', 'second pass'] });
    expect(notes).toContain('1. first pass');
    expect(notes).toContain('2. second pass');
  });

  it('does not number a single attempt', () => {
    const notes = renderDeferralNotes({ why: 'x', tried: ['only pass'] });
    expect(notes).toContain('only pass');
    expect(notes).not.toContain('1. only pass');
  });

  it('points at the draft and says it is applyable, not scrap', () => {
    const notes = renderDeferralNotes({
      why: 'x',
      patchPath: 'docs/audit-deferred/thing.patch',
      draftCommits: 3,
    });
    expect(notes).toContain('#### Draft implementation');
    expect(notes).toContain('(3 commits)');
    expect(notes).toContain('git apply docs/audit-deferred/thing.patch');
  });

  it('omits the draft section entirely when nothing was committed', () => {
    const notes = renderDeferralNotes({ why: 'implementation failed', tried: ['brief was wrong'] });
    expect(notes).not.toContain('#### Draft implementation');
  });

  it('names a red gate as the gate rather than as a review rejection', () => {
    const notes = renderDeferralNotes({
      why: 'fix broke the type-check',
      gateDetail: 'npm run check is red',
      patchPath: 'docs/audit-deferred/thing.patch',
    });
    expect(notes).toContain('gates were red at the final round: npm run check is red');
    expect(notes).not.toContain('review is what it did not pass');
  });

  it('never claims a reason it was not given', () => {
    expect(renderDeferralNotes()).toContain('No reason recorded.');
  });
});
