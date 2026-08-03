# ADR-0095: Cloud Sessions Talk to GitHub Through the MCP Tools, Never the `gh` CLI

**Status:** Active **Date:** 2026-08

## Context

Claude Code on the web sessions kept reaching for the `gh` CLI — `gh pr list`, `gh pr create`,
`gh issue list` — and failing, then retrying variations of the same command instead of falling
through to the GitHub MCP tools (`mcp__github__*`) that are authorized and working. The obvious
reading is "`gh` has no auth in the cloud; give it a durable token." That reading is wrong, and
acting on it wastes a session's worth of setup.

`gh` is not merely unauthenticated in a cloud container. It is blocked by **four independent
layers**, each of which is on its own sufficient to break it. All four were probed directly from a
cloud session.

### 1. The binary is absent

```console
$ command -v gh
$ gh --version
bash: gh: command not found
```

Nothing is installed to authenticate. `.claude/cloud/setup.sh` could install it — the release
tarball downloads fine through the egress proxy, the same path that already fetches chisel — so this
layer alone would be trivially fixable. The next three are not.

### 2. The token env vars are inert — the proxy injects the real credential

`GH_TOKEN` and `GITHUB_TOKEN` are both set, which is what makes "just give `gh` a durable token"
look like the fix. They carry no authority:

```console
$ GH_TOKEN=ghp_bogus000000000000000000000000000000 gh api user --jq '.login'
KyleMit
```

A **deliberately bogus** token authenticates as the real user. The credential is injected by the
egress proxy, not read from the variable; `gh` only requires the variable to be non-empty so it
doesn't short-circuit to `gh auth login`. There is consequently **no token to install durably** —
setting one changes nothing, and the value already present is not a secret worth propagating.

`gh auth status` compounds the confusion by reporting `The token in GH_TOKEN is invalid` while
`gh api user` succeeds against the same endpoint. That message is an artifact of gh's local scope
check and says nothing about whether a call will work.

### 3. `origin` is not a GitHub remote

```console
$ git remote -v
origin  http://<redacted>@127.0.0.1:41729/git/KyleMit/Splotch (fetch)
```

The remote points at a local git proxy on loopback. Every repo-inferring `gh` command therefore dies
before it makes a request:

```console
$ gh pr list
none of the git remotes configured for this repository point to a known GitHub host.
```

`GH_REPO=KyleMit/Splotch` does not repair this for all commands — `gh repo view` still refuses.

### 4. The API itself is gated, for both transports

With the repo named explicitly, GraphQL is refused:

```console
$ GH_REPO=KyleMit/Splotch gh pr list
HTTP 403: This GraphQL query is not enabled for this session — only the pinned set of
PR-review operations is served. Use REST via `gh api repos/{owner}/{repo}/...` instead.
```

This alone disables most of the CLI: `gh pr list`, `gh pr view`, `gh issue list` and friends are
GraphQL clients. And the suggested REST fallback is gated too, even for the session's own repo:

```console
$ gh api repos/KyleMit/Splotch
HTTP 403: GitHub access is not enabled for this session. An org admin must connect the
Claude GitHub App for this organization.
```

Meanwhile the identical query through the MCP server returns immediately:

```
mcp__github__list_pull_requests(owner: KyleMit, repo: Splotch, state: open)
→ 734 "ci: enforce ADR identity and index integrity"
  733 "Fix Actions Panel first-paint offset"
  731 "Share unavailable feedback for screenshot cooldown"
```

The MCP server holds its own installation credential out-of-band. That is the authorized path; the
container's direct `api.github.com` egress is not, by policy.

## Decision

**Cloud sessions use the GitHub MCP tools (`mcp__github__*`) for every GitHub interaction. `gh` is
never installed and never invoked.** Git itself (`fetch`, `push`, `commit`) keeps working normally
through the loopback proxy remote — this decision is only about the GitHub *API*, not about git.

To make the rule land where it is actually needed, it is enforced in three places:

* **`.claude/hooks/cloud-github-access.sh`** — a `CLAUDE_CODE_REMOTE`-guarded SessionStart hook.
  SessionStart stdout becomes context, so every cloud session is told the rule before it has a
  chance to guess, which is the layer that actually changes behavior. Guarded so local sessions,
  where `gh` works fine, are unaffected.
* **`.ruler/github.md`** — the standing repo-wide rule, generated into the root `CLAUDE.md` /
  `AGENTS.md`, phrased so it is correct in both environments.
* **Skill wording** — skills that offered `gh` and MCP as alternatives listed `gh` first, which
  biased the choice toward the broken path. They now lead with the MCP tool and mark `gh` as
  local-only.

## Alternatives rejected

**Install `gh` in `.claude/cloud/setup.sh` and give it a durable token.** This is the request that
prompted the investigation, and it cannot work. Layer 2 shows there is no meaningful token to
install; layers 3 and 4 show that even a perfectly authenticated `gh` would be refused at the proxy
for both GraphQL and REST. Installing the binary would produce a `gh` that looks available and fails
deeper into each command — strictly worse than its absence, which at least fails fast.

**Rewrite `origin` to an `https://github.com/...` remote so `gh` can infer the repo.** Fixes layer 3
only, and would break the git proxy that push depends on.

**Ask an org admin to connect the Claude GitHub App so direct API access is enabled.** This targets
layer 4's error message, but the MCP tools already provide that access through a supported path.
Adding a second credential path to maintain buys nothing.

## Consequences

* Any GitHub operation with no MCP equivalent is genuinely unavailable in a cloud session and must
  be done locally or by the user. `prune-remote-branches` already documents one such gap (ref
  deletion), and that shape of limitation is now expected rather than a bug to debug.
* Skills that ship `gh` recipes stay useful locally; their cloud path is the MCP tool listed
  alongside.
* If a future session sees a `gh` command fail, the answer is never "authenticate `gh`" — it is to
  use the MCP tool. This ADR exists so that conclusion is not re-derived by probing the proxy again.
