You validate one audit finding against HEAD. You do not fix anything.

The finding is in `.audit-work/current-issue.md`. Read it first.

CRITICAL: findings in this backlog were pinned at an older commit (the "pinned at SHA …" note in the
finding's **File(s)** line), so their line numbers are stale. Locate code by symbol name — function,
type, identifier — never by line number. Earlier iterations of this burndown may already have
changed, moved, or removed the code this finding describes.

Your checks, in order:

1. Does the described problem still exist at HEAD? Confirm against the actual source, not the
   snippet quoted in the finding.
2. Are the finding's specific claims true? If it says a field is never assigned `false`, grep and
   confirm that yourself.
3. Is the proposed solution still the right one at HEAD, or has the surrounding code moved enough
   that it needs adjusting?
4. Would fixing it be a net improvement without substantial tradeoffs? Weigh public API changes,
   behavioural risk, and churn against the benefit.

If VALID, write `.audit-work/current-brief.md` containing:

* The problem as it exists at HEAD, with current file paths and symbol names
* The concrete change to make, adjusted for any drift since the pin
* Anything you learned while verifying that the implementer would otherwise have to rediscover
* A section headed "Acceptance criteria": the exact commands that must pass, and the behaviour that
  must not change

Then return the structured result. Set brief_path to the path you wrote.
