import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import {
  candidateConfigurationKind,
  candidateSourceReferences,
  isRelativeCandidateSpecifier,
  readCandidateJsonConfig,
  readCandidateTsconfig,
} from './candidate-references.mjs';

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const GENERATED_SUBPATHS = [
  'node_modules',
  '.git',
  '.expo',
  'dist',
  'android/.gradle',
  'android/.cxx',
  'android/build',
  'android/app/.cxx',
  'android/app/build',
  'ios/Pods',
  'ios/build',
];

function inside(path) {
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function excluded(path) {
  return (
    path.split(sep).includes('node_modules') ||
    GENERATED_SUBPATHS.some((subpath) => path === subpath || path.startsWith(`${subpath}/`))
  );
}

function assertOwnedPath(candidate, path, owner) {
  const local = relative(candidate, path);
  assert.ok(inside(local), `${owner} escapes candidate ownership: ${path}`);
  assert.ok(!excluded(local), `${owner} enters excluded candidate output: ${local}`);
}

function discoverCandidateFiles(candidate) {
  const files = [];
  const visited = new Set();
  function visit(directory) {
    const physical = realpathSync(directory);
    assertOwnedPath(candidate, physical, relative(candidate, directory));
    assert.ok(
      isNodeOwner(relative(candidate, directory)) || !isNodeOwner(relative(candidate, physical)),
      `${relative(candidate, directory)} aliases Node configuration or script into app source`
    );
    if (visited.has(physical)) return;
    visited.add(physical);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (excluded(relative(candidate, path))) continue;
      if (entry.isDirectory() || (entry.isSymbolicLink() && statSync(path).isDirectory())) {
        visit(path);
      } else if (
        SOURCE_EXTENSION.test(entry.name) ||
        /^tsconfig.*\.json$/.test(entry.name) ||
        (candidateConfigurationKind(relative(candidate, path)) &&
          /^(?:\.babelrc(?:\.json)?|babel\.config\.json)$/.test(entry.name)) ||
        ['app.json', 'app.config.json'].includes(relative(candidate, path))
      ) {
        const physical = realpathSync(path);
        const file = relative(candidate, path);
        assertOwnedPath(candidate, physical, file);
        assert.ok(
          isNodeOwner(file) || !isNodeOwner(relative(candidate, physical)),
          `${file} aliases Node configuration or script into app source`
        );
        if (candidateConfigurationKind(file) || /^tsconfig.*\.json$/.test(entry.name))
          assert.equal(
            path,
            physical,
            `${file} uses unsupported symlinked candidate configuration`
          );
        files.push(physical);
      }
    }
  }
  visit(candidate);
  return [...new Set(files)].sort();
}

function isNodeOwner(file) {
  return (
    file === 'scripts' ||
    file.startsWith('scripts/') ||
    /^[.\w-]+\.config(?:\.[cm]?[jt]s)?$/.test(file) ||
    /^\.babelrc(?:\.[cm]?[jt]s)?$/.test(file)
  );
}

function assertAppImportTarget(candidate, file, path) {
  if (SOURCE_EXTENSION.test(file) && !isNodeOwner(file))
    assert.ok(
      !isNodeOwner(relative(candidate, path)),
      `${file} imports Node configuration or script into app source: ${relative(candidate, path)}`
    );
}

function assertLocalReference(candidate, file, specifier) {
  assert.ok(!specifier.includes('\\'), `${file} uses unsupported local backslash: ${specifier}`);
  const path = resolve(candidate, dirname(file), specifier);
  assertOwnedPath(candidate, path, `${file} imports ${specifier}`);
  assertAppImportTarget(candidate, file, path);
  if (existsSync(path)) {
    const physical = realpathSync(path);
    assertOwnedPath(candidate, physical, `${file} resolves ${specifier}`);
    assertAppImportTarget(candidate, file, physical);
  }
}

function packageName(specifier, file) {
  const parts = specifier.split('/');
  assert.ok(
    !specifier.includes('\\') &&
      !specifier.includes(':') &&
      parts.every((part) => part && part !== '.' && part !== '..') &&
      (!specifier.startsWith('@') || (parts.length >= 2 && parts[0].length > 1)),
    `${file} uses malformed package specifier: ${specifier}`
  );
  return parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
}

function assertPackageReference(declared, file, specifier) {
  const name = packageName(specifier, file);
  assert.ok(declared.has(name), `${file} imports undeclared ${specifier}`);
}

function assertTypeReference(candidate, declared, file, specifier) {
  packageName(specifier, file);
  const result = ts.resolveTypeReferenceDirective(
    specifier,
    join(candidate, file),
    {},
    ts.sys
  ).resolvedTypeReferenceDirective;
  assert.ok(result?.packageId, `${file} has unresolved package type reference: ${specifier}`);
  assertPackageReference(declared, file, result.packageId.name);
}

function assertReference(candidate, declared, file, { specifier, kind }) {
  if (kind === 'local' || isRelativeCandidateSpecifier(specifier)) {
    assertLocalReference(candidate, file, specifier);
  } else if (kind === 'types') {
    assertTypeReference(candidate, declared, file, specifier);
  } else if (!specifier.startsWith('node:') && declared.has(specifier.split('/')[0])) {
    assertPackageReference(declared, file, specifier);
  } else if (isBuiltin(specifier)) {
    assert.ok(isNodeOwner(file), `${file} imports Node builtin into app source: ${specifier}`);
  } else {
    assertPackageReference(declared, file, specifier);
  }
}

function tsconfigReferences(candidate, path, visited) {
  const physical = realpathSync(path);
  assertOwnedPath(candidate, physical, relative(candidate, path));
  assert.equal(
    path,
    physical,
    `${relative(candidate, path)} uses unsupported symlinked local tsconfig`
  );
  if (visited.has(physical)) return [];
  visited.add(physical);
  const file = relative(candidate, path);
  const { references, localExtends } = readCandidateTsconfig(readFileSync(path, 'utf8'), file);
  for (const specifier of localExtends) {
    const base = resolve(dirname(path), specifier);
    const extended = ts.sys.fileExists(base) || base.endsWith('.json') ? base : `${base}.json`;
    const target = relative(dirname(path), extended);
    const selected = target.startsWith('.') ? target : `./${target}`;
    references.find(
      (reference) => reference.kind === 'import' && reference.specifier === specifier
    ).specifier = selected;
    assertLocalReference(candidate, file, selected);
    assert.ok(ts.sys.fileExists(extended), `${file} has unresolved local tsconfig: ${specifier}`);
    references.push(...tsconfigReferences(candidate, extended, visited));
  }
  return references;
}

export function assertDeclaredCandidateImports(candidate, manifest) {
  candidate = realpathSync(candidate);
  const declared = new Set(Object.keys(manifest.devDependencies));
  const files = discoverCandidateFiles(candidate);
  const configVisited = new Set();
  const references = [];
  for (const path of files) {
    const file = relative(candidate, path);
    const found = /^tsconfig.*\.json$/.test(path.split(sep).at(-1))
      ? tsconfigReferences(candidate, path, configVisited)
      : extname(path) === '.json' || path.endsWith('/.babelrc')
        ? readCandidateJsonConfig(readFileSync(path, 'utf8'), file)
        : candidateSourceReferences(readFileSync(path, 'utf8'), file);
    references.push(...found.map((reference) => ({ file, ...reference })));
  }
  for (const { file, ...reference } of references)
    assertReference(candidate, declared, file, reference);
  return {
    scannedCandidateFiles: files.map((path) => relative(candidate, path)),
    localTsconfigFiles: [...configVisited].map((path) => relative(candidate, path)).sort(),
    dependencyReferences: references.length,
    generatedSubpathExclusions: [...GENERATED_SUBPATHS],
    dependencyDirectoryExclusion: 'node_modules at any candidate depth',
    scope:
      'All maintained candidate JS/TS files and finite literal Babel, Expo and tsconfig dependency references',
    nonCoverage:
      'Metro string module references (including babelTransformerPath and minifierPath) and alternate config lookup are not scanned; Podfile/Gradle provider-context commands remain owned by PHASE-1 native source, materialization and toolchain qualification; arbitrary native-language/config execution is not scanned',
  };
}
