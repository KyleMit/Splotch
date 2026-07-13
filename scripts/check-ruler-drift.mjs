import { spawnSync } from 'node:child_process';

const trackedPaths = [
  'AGENTS.md',
  'CLAUDE.md',
  'android/AGENTS.md',
  'android/CLAUDE.md',
  'docs/handoff/AGENTS.md',
  'docs/handoff/CLAUDE.md',
  'scripts/AGENTS.md',
  'scripts/CLAUDE.md',
  'tools/asset-gen/AGENTS.md',
  'tools/asset-gen/CLAUDE.md',
  'web/src/AGENTS.md',
  'web/src/CLAUDE.md',
  'web/tests/AGENTS.md',
  'web/tests/CLAUDE.md',
  '.claude/skills',
  '.agents/skills',
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

const applyResult = run('npm', ['run', 'ruler:apply']);
if (applyResult.status !== 0) {
  process.exit(applyResult.status ?? 1);
}

const statusResult = run('git', ['status', '--porcelain', '--', ...trackedPaths], {
  capture: true,
});

if (statusResult.status !== 0) {
  process.stdout.write(statusResult.stdout ?? '');
  process.stderr.write(statusResult.stderr ?? '');
  process.exit(statusResult.status ?? 1);
}

const drift = statusResult.stdout.trim();
if (drift) {
  console.error(
    [
      'Generated agent files are out of sync with .ruler/.',
      'Run `npm run ruler:apply` and commit the generated result.',
      '',
      drift,
    ].join('\n'),
  );
  process.exit(1);
}

console.log('Generated agent files are in sync with .ruler/.');
