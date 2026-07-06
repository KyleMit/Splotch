---
name: pr-screenshots
description: Custom Splotch conventions for visuals in a pull request body — always include screenshots, before/after tables for changes, all states for multi-state components, and gifs/video for animations. Use in addition to the built-in PR flow whenever opening, creating, or updating a pull request that touches anything visible in the UI.
---

# Screenshots in a Pull Request

Splotch is a visual app, so a PR that changes the UI is not reviewable from a diff
alone. These conventions augment the normal PR flow — they don't replace it. Follow
them in addition to whatever the built-in PR behavior already does.

**Always try to include screenshots in the PR.** Capture the running app, not a
mockup. For web use the [`run-splotch`](../run-splotch/SKILL.md) skill's driver to
take screenshots; for native (Android/iOS) use the [`mobile`](../mobile/SKILL.md)
skill. If a change genuinely has no visible surface, say so in the PR body rather
than silently omitting visuals.

## Getting the images into the PR body (fully automated)

Markdown image syntax needs a **hosted URL** — GitHub renders `![](…)` by fetching
that URL, it does not read files out of the PR. The obvious ways to host an image
are **not available to an agent**, so don't waste a turn on them:

* **There is no GitHub API to upload an attachment.** The web UI's drag-and-drop
  (`github.com/user-attachments/assets/…`) posts to an undocumented endpoint
  (`/upload/policies/assets`) that only accepts a browser `user_session` cookie — a
  PAT or `GITHUB_TOKEN` gets a `422`. The GitHub MCP server has no upload tool
  either (it can commit files and edit the PR body, nothing more). Browser-driver
  extensions like `gh-image` work only because they replay a logged-in browser
  session, which a token-only remote session does not have.

**The elegant path that _is_ fully automatable: a `pr-assets` orphan branch.**
Splotch is a **public** repo, so `raw.githubusercontent.com` URLs render inline in
a PR body with no auth, forever. Commit the PNGs/GIFs to a dedicated branch that is
**never merged into `main`**, so `main`'s history and working tree stay clean while
the images stay hosted for as long as the branch lives.

1. Put the captured files on the `pr-assets` branch under a per-PR folder, without
   disturbing your feature branch. First run only, create the branch empty:

   ```sh
   git switch --orphan pr-assets && git commit --allow-empty -m "init pr-assets" \
     && git push -u origin pr-assets && git switch -   # back to your feature branch
   ```

   Then, for each PR, add its shots (a `git worktree` keeps your feature branch
   checkout untouched):

   ```sh
   git fetch origin pr-assets
   git worktree add ../pr-assets pr-assets
   mkdir -p ../pr-assets/<pr-slug> && cp shots/*.png ../pr-assets/<pr-slug>/
   git -C ../pr-assets add . && git -C ../pr-assets commit -m "shots: <pr-slug>"
   git -C ../pr-assets push && git worktree remove ../pr-assets
   ```

   No local git? The GitHub MCP `push_files` tool commits the same files straight to
   the `pr-assets` branch (base it on `main` once via `create_branch` if missing).

2. Reference them in the PR body by raw URL:

   ```markdown
   ![before](https://raw.githubusercontent.com/KyleMit/Splotch/pr-assets/<pr-slug>/before.png)
   ```

Use `<pr-slug>` = the feature branch's kebab summary (e.g. `magic-brush`). GitHub
resolves the raw URL server-side, so it renders regardless of the agent's proxy.

> Two escape hatches, neither better here: committing shots into the **feature
> branch** (`docs/pr/…`) is simplest but drags binaries into `main` on merge — the
> thing the orphan branch avoids. **Release assets** (`--prerelease` tagged by PR #)
> is the token-authenticated route that also works for _private_ repos, but it needs
> a raw `uploads.github.com` call and clutters the releases list; only reach for it
> if Splotch ever goes private.

## Which visual to include

| The change is… | Include |
| --- | --- |
| A bug fix or a change to existing UI | **Before** and **after**, side by side in a markdown table |
| Fine-tuning one component | A screenshot **cropped to just that component** |
| Adding multiple states to a component | **Every** possible state |
| An animation | A **gif or short video** of the real animation; if that's not possible, **before / intermediate / after** stills |

### Before / after (bug fix or change)

Put the two shots in a table so reviewers can compare them directly:

```markdown
| Before | After |
| --- | --- |
| ![before](url) | ![after](url) |
```

### Fine-tuning a component

When the change is a small adjustment to a single component, crop the screenshot to
just that component instead of the whole screen — the reviewer should not have to
hunt for what moved.

### Multiple states

If the change adds states to a component (e.g. default / hover / active / disabled,
or empty / loading / error / loaded), show **all** of them, one shot per state,
labeled. A single state hides exactly the cases most likely to regress.

### Animations

Prefer a gif or a small video of the actual animation running — a still can't show
timing or easing. Only when a capture truly isn't possible, fall back to three
stills: **before**, an **intermediate** frame, and **after**.
