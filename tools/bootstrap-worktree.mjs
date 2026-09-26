import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { isMain } from './lib/proc.mjs';

const FAILURE_DETAIL_CHAR_LIMIT = 800;
const MAIN_REF = 'refs/heads/main';
const REMOTE_MAIN_REF = 'refs/remotes/origin/main';
const IS_ANCESTOR_EXIT = 0;
const NOT_ANCESTOR_EXIT = 1;
const REF_EXISTS_EXIT = 0;
const REF_MISSING_EXIT = 1;
// Git writes these reflog subjects untranslated when it creates or renames a branch; any other
// entry — a commit, merge, reset, or pull — means the ref has moved since it was cut.
const CREATION_REFLOG_PREFIXES = ['branch: Created from ', 'Branch: renamed '];
// Marks each reflog line so a blank subject survives output trimming as an entry of its own.
const REFLOG_ENTRY_MARK = 'entry:';

export const RUNNERS = ['claude', 'codex'];

function runProcess(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
}

function failureDetail(result) {
  const output = result.stderr?.trim() || result.stdout?.trim() || result.error?.message;
  if (output) return output.slice(-FAILURE_DETAIL_CHAR_LIMIT);
  if (result.signal) return `terminated by ${result.signal}`;
  return `exit ${result.status ?? 'unknown'}`;
}

function requireCommand(runCommand, command, args, cwd, failureMessage) {
  const result = runCommand(command, args, cwd);
  if (result.status !== 0) {
    throw new Error(`${failureMessage}: ${failureDetail(result)}`);
  }
  return result.stdout?.trim() ?? '';
}

function readLocalMain(runCommand, repoRoot) {
  const result = runCommand('git', ['rev-parse', MAIN_REF], repoRoot);
  if (result.status !== 0) return null;
  return result.stdout?.trim() ?? '';
}

function updateStaleMainWorktree(runCommand, repoRoot) {
  const trackedChanges = requireCommand(
    runCommand,
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    repoRoot,
    'Could not inspect tracked worktree changes'
  );
  if (trackedChanges) {
    throw new Error(
      'tracked changes are present. Preserve or discard them explicitly before restarting the session.'
    );
  }

  requireCommand(
    runCommand,
    'git',
    ['fetch', '--no-tags', 'origin', 'main'],
    repoRoot,
    'Could not fetch origin/main; check network and remote access, then restart the session'
  );
  const fetchedHead = requireCommand(
    runCommand,
    'git',
    ['rev-parse', 'FETCH_HEAD'],
    repoRoot,
    'Could not read the fetched main commit'
  );
  requireCommand(
    runCommand,
    'git',
    ['checkout', '--detach', 'FETCH_HEAD'],
    repoRoot,
    'Could not detach the worktree at fetched origin/main'
  );
  const checkedOutHead = requireCommand(
    runCommand,
    'git',
    ['rev-parse', 'HEAD'],
    repoRoot,
    'Could not verify the checked-out commit'
  );
  if (checkedOutHead !== fetchedHead) {
    throw new Error(
      `checkout verification failed: HEAD is ${checkedOutHead}, expected ${fetchedHead}.`
    );
  }
}

function tryEnablePnpmShim(runCommand, repoRoot) {
  runCommand('corepack', ['enable', 'pnpm'], repoRoot);
}

function provisionDependencies(runCommand, repoRoot) {
  tryEnablePnpmShim(runCommand, repoRoot);
  requireCommand(
    runCommand,
    'corepack',
    ['install'],
    repoRoot,
    'Could not provision the pinned pnpm version'
  );
  requireCommand(
    runCommand,
    'pnpm',
    ['install', '--frozen-lockfile', '--prefer-offline'],
    repoRoot,
    'Could not install project dependencies; check the pnpm output, then restart the session'
  );
  requireCommand(
    runCommand,
    'npm',
    ['run', 'info'],
    repoRoot,
    'Dependency verification failed because npm run info did not succeed'
  );
}

function readBranch(runCommand, repoRoot) {
  return requireCommand(
    runCommand,
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    repoRoot,
    'Could not inspect HEAD'
  );
}

/**
 * A Codex worktree starts detached at whatever local `main` pointed to when it was cut, so it
 * needs a refresh before the first turn. Any other detached HEAD — a rival agent's review
 * worktree pinned to a PR head, a bisect — is a deliberate position and is never moved.
 */
function isDetachedAtLocalMain(runCommand, repoRoot) {
  const initialHead = requireCommand(
    runCommand,
    'git',
    ['rev-parse', 'HEAD'],
    repoRoot,
    'Could not read the initial worktree commit'
  );
  const localMain = readLocalMain(runCommand, repoRoot);
  return localMain !== null && initialHead === localMain;
}

function isPublished(runCommand, repoRoot, branch) {
  const upstream = requireCommand(
    runCommand,
    'git',
    ['for-each-ref', '--format=%(upstream)', `refs/heads/${branch}`],
    repoRoot,
    'Could not read the branch upstream'
  );
  if (upstream) return true;
  const remoteBranch = runCommand(
    'git',
    ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`],
    repoRoot
  );
  if (remoteBranch.status === REF_EXISTS_EXIT) return true;
  if (remoteBranch.status === REF_MISSING_EXIT) return false;
  throw new Error(`Could not look up origin/${branch}: ${failureDetail(remoteBranch)}`);
}

function isAtRemoteMain(runCommand, repoRoot) {
  const [head, remoteMain] = requireCommand(
    runCommand,
    'git',
    ['rev-parse', 'HEAD', REMOTE_MAIN_REF],
    repoRoot,
    `Could not compare HEAD with ${REMOTE_MAIN_REF}`
  ).split('\n');
  return head === remoteMain;
}

/**
 * The desktop app creates a session branch without writing any reflog entry, so an empty reflog
 * is the normal fresh shape — but it is also what an expired reflog or
 * `core.logAllRefUpdates=false` leaves behind. An empty reflog is therefore trusted only while
 * HEAD sits exactly on the last-known `origin/main`, where a default-base worktree is cut.
 */
function hasNeverMoved(runCommand, repoRoot, branch) {
  const reflog = requireCommand(
    runCommand,
    'git',
    ['reflog', 'show', `--format=${REFLOG_ENTRY_MARK}%gs`, `refs/heads/${branch}`],
    repoRoot,
    'Could not read the branch reflog'
  );
  if (!reflog) return isAtRemoteMain(runCommand, repoRoot);
  return reflog.split('\n').every((line) => {
    const subject = line.slice(REFLOG_ENTRY_MARK.length);
    return CREATION_REFLOG_PREFIXES.some((prefix) => subject.startsWith(prefix));
  });
}

function isAncestorOfRemoteMain(runCommand, repoRoot) {
  const result = runCommand(
    'git',
    ['merge-base', '--is-ancestor', 'HEAD', REMOTE_MAIN_REF],
    repoRoot
  );
  if (result.status === IS_ANCESTOR_EXIT) return true;
  if (result.status === NOT_ANCESTOR_EXIT) return false;
  throw new Error(`Could not compare HEAD with ${REMOTE_MAIN_REF}: ${failureDetail(result)}`);
}

/**
 * A Claude Code worktree arrives on its own branch cut from `origin/main` as the shared repository
 * last fetched it, which can already be behind the remote. The branch may move only while it
 * provably carries no work, so a resumed session or a worktree with real work stays where it is:
 * nothing uncommitted (untracked files included), never published, a ref that has not moved since
 * it was created, and HEAD already on `origin/main`. Ancestry alone is not enough — a commit that
 * reached `main` and was reverted there still passes it — so the reflog supplies the provenance.
 * Every check is local and runs against the last-known `origin/main`, so a branch with work never
 * pays for a fetch; `main` only moves forward, and the `--ff-only` merge refuses if it ever does
 * not.
 */
function isUnworkedBranch(runCommand, repoRoot, branch) {
  const changes = requireCommand(
    runCommand,
    'git',
    ['status', '--porcelain', '--untracked-files=normal'],
    repoRoot,
    'Could not inspect worktree changes'
  );
  if (changes) return false;
  if (isPublished(runCommand, repoRoot, branch)) return false;
  if (!hasNeverMoved(runCommand, repoRoot, branch)) return false;
  return isAncestorOfRemoteMain(runCommand, repoRoot);
}

function fastForwardToFetchedMain(runCommand, repoRoot) {
  const initialHead = requireCommand(
    runCommand,
    'git',
    ['rev-parse', 'HEAD'],
    repoRoot,
    'Could not read the initial worktree commit'
  );
  requireCommand(
    runCommand,
    'git',
    ['fetch', '--no-tags', 'origin', 'main'],
    repoRoot,
    'Could not fetch origin/main'
  );
  const fetchedHead = requireCommand(
    runCommand,
    'git',
    ['rev-parse', 'FETCH_HEAD'],
    repoRoot,
    'Could not read the fetched main commit'
  );
  if (fetchedHead === initialHead) return;

  requireCommand(
    runCommand,
    'git',
    ['merge', '--ff-only', fetchedHead],
    repoRoot,
    'Could not fast-forward the branch to the fetched origin/main'
  );
  const mergedHead = requireCommand(
    runCommand,
    'git',
    ['rev-parse', 'HEAD'],
    repoRoot,
    'Could not verify the fast-forwarded commit'
  );
  if (mergedHead !== fetchedHead) {
    throw new Error(
      `fast-forward verification failed: HEAD is ${mergedHead}, expected ${fetchedHead}.`
    );
  }
}

/**
 * A stale start is recoverable in-session with one command, and a refused `--ff-only` merge leaves
 * HEAD where it was, so a failed refresh warns and lets provisioning continue rather than costing
 * the session.
 */
function refreshUnworkedBranch(runCommand, repoRoot, branch, onWarning) {
  try {
    if (isUnworkedBranch(runCommand, repoRoot, branch)) {
      fastForwardToFetchedMain(runCommand, repoRoot);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    onWarning(
      `Could not bring branch ${branch} up to date with origin/main (${reason}). It may start ` +
        'behind origin/main: run `git fetch origin main && git merge --ff-only origin/main`, then ' +
        '`pnpm install --frozen-lockfile`, before starting work.'
    );
  }
}

export function bootstrapWorktree({
  cwd = process.cwd(),
  runCommand = runProcess,
  onWarning = () => {},
} = {}) {
  try {
    const gitDir = requireCommand(
      runCommand,
      'git',
      ['rev-parse', '--path-format=absolute', '--git-dir'],
      cwd,
      'Could not inspect the Git directory'
    );
    const commonDir = requireCommand(
      runCommand,
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      cwd,
      'Could not inspect the common Git directory'
    );

    if (gitDir === commonDir) return null;

    const repoRoot = requireCommand(
      runCommand,
      'git',
      ['rev-parse', '--show-toplevel'],
      cwd,
      'Could not locate the linked worktree root'
    );

    const branch = readBranch(runCommand, repoRoot);
    if (branch === 'HEAD') {
      if (isDetachedAtLocalMain(runCommand, repoRoot)) {
        updateStaleMainWorktree(runCommand, repoRoot);
      }
    } else {
      refreshUnworkedBranch(runCommand, repoRoot, branch, onWarning);
    }
    provisionDependencies(runCommand, repoRoot);

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Claude Code leaves `CLAUDE_PROJECT_DIR` — and so the hook command's own path — pointing at the
 * main checkout, and reports the worktree only through the payload's `cwd`.
 */
export function readHookCwd(payload) {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    const cwd = parsed?.cwd;
    return typeof cwd === 'string' && cwd ? cwd : null;
  } catch {
    return null;
  }
}

function readStdin() {
  if (process.stdin.isTTY) return null;
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return null;
  }
}

function parseRunner(argv) {
  const flag = argv.find((arg) => arg.startsWith('--runner='));
  const runner = flag?.slice('--runner='.length);
  if (!RUNNERS.includes(runner)) {
    throw new Error(`--runner must be one of ${RUNNERS.join(', ')}`);
  }
  return runner;
}

const RECOVERY_INSTRUCTION =
  'This worktree may have no dependencies installed. Run `pnpm install --frozen-lockfile` in the ' +
  'worktree root before any npm script, and report the failure above if it recurs.';

/**
 * Codex reads a stop decision from the hook's stdout. Claude Code splits the two audiences across
 * two fields and cannot merge them: `systemMessage` reaches only the user, and only
 * `hookSpecificOutput.additionalContext` reaches the model. SessionStart cannot block on any exit
 * code, and a schema-valid JSON body makes Claude Code ignore the exit code entirely rather than
 * report an error — so the session always starts and the exit code is 0, the documented one for
 * structured output.
 */
export function reportFailure(runner, reason) {
  const message = `Splotch worktree bootstrap stopped: ${reason}`;
  if (runner === 'codex') {
    return {
      stdout: { continue: false, stopReason: message, systemMessage: message },
      exitCode: 0,
    };
  }
  return {
    stdout: {
      systemMessage: message,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `${message}\n${RECOVERY_INSTRUCTION}`,
      },
    },
    stderr: message,
    exitCode: 0,
  };
}

/**
 * Both runners read the same SessionStart output schema, so a warning takes one shape: omitting
 * `continue: false` is what lets a Codex session start, and the two fields reach the user and the
 * model as they do in a Claude failure report.
 */
export function reportWarning(warning) {
  const message = `Splotch worktree bootstrap warning: ${warning}`;
  return {
    stdout: {
      systemMessage: message,
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: message },
    },
    stderr: message,
    exitCode: 0,
  };
}

export function reportOutcome(runner, { failure, warning }) {
  if (failure) return reportFailure(runner, warning ? `${failure}\n${warning}` : failure);
  if (warning) return reportWarning(warning);
  return null;
}

if (isMain(import.meta.url)) {
  const runner = parseRunner(process.argv.slice(2));
  const cwd = readHookCwd(readStdin()) ?? process.cwd();
  let warning = null;
  const failure = bootstrapWorktree({
    cwd,
    onWarning: (message) => {
      warning = message;
    },
  });
  const report = reportOutcome(runner, { failure, warning });
  if (report) {
    const { stdout, stderr, exitCode } = report;
    if (stderr) process.stderr.write(`${stderr}\n`);
    process.stdout.write(`${JSON.stringify(stdout)}\n`);
    process.exitCode = exitCode;
  }
}
