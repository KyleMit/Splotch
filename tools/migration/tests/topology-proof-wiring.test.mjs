import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { TOPOLOGY_PROOF_BRANCH } from '../../netlify-topology-witness.mjs';
import { QUALITY_COMMANDS } from '../../ci-mirror/run-quality-checks.mjs';

const root = join(import.meta.dirname, '..', '..', '..');
const workflow = readFileSync(join(root, '.github/workflows/native-topology-proof.yml'), 'utf8');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const evidenceCommand = 'npm run check:migration:native-topology:evidence';
const liveCommand = 'npm run check:migration:native-topology';

function proofWorkflowViolations(source) {
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) return ['invalid proof workflow'];
  const parsed = document.toJS();
  const failures = [];
  if (
    JSON.stringify(parsed.on?.pull_request?.branches) !==
    JSON.stringify(['codex/native-migration', 'codex/migration-05-native-topology'])
  )
    failures.push('migration PR trigger absent');
  if (JSON.stringify(parsed.on?.push?.branches) !== JSON.stringify([TOPOLOGY_PROOF_BRANCH]))
    failures.push('proof-ref trigger absent');
  if (parsed.defaults?.run?.shell !== 'bash') failures.push('proof shell changed');
  const job = parsed.jobs?.['topology-proof'];
  const expectedCondition = `github.head_ref == 'codex/migration-05-native-topology' || github.head_ref == 'codex/migration-netlify-install' || github.ref_name == '${TOPOLOGY_PROOF_BRANCH}'`;
  if (job?.if !== expectedCondition) failures.push('proof scope changed');
  if (job?.['continue-on-error']) failures.push('proof job failures ignored');
  const steps = job?.steps ?? [];
  for (const command of [liveCommand, evidenceCommand]) {
    const matches = steps.filter((step) => step.run === command);
    if (matches.length !== 1 || Object.hasOwn(matches[0], 'if') || matches[0]['continue-on-error'])
      failures.push(`proof command not mandatory: ${command}`);
  }
  if (
    steps.findIndex((step) => step.run === liveCommand) >=
    steps.findIndex((step) => step.run === evidenceCommand)
  )
    failures.push('proof command order changed');
  return failures;
}

describe('topology proof CI ownership', () => {
  it('runs exact evidence on topology and repair PRs and the proof ref while Quality keeps live invariants', () => {
    expect(proofWorkflowViolations(workflow)).toEqual([]);
    expect(manifest.scripts['check:migration:native-topology:evidence']).toBe(
      'node tools/migration/check-native-topology-evidence.mjs'
    );
    expect(QUALITY_COMMANDS).toContain(liveCommand);
    expect(QUALITY_COMMANDS).not.toContain(evidenceCommand);
  });

  it('rejects missing, conditional, ignored or mis-scoped exact evidence execution', () => {
    expect(proofWorkflowViolations(workflow.replace(evidenceCommand, 'node -e 0'))).toContain(
      `proof command not mandatory: ${evidenceCommand}`
    );
    expect(
      proofWorkflowViolations(
        workflow.replace(`run: ${evidenceCommand}`, `if: false\n        run: ${evidenceCommand}`)
      )
    ).toContain(`proof command not mandatory: ${evidenceCommand}`);
    expect(
      proofWorkflowViolations(
        workflow.replace(
          `run: ${evidenceCommand}`,
          `continue-on-error: true\n        run: ${evidenceCommand}`
        )
      )
    ).toContain(`proof command not mandatory: ${evidenceCommand}`);
    for (const head of ['codex/migration-05-native-topology', 'codex/migration-netlify-install']) {
      expect(
        proofWorkflowViolations(workflow.replace(`github.head_ref == '${head}'`, 'false'))
      ).toContain('proof scope changed');
    }
    expect(
      proofWorkflowViolations(
        workflow.replace(
          'branches: [codex/native-migration, codex/migration-05-native-topology]',
          'branches: [codex/native-migration]'
        )
      )
    ).toContain('migration PR trigger absent');
    expect(
      proofWorkflowViolations(
        workflow.replace(`branches: [${TOPOLOGY_PROOF_BRANCH}]`, 'branches: [main]')
      )
    ).toContain('proof-ref trigger absent');
  });
});
