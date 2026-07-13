---
name: pr-screenshots
description: Custom Splotch conventions for visuals in a pull request body — always include screenshots, before/after tables for changes, all states for multi-state components, and gifs/video for animations. Use in addition to the built-in PR flow whenever opening, creating, or updating a pull request that touches anything visible in the UI.
---

# Screenshots in a Pull Request

Splotch is a visual app, so a PR that changes the UI is not reviewable from a diff alone. These
conventions augment the normal PR flow — they don't replace it. Follow them in addition to whatever
the built-in PR behavior already does.

**Always try to include screenshots in the PR.** Capture the running app, not a mockup. For web use
the [`run-splotch`](../run-splotch/SKILL.md) skill's driver to take screenshots; for native
(Android/iOS) use the [`mobile`](../mobile/SKILL.md) skill. If a change genuinely has no visible
surface, say so in the PR body rather than silently omitting visuals.

## Getting the images into the PR body (fully automated)

Markdown image syntax needs a **hosted URL** — GitHub renders `![](…)` by fetching that URL, it does
not read files out of the PR. The obvious ways to host an image are **not available to a token-only
agent**, so don't waste a turn on them (the full rationale, sources, and rejected options are in
[ADR-0046](../../docs/adrs/0046-pr-screenshot-hosting-via-orphan-branch.md)):

* **There is no GitHub API to upload an attachment.** The web UI's drag-and-drop
  (`github.com/user-attachments/assets/…`) posts to an undocumented endpoint
  (`/upload/policies/assets`) that only accepts a browser `user_session` cookie — a PAT or
  `GITHUB_TOKEN` gets a `422`. The GitHub MCP server has no upload tool either (it can commit files
  and edit the PR body, nothing more). Browser-driver extensions like `gh-image` work only because
  they replay a logged-in browser session, which a token-only remote session does not have.

**The path that *is* fully automatable: a `pr-assets` orphan branch.** Splotch is a **public** repo,
so `raw.githubusercontent.com` URLs render inline in a PR body with no auth. Commit the PNGs/GIFs to
a dedicated branch that shares **no history with `main` and is never merged**, so `main`'s log and
working tree stay clean while the images stay hosted for as long as the branch lives. Verified
end-to-end — see the ADR's Verification table.

1. Put the captured files on `pr-assets` under a per-PR folder, from a **detached worktree** so your
   feature-branch checkout is never touched. This block is idempotent — it reuses the remote branch
   if it exists (the common case after the first PR) and creates the orphan only when it doesn't, so
   you never have to know which case you're in:

   ```sh
   git worktree add --detach ../pr-assets-wt
   cd ../pr-assets-wt
   # Reuse the branch if it already exists on the remote; else create the orphan
   # (no main history). An unconditional `checkout --orphan` would make a fresh
   # empty branch that then FAILS to push over the existing remote history.
   git fetch origin pr-assets && git checkout pr-assets \
     || { git checkout --orphan pr-assets && git rm -rf . >/dev/null 2>&1; }
   mkdir -p <pr-slug>
   cp /path/to/before.png /path/to/after.png <pr-slug>/
   git add -A && git commit -m "pr-assets: shots for <pr-slug>"
   git push -u origin pr-assets
   cd - && git worktree remove ../pr-assets-wt --force
   ```

   No local git? The GitHub MCP `push_files` tool commits the same files straight to the `pr-assets`
   branch (create it once via `create_branch` if missing — note that only makes a normal branch off
   `main`, not a true orphan, but it still never merges so `main` stays clean).

2. Reference them in the PR body by raw URL — GitHub resolves it **server-side**, so it renders
   regardless of the agent's outbound proxy:

   ```markdown
   | Before                                                                                      | After                                                                                     |
   | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
   | ![before](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/<pr-slug>/before.png) | ![after](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/<pr-slug>/after.png) |
   ```

   Use `<pr-slug>` = the feature branch's kebab summary (e.g. `magic-brush`). Sanity- check a URL
   before posting: `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" <raw-url>` should print
   `200 image/png`. (Don't use `curl -sI | head -1` — in cloud sessions every HTTPS request tunnels
   through the agent proxy, whose CONNECT handshake always returns
   `HTTP/1.1 200 Connection Established`, masking the real origin status so a 404'd URL still reads
   `200`.)

> Two escape hatches, neither better here: committing shots into the **feature branch**
> (`docs/pr/…`) is simplest but drags binaries into `main` on merge — the thing the orphan branch
> avoids. **Release assets** (`--prerelease` tagged by PR #) is the token-authenticated route that
> also works for *private* repos, but it needs a raw `uploads.github.com` call and clutters the
> releases list — the documented escalation only **if Splotch ever goes private** (raw URLs stop
> rendering for unauthenticated viewers then). See ADR-0046.

## Which visual to include

| The change is…                        | Include                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A bug fix or a change to existing UI  | **Before** and **after**, side by side in a markdown table                                                       |
| Fine-tuning one component             | A screenshot **cropped to just that component**                                                                  |
| Adding multiple states to a component | **Every** possible state                                                                                         |
| An animation                          | A **gif or short video** of the real animation; if that's not possible, **before / intermediate / after** stills |

### Before / after (bug fix or change)

Put the two shots in a table so reviewers can compare them directly:

```markdown
| Before         | After         |
| -------------- | ------------- |
| ![before](url) | ![after](url) |
```

### Fine-tuning a component

When the change is a small adjustment to a single component, crop the screenshot to just that
component instead of the whole screen — the reviewer should not have to hunt for what moved.

### Multiple states

If the change adds states to a component (e.g. default / hover / active / disabled, or empty /
loading / error / loaded), show **all** of them, one shot per state, labeled. A single state hides
exactly the cases most likely to regress.

### Animations

Prefer a gif or a small video of the actual animation running — a still can't show timing or easing.
Only when a capture truly isn't possible, fall back to three stills: **before**, an **intermediate**
frame, and **after**.
