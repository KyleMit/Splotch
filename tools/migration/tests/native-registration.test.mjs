import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import prettier from 'prettier';
import stylelint from 'stylelint';
import { parseDocument } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { QUALITY_COMMANDS } from '../../ci-mirror/run-quality-checks.mjs';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';

const root = join(import.meta.dirname, '..', '..', '..');
const formatterFixtures = [];

afterEach(() => formatterFixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

const read = (path) => readFileSync(join(root, path), 'utf8');
const sourceCommand = 'npm run check:migration:native-candidate';
const topologyCommand = 'npm run check:migration:native-topology';
const materializerScript = 'gen:migration:native-candidate';
const manifest = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/test.yml');
const manualEntry =
  /(?:materialize-native-candidate\.mjs|gen:migration:native-candidate|inspect-android-candidate-archives\.mjs)/;

function registrationViolations(packageManifest, commands, source) {
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) return ['invalid workflow'];
  const job = document.toJS().jobs?.quality;
  const failures = [];
  const steps = Array.isArray(job?.steps) ? job.steps : [];
  const matches = steps.filter((step) => step.run === sourceCommand);
  if (
    job?.if !== "${{ github.event_name != 'push' || !startsWith(github.ref, 'refs/tags/') }}" ||
    job?.['continue-on-error'] ||
    matches.length !== 1 ||
    Object.hasOwn(matches[0], 'if') ||
    Object.hasOwn(matches[0], 'continue-on-error')
  )
    failures.push('native source CI step is not mandatory');
  if (
    commands.filter((command) => command === sourceCommand).length !== 1 ||
    commands.filter((command) => command === topologyCommand).length !== 1 ||
    commands.indexOf(sourceCommand) !== commands.indexOf(topologyCommand) + 1
  )
    failures.push('native source local order differs');
  if (
    steps.filter((step) => step.run === topologyCommand).length !== 1 ||
    steps.findIndex((step) => step.run === sourceCommand) !==
      steps.findIndex((step) => step.run === topologyCommand) + 1
  )
    failures.push('native source CI order differs');
  for (const [script, entry] of [
    ['check:migration:native-candidate', 'node tools/migration/check-native-candidate.mjs'],
    [materializerScript, 'node tools/migration/materialize-native-candidate.mjs'],
  ]) {
    if (packageManifest.scripts?.[script] !== entry)
      failures.push(`native entry changed: ${script}`);
    if (!packageManifest['scripts-info']?.[script]?.trim())
      failures.push(`native description missing: ${script}`);
  }
  if (
    commands.some((command) => manualEntry.test(command)) ||
    steps.some((step) => manualEntry.test(step.run ?? ''))
  )
    failures.push('manual native operation in Quality');
  for (const [name, command] of Object.entries(packageManifest.scripts ?? {})) {
    if (/^(?:pre|post)|^(?:install|prepare)$/.test(name) && manualEntry.test(command))
      failures.push(`manual native operation in lifecycle: ${name}`);
  }
  return failures;
}

function mutatedWorkflow(mutate) {
  const document = parseDocument(workflow, { uniqueKeys: true });
  mutate(document.getIn(['jobs', 'quality']));
  return document.toString();
}

function sourceStep(job) {
  return job.get('steps').items.find((step) => step.get('run') === sourceCommand);
}

describe('maintained native source registration', () => {
  it('executes the source checker after topology in both Quality owners with manual materialization', () => {
    expect(registrationViolations(manifest, QUALITY_COMMANDS, workflow)).toEqual([]);
  });

  it('rejects missing, ignored, conditional and duplicate CI source execution', () => {
    for (const mutate of [
      (job) => sourceStep(job).set('run', 'node -e 0'),
      (job) => sourceStep(job).set('if', false),
      (job) => sourceStep(job).set('continue-on-error', true),
      (job) => job.get('steps').add(sourceStep(job).clone()),
      (job) => job.set('if', false),
    ]) {
      expect(registrationViolations(manifest, QUALITY_COMMANDS, mutatedWorkflow(mutate))).toContain(
        'native source CI step is not mandatory'
      );
    }
  });

  it('rejects local omission, wrong CLI bindings and materialization in lifecycle or Quality', () => {
    expect(
      registrationViolations(
        manifest,
        QUALITY_COMMANDS.filter((row) => row !== sourceCommand),
        workflow
      )
    ).toContain('native source local order differs');
    const wrong = structuredClone(manifest);
    wrong.scripts['check:migration:native-candidate'] = 'node -e 0';
    expect(registrationViolations(wrong, QUALITY_COMMANDS, workflow)).toContain(
      'native entry changed: check:migration:native-candidate'
    );
    wrong.scripts.prebuild = `npm run ${materializerScript}`;
    expect(registrationViolations(wrong, QUALITY_COMMANDS, workflow)).toContain(
      'manual native operation in lifecycle: prebuild'
    );
    expect(
      registrationViolations(
        manifest,
        [...QUALITY_COMMANDS, `npm run ${materializerScript}`],
        workflow
      )
    ).toContain('manual native operation in Quality');
  });
});

describe('maintained native formatter ownership', () => {
  it('includes candidate resource JSON while preserving shipping-native exclusions', async () => {
    for (const path of [
      'ios/Podfile.properties.json',
      'ios/HelloWorld/Images.xcassets/Contents.json',
    ]) {
      const maintained = `${CANDIDATE_DIRECTORY}/${path}`;
      const info = await prettier.getFileInfo(join(root, maintained), {
        ignorePath: join(root, '.prettierignore'),
      });
      expect(info.ignored, maintained).toBe(false);
      expect(info.inferredParser, maintained).toBe('json');
      const options = await prettier.resolveConfig(join(root, maintained));
      expect(
        await prettier.check(read(maintained), { ...options, filepath: join(root, maintained) })
      ).toBe(true);
      expect(
        await prettier.check('{"format":"rejecting control"}', {
          ...options,
          filepath: join(root, maintained),
        })
      ).toBe(false);
      const retained = spawnSync(
        'git',
        ['-c', 'core.excludesFile=/dev/null', 'check-ignore', '--no-index', maintained],
        { cwd: root, encoding: 'utf8' }
      );
      expect(retained.status).toBe(1);
    }
    for (const path of [
      'android/app/build.gradle',
      'ios/App/App/Info.plist',
      'tools/perf/ios/probe.mjs',
    ]) {
      expect(
        (
          await prettier.getFileInfo(join(root, path), {
            ignorePath: join(root, '.prettierignore'),
          })
        ).ignored,
        path
      ).toBe(true);
    }
    const owned = mkdtempSync(join(tmpdir(), 'splotch-native-formatter-control-'));
    formatterFixtures.push(owned);
    const ignore = join(owned, '.prettierignore');
    writeFileSync(ignore, read('.prettierignore'));
    for (const path of [
      `${CANDIDATE_DIRECTORY}/android/build/format-control.json`,
      `${CANDIDATE_DIRECTORY}/ios/format-control.md`,
      `${CANDIDATE_DIRECTORY}/ios/format-control.svg`,
      `${CANDIDATE_DIRECTORY}/android/node_modules/format-control.json`,
    ]) {
      const target = join(owned, path);
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(target, 'actual formatter exclusion control');
      expect(readFileSync(target, 'utf8')).toBe('actual formatter exclusion control');
      expect((await prettier.getFileInfo(target, { ignorePath: ignore })).ignored, path).toBe(true);
    }
  });

  it('keeps actual ESLint and stylelint candidate source checks active', async () => {
    const eslint = new ESLint({ cwd: root });
    expect(
      await eslint.isPathIgnored(join(root, CANDIDATE_DIRECTORY, 'src/RegistrationControl.tsx'))
    ).toBe(false);
    const messages = await eslint.lintText('export const value: any = 1;', {
      filePath: join(root, CANDIDATE_DIRECTORY, 'src/RegistrationControl.tsx'),
    });
    expect(messages[0].messages.map((message) => message.ruleId)).toContain(
      '@typescript-eslint/no-explicit-any'
    );
    const { results } = await stylelint.lint({
      code: '.a { colr: red; }',
      codeFilename: join(root, CANDIDATE_DIRECTORY, 'src/RegistrationControl.css'),
      cwd: root,
    });
    expect(results[0].warnings.map((warning) => warning.rule)).toContain('property-no-unknown');
  });
});
