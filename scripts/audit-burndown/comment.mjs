// Rendering for the per-commit PR comments the burndown posts — one comment per
// fix carrying the issue, how it was solved, and any adversarial catch. Kept in
// its own module so burndown.mjs and the backfill share one implementation and
// it can be unit-tested (burndown.mjs runs its loop on import and can't be).

// Pull the finding's Problem section for the "what was wrong" half of the
// comment; fall back to the File(s) line if the finding has no Problem heading.
export function findingProblem(issue) {
  const lines = (issue ?? '').split('\n');
  const start = lines.findIndex((l) => /^####\s+Problem/i.test(l));
  if (start === -1) return (lines.find((l) => /^\*\*File/i.test(l)) ?? '').trim();
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^####\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  let text = lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
  if (text.length > 800) {
    // Cut at a line boundary (not mid-line) so a snippet stays readable.
    const cut = text.slice(0, 800);
    const nl = cut.lastIndexOf('\n');
    text = `${(nl > 0 ? cut.slice(0, nl) : cut).trimEnd()}\n…`;
  }
  // Balance a dangling ``` fence — from truncation, or a malformed finding — so
  // the rest of the comment doesn't render as one big code block.
  if ((text.match(/```/g)?.length ?? 0) % 2 === 1) text += '\n```';
  return text;
}

// GitHub linkifies a bare #<digits> into an issue/PR reference; escape those in
// these machine-authored bodies so a finding that mentions "#42" doesn't ping an
// unrelated PR (CLAUDE.md, "Writing on GitHub").
export const escapeHashRefs = (s) => s.replace(/#(\d)/g, '\\#$1');

export function commitCommentBody({ sha, title, problem, fix, catches, e2eSpecs }) {
  const b = [`### \`${(sha ?? '').slice(0, 12)}\` — ${title}`, ''];
  if (problem) b.push('**Issue**', '', problem, '');
  b.push('**Fix**', '', fix || '_(implementer reported no summary)_', '');
  if (catches?.length) {
    b.push(
      '**Adversarial review** — reviewer caught the following; addressed before approval:',
      ''
    );
    for (const c of catches) b.push(`- ${c}`);
    b.push('');
  } else {
    b.push('**Adversarial review** — approved on the first pass; no changes needed.', '');
  }
  if (e2eSpecs?.length) b.push(`**E2E gate** — \`${e2eSpecs.join(' ')}\``, '');
  return escapeHashRefs(b.join('\n').trimEnd());
}
