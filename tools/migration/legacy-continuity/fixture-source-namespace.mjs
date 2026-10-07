import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, posix } from 'node:path';
import ts from 'typescript';
import { digest, exposeHeldRecognizer } from './contract.mjs';

const require = createRequire(import.meta.url);
export const FIXTURE_COMPILER_INPUTS = Object.freeze([
  require.resolve('typescript'),
  require.resolve('typescript/package.json'),
]);

const SOURCE_DIRECTORY = 'web/src/';
const OWNER_DIRECTORY = 'web/src/lib/legacyContinuitySource/';
const HELD_OWNER = 'web/src/lib/drawing/unsavedPictureStore.ts';
const PARSER_OWNERS = new Set([
  'web/src/lib/state/settings.svelte.ts',
  'web/src/lib/state/tool.svelte.ts',
]);
const SOURCE_SUFFIXES = ['', '.ts', '.js', '/index.ts', '/index.js'];

function moduleEdges(source, path) {
  assert.ok(/\.(?:ts|js)$/.test(path), `L0_FIXTURE_OWNER_FORM_UNSUPPORTED: ${path}`);
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  assert.equal(file.parseDiagnostics.length, 0, `L0_FIXTURE_OWNER_SYNTAX: ${path}`);
  const edges = [];
  function add(literal, runtime, kind) {
    assert.ok(ts.isStringLiteralLike(literal), `L0_FIXTURE_OWNER_IMPORT_UNSUPPORTED: ${path}`);
    edges.push({
      start: literal.getStart(file),
      end: literal.end,
      specifier: literal.text,
      runtime,
      kind,
    });
  }
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const typesOnly =
        clause &&
        (clause.isTypeOnly ||
          (!clause.name &&
            clause.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((value) => value.isTypeOnly)));
      add(node.moduleSpecifier, !typesOnly, 'static');
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const typesOnly =
        node.isTypeOnly ||
        (node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.length > 0 &&
          node.exportClause.elements.every((value) => value.isTypeOnly));
      add(node.moduleSpecifier, !typesOnly, 'static');
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      assert.equal(node.arguments.length, 1, `L0_FIXTURE_OWNER_IMPORT_UNSUPPORTED: ${path}`);
      add(node.arguments[0], true, 'dynamic');
    } else if (ts.isImportTypeNode(node)) {
      assert.ok(
        ts.isLiteralTypeNode(node.argument),
        `L0_FIXTURE_OWNER_IMPORT_UNSUPPORTED: ${path}`
      );
      add(node.argument.literal, false, 'type');
    } else if (
      (ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'URL') ||
      (ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'glob')
    ) {
      assert.fail(`L0_FIXTURE_OWNER_IMPORT_UNSUPPORTED: ${path}`);
    } else if (
      ts.isImportEqualsDeclaration(node) ||
      (ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require')
    ) {
      assert.fail(`L0_FIXTURE_OWNER_IMPORT_UNSUPPORTED: ${path}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return edges;
}

function resolveLocal(edge, from, paths) {
  const name = edge.specifier;
  assert.ok(
    !name.startsWith('/') && !name.startsWith('#'),
    `L0_FIXTURE_OWNER_IMPORT_UNSUPPORTED: ${name}`
  );
  if (!name.startsWith('.') && !name.startsWith('$lib/')) {
    assert.ok(
      !name.startsWith('$') || name.startsWith('$app/') || name.startsWith('$env/'),
      `L0_FIXTURE_OWNER_ALIAS_UNSUPPORTED: ${name}`
    );
    return null;
  }
  assert.doesNotMatch(name, /[?#\\]/, `L0_FIXTURE_OWNER_IMPORT_UNSUPPORTED: ${name}`);
  const base = name.startsWith('$lib/')
    ? SOURCE_DIRECTORY + 'lib/' + name.slice(5)
    : posix.normalize(posix.join(posix.dirname(from), name));
  assert.ok(
    base.startsWith(SOURCE_DIRECTORY) && !base.startsWith(OWNER_DIRECTORY),
    `L0_FIXTURE_OWNER_ESCAPE: ${name}`
  );
  const candidates = SOURCE_SUFFIXES.map((suffix) => base + suffix).filter((path) =>
    paths.has(path)
  );
  assert.equal(candidates.length, 1, `L0_FIXTURE_OWNER_UNRESOLVED: ${from}: ${name}`);
  return candidates[0];
}

function originalOwner(root, entry) {
  assert.ok(['100644', '100755'].includes(entry.mode), `L0_FIXTURE_OWNER_MODE: ${entry.path}`);
  const path = join(root, entry.path);
  const stat = lstatSync(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), `L0_FIXTURE_OWNER_TYPE: ${entry.path}`);
  const bytes = readFileSync(path);
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(blob, entry.blob, `L0_FIXTURE_OWNER_SOURCE_CHANGED: ${entry.path}`);
  assert.equal(bytes.length, entry.bytes, `L0_FIXTURE_OWNER_LENGTH: ${entry.path}`);
  assert.equal(
    Boolean(stat.mode & 0o111),
    entry.mode === '100755',
    `L0_FIXTURE_OWNER_MODE: ${entry.path}`
  );
  assert.equal(
    Buffer.from(bytes.toString('utf8')).equals(bytes),
    true,
    `L0_FIXTURE_OWNER_UTF8: ${entry.path}`
  );
  return bytes.toString('utf8');
}

function relocatedPath(path) {
  return OWNER_DIRECTORY + path.slice(SOURCE_DIRECTORY.length);
}

function importPath(from, target, requested) {
  const extension = /\.(?:ts|js)$/.test(requested) ? '' : /\.(?:ts|js)$/;
  const destination = extension ? target.replace(extension, '') : target;
  const relative = posix.relative(posix.dirname(from), destination);
  return relative.startsWith('.') ? relative : './' + relative;
}

function rewriteModule(source, from, destination, edges, owners, paths) {
  const substitutions = [];
  for (const edge of edges) {
    const local = resolveLocal(edge, from, paths);
    if (!local) continue;
    const target = edge.runtime && owners.has(local) ? relocatedPath(local) : local;
    const after = importPath(destination, target, edge.specifier);
    substitutions.push({
      ...edge,
      sourceTarget: local,
      target,
      before: source.slice(edge.start, edge.end),
      after: JSON.stringify(after),
    });
  }
  let derived = source;
  for (const item of [...substitutions].sort((a, b) => b.start - a.start)) {
    derived = derived.slice(0, item.start) + item.after + derived.slice(item.end);
  }
  return { derived, substitutions };
}

export function relocateFixtureOwners(root, input, fixtureFiles) {
  const originals = new Map(input.sourceFiles.map((entry) => [entry.path, entry]));
  assert.equal(originals.size, input.sourceFiles.length, 'L0_FIXTURE_OWNER_DUPLICATE_SOURCE');
  const paths = new Set([...originals.keys(), ...Object.keys(fixtureFiles)]);
  const owners = new Map();
  const templates = Object.entries(fixtureFiles).filter(([path]) => path.endsWith('.ts'));
  function collect(from, edges) {
    for (const edge of edges.filter((value) => value.runtime)) {
      const local = resolveLocal(edge, from, paths);
      if (!local || owners.has(local)) continue;
      if (local in fixtureFiles) {
        assert.ok(from in fixtureFiles, `L0_FIXTURE_OWNER_GENERATED_DEPENDENCY: ${from}`);
        continue;
      }
      assert.ok(originals.has(local), `L0_FIXTURE_OWNER_DANGLING: ${local}`);
      const original = originalOwner(root, originals.get(local));
      const recognizerExport = input.role !== 'released' && local === HELD_OWNER;
      const source = recognizerExport ? exposeHeldRecognizer(original) : original;
      const module = { original, source, edges: moduleEdges(source, local), recognizerExport };
      owners.set(local, module);
      collect(local, module.edges);
    }
  }
  for (const [path, source] of templates) collect(path, moduleEdges(source, path));
  const eager = new Set();
  function verifyEager(from, edges) {
    for (const edge of edges.filter((value) => value.runtime && value.kind === 'static')) {
      const local = resolveLocal(edge, from, paths);
      if (!local || eager.has(local)) continue;
      assert.ok(!PARSER_OWNERS.has(local), `L0_FIXTURE_OWNER_PARSE_PHASE: ${local}`);
      eager.add(local);
      const source = owners.get(local)?.source ?? fixtureFiles[local];
      verifyEager(local, moduleEdges(source, local));
    }
  }
  for (const [path, source] of templates) verifyEager(path, moduleEdges(source, path));
  const files = { ...fixtureFiles };
  const ownerCopies = [...owners]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, owner]) => {
      const target = relocatedPath(path);
      assert.ok(
        !originals.has(target) && !(target in fixtureFiles),
        `L0_FIXTURE_OWNER_DESTINATION_EXISTS: ${target}`
      );
      const transformed = rewriteModule(owner.source, path, target, owner.edges, owners, paths);
      files[target] = transformed.derived;
      return {
        source: path,
        target,
        sourceEntry: originals.get(path),
        originalSha256: digest(Buffer.from(owner.original)),
        recognizerExport: owner.recognizerExport,
        bodySourceSha256: digest(Buffer.from(owner.source)),
        substitutions: transformed.substitutions,
        derivedSha256: digest(Buffer.from(transformed.derived)),
      };
    });
  const fixtureRewrites = templates.map(([path, source]) => {
    const transformed = rewriteModule(source, path, path, moduleEdges(source, path), owners, paths);
    files[path] = transformed.derived;
    return {
      path,
      originalSha256: digest(Buffer.from(source)),
      derivedSha256: digest(Buffer.from(transformed.derived)),
      substitutions: transformed.substitutions,
    };
  });
  return {
    files,
    receipt: {
      directory: OWNER_DIRECTORY,
      scope: 'Derived frozen-source owner instances; shipping singletons unchanged',
      ownerCopies,
      fixtureRewrites,
    },
  };
}

export function verifyFixtureOwners(root, namespace) {
  const targets = new Set(namespace.receipt.ownerCopies.map((owner) => owner.target));
  assert.equal(
    targets.size,
    namespace.receipt.ownerCopies.length,
    'L0_FIXTURE_OWNER_DUPLICATE_TARGET'
  );
  for (const owner of namespace.receipt.ownerCopies) {
    assert.equal(owner.source, owner.sourceEntry.path, 'L0_FIXTURE_OWNER_SOURCE_MAPPING');
    assert.equal(owner.target, relocatedPath(owner.source), 'L0_FIXTURE_OWNER_TARGET_MAPPING');
    const original = originalOwner(root, owner.sourceEntry);
    assert.equal(
      digest(Buffer.from(original)),
      owner.originalSha256,
      'L0_FIXTURE_OWNER_SOURCE_CHANGED'
    );
    let expected = owner.recognizerExport ? exposeHeldRecognizer(original) : original;
    assert.equal(
      digest(Buffer.from(expected)),
      owner.bodySourceSha256,
      'L0_FIXTURE_OWNER_BODY_CHANGED'
    );
    for (const item of [...owner.substitutions].sort((a, b) => b.start - a.start)) {
      assert.equal(
        expected.slice(item.start, item.end),
        item.before,
        'L0_FIXTURE_OWNER_IMPORT_CHANGED'
      );
      expected = expected.slice(0, item.start) + item.after + expected.slice(item.end);
    }
    const path = join(root, owner.target);
    assert.ok(
      lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(),
      'L0_FIXTURE_OWNER_TARGET_TYPE'
    );
    assert.equal(
      readFileSync(path).equals(Buffer.from(expected)),
      true,
      `L0_FIXTURE_OWNER_BODY_CHANGED: ${owner.target}`
    );
    assert.equal(
      digest(Buffer.from(expected)),
      owner.derivedSha256,
      'L0_FIXTURE_OWNER_DERIVED_CHANGED'
    );
  }
  for (const [path, expected] of Object.entries(namespace.files)) {
    const target = join(root, path);
    const stat = lstatSync(target);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'L0_FIXTURE_OWNER_TARGET_TYPE');
    assert.equal(
      readFileSync(target).equals(Buffer.from(expected)),
      true,
      `L0_FIXTURE_OWNER_OUTPUT_CHANGED: ${path}`
    );
  }
}
