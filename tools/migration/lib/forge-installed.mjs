import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import ts from 'typescript';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { dependencySpecifiers } from './native-identity.mjs';

function contained(root, path) {
  const physical = realpathSync(path);
  const remainder = relative(root, physical);
  assert.ok(
    remainder && remainder !== '..' && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder),
    `Installed path escapes owner: ${path}`
  );
  return physical;
}

export function collectForgeInstallPackages(root) {
  root = realpathSync(root);
  const packages = new Map();
  const modules = new Set();
  function packageDirectory(path) {
    const physical = contained(root, path);
    if (packages.has(physical)) return;
    const manifestPath = contained(root, join(physical, 'package.json'));
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(typeof manifest.name, 'string', `Installed package name absent: ${path}`);
    assert.equal(typeof manifest.version, 'string', `Installed package version absent: ${path}`);
    packages.set(physical, { path: physical, manifest });
    modulesDirectory(join(physical, 'node_modules'));
  }
  function modulesDirectory(path) {
    if (!existsSync(path)) return;
    const physical = contained(root, path);
    if (modules.has(physical)) return;
    modules.add(physical);
    for (const entry of readdirSync(physical, { withFileTypes: true })) {
      const child = join(physical, entry.name);
      if (entry.name === '.pnpm') {
        const store = contained(root, child);
        for (const item of readdirSync(store, { withFileTypes: true })) {
          if (item.isDirectory() || item.isSymbolicLink())
            modulesDirectory(
              item.name === 'node_modules'
                ? join(store, item.name)
                : join(store, item.name, 'node_modules')
            );
        }
      } else if (entry.name.startsWith('@')) {
        for (const name of readdirSync(contained(root, child))) packageDirectory(join(child, name));
      } else if (!entry.name.startsWith('.') && (entry.isDirectory() || entry.isSymbolicLink()))
        packageDirectory(child);
    }
  }
  for (const context of [
    root,
    join(root, CANDIDATE_DIRECTORY),
    join(root, 'web'),
    join(root, 'netlify/functions'),
    join(root, 'tools'),
  ])
    modulesDirectory(join(context, 'node_modules'));
  return [...packages.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function sourceFiles(directory, visited = new Set()) {
  const physical = realpathSync(directory);
  if (visited.has(physical)) return [];
  visited.add(physical);
  return readdirSync(physical, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return [];
    const path = join(physical, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Installed consumer source symlink: ${path}`);
    if (entry.isDirectory()) return sourceFiles(path, visited);
    return entry.isFile() && /\.(?:js|mjs|cjs|ts|tsx|json)$/.test(entry.name) ? [path] : [];
  });
}

function assertNoForgeSubpath(value, label) {
  if (typeof value === 'string')
    assert.ok(
      !/(?:^|\/)node-forge\//.test(value),
      `Unsupported unpatched node-forge subpath: ${label}: ${value}`
    );
  else if (Array.isArray(value)) for (const item of value) assertNoForgeSubpath(item, label);
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      assertNoForgeSubpath(key, label);
      assertNoForgeSubpath(item, label);
    }
}

function assertResolvedForgeReferences(source, path, specifiers) {
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  let forgeLiteral = false;
  let unresolved = false;
  let unsupportedLiteral = false;
  function dependencyCall(node) {
    return (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require') ||
        (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'require' &&
          node.expression.name.text === 'resolve'))
    );
  }
  function visit(node) {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text === 'node-forge'
    ) {
      forgeLiteral = true;
      const parent = node.parent;
      const declaration =
        (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
        parent.moduleSpecifier === node;
      const call =
        dependencyCall(parent) &&
        parent.arguments.length === 1 &&
        parent.arguments[0] === node &&
        ts.isStringLiteral(node);
      if (!declaration && !call) unsupportedLiteral = true;
    }
    if (dependencyCall(node)) {
      if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) unresolved = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (forgeLiteral) {
    assert.ok(!unresolved, `Unresolved dependency call in forge-bearing source: ${path}`);
    assert.ok(
      !unsupportedLiteral && specifiers.includes('node-forge'),
      `Unsupported forge main reference form: ${path}`
    );
  }
}

export function inspectForgeReferences(packages, lock) {
  assertNoForgeSubpath(lock.importers, 'lock importers');
  assertNoForgeSubpath(lock.snapshots, 'lock snapshots');
  const references = [];
  for (const installed of packages) {
    assertNoForgeSubpath(installed.manifest, `${installed.manifest.name} manifest`);
    if (installed.manifest.name === 'node-forge') continue;
    for (const path of sourceFiles(installed.path)) {
      const source = readFileSync(path, 'utf8');
      if (!source.includes('node-forge')) continue;
      if (path.endsWith('.json')) {
        assertNoForgeSubpath(JSON.parse(source), path);
        continue;
      }
      const specifiers = dependencySpecifiers(source, path);
      assertResolvedForgeReferences(source, path, specifiers);
      for (const specifier of specifiers) {
        assertNoForgeSubpath(specifier, path);
        if (specifier === 'node-forge')
          references.push({
            package: installed.manifest.name,
            version: installed.manifest.version,
            path,
          });
      }
      assert.ok(
        !/["'`](?:[^"'`]*\/)?node-forge\/[^"'`]*["'`]/.test(source),
        `Unsupported node-forge subpath literal: ${path}`
      );
    }
  }
  return references;
}

export function verifyInstalledForgeFiles(path, mitigation, digest) {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      assert.ok(!entry.isSymbolicLink(), `Forge package contains source symlink: ${child}`);
      if (entry.name === 'node_modules') continue;
      if (entry.isDirectory()) walk(child);
      else {
        assert.ok(
          entry.isFile() && lstatSync(child).isFile(),
          `Forge source is not a file: ${child}`
        );
        const bytes = readFileSync(child);
        files.push({
          path: relative(path, child).split(sep).join('/'),
          bytes: bytes.length,
          sha256: digest(bytes),
        });
      }
    }
  }
  walk(path);
  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  assert.deepEqual(
    files,
    mitigation.files,
    `Installed forge bytes differ from reviewed lib-only mitigation: ${path}`
  );
}
