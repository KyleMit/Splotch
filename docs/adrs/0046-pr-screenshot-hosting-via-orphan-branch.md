# ADR-0046: Host PR Screenshots on a `pr-assets` Orphan Branch

**Status:** Active **Date:** 2026-07

## Context

Splotch is a visual app, so [`pr-screenshots`](../../.claude/skills/pr-screenshots/SKILL.md) makes
screenshots mandatory in any UI-touching PR. But an agent opening a PR from a remote (Claude Code on
the web) session has no way to get a captured PNG *into* the PR body the way a human does with the
web UI's drag-and-drop. Markdown `![](…)` renders by fetching a **hosted URL** — GitHub does not
read image files out of the PR — and every obvious way to host one is closed to a token-only agent:

* **There is no GitHub REST/GraphQL endpoint to upload a comment/PR attachment.** Confirmed across
  GitHub community threads; no such API exists and the omission is treated as deliberate (abuse
  surface).
* **The web UI's drag-and-drop is browser-only.** It POSTs to an undocumented endpoint,
  `github.com/upload/policies/assets`, which lands the file at
  `github.com/user-attachments/assets/…`. That endpoint authenticates with a browser `user_session`
  cookie **only** — a PAT or `GITHUB_TOKEN` gets `422`.
* **The GitHub MCP server we use has no upload tool.** Its surface is file commits (`push_files`,
  `create_or_update_file`) and PR-body edits — nothing that reaches the attachments CDN.
* **Browser-driver workarounds** (`gh-image`, `gh-attach`, the `chrome-devtools-mcp` approach) only
  work because they replay a *logged-in browser session*. A token-only remote session has no GitHub
  session cookie, so they don't apply here.

The one decisive fact in our favor: **`KyleMit/Splotch` is a public repo.** For a public repo,
`raw.githubusercontent.com` URLs render inline in a PR body with no auth, permanently. So the images
can live in the repo's git objects and be referenced by raw URL — the only remaining question is
*which branch* holds them, because committing binaries onto `main` is the cost we want to avoid.

## Decision

Host PR screenshots on a dedicated **`pr-assets` orphan branch** and reference them from the PR body
by `raw.githubusercontent.com` URL. The branch is created with `git checkout --orphan`, so it shares
**no history with `main`**; the PNGs live only in that branch's commits and are **never merged**.
`main`'s log and working tree stay clean while the images stay hosted for as long as the branch
lives.

Layout — one folder per PR, keyed by the feature-branch slug:

```
pr-assets (orphan branch)
├── README.md
└── <pr-slug>/
    ├── before.png
    └── after.png
```

Referenced as:

```markdown
![before](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/<pr-slug>/before.png)
```

Mechanics live in the [`pr-screenshots`](../../.claude/skills/pr-screenshots/SKILL.md) skill (a
`git worktree` sequence so the feature-branch checkout is never disturbed, plus an MCP `push_files`
fallback for sessions without local git). GitHub resolves the raw URL **server-side**, so rendering
is independent of the agent's outbound proxy.

### Rejected alternatives

* **Drag-and-drop / `user-attachments` CDN** — the ideal (images tied to the PR, no repo objects at
  all), but unreachable without a browser session cookie. This is the whole reason the ADR exists.
* **Browser automation** (Playwright/`chrome-devtools-mcp` driving github.com to replay the upload)
  — would produce real `user-attachments` URLs, but needs a logged-in GitHub session the remote
  environment doesn't have, and adds a brittle UI-scraping step. Reconsider only if sessions ever
  carry a GitHub login.
* **Screenshots on the feature branch** (`docs/pr/<slug>/*.png`) — simplest, and self-documenting,
  but drags the binaries into `main` on merge. That is exactly the history bloat the orphan branch
  is chosen to avoid.
* **GitHub Release assets** (a `--prerelease` tagged per PR, referencing the asset
  `browser_download_url`) — the one token-authenticated route that also works for **private** repos,
  via a raw `uploads.github.com` call. Rejected for now because it clutters the releases list and
  needs an API call outside the MCP surface; it is the documented escalation **if Splotch ever goes
  private**, since raw URLs on a public branch would then stop rendering for unauthenticated
  viewers.
* **External object store / Netlify branch deploy** — hosting the PNGs off-repo (S3, or
  `static/pr/*` served from the branch's Netlify preview) avoids git objects entirely but adds
  infra/secrets or couples image availability to a live deploy, for no gain over a public raw URL.

## Verification

Exercised end-to-end while writing this ADR, on the `github-pr-screenshots` change:

1. Captured two real app shots with the [`run-splotch`](../../.claude/skills/run-splotch/SKILL.md)
   driver — a blank canvas (`before`) and a drawn purple stroke (`after`).
2. Created the `pr-assets` orphan branch in a detached `git worktree`, committed the two PNGs under
   `github-pr-screenshots/`, and pushed. The main working tree was untouched throughout.
3. Confirmed the raw URLs serve the bytes:

   | File         | Request                                                                                    | Result                        |
   | ------------ | ------------------------------------------------------------------------------------------ | ----------------------------- |
   | `before.png` | `GET raw.githubusercontent.com/KyleMit/Splotch/pr-assets/github-pr-screenshots/before.png` | `200 image/png`, 177412 bytes |
   | `after.png`  | `GET …/after.png`                                                                          | `200 image/png`, 192202 bytes |

4. Opened the PR for this change with a before/after table referencing those URLs and confirmed the
   images render inline.

## Consequences

* **+** Screenshots in a PR body are now **fully automatable** from a token-only remote session — no
  browser session, no external host, no manual drag-and-drop.
* **+** `main`'s history and working tree stay clean: the orphan branch is never merged, so the
  binaries never land on `main`.
* **+** Renders server-side, so it works regardless of the agent's proxy and for any viewer (public
  repo → no auth on the raw URL).
* **−** The PNGs still consume git objects on the `pr-assets` branch; the repo grows with each PR's
  screenshots. Prune old folders if it ever matters — deleting them from the branch only affects
  already-merged PRs' historical images.
* **−** The scheme is **public-repo-specific**. If Splotch goes private, `raw.githubusercontent.com`
  stops rendering for unauthenticated viewers and we must switch to the Release-asset route
  documented above.
* **−** One extra branch to keep around; a stray merge of `pr-assets` into `main` would defeat the
  point, so it is documented as never-merge in the branch README and the skill.
