// Pure readiness rules for cutting a release: what must be true of the commit
// about to become the release's parent before cut-release.mjs is allowed to
// commit, tag, and push. Kept free of git/gh calls so the rules are testable
// without a network; check-release-readiness.mjs gathers the inputs.
//
// The commit under test is the CURRENT HEAD, not the release commit — the
// release commit does not exist yet, and it only ever changes the release
// paths cut-release.mjs owns, so its parent's CI verdict is the one that
// describes the code being shipped.

export const CHECK_RUN_CONCLUSIONS_THAT_PASS = new Set(['success', 'skipped', 'neutral']);

// Tag-only workflows never run against main, so a green main says nothing
// about them. Naming them here lets the readiness report say which gates the
// release will meet for the first time only after the tag exists.
export const TAG_ONLY_GATES = [
  { workflow: 'android-deploy.yml', name: 'Android Deploy Smoke' },
  { workflow: 'ios-deploy.yml', name: 'iOS Deploy Smoke' },
  { workflow: 'test.yml', name: 'WebKit commit gate (full)' },
];

export function summarizeCheckRuns(checkRuns) {
  const failing = [];
  const pending = [];
  for (const run of checkRuns) {
    if (run.status !== 'completed') {
      pending.push(run.name);
      continue;
    }
    if (!CHECK_RUN_CONCLUSIONS_THAT_PASS.has(run.conclusion)) {
      failing.push(`${run.name} (${run.conclusion})`);
    }
  }
  return { total: checkRuns.length, failing, pending };
}

export function readinessProblems({ head, upstream, branch, checkRuns, dirtyPaths = [] }) {
  const problems = [];
  if (branch !== 'main') problems.push(`on branch ${branch ?? '(detached)'}, not main`);
  if (head !== upstream) {
    problems.push(
      `HEAD ${head.slice(0, 12)} is not origin/main ${upstream.slice(0, 12)} — pull or push first`
    );
  }
  if (dirtyPaths.length) problems.push(`working tree has ${dirtyPaths.length} uncommitted path(s)`);

  const summary = summarizeCheckRuns(checkRuns);
  if (summary.total === 0) problems.push('no CI check runs reported for HEAD yet');
  if (summary.pending.length) problems.push(`CI still running: ${summary.pending.join(', ')}`);
  if (summary.failing.length) problems.push(`CI failed: ${summary.failing.join(', ')}`);
  return problems;
}

export function renderReadiness({ head, problems, checkRuns, rehearsed = false }) {
  const summary = summarizeCheckRuns(checkRuns);
  const lines = [`Release readiness for ${head.slice(0, 12)}`, ''];
  lines.push(
    `  check runs: ${summary.total} (${summary.failing.length} failing, ${summary.pending.length} pending)`
  );
  for (const problem of problems) lines.push(`  ✗ ${problem}`);
  if (!problems.length) lines.push('  ✓ HEAD is origin/main and its CI is green');
  lines.push('');
  lines.push(
    rehearsed
      ? '  tag-only gates were rehearsed on this commit'
      : `  not covered until the tag exists: ${TAG_ONLY_GATES.map((g) => g.name).join(', ')}`
  );
  return lines.join('\n');
}
