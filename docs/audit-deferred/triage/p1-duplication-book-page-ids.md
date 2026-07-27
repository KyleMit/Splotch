# Book id is re-typed as a string argument on every `page()` call, silently generating asset paths on mismatch

**Priority/category:** P1[duplication] · **Cluster:** C13 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/state/books.ts:92-122` (`page()` factory) and `124-237` (`BOOKS`)
— pinned at SHA f934d43 **Draft patch:**
`docs/audit-deferred/p1-duplication-book-id-is-re-typed-as-a-string-argument-on-every-page-ca.patch`

## Verdict

**FIX — clear winner.** The draft's `book()` builder — the book id typed once, the inner `page()`
closing over it — was accepted by the reviewer on its merits; every unresolved objection is a stale
documentation site still showing the old `page(book, id, name)` signature. Re-implement the builder
on top of HEAD's refactored `books.ts` (the patch no longer applies cleanly) and sweep *all* stale
doc sites this time, including the one the draft missed
(`tools/asset-gen/legacy/night-fills.md:22`).

## Original finding (condensed)

`page()` takes the enclosing book's id as a bare string first argument, so each book repeats its id
6× (48 calls total) in `BOOKS`. Nothing ties a page to its book in the type system: pasting a
`page('farm', …)` line into the `dinosaur` block compiles cleanly and silently emits
`/coloring/farm/...` asset paths under the Dinosaurs book. Proposed a builder that binds the book id
once so `Book.id` becomes the single source.

## Why it was deferred

Failed adversarial review. All three unresolved objections are doc-drift, not code:

1. `tools/asset-gen/docs/pipeline.md:334-337` still teaches the obsolete three-argument
   `page('nature', 'ant', 'Ant', …)` wiring step.
2. `tools/asset-gen/legacy/night-fills.md` (the live catalog-wiring guidance, ~line 240) still shows
   `page('farm', 'cat', 'Cat')`.
3. `tools/asset-gen/legacy/night-fills.md:22` still presents a three-argument form as current
   ship/wire guidance.

The draft's commits 2-3 fixed objections 1 and 2 (both hunks are in the patch); objection 3 — the
blockquote example at line 22 — was never addressed and is what kept the review red.

## Current state of the code

The finding still fully holds at HEAD, but the file has been refactored underneath the patch:

* `books.ts` now builds paths through extracted helpers —
  `pageAssetPath(bookId, pageId,
  orientation, variant)`, `optionalPageAssetPaths(…)`,
  `coverPath(bookId)` — and `Book.platforms` is now required. `page()` still takes `book: string` as
  its first positional arg (`books.ts:135-155`), and all 48 call sites still repeat the enclosing
  book's id (`books.ts:157-270`). The mismatch failure mode is unchanged.
* `books.test.ts` has no path-membership invariant; the draft's table-driven
  `startsWith('/coloring/${book.id}/')` test is still novel and worth keeping.
* `pipeline.md:335-337` and `night-fills.md:240` are unchanged — still stale-in-waiting. Notably,
  `night-fills.md:22` is *already wrong today*: it shows
  `page('nature', 'ant', 'Ant', ['portrait', 'landscape'], ['portrait', 'landscape'])` — positional
  array arguments that predate even the current `{ nightExcept, chalkExcept }` options object.
* Because of the helper refactor, `git apply` of the draft patch will conflict in `books.ts` (its
  context is the old inline-template-literal factory). `night-fills.md` also changed since the pin
  (script paths moved to `legacy/`), though the draft's specific hunk region survives.

## Options considered

1. **Builder closing over the book id (winner — the draft's approach, rebased).** Single source for
   the id, cross-book mismatch becomes unrepresentable, and it now composes *better* with HEAD: the
   inner `page()` just forwards the captured `bookId` to `pageAssetPath`, and `cover` falls out of
   `coverPath(bookId)`.
2. **Keep the shape, add a runtime/test assertion only.** The draft's invariant test would catch a
   mismatch in CI, but the id stays typed 48×, and the test catches the slip after the fact instead
   of making it impossible. Strictly weaker; keep the test *and* the builder.
3. **Per-book string-literal union types.** Type-level enforcement without restructuring, but it
   duplicates every id into a type and still lets `page('farm', …)` appear under `dinosaur` unless
   each book gets its own branded call — more machinery than option 1 for less safety.

## Recommendation

Re-implement (don't `git apply`) the draft's shape on HEAD's helper structure:

```ts
function book(
  id: string,
  name: string,
  platforms: BookPlatform[],
  buildPages: (
    page: (id: string, name: string, exceptions?: PageExceptions) => ColoringPage,
  ) => ColoringPage[],
): Book {
  function page(
    pageId: string,
    pageName: string,
    { nightExcept = [], chalkExcept = [] }: PageExceptions = {},
  ) {
    return {
      id: pageId,
      name: pageName,
      images: {
        portrait: pageAssetPath(id, pageId, 'portrait', 'outline'),
        landscape: pageAssetPath(id, pageId, 'landscape', 'outline'),
      },
      colorImages: {/* …same, variant 'light' */},
      nightImages: optionalPageAssetPaths(id, pageId, nightExcept, 'night'),
      chalkImages: optionalPageAssetPaths(id, pageId, chalkExcept, 'chalk'),
    };
  }
  return { id, name, platforms, cover: coverPath(id), pages: buildPages(page) };
}
```

`BOOKS` becomes `book('farm', 'Farm', ['web', 'mobile'], (page) => [page('cat', 'Cat'), …])` — the
draft's catalog hunks carry over almost verbatim. Keep the draft's `books.test.ts` path-membership
test and extend it to assert `book.cover` too.

To survive the recorded objections, the doc sweep must cover **all three** sites — the draft fixed
two of three:

* `tools/asset-gen/docs/pipeline.md:335-337` → book-bound `page('ant', 'Ant')` +
  `page('ant', 'Ant', { nightExcept: ['portrait'] })` (the draft's hunk, still correct).
* `tools/asset-gen/legacy/night-fills.md:240` → `page('cat', 'Cat')` (the draft's hunk, still
  correct — re-anchor it past the `legacy/` path edits).
* `tools/asset-gen/legacy/night-fills.md:22` → the missed one. Rewrite the blockquote's wiring
  example to the book-bound options-object form, e.g.
  `page('ant', 'Ant', { nightExcept: [...], chalkExcept: [...] })` — mechanically, sweep
  `grep -rn "page('" tools/` until every hit shows the two-arg (+ optional exceptions) form.

Verification: `npm run check`, `npm run test:unit -- books`, the grep above coming back clean, and a
spot-check that `scripts/strip-native-assets.mjs` (which imports `BOOKS`) still runs — the exported
shape is unchanged, so no behavioral diff is expected.

## Suggested next step

Re-stage in docs/AUDIT.md with amended instructions: "re-implement the patch's design on the current
helper-based `books.ts` (the patch conflicts at HEAD); fix all three doc sites, including
`night-fills.md:22`; verify with `grep -rn \"page('\" tools/`". A single small PR.
