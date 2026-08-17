# Issue workflow

GitHub Issues is Splotch's live backlog. Every planned change — feature, bug, chore, test, security,
or perf — is an issue, and the tracker is the answer to "what should I work on next?" (This replaced
the old `IDEAS.md` / `docs/BACKLOG.md` files; their items were migrated into issues in 2026-07.)

Browse or filter the backlog: <https://github.com/kylemit/splotch/issues>.

## Issue format

Keep issues scoped and hand-off-ready — a good issue says **what** to build, **why** it matters,
**where** the code lives, and **how you'll know it's done**:

* **Title** — a concise imperative summary ("Add a stamps tool", not "Stamps").
* **Body** — what / why / where / done-when. The `.github/ISSUE_TEMPLATE/` forms (`feature_request`,
  `bug_report`, `task`) scaffold this; blank issues are allowed for quick notes.
* **Labels** — exactly one `type:*`, one or more `area:*`, and optionally a `priority:*` and any
  meta labels (see the glossary below).
* **Escaping `#`-numbers** — GitHub auto-links a bare `#12` into a reference to issue/PR 12. In
  issue and PR text, escape a `#`-number that isn't a deliberate reference: `` `#12` `` or `\#12`. A
  real reference ("fixes #12") stays unescaped.

## Label glossary

Labels are declared in [`.github/labels.yml`](../.github/labels.yml) and synced to GitHub by the
`Label Sync` workflow — edit that file (not the GitHub UI) to change the taxonomy.

### `type:` — what kind of work (pick one)

| Label           | Use for                                                 |
| --------------- | ------------------------------------------------------- |
| `type:feature`  | New user-facing capability                              |
| `type:bug`      | Something isn't working as intended                     |
| `type:chore`    | Tooling, build, deps, refactor — no user-facing feature |
| `type:test`     | Test coverage or CI test infrastructure                 |
| `type:perf`     | Performance / responsiveness                            |
| `type:security` | Access, admin, privacy, or security hardening           |
| `type:docs`     | Documentation                                           |
| `type:audit`    | Surfaced by an audit skill — see the note below         |

`type:audit` is the **one exception** to "pick one `type:`". It's a provenance marker: `vet-audits`
files it on every audit finding that survives validation, and `fix-audits` burns down the open
`type:audit` issues. It may layer on top of the finding's substantive type (`type:audit` +
`type:perf`), so an audit issue can legitimately carry two `type:` labels.

### `area:` — which part of the product (one or more)

| Label                 | Scope                                               |
| --------------------- | --------------------------------------------------- |
| `area:drawing`        | Canvas, brushes, tools, drawing engine              |
| `area:ai-art`         | AI image generation, styles, prompts                |
| `area:coloring-book`  | Coloring-book pages, packs, workflow                |
| `area:dark-mode`      | Dark-mode theming and assets                        |
| `area:ux`             | Layout, polish, responsiveness                      |
| `area:settings`       | Settings modal and controls                         |
| `area:admin-security` | Admin console, access codes, quotas, ops            |
| `area:native`         | Android / iOS / Capacitor                           |
| `area:ci-testing`     | CI pipeline and test infrastructure                 |
| `area:release`        | Release and deployment automation                   |
| `area:infra`          | Dev tooling, dependencies, repo infrastructure      |
| `area:asset-gen`      | Asset-generation image pipeline (`tools/asset-gen`) |
| `area:store-launch`   | Blocks App Store / Play submission                  |

`area:store-launch` is the one label in this group that names a **delivery goal** rather than a part
of the product. Store-submission work cuts across native, AI, the Parent Center, and the privacy
copy, and what those issues have in common is that shipping is blocked until they land — so they
also carry whichever product `area:*` they touch. Browse the set with
[`label:area:store-launch`](https://github.com/kylemit/splotch/issues?q=is%3Aissue+label%3Aarea%3Astore-launch),
or read the tracking issue that lists them as sub-issues (see "Tracking issues" below).

### `priority:` — triage signal (optional, at most one)

`priority:high` · `priority:medium` · `priority:low`. Unset means untriaged. Priority is a
deliberate triage call, not a default — most of the migrated backlog is intentionally left unset.

### `triage:` — what the issue is waiting on (optional, at most one)

Applied by triage passes to record the actionability call, so filtered views answer "what can an
agent just do?" vs "what is waiting on Kyle?". When several apply, the scarcest resource wins:
`needs-decision` > `needs-human` > `needs-device` > `easy-win`.

| Label                   | Meaning                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `triage:needs-decision` | Blocked on a human decision — options and a ranked recommendation live in an issue comment |
| `triage:needs-human`    | Blocked on human-only integration — external accounts, credentials, consoles, purchases    |
| `triage:needs-device`   | Needs hands on a physical device to verify — exact steps live in an issue comment          |
| `triage:easy-win`       | Fully automatable, no clear downside beyond implementation cost                            |

### meta

| Label              | Meaning                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `in-progress`      | Claimed by a `burn-down-backlog` session actively working it; excluded from that skill's future pickup until the issue closes            |
| `reviewed`         | Review pass complete; automation moves the issue to Project status `ToDo`                                                                |
| `needs-triage`     | Valid audit finding whose fix approach is unclear — a human confirms direction before `fix-audits` implements it (filed by `vet-audits`) |
| `needs-scoping`    | Rough spec — investigate and firm up (often an ADR) before significant work                                                              |
| `needs-adr`        | Needs an architectural decision record before or alongside implementation                                                                |
| `wont-do`          | Considered and declined (see "Closing" below)                                                                                            |
| `good first issue` | Small, self-contained, good for a newcomer                                                                                               |

## Tracking issues

When a body of work only makes sense as a set — everything that must land before a release, a
migration touching a dozen call sites — open a **tracking issue** and attach the others as GitHub
**sub-issues** (the "Create sub-issue / Add existing issue" control on the parent). Sub-issues are a
real parent/child relationship, not a Markdown checklist: GitHub renders the completion count on the
parent, each child links back to it, and closing a child ticks the parent automatically. A hand-kept
checklist of `#`-numbers goes stale the first time someone closes one from a PR.

Pair the tracking issue with a label so the set stays findable when someone arrives from search
instead of from the parent — the two answer different questions ("what's left for this goal?" vs "is
this issue part of that goal?"). The tracking issue carries the same label as its children.

## Triage & lifecycle

* **New issues** land untriaged (no `priority:*`). Triage adds a priority and confirms labels.
* **Reviewing issues** — after a review pass confirms that an issue is clear, actionable, and
  correctly labeled, add `reviewed`. The label workflow ensures the issue is in the project and sets
  its Status to `ToDo`.
* **Picking work** — filter open issues by `area:*` / `type:*` / `priority:*`; prefer high
  value-to-effort for your context. Order is not implied by issue number.
* **Starting work** — assign yourself; reference the issue from the PR ("fixes #NN") so it closes on
  merge.
* **Closing as done** — merge a PR that references the issue, or close with reason *completed*.
* **Closing as won't-do** — not every idea ships. Add the `wont-do` label and close with reason
  **not planned** (a one-line note on why keeps the record useful). Won't-do is a first-class
  outcome, not a failure.

### Project automation

The `Move reviewed issue to ToDo` workflow runs when `reviewed` is applied. It adds the issue to
[KyleMit's Splotch project](https://github.com/users/KyleMit/projects/1) if needed, then sets the
`Status` field to `ToDo`. The repository must have an Actions secret named `PROJECT_PAT` containing
a classic personal access token with the `project` scope (`repo` is also required if the repository
becomes private). The normal `GITHUB_TOKEN` cannot update a user-owned project.

### Audit findings become issues

Splotch's audit skills feed the tracker, not a standing Markdown backlog (see
`.claude/audit-conventions.md`):

1. **Producers** (`code-audit`, `extract-audit`, `lighthouse-audit`, `session-audit`) write raw
   findings to a **transient** `docs/AUDIT.md`.
2. **`vet-audits`** adversarially validates each finding and drains the file: it drops the ones that
   don't hold up and **files each survivor as a GitHub issue** labeled `type:audit` plus the
   applicable `area:*`/`type:*`. A finding that's valid but whose fix approach is unclear also gets
   `needs-triage`. Once drained, `docs/AUDIT.md` is deleted.
3. **`fix-audits`** queries open `type:audit` issues and burns them down — one commit per issue,
   referencing it so it closes on merge.

So `docs/AUDIT.md` is a staging area between a producer and `vet-audits`, never the durable backlog.
The durable audit backlog is the set of open `type:audit` issues.

## For coding agents

The backlog is the tracker, not a file. When asked what to work on next, list open issues and filter
by label. When you capture a durable TODO, open an issue (don't add it to a Markdown backlog). Use
the GitHub MCP tools (`list_issues`, `search_issues`, `issue_write`) — and search existing issues
before filing a new one to avoid duplicates. After completing an issue review pass, apply the
`reviewed` label only when the issue is clear, actionable, and correctly labeled; that label moves
the issue to the project's `ToDo` status.
