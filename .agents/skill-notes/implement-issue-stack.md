# Implement issue stack — design notes

This is a direct Codex-only package because it orchestrates Codex subagents, GitHub stacks, and the
Codex-side `run-rival-agent` capability. Claude authentication, installation, permission policy, and
standalone-review publication live in `run-rival-agent`; this note records only issue-stack
decisions.

The orchestrator intentionally remains prose-driven while the checkpoint and reviewer seams are
fixed Node programs. GitHub stack behavior is new in `gh stack` 0.1.0, so the skill pins that
validated interface in preflight rather than pretending it is stable forever.

## Permission boundary

The stack workflow installs `run-rival-agent`'s Claude wrappers together with its own GitHub and
push rules. General `gh` and `git push` stay at `prompt`; PR/stack merge, repository deletion, and
GitHub logout remain forbidden. See the `run-rival-agent` design note for the Claude subprocess and
publication boundary.

The checkpoint names CI attempts `ciRepairContinuations`: only handing a confirmed failure back to
the implementer for product-code changes consumes the limit. Polls, infrastructure reruns,
controlled head/base diagnosis, support work on a shared gate, and external-service waits do not.
Quarantine clears the recorded stack number immediately after GitHub confirms unstacking so a
resumed run cannot accidentally mutate the old stack.

## CI self-heal decision

PR #729 exposed a classification error in the first real issue-stack run. Its fast WebKit crayon
scenario failed twice under system-wide renderer slowdown even though the changed audio path could
not execute in `/dev/engine`, exact head/base measurements were indistinguishable, and the sibling
multi-finger control remained healthy. The workflow treated exhaustion of a product repair budget as
sufficient reason to quarantine issue #709. That was procedurally consistent with the original
skill, but wrong on the merits: the evidence belonged to the gate, not the product change. Issue
#709 was later replayed and merged through PR #739; issue #740 owns the gate repair.

The durable rule is causal isolation before budget accounting. A red check never becomes optional,
but a non-causal red check also never becomes product blame. The orchestrator pauses the queue,
creates a support layer below the affected product PR, repairs the shared gate with a negative
control and stability evidence, and then reruns the product PR on the repaired base. This adds one
support PR when necessary rather than overloading the product PR or discarding good work. If the
gate cannot be repaired safely, the queue is globally blocked because later green results from the
same gate are not credible.

## Review-first, final-CI decision

The issue #227 run showed that waiting for CI before review and again after every review-feedback
push serialized two independent gates and repeatedly charged the same head transition. CI does not
need to establish review readiness: the standalone reviewer performs its own empirical checks, and
all remote checks ultimately need to prove only the delivered head.

Every product PR and gate-repair support PR still receives the standalone review. Review feedback
and the bounded re-review cycle settle first, without waiting for or adjudicating automatic CI runs.
The orchestrator then marks the reviewed PR ready and evaluates CI once on the exact final head,
adopting an existing run only when its head OID matches. A product-code CI repair necessarily
invalidates the prior head review, so that exceptional path returns through review before the final
CI gate is evaluated again. This preserves both guarantees—reviewed final code and green final
code—without placing CI waits between ordinary review cycles.

## Review convergence and issue-local quarantine

The first issue-stack draft launched a fresh, non-resumable adversarial reviewer for every repaired
head. That maximized independence but gave later rounds no memory of the findings they were meant to
verify. A reviewer repeatedly prompted to perform a full adversarial pass has an incentive to widen
scope and produce another finding, even after the product is shippable.

Review independence now applies at the PR boundary, not between rounds of the same PR. The first
round starts a fresh Claude conversation; every later head resumes it in a fresh disposable
checkout. Continuation prompts verify prior blockers and the response delta, admit a new blocking
finding only when the response introduced it, earlier evidence could not expose it, or a critical
safety/security/data-loss risk justifies surfacing a prior miss, and explicitly accept a clean
result. One full review plus two continuation rounds bounds the process. Remaining valid blockers
quarantine the issue rather than turning suggestions or nits into mandatory churn. The fixed
publisher owns the authoritative count and refuses a fourth published turn; the orchestrator's
checkpoint mirrors that state rather than enforcing a budget from prose alone.

The campaign boundary follows the same blast-radius rule. Missing shared authorization, broken
repository-wide gates, or unavailable common infrastructure remain global blockers because later
results would not be trustworthy. An implementation, review, or product-CI failure confined to one
PR is issue-local: replace its closing reference, attach a rich postmortem to the closed PR and the
issue, remove it from the stack, restore `last_good_base`, and continue with the next pending issue.
The campaign may therefore finish successfully with quarantined layers called out in its handoff.

Open validation questions:

* Whether future `gh stack` versions preserve `link`'s numeric ambiguity and `--base` behavior.
* Whether GitHub exposes stack membership/base changes quickly enough to avoid a short retry after
  `gh stack link`.
* Whether Claude Auto consistently approves the narrowly authorized unsandboxed `gh api` calls in
  headless mode on macOS.
