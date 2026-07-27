# `AiImageResult` casts in event handlers

**Priority/category:** P5[type-safety] · **Cluster:** C03 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/AiImageResult.svelte:42` — pinned at SHA f934d43
**Draft patch:** none

## Verdict

**FIX — clear winner.** Type the handler's `currentTarget` and drop the `as` cast.

## Original finding (condensed)

`handleImgLoad` does `const { naturalWidth: w, naturalHeight: h } = e.target as HTMLImageElement;`.
The cast is safe today (the handler is only wired to an `<img onload>`), but `as` bypasses the
checker and would silently mis-type if the handler were ever reused on a different element. Minor.

## Current state of the code

Still present, now at `web/src/lib/components/AiImageResult.svelte:46-49`. The component was
refactored since the pin (constants hoisted, `closeAiResult` moved to `aiGeneration.svelte`), but
the handler body is unchanged and this is the component's only cast — `handleAnimationEnd` compares
`e.target === dialogEl` without one. The handler is bound once, on the hidden `.stage-sizer` img
(line 146).

## Options considered

* **Typed `currentTarget` on the named handler (winner).** Svelte types an `<img>`'s `onload` as
  `EventHandler<Event, HTMLImageElement>`, i.e. the event's `currentTarget` is already
  `HTMLImageElement`. Declaring the parameter to match keeps the named handler, removes the cast,
  and makes any future rebinding onto a non-img element a compile error. `load` doesn't bubble, so
  `target` → `currentTarget` is behavior-identical here.
* **Inline arrow at the binding site** (`onload={(e) => handleImgLoad(e.currentTarget)}` with
  `handleImgLoad(img: HTMLImageElement)`). Equivalent safety, slightly more indirection in the
  template. Fine, but no advantage over the first.
* **Leave it.** Defensible for a P5 — the cast is provably safe today. But the fix is one line,
  strictly stronger, and removes an `as` that invites copy-paste into places where it isn't safe.

## Recommendation

```ts
function handleImgLoad(e: Event & { currentTarget: HTMLImageElement }) {
  const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
  if (w > 0 && h > 0) imgAspect = w / h;
}
```

`onload={handleImgLoad}` type-checks unchanged. Verify with `npm run check` and by opening an AI
result — the stage must still size to the loaded image's aspect.

## Suggested next step

Re-stage in `docs/AUDIT.md` as-is (updated line number 46), or fold into any nearby edit to the
component — it's a one-line change not worth its own PR.
