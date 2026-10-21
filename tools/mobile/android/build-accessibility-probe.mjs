import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { isMain, ROOT } from '../../lib/proc.mjs';

const SOURCE_DIR = fileURLToPath(new URL('./probes/accessibility-action/', import.meta.url));
const NATIVE_DIR = join(ROOT, 'experiments/native-architecture/android');
const PROJECT_NAME = 'parityAccessibilityProbe';
const PROBE_SOURCES = [
  'AndroidManifest.xml',
  'build.gradle',
  'src/art/splotch/parity/driver/AccessibilityActionProbe.java',
];
const groovyLiteral = (value) =>
  `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n').replaceAll('\r', '\\r')}'`;

function outsideDirectory(root, path) {
  const distance = relative(root, path);
  return distance === '..' || distance.startsWith(`..${sep}`);
}

function regularFile(path) {
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
    throw new Error(`Expected a regular file: ${path}`);
  }
}

export function prepareAccessibilityProbeProject({ outputDir, nativeDir }) {
  const output = resolve(outputDir);
  const native = resolve(nativeDir);
  if (existsSync(output))
    throw new Error('Output already exists; preserve it and select a fresh directory');
  if (!outsideDirectory(ROOT, output))
    throw new Error('Output must be private and outside the checkout');
  if (!existsSync(dirname(output)) || !lstatSync(dirname(output)).isDirectory()) {
    throw new Error('Output parent must be an existing directory');
  }
  regularFile(join(native, 'settings.gradle'));
  regularFile(join(native, 'app/build.gradle'));
  const canonicalOutput = join(realpathSync.native(dirname(output)), basename(output));
  if (!outsideDirectory(realpathSync.native(ROOT), canonicalOutput))
    throw new Error('Output parent resolves inside the checkout');
  const sources = PROBE_SOURCES.map((path) => ({
    path,
    bytes: readFileSync(join(SOURCE_DIR, path)),
  }));
  mkdirSync(output, { mode: 0o700 });
  const project = join(output, 'project');
  cpSync(SOURCE_DIR, project, { recursive: true, errorOnExist: true, force: false });
  const include = join(output, 'include-probe.gradle');
  writeFileSync(
    include,
    `settingsEvaluated { settings ->\n    if (settings.settingsDir.canonicalFile == new File(${groovyLiteral(native)}).canonicalFile) {\n        settings.include ':${PROJECT_NAME}'\n        settings.project(':${PROJECT_NAME}').projectDir = new File(${groovyLiteral(project)})\n    }\n}\n`,
    { mode: 0o600 }
  );
  const sourceManifest = sources.map(({ path, bytes }) => ({
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }));
  return { output, native, project, include, sourceManifest };
}

export function runBuildAccessibilityProbe(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { output: { type: 'string' } },
    strict: true,
  });
  if (!values.output) throw new Error('Required: --output <fresh-private-directory>');
  const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  if (git(['status', '--porcelain']))
    throw new Error('Commit the reviewable source before building its diagnostic APK');
  const source = git(['rev-parse', 'HEAD']);
  const plan = prepareAccessibilityProbeProject({
    outputDir: values.output,
    nativeDir: NATIVE_DIR,
  });
  const command = [
    `:${PROJECT_NAME}:assembleRelease`,
    '--no-daemon',
    '--max-workers=2',
    '--console=plain',
    '--init-script',
    plan.include,
  ];
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.PERF_MARKS;
  delete env.PUBLIC_ENABLE_DEV_HARNESS;
  const log = openSync(join(plan.output, 'build.log.txt'), 'wx', 0o600);
  let result;
  try {
    result = spawnSync(join(plan.native, 'gradlew'), command, {
      cwd: plan.native,
      env,
      stdio: ['ignore', log, log],
    });
  } finally {
    closeSync(log);
  }
  const record = {
    source,
    inputs: plan.sourceManifest,
    command,
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message,
    installed: false,
    newSigningIdentity: false,
  };
  if (result.status === 0) {
    try {
      const apkDir = join(plan.project, 'build/outputs/apk/release');
      const artifacts = readdirSync(apkDir).filter((name) => name.endsWith('.apk'));
      if (artifacts.length !== 1) throw new Error('Expected exactly one diagnostic APK');
      const apk = join(apkDir, artifacts[0]);
      regularFile(apk);
      const bytes = readFileSync(apk);
      record.apk = {
        path: relative(plan.output, apk),
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
      record.sourceTreeStillClean = git(['status', '--porcelain']) === '';
      if (!record.sourceTreeStillClean)
        record.invalidated = 'Source changed during build; no artifact admission';
    } catch (error) {
      record.invalidated = error.message;
    }
  }
  writeFileSync(join(plan.output, 'build-record.json'), `${JSON.stringify(record, null, 2)}\n`, {
    mode: 0o600,
  });
  if (result.status !== 0 || !record.sourceTreeStillClean || record.invalidated)
    throw new Error(
      'Build failed or source changed; retain the private build record and logs before retry'
    );
  console.log('Accessibility diagnostic APK built. No installation or device action performed.');
}

if (isMain(import.meta.url)) runBuildAccessibilityProbe(process.argv.slice(2));
