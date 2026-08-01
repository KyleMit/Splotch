import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, isMain, runMain } from './lib/proc.mjs';
import { COMPLETED_RELEASE_TAGS_FILE } from './perf/ipad-release-rig-job.mjs';

const LABEL_PREFIX = 'art.splotch.ipad-perf';
const STATE_DIR = join(homedir(), 'Library', 'Application Support', 'SplotchPerfRig');

const xml = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function releaseRigPlist({ cadence, repo, deviceId, deviceModel, nodePath, logDir }) {
  if (!['fast', 'release'].includes(cadence)) throw new Error('cadence must be fast or release');
  const fast = cadence === 'fast';
  const label = `${LABEL_PREFIX}-${cadence}`;
  const args = [
    nodePath,
    join(repo, 'scripts', 'perf', 'ipad-release-rig-job.mjs'),
    `--cadence=${cadence}`,
    `--repo=${repo}`,
    `--device-id=${deviceId}`,
    `--device-model=${deviceModel}`,
  ];
  const calendar = fast
    ? '<key>Weekday</key><integer>1</integer><key>Hour</key><integer>3</integer><key>Minute</key><integer>0</integer>'
    : '<key>Hour</key><integer>4</integer><key>Minute</key><integer>0</integer>';
  const programArguments = args.map((arg) => `<string>${xml(arg)}</string>`).join('');
  const logPath = join(logDir, `${label}.log`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${programArguments}</array>
<key>WorkingDirectory</key><string>${xml(repo)}</string>
<key>StartCalendarInterval</key><dict>${calendar}</dict>
<key>ProcessType</key><string>Background</string>
<key>LowPriorityIO</key><true/>
<key>Nice</key><integer>10</integer>
<key>Umask</key><integer>63</integer>
<key>StandardOutPath</key><string>${xml(logPath)}</string>
<key>StandardErrorPath</key><string>${xml(logPath)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(`${dirname(nodePath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`)}</string></dict>
</dict></plist>
`;
}

function gitOutput(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${result.status ?? 'without a status'}`);
  }
  return result.stdout.trim();
}

function launchctl(args, allowFailure = false) {
  const result = spawnSync('launchctl', args, { stdio: 'inherit' });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`launchctl ${args.join(' ')} exited ${result.status}`);
  }
}

export async function installIpadReleaseRig(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      repo: { type: 'string', default: ROOT },
      'device-id': { type: 'string' },
      'device-model': { type: 'string' },
      install: { type: 'boolean', default: false },
      kickstart: { type: 'boolean', default: false },
    },
  });
  if (!values['device-id'] || !values['device-model']) {
    throw new Error('--device-id and --device-model are required');
  }
  const repo = resolve(values.repo);
  const launchAgents = join(homedir(), 'Library', 'LaunchAgents');
  const logDir = join(homedir(), 'Library', 'Logs', 'Splotch');
  const plists = ['fast', 'release'].map((cadence) => ({
    cadence,
    label: `${LABEL_PREFIX}-${cadence}`,
    path: join(launchAgents, `${LABEL_PREFIX}-${cadence}.plist`),
    content: releaseRigPlist({
      cadence,
      repo,
      deviceId: values['device-id'],
      deviceModel: values['device-model'],
      nodePath: process.execPath,
      logDir,
    }),
  }));
  if (!values.install) {
    if (values.kickstart) throw new Error('--kickstart requires --install');
    for (const plist of plists) console.log(`# ${plist.path}\n${plist.content}`);
    return plists;
  }
  if (process.platform !== 'darwin') throw new Error('launchd installation requires macOS');
  mkdirSync(launchAgents, { recursive: true });
  mkdirSync(logDir, { recursive: true, mode: 0o700 });
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  const releaseState = join(STATE_DIR, COMPLETED_RELEASE_TAGS_FILE);
  if (!existsSync(releaseState)) {
    const tags = gitOutput(repo, [
      'tag',
      '--list',
      'v*',
      '--merged',
      'main',
      '--sort=version:refname',
    ])
      .split('\n')
      .filter(Boolean);
    writeFileSync(releaseState, `${JSON.stringify(tags, null, 2)}\n`, { mode: 0o600 });
  }
  const domain = `gui/${process.getuid()}`;
  for (const plist of plists) {
    writeFileSync(plist.path, plist.content, { mode: 0o600 });
    chmodSync(plist.path, 0o600);
    launchctl(['bootout', domain, plist.path], true);
    launchctl(['bootstrap', domain, plist.path]);
    launchctl(['enable', `${domain}/${plist.label}`]);
    if (values.kickstart) launchctl(['kickstart', `${domain}/${plist.label}`]);
    console.log(`Installed ${plist.path}`);
  }
  return plists;
}

if (isMain(import.meta.url)) runMain(installIpadReleaseRig);
