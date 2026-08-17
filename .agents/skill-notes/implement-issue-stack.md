# Implement issue stack — design notes

This is a direct Codex-only package because it orchestrates Codex subagents, GitHub stacks, and the
Codex-only `run-claude` capability. Claude authentication, installation, permission policy, and
standalone-review publication live in `run-claude`; this note records only issue-stack decisions.

The orchestrator intentionally remains prose-driven while the checkpoint and reviewer seams are
fixed Node programs. GitHub stack behavior is new in `gh stack` 0.1.0, so the skill pins that
validated interface in preflight rather than pretending it is stable forever.

## Permission boundary

The stack workflow installs `run-claude` together with its own GitHub and push rules. General `gh`
and `git push` stay at `prompt`; PR/stack merge, repository deletion, and GitHub logout remain
forbidden. See the `run-claude` design note for the Claude subprocess and publication boundary.

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

Open validation questions:

* Whether future `gh stack` versions preserve `link`'s numeric ambiguity and `--base` behavior.
* Whether GitHub exposes stack membership/base changes quickly enough to avoid a short retry after
  `gh stack link`.
* Whether Claude Auto consistently approves the narrowly authorized unsandboxed `gh api` calls in
  headless mode on macOS.
