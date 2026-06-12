# TODO

> Work through these items one at a time using `/fix-next-todo`.
> After each fix: remove the completed item, run relevant type checks or tests, and suggest a commit message.
> Do **not** `git add` or `git commit` — the user reviews the diff first.


- [ ] **[Readability] Sweep small dead/stale fragments** — File(s): `src/lib/components/parent/AboutTab.svelte`, `src/lib/components/AiImagePrompt.svelte`
  AboutTab has two consecutive identical `{#if import.meta.env.DEV}` blocks (lines 66–71, the second mis-indented) — merge into one block containing both dev links. AiImagePrompt's comment "The open/close $effect above only revokes on an explicit close" (line 27) refers to an `$effect` that no longer exists — cleanup now happens via the `modalDialog` action's `onClose`; rewrite the comment to say the teardown effect covers the still-open-at-unmount case.
