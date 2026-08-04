# Implement issue stack — design notes

This is a direct Codex-only package because its trust boundary is the standalone Claude Code
reviewer. A shared Ruler skill would imply Claude could orchestrate an adversarial Claude review of
itself and would make runner-specific subprocess permission details part of both packages.

The orchestrator intentionally remains prose-driven while the checkpoint and reviewer seams are
fixed Node programs. GitHub stack behavior is new in `gh stack` 0.1.0, so the skill pins that
validated interface in preflight rather than pretending it is stable forever.

## Permission-boundary decision

The reviewer must retain Claude's normal tools—repository search, Bash, tests, Playwright, web
research, package installation, and subagents—while the reviewed PR remains untrusted. Both
authenticated CLIs create a macOS-specific obstacle: subprocesses inside Codex's Seatbelt sandbox
run as the user and see binaries and config files but cannot read Claude or GitHub credentials from
the Keychain.

Alternatives considered:

* **Keep Claude inside Codex's sandbox.** Safest parent boundary, but both CLIs appear logged out
  and the reviewer cannot publish.
* **Run a tool-less model over a supplied diff.** Avoids credentials, but cannot reproduce behavior,
  run tests, inspect surrounding code, or empirically refute a finding.
* **Allow raw `claude` or use a permission-bypass mode.** Maximizes capability, but lets
  caller-controlled flags or one compromised prompt remove the second approval layer.
* **Have Codex post Claude's structured findings.** The narrowest publishing design, and preferred
  when Claude does not need to publish. Rejected here because an independent GitHub review with
  anchored comments is an explicit workflow deliverable.
* **Use a separate OS account or VM.** A harder credential boundary, but loses the existing
  Max/Keychain login and adds enough setup friction to defeat the local overnight workflow. It
  remains the escalation path if classifier-reviewed host access becomes insufficient.

The selected design uses layered controls:

1. Codex uses on-request approval with Auto-review and workspace-write sandboxing. General `gh` and
   `git push` stay at `prompt`; PR/stack merge, repository deletion, GitHub logout, and raw Claude
   entry points are forbidden. These rules are not a complete API denylist—repository protections
   and credential scopes remain the hard remote perimeter.
2. The installer writes two fixed, read-only Node entry points outside the workspace: a no-argument
   authentication probe and a publisher accepting only `--pr <positive-integer>` for
   `KyleMit/Splotch`. It rejects another home/repository and records SHA-256 hashes for the
   wrappers, trusted settings, and rubric. The preflight validates both bytes and effective policy
   decisions.
3. The publisher validates the origin remote, PR number/URL/state, same-repository status, branch
   names, and exact base/head OIDs. It fetches those objects and creates a disposable detached
   worktree so review experiments cannot damage the developer or implementer worktree.
4. Claude runs with Auto permissions, default tools, safe mode, a trusted settings profile, no
   Chrome, no ambient MCP servers, and no persisted session. The inner Bash sandbox is required and
   retains the Auto classifier; an incompatible command may request a classifier-reviewed
   unsandboxed retry. `--bare` and bypass modes are never used.
5. The trusted rubric is installed outside the reviewed checkout and appends the canonical
   `leave-pr-review` skill. The positional user prompt grants one external capability: submit one
   `COMMENT` review to the validated PR. Repository content, diffs, issue/PR text, web pages, and
   command output are untrusted material, never authorization.
6. Each new invocation generates a unique hidden review marker containing the exact base and head
   OIDs. A retry first adopts the one existing marked `COMMENT` review for that base/head instead of
   publishing a duplicate; multiple matching reviews are an explicit failure. A new review succeeds
   only when GitHub contains exactly one review with its unique marker on the reviewed head OID.
   Claude and the implementer share the user's GitHub identity, so
   `address-pr-review
   mode=autonomous` recognizes that marker and includes both its review body
   and inline comments instead of filtering them as self-authored.

Consequences: the full reviewer works with existing Max and GitHub authentication, the reviewed
branch cannot inject Claude customizations, silent non-publishing becomes an explicit failure, and
no layer grants merge authority. The cost is that Codex cannot inspect Claude's nested operations
after approving the wrapper; Claude Auto, the inner sandbox, precise prompt capability, credential
scope, and GitHub protections own that boundary. The wrappers are intentionally specific to Kyle's
macOS paths, and `allowUnsandboxedCommands: true` is weaker isolation than a VM.

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

Open validation questions:

* Whether future `gh stack` versions preserve `link`'s numeric ambiguity and `--base` behavior.
* Whether GitHub exposes stack membership/base changes quickly enough to avoid a short retry after
  `gh stack link`.
* Whether Claude Auto consistently approves the narrowly authorized unsandboxed `gh api` calls in
  headless mode on macOS.
