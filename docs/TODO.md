# TODO

> Work through these items one at a time using `/fix-next-todo`.
> After each fix: remove the completed item, run relevant type checks or tests, and suggest a commit message.
> Do **not** `git add` or `git commit` — the user reviews the diff first.

- [ ] **[Extract] getPolaroidFrameOffset** — File: `src/lib/drawing/screenshot.ts`, ~line 117
  Inside `playPolaroidAnimation()`, lines 117–127 compute the pixel offset from the screenshot button's center to the viewport center (used as CSS `--from-x` / `--from-y` on the polaroid frame). Extract into:
  `function getPolaroidFrameOffset(buttonRect: DOMRect): { fromX: number; fromY: number }`
  Live in the same file. Pure geometry; independently testable and separates layout math from DOM mutation in `playPolaroidAnimation`.
