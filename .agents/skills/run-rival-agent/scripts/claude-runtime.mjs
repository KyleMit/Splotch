import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CLOUD_CLAUDE_VERSION = '2.1.287';
export const CLOUD_REPOSITORY = '/workspace/Splotch';
export const CLOUD_CLI_DIRECTORY = '/workspace/.cache/claude-code';
export const CLOUD_INSTALL_ROOT = '/workspace/.cache/splotch-rival-agent';
export const CLOUD_CONFIG_DIRECTORY = join(CLOUD_CLI_DIRECTORY, 'state');
export const DESKTOP_CLAUDE_PATH = '/Users/kylemit/.local/bin/claude';

export function isManagedCloud() {
  return process.platform === 'linux' && existsSync('/etc/codex/network-policy.json');
}

// The explicit selection lets the tests exercise both hosts on a Linux CI runner.
export function resolveClaudeRuntime(cloud = isManagedCloud()) {
  return cloud
    ? {
        cloud: true,
        command: join(CLOUD_CLI_DIRECTORY, 'node_modules/.bin/claude'),
        projectsDirectory: join(CLOUD_CONFIG_DIRECTORY, 'projects'),
        installRoot: CLOUD_INSTALL_ROOT,
        ledgerDirectory: '/workspace/.cache/splotch-rival-state/ledger',
        environment: {
          CLAUDE_CONFIG_DIR: CLOUD_CONFIG_DIRECTORY,
          DISABLE_AUTOUPDATER: '1',
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        },
      }
    : {
        cloud: false,
        command: DESKTOP_CLAUDE_PATH,
        projectsDirectory: '/Users/kylemit/.claude/projects',
        installRoot: join(homedir(), '.local/libexec/splotch-rival-agent'),
        environment: {},
      };
}

export const CLAUDE_RUNTIME = resolveClaudeRuntime();
