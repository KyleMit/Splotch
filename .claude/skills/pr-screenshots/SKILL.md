---
name: pr-screenshots
description: Custom Splotch conventions for visuals in a pull request body — always include screenshots, before/after tables for changes, all states for multi-state components, and gifs/video for animations. Use whenever a pull request that touches the UI is opened, updated, or amended. This includes PRs you did not open yourself (one created by the Claude Code web-session "Create PR" button, or by a teammate) and every time you push further UI-affecting commits to a branch: after such a push, check whether an open PR exists for the branch and make sure its body has up-to-date screenshots describing the current changeset. Do not wait to be the one who opens the PR — the trigger is UI changes reaching a branch that has (or is about to have) an open PR, not you invoking the create-PR step.
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

## A PR can be opened without you — don't rely on catching it at create time

The trigger for this skill is **UI changes landing on a branch that has an open
PR**, not you running the create-PR step. A PR here is often opened *out of band* —
by the Claude Code **web-session "Create PR" button**, or by a teammate — so there
may be no create-PR call in your turn to hang these conventions on. If you only act
when you open the PR yourself, an out-of-band PR ships with a bare, screenshot-less
body (the gap that motivated this section).

So make it part of pushing UI work, every time:

1. **After pushing UI-affecting commits to a branch, check for an open PR** for that
   branch — GitHub MCP `list_pull_requests` / `search_pull_requests` filtered to the
   head branch (`head:<branch>` or the `head` param). Also treat it as opened if the
   user mentions or links a PR for your branch.
2. **If an open PR exists, make its body carry current visuals** for the change,
   following the table below. Update the PR body (`update_pull_request`) — don't wait
   to be asked, and don't settle for having delivered the shots only in chat.
3. **If no PR exists yet**, capture the shots anyway (they're cheap and you'll want
   them when one is opened) and note them, so the first person to open the PR — you
   or the web button — has them ready.

### Keep the visuals current as the changeset grows

A PR body is **living**: the screenshots must describe the **whole current
changeset**, not just the first push. Every time you amend the branch with more
UI-affecting commits (a follow-up fix, a review change, a new state), **refresh the
shots and any before/after** and update the PR body so the visuals always match the
current diff. Replace stale images rather than appending a newer set beside them.

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
