// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

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

function hasForgeMitigationImport(ast) {
  return ast.statements.some(
    (node) =>
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === './lib/forge-mitigation.mjs' &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings) &&
      node.importClause.namedBindings.elements.some(
        (binding) =>
          binding.name.text === 'verifyForgeMitigation' &&
          (!binding.propertyName || binding.propertyName.text === 'verifyForgeMitigation')
      )
  );
}

function hasPrecedingTermination(statements) {
  let returns = false;
  function visit(node) {
    if (ts.isFunctionLike(node) || ts.isClassDeclaration(node)) return;
    if (ts.isReturnStatement(node)) returns = true;
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'process' &&
      node.expression.name.text === 'exit'
    )
      returns = true;
    ts.forEachChild(node, visit);
  }
  for (const statement of statements) visit(statement);
  return returns;
}

function hasDirectForgeMitigationCall(ast) {
  const owner = ast.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'checkNativeTopology'
  );
  if (!owner?.body || !owner.modifiers?.some((node) => node.kind === ts.SyntaxKind.AsyncKeyword))
    return false;
  const statements = owner.body.statements;
  const index = statements.findIndex(
    (node) =>
      ts.isVariableStatement(node) &&
      (node.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
      node.declarationList.declarations.some((declaration) => {
        if (
          !ts.isIdentifier(declaration.name) ||
          declaration.name.text !== 'forgeMitigation' ||
          !declaration.initializer ||
          !ts.isAwaitExpression(declaration.initializer)
        )
          return false;
        const call = declaration.initializer.expression;
        return (
          ts.isCallExpression(call) &&
          ts.isIdentifier(call.expression) &&
          call.expression.text === 'verifyForgeMitigation' &&
          call.arguments.length === 3 &&
          call.arguments.every(
            (argument, position) =>
              argument.getText(ast) === ['root', 'drawingForge.lock', 'workspace'][position]
          )
        );
      })
  );
  const projection = statements.findIndex(
    (node) =>
      node.getText(ast).replace(/\s+/g, '') ===
      'constdrawingForge=projectDrawingForgeLock(lock,manifest,readDrawingForgeInputs(root));'
  );
  const adjunctImport = ast.statements.some(
    (node) =>
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === './lib/native-drawing-forge-paths.mjs' &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings) &&
      ['projectDrawingForgeLock', 'readDrawingForgeInputs'].every((name) =>
        node.importClause.namedBindings.elements.some(
          (binding) =>
            binding.name.text === name &&
            (!binding.propertyName || binding.propertyName.text === name)
        )
      )
  );
  return (
    adjunctImport &&
    projection >= 0 &&
    projection < index &&
    !hasPrecedingTermination(statements.slice(0, index))
  );
}

function forgeMitigationWiringViolations(workspaceYaml, checker, commands) {
  if (!configuredIgnoredGhsas(workspaceYaml).includes('GHSA-86w9-cpqp-85rv')) return [];
  const ast = ts.createSourceFile(
    'check-native-topology.mjs',
    checker,
    ts.ScriptTarget.Latest,
    true
  );
  const failures = [];
  if (ast.parseDiagnostics.length) failures.push('mitigation caller source is malformed');
  if (!hasForgeMitigationImport(ast)) failures.push('installed mitigation import absent');
  if (!hasDirectForgeMitigationCall(ast))
    failures.push('mandatory installed mitigation call absent');
  const guardIndex = commands.indexOf('npm run check:migration:native-topology');
  if (guardIndex < 0 || guardIndex >= commands.indexOf(dependencyAuditCommand))
    failures.push('mitigation is not before audit');
  return failures;
}

function hasTopologyMainInvocation(ast) {
  const index = ast.statements.findIndex(
    (node) => ts.isIfStatement(node) && node.expression.getText(ast) === 'isMain(import.meta.url)'
  );
  if (index < 0 || hasPrecedingTermination(ast.statements.slice(0, index))) return false;
  const main = ast.statements[index];
  if (main.elseStatement || !ts.isExpressionStatement(main.thenStatement)) return false;
  const call = main.thenStatement.expression;
  if (
    !ts.isCallExpression(call) ||
    call.expression.getText(ast) !== 'runMain' ||
    call.arguments.length !== 1
  )
    return false;
  const callback = call.arguments[0];
  if (
    !ts.isArrowFunction(callback) ||
    !callback.modifiers?.some((node) => node.kind === ts.SyntaxKind.AsyncKeyword) ||
    !ts.isBlock(callback.body)
  )
    return false;
  const statements = callback.body.statements;
  return (
    statements.length === 1 &&
    ts.isExpressionStatement(statements[0]) &&
    statements[0].getText(ast).replace(/\s+/g, '') ===
      'console.log(JSON.stringify(awaitcheckNativeTopology(process.argv.slice(2)),null,2));'
  );
}

function forgeInvocationWiringViolations(checker, scripts) {
  const failures = [];
  if (
    scripts['check:migration:native-topology'] !== 'node tools/migration/check-native-topology.mjs'
  )
    failures.push('npm topology script does not invoke the guard');
  const ast = ts.createSourceFile(
    'check-native-topology.mjs',
    checker,
    ts.ScriptTarget.Latest,
    true
  );
  if (ast.parseDiagnostics.length || !hasTopologyMainInvocation(ast))
    failures.push('topology main does not await the guard');
  return failures;
}

describe('the guard-qualified Forge advisory exception', () => {
  const checker = readFileSync(join(repoRoot, 'tools/migration/check-native-topology.mjs'), 'utf8');
  const { scripts } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

  it('requires the actual installed guard before the unchanged Quality audit', () => {
    expect(forgeMitigationWiringViolations(pnpmWorkspace, checker, QUALITY_COMMANDS)).toEqual([]);
    expect(forgeInvocationWiringViolations(checker, scripts)).toEqual([]);
  });

  it('rejects commented imports/calls, dead or conditional calls and preceding returns', () => {
    const call =
      'const forgeMitigation = await verifyForgeMitigation(root, drawingForge.lock, workspace);';
    const mitigationSpecifier = './lib/forge-mitigation.mjs';
    const importDeclaration = `import { verifyForgeMitigation } from '${mitigationSpecifier}';`;
    expect(
      forgeMitigationWiringViolations(
        pnpmWorkspace,
        checker.replace(importDeclaration, `// ${importDeclaration}`),
        QUALITY_COMMANDS
      )
    ).toContain('installed mitigation import absent');
    for (const replacement of [
      `// ${call}`,
      `if (false) { ${call} }`,
      `if (root) { ${call} }`,
      'const forgeMitigation = root ? await verifyForgeMitigation(root, drawingForge.lock, workspace) : null;',
      `return {}; ${call}`,
      `if (root) return {}; ${call}`,
      `process.exit(0); ${call}`,
      `if (root) process.exit(0); ${call}`,
    ])
      expect(
        forgeMitigationWiringViolations(
          pnpmWorkspace,
          checker.replace(call, replacement),
          QUALITY_COMMANDS
        )
      ).toContain('mandatory installed mitigation call absent');
  });

  it('requires the unconditional qualified N1 projection before the installed guard', () => {
    const projection =
      'const drawingForge = projectDrawingForgeLock(lock, manifest, readDrawingForgeInputs(root));';
    for (const changed of [
      checker.replace(projection, 'const drawingForge = { lock };'),
      checker.replace(projection, `if (root) { ${projection} }`),
      checker.replace('readDrawingForgeInputs(root)', '{}'),
      checker.replace('./lib/native-drawing-forge-paths.mjs', './lib/unreviewed-projection.mjs'),
      checker.replace('root, drawingForge.lock, workspace', 'root, lock, workspace'),
    ])
      expect(forgeMitigationWiringViolations(pnpmWorkspace, changed, QUALITY_COMMANDS)).toContain(
        'mandatory installed mitigation call absent'
      );
  });

  it('rejects no-op npm scripts, dead main callbacks and preceding process exits', () => {
    expect(
      forgeInvocationWiringViolations(checker, {
        ...scripts,
        'check:migration:native-topology': 'node -e 0',
      })
    ).toContain('npm topology script does not invoke the guard');
    for (const changed of [
      checker.replace('if (isMain(import.meta.url))', 'if (false)'),
      checker.replace('runMain(async () => {', 'runMain(async () => { return;'),
      checker.replace('await checkNativeTopology(process.argv.slice(2))', '{}'),
      checker.replace(
        'await checkNativeTopology(process.argv.slice(2))',
        'checkNativeTopology(process.argv.slice(2))'
      ),
      checker.replace(
        'if (isMain(import.meta.url))',
        'process.exit(0); if (isMain(import.meta.url))'
      ),
    ])
      expect(forgeInvocationWiringViolations(changed, scripts)).toContain(
        'topology main does not await the guard'
      );
  });

  it('rejects missing import, missing unconditional call and missing or reordered Quality step', () => {
    expect(
      forgeMitigationWiringViolations(
        pnpmWorkspace,
        checker.replace('import { verifyForgeMitigation }', 'import { absent }'),
        QUALITY_COMMANDS
      )
    ).toContain('installed mitigation import absent');
    expect(
      forgeMitigationWiringViolations(
        pnpmWorkspace,
        checker.replace(
          'const forgeMitigation = await verifyForgeMitigation',
          'const forgeMitigation = absent'
        ),
        QUALITY_COMMANDS
      )
    ).toContain('mandatory installed mitigation call absent');
    expect(
      forgeMitigationWiringViolations(
        pnpmWorkspace,
        checker,
        QUALITY_COMMANDS.filter((command) => command !== 'npm run check:migration:native-topology')
      )
    ).toContain('mitigation is not before audit');
    expect(
      forgeMitigationWiringViolations(pnpmWorkspace, checker, [
        dependencyAuditCommand,
        'npm run check:migration:native-topology',
      ])
    ).toContain('mitigation is not before audit');
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
