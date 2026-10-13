// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { QUALITY_COMMANDS, runQualityChecks, summarize } from '../run-quality-checks.mjs';
import { jobBlock, runCommandsIn, testWorkflow } from './workflow-job-steps.mjs';

// `npm run check:quality` exists so the Quality job is reproducible before pushing —
// which it only is while it runs the same commands. The workflow is YAML and
// cannot import the list, so the two sides are compared here instead: a step
// added to CI and not to the script leaves the script quietly under-checking,
// which is the exact failure it was written to prevent.
const repoRoot = join(import.meta.dirname, '..', '..', '..');
const pnpmWorkspace = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
const dependenciesDoc = readFileSync(join(repoRoot, 'docs/DEPENDENCIES.md'), 'utf8');
const dependencyAuditCommand = 'pnpm audit --audit-level=high';

// ADR-0031 caps an audit exception's life at this many days past its approval.
const EXCEPTION_REVIEW_WINDOW_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXCEPTIONS_HEADING = /^### Active dependency-audit status and exceptions\b/;
const GHSA_ID = /^GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}$/;
const REQUIRED_RECORD_FIELDS = [
  'Advisory',
  'Locked paths',
  'Upstream evidence',
  'Reachability',
  'Approved',
  'Review by',
  'Removal trigger',
];

/** The `auditConfig.ignoreGhsas` entries in pnpm-workspace.yaml, read without a YAML dependency. */
function configuredIgnoredGhsas(workspaceYaml) {
  const lines = workspaceYaml.split('\n');
  const start = lines.findIndex((line) => line === 'auditConfig:');
  if (start === -1) return [];
  const ids = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!line.startsWith('  ')) break;
    const [, id] = line.match(/^ {4}- (\S+)$/) ?? [];
    if (id) ids.push(id);
  }
  return ids;
}

/** Each `#### GHSA-…` record in the exceptions subsection, with its bolded field bullets. */
function exceptionRecords(markdown) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => EXCEPTIONS_HEADING.test(line));
  if (start === -1) throw new Error('docs/DEPENDENCIES.md lost its audit-exceptions subsection');
  const records = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,3} /.test(line)) break;
    const heading = line.match(/^#### (\S+)$/);
    if (heading) {
      records.push({ id: heading[1], fields: {} });
      continue;
    }
    const field = line.match(/^\* \*\*([^*]+):\*\* (.+)$/);
    if (field && records.length > 0) records.at(-1).fields[field[1]] = field[2];
  }
  return records;
}

/** Every way the configured ignores and their evidence records disagree, as of `today`. */
function auditExceptionViolations({ configured, records, today }) {
  const violations = [];
  const recorded = new Set(records.map((record) => record.id));
  for (const id of configured) {
    if (!GHSA_ID.test(id)) violations.push(`${id}: not an exact GHSA id`);
    if (!recorded.has(id)) violations.push(`${id}: ignored without an evidence record`);
  }
  for (const { id, fields } of records) {
    if (!configured.includes(id)) violations.push(`${id}: recorded but not ignored`);
    const missing = REQUIRED_RECORD_FIELDS.filter((name) => !fields[name]);
    if (missing.length > 0) violations.push(`${id}: missing ${missing.join(', ')}`);
    const approvedOn = Date.parse(fields.Approved?.match(/\d{4}-\d{2}-\d{2}$/)?.[0] ?? '');
    const reviewBy = Date.parse(fields['Review by'] ?? '');
    if (Number.isNaN(approvedOn) || Number.isNaN(reviewBy)) {
      violations.push(`${id}: approval or review-by date unreadable`);
      continue;
    }
    if (reviewBy - approvedOn > EXCEPTION_REVIEW_WINDOW_DAYS * MS_PER_DAY) {
      violations.push(`${id}: review-by is more than ${EXCEPTION_REVIEW_WINDOW_DAYS} days out`);
    }
    if (reviewBy < today) violations.push(`${id}: expired on ${fields['Review by']}`);
  }
  return violations;
}

describe('the quality script mirrors the Quality job', () => {
  it('runs exactly the workflow steps, in the workflow order', () => {
    expect(QUALITY_COMMANDS).toEqual(runCommandsIn(jobBlock(testWorkflow, 'quality')));
  });

  it('blocks high and critical dependency advisories without broad exclusions', () => {
    expect(QUALITY_COMMANDS).toContain(dependencyAuditCommand);
    expect(QUALITY_COMMANDS.filter((command) => command.startsWith('pnpm audit'))).toEqual([
      dependencyAuditCommand,
    ]);
  });

  it('ignores only exact GHSAs that carry an unexpired evidence record', () => {
    expect(
      auditExceptionViolations({
        configured: configuredIgnoredGhsas(pnpmWorkspace),
        records: exceptionRecords(dependenciesDoc),
        today: Date.now(),
      })
    ).toEqual([]);
  });
});

describe('the audit-exception policy check', () => {
  const ID = 'GHSA-vfj7-8cjw-p6xm';
  const fields = {
    Advisory: 'a',
    'Locked paths': 'b',
    'Upstream evidence': 'c',
    Reachability: 'd',
    Approved: 'Someone, 2026-10-04',
    'Review by': '2027-01-02',
    'Removal trigger': 'e',
  };
  const today = Date.parse('2026-10-05');

  it('accepts a configured GHSA with a complete, unexpired record', () => {
    expect(
      auditExceptionViolations({ configured: [ID], records: [{ id: ID, fields }], today })
    ).toEqual([]);
  });

  it('rejects an ignore without a record, and a record without an ignore', () => {
    expect(auditExceptionViolations({ configured: [ID], records: [], today })).toEqual([
      `${ID}: ignored without an evidence record`,
    ]);
    expect(
      auditExceptionViolations({ configured: [], records: [{ id: ID, fields }], today })
    ).toEqual([`${ID}: recorded but not ignored`]);
  });

  it('rejects a non-GHSA ignore, a missing field, an over-long window, and an expired record', () => {
    expect(
      auditExceptionViolations({ configured: ['CVE-2026-0001'], records: [], today })
    ).toContain('CVE-2026-0001: not an exact GHSA id');
    expect(
      auditExceptionViolations({
        configured: [ID],
        records: [{ id: ID, fields: { ...fields, Reachability: undefined } }],
        today,
      })
    ).toEqual([`${ID}: missing Reachability`]);
    expect(
      auditExceptionViolations({
        configured: [ID],
        records: [{ id: ID, fields: { ...fields, 'Review by': '2027-03-01' } }],
        today,
      })
    ).toEqual([`${ID}: review-by is more than ${EXCEPTION_REVIEW_WINDOW_DAYS} days out`]);
    expect(
      auditExceptionViolations({
        configured: [ID],
        records: [{ id: ID, fields }],
        today: Date.parse('2027-01-03'),
      })
    ).toEqual([`${ID}: expired on 2027-01-02`]);
  });

  it('reads the ignore list and records from the real file shapes', () => {
    expect(
      configuredIgnoredGhsas(
        `nodeLinker: hoisted\nauditConfig:\n  ignoreGhsas:\n    # why\n    - ${ID}\n\nallowBuilds:\n  x: false\n`
      )
    ).toEqual([ID]);
    expect(configuredIgnoredGhsas('nodeLinker: hoisted\n')).toEqual([]);
    expect(
      exceptionRecords(
        `### Active dependency-audit status and exceptions (checked x)\n\n#### ${ID}\n\n* **Approved:** Someone, 2026-10-04\n* **Review by:** 2027-01-02\n\n### Next\n\n#### GHSA-out-of-section\n`
      )
    ).toEqual([{ id: ID, fields: { Approved: 'Someone, 2026-10-04', 'Review by': '2027-01-02' } }]);
  });

  it('picks the quality job, not whatever job happens to be first', () => {
    const block = jobBlock(testWorkflow, 'quality');
    expect(block).toContain('name: Quality');
    expect(block).not.toContain('npm run test:e2e');
  });
});

describe('runQualityChecks', () => {
  it('runs every check even after one fails, and reports each failure', () => {
    const attempted = [];
    const failures = runQualityChecks({
      run: (command) => {
        attempted.push(command);
        return !command.startsWith('npm run lint');
      },
    });

    expect(attempted).toEqual(QUALITY_COMMANDS);
    expect(failures).toEqual(QUALITY_COMMANDS.filter((c) => c.startsWith('npm run lint')));
  });

  it('exits non-zero and names the failures, or zero when all pass', () => {
    const errors = [];
    const log = { log: () => {}, error: (line) => errors.push(line) };

    expect(summarize([], log)).toBe(0);
    expect(errors).toEqual([]);

    expect(summarize(['npm run lint'], log)).toBe(1);
    expect(errors.join('\n')).toContain('npm run lint');
  });
});
