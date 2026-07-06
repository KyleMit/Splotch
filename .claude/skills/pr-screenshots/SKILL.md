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
