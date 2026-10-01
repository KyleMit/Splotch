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

For before and after shots from a local Vite server, keep one installed worktree and server: capture
the changed branch, detach that clean worktree at `origin/main`, wait for reload, capture the prior
state on the same port, then return to the branch. A second scratch worktree with a symlinked
`node_modules` can make Vite reject font files outside its allowlist and silently render the prior
state in a fallback font. Use a second worktree only with its own `pnpm install`.

## Getting the images into the PR body (fully automated)

Markdown image syntax needs a **hosted URL** — GitHub renders `![](…)` by fetching that URL, it does
not read files out of the PR. The obvious ways to host an image are **not available to a token-only
agent**, so don't waste a turn on them (the full rationale, sources, and rejected options are in
[ADR-0046](../../../docs/adrs/0046-pr-screenshot-hosting-via-orphan-branch.md)):

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
   feature-branch checkout is never touched. Run the block as written; each part guards a failure
   that concurrent sessions hit:

   * **A unique worktree path.** Agent worktrees share one parent directory, so a fixed path like
     `../pr-assets-wt` collides between sessions; `mktemp -d` cannot.
   * **Detached at `origin/pr-assets`, never the local branch.** Local branches are shared by every
     worktree and `git fetch` moves only `origin/pr-assets`, so a stale local `pr-assets` would take
     the commit and the push would be rejected.
   * **One rebase-and-retry on rejection.** Each PR adds only its own `<pr-slug>/` folder, so a push
     that lost a race replays cleanly onto the new remote tip. Never force-push `pr-assets`: other
     PR bodies link to its files by raw URL.
   * **The first upload ever** (no remote branch) starts from a parentless empty commit, so the
     branch shares no history with `main`. The push names `refs/heads/pr-assets` in full because a
     detached `HEAD` cannot create a remote branch from a short name.

   ```sh
   wt="$(mktemp -d)"
   if git fetch origin pr-assets; then base=origin/pr-assets
   else base="$(git commit-tree "$(git hash-object -t tree /dev/null)" -m "pr-assets: root")"; fi
   git worktree add --detach "$wt" "$base"
   (
     set -e
     cd "$wt"
     mkdir -p <pr-slug>
     cp /path/to/before.png /path/to/after.png <pr-slug>/
     git add <pr-slug> && git commit -m "pr-assets: shots for <pr-slug>"
     git push origin HEAD:refs/heads/pr-assets || {
       git fetch origin pr-assets && git rebase origin/pr-assets &&
         git push origin HEAD:refs/heads/pr-assets
     }
   ); ok=$?
   git worktree remove --force "$wt"
   [ "$ok" -eq 0 ]
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
