import { spawnSync } from 'node:child_process';

export function runGitHub(
  args,
  { cwd = process.cwd(), allowedExitCodes = [0], includeResult = false } = {}
) {
  const result = spawnSync('gh', args, { cwd, encoding: 'utf8' });
  if (result.error) throw new Error(`Cannot run gh: ${result.error.message}`);
  if (!allowedExitCodes.includes(result.status)) {
    throw new Error(
      `gh ${args.slice(0, 2).join(' ')} failed: ${result.stderr.trim() || `exit ${result.status}`}`
    );
  }
  return includeResult
    ? { status: result.status, stdout: result.stdout, stderr: result.stderr }
    : result.stdout;
}

export function parseGitHubJson(output, context) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${context} did not return JSON`);
  }
}

function parseRepository(value) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(value)) throw new Error(`Invalid repository: ${value}`);
  return value;
}

export function resolveRepository(repo, run = runGitHub) {
  if (repo) return parseRepository(repo);
  const result = parseGitHubJson(run(['repo', 'view', '--json', 'nameWithOwner']), 'gh repo view');
  return parseRepository(result.nameWithOwner);
}

export function parseIssueNumber(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || String(number) !== value) {
    throw new Error(`Expected a positive issue or PR number, got ${value ?? '(missing)'}`);
  }
  return number;
}
