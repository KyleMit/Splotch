import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { webHostCopyRoles } from '../../../migration/probes/web-host/host/contract.ts';
import { assertCopyInputs } from './web-host-inputs.mjs';

const ICON_GENERATOR_PATH = 'tools/icons/gen-icon-names.mjs';
const RELEASE_GENERATOR_PATH = 'tools/release/gen-release-notes.mjs';
const EXTRA_STAGE_HOOKS = ['preprebuild', 'postprebuild', 'prepostbuild', 'postpostbuild'];
const BUILD_OWNER_PATTERN = /^node tools\/run-web-tool\.mjs vite build$/;

function iconOutputPath(root) {
  const source = ts.createSourceFile(
    ICON_GENERATOR_PATH,
    readFileSync(join(root, ICON_GENERATOR_PATH), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  if (source.parseDiagnostics.length) throw new Error('Icon generator could not be parsed');
  const outputs = [];
  const writes = [];
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const) {
      for (const declaration of statement.declarationList.declarations)
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === 'OUT' &&
          declaration.initializer &&
          ts.isStringLiteral(declaration.initializer)
        )
          outputs.push(declaration.initializer.text);
    }
    if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)) {
      const call = statement.expression;
      if (
        ts.isIdentifier(call.expression) &&
        call.expression.text === 'writeFileSync' &&
        call.arguments[0] &&
        ts.isIdentifier(call.arguments[0]) &&
        call.arguments[0].text === 'OUT'
      )
        writes.push(call);
    }
  }
  if (outputs.length !== 1 || writes.length !== 1)
    throw new Error('Icon generator output owner changed');
  return outputs[0];
}

export async function generatedSourcePaths(owned, bindings) {
  for (const role of webHostCopyRoles(bindings.variant)) assertCopyInputs(owned, bindings, role);
  const root = join(owned.root, 'control');
  const release = await import(pathToFileURL(join(root, RELEASE_GENERATOR_PATH)).href);
  return [iconOutputPath(root), ...release.releaseNoteOutputPaths(release.readReleases())].sort();
}

export function stagedBuildScripts(root) {
  const { scripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts))
    throw new Error('Copied build script owner is missing');
  for (const hook of EXTRA_STAGE_HOOKS)
    if (Object.hasOwn(scripts, hook))
      throw new Error(`Staged build would change implicit hook behavior: ${hook}`);
  for (const name of ['prebuild', 'build', 'postbuild'])
    if (typeof scripts[name] !== 'string' || !scripts[name])
      throw new Error(`Missing staged owner: ${name}`);
  if (!BUILD_OWNER_PATTERN.test(scripts.build))
    throw new Error('Build owner is not the reviewed direct Vite caller');
  return { prebuild: scripts.prebuild, build: scripts.build, postbuild: scripts.postbuild };
}
