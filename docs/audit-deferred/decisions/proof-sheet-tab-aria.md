# Proof-sheet hub tab UI lacks ARIA tab semantics

**Original finding:** [P4][accessibility] — `scrapbook/coloring-book-proof-sheets/index.html` (tab
strip + iframe panel) — deferred because the draft's extension of
`web/tests/proof-sheet-history.spec.ts` went red at the final review round. **Verdict:** FIX

## Context

The coloring-book proof-sheet hub implements a genuine tab widget — mutually-exclusive `.on` state,
←/→ arrow navigation, a switched `<iframe id="sheet">` — with zero assistive semantics: no
`role="tablist"` on the `.tabs` container, no `role="tab"`/`aria-selected` on the generated buttons,
no `role="tabpanel"`/`aria-labelledby` tying the iframe to the active tab. The proposed fix was
exactly those attributes.

The burndown draft (3 commits, kept at
`docs/audit-deferred/p4-accessibility-tab-ui-is-built-from-bare-button-s-with-no-tab-aria-sem.patch`)
was **not rejected on ARIA substance**. It failed because it extended the existing history-guard
spec `web/tests/proof-sheet-history.spec.ts` with a tab click followed by history traversal
(`window.history.back()` then the pre-existing `page.goBack()`), and that spec was red at the
driver's final gate. Round 3's swap of a hash-navigation step from `page.goBack()` to
`page.evaluate(() => window.history.back())` did not get it green.

## Current state

Verified at HEAD (63a7aa49):

* **The problem is still real.** Neither the committed
  `scrapbook/coloring-book-proof-sheets/index.html` nor its generator emits any `role`,
  `aria-selected`, or `aria-labelledby` on the tab strip or iframe.
* **The page is no longer hand-authored.** Since the pin (f934d43), commit c9a7b7f introduced
  `scripts/gen-coloring-book-proof-sheet-hub.mjs`; the committed HTML is now regenerated output
  (`npm run scrapbook:proof-sheet-hub`, also invoked by `scripts/publish-scrapbook.mjs`). The fix
  belongs in the **generator**, with the committed HTML regenerated from it.
* **The draft patch no longer applies.** Commit c77cfb2 modernized the hub script from ES5 `var` +
  function expressions to `const`/arrow syntax, so the patch hunks miss — but every ARIA line in it
  is small and trivially portable.
* **The spec is green at HEAD.** Ran
  `node scripts/web.mjs playwright test proof-sheet-history --reporter=line`: 1 passed. The current
  spec only loads the hub and immediately calls `page.goBack()` — it never clicks a tab.

## Why the draft's spec went red (the actual mechanism)

Clicking a tab triggers **two** navigations in `show()`:

1. `location.hash = '#dinosaur'` — a same-document hash push on the top frame, appended to the joint
   session history **synchronously**;
2. `frame.src = 'dinosaur.html'` — a cross-document navigation of the subframe. A programmatic
   iframe navigation *after* the initial page load appends its **own** joint-session-history entry,
   and that entry lands only when the subframe navigation **commits — asynchronously**, some time
   after the hash entry.

So a back-traversal issued after the click races the iframe commit: depending on whether
`dinosaur.html` has committed yet, `history.back()` undoes either the iframe entry (URL stays
`#dinosaur`, assertion `toHaveURL(/#farm$/)` fails) or the hash entry (assertion passes). The
draft's round-3 change to `window.history.back()` fixed a different symptom — Playwright's
`page.goBack()` waiting for a main-frame load that a subframe-only traversal never fires — but left
the entry-ordering race intact. Worse, the spec's final pre-existing `page.goBack()` (the original
history guarantee) then had to traverse a stack whose depth varied by the same race.

The current spec at HEAD is deterministic precisely because it never navigates after load: the
initial `frame.src` assignment runs during document parsing, so the iframe's first navigation
*replaces* rather than pushes.

## Options considered

1. **FIX in the generator, verify without post-click history traversal** (winner). ~12 lines in
   `scripts/gen-coloring-book-proof-sheet-hub.mjs` + regenerate; a separate test asserts the ARIA
   contract and the click-toggle, and deliberately never touches history after a click.
2. **DROP as not worth it for an internal keeper page.** Rejected: the deferral reason was test
   flakiness, now fully diagnosed — not a disputed or expensive change. The semantics cost ~12
   template lines, the tab pattern is already fully built, and the repo demonstrably cares about
   this page's correctness (it has a dedicated history spec and three audit fixes since the pin).
   Dropping would leave a widget that announces as eight unlabeled toggle buttons when the finish
   line is one commit away.
3. **Fix + also complete the full APG tabs pattern** (roving `tabindex`, arrow keys on the tabs
   themselves, automatic activation semantics). Rejected as scope creep for a low-stakes internal
   GitHub-Pages reference page: the buttons are natively focusable, the page already has global ←/→
   handling, and the finding explicitly set the bar at "the semantics are cheap to finish."

## Decision

**FIX**, as option 1:

1. Edit `scripts/gen-coloring-book-proof-sheet-hub.mjs` only (the committed HTML is generated
   output): `role="tablist"` (plus a cheap `aria-label="Coloring categories"`) on the `.tabs` div;
   `role="tabpanel"` on `#sheet`; per-button `id`, `role="tab"`, `aria-controls="sheet"` in the
   `CATEGORIES.forEach` builder; `aria-selected` toggled beside the `.on` class and
   `aria-labelledby` updated on the frame inside `show()`.
2. Regenerate the committed HTML with `npm run scrapbook:proof-sheet-hub` and commit both files
   together (drift between them would be a bug).
3. Verification: add a **second test** in `web/tests/proof-sheet-history.spec.ts` (hoisting the
   `page.route` fixture into a `test.beforeEach`) that asserts the ARIA contract on load and across
   one tab click — and performs **no history traversal after the click**. Leave the existing history
   test's body byte-identical. Prove flake-resistance with
   `node scripts/web.mjs playwright test proof-sheet-history --repeat-each=10` per
   `.claude/rules/testing.md`.

Explicitly out of scope: any change to the history test's assertions; APG keyboard completeness
(option 3); axe coverage — `web/tests/a11y.spec.ts` is deliberately scoped to the app's adult-facing
surfaces, and the scrapbook hub is not an app route.

## Why the previous attempt failed, and how this path avoids it

There was one blocking objection — "the Playwright spec(s) tests/proof-sheet-history.spec.ts are
red" — and it maps to one cause: the draft welded ARIA assertions onto the history-guard test and
then navigated history after a tab click, racing the iframe's asynchronous joint-history entry
(mechanism above). This path removes the race by construction: ARIA state after a click is
plain-DOM, fully covered by web-first retrying assertions, and needs no history traversal at all;
the history guarantee stays in its own untouched, already-green test. No round of the review
objected to the ARIA attributes themselves, the generator edit, or regenerating the committed HTML —
those parts of the draft carry forward (re-expressed in the modernized `const`/arrow syntax the hub
gained at c77cfb2).

## Implementation sketch

Generator template (`scripts/gen-coloring-book-proof-sheet-hub.mjs`; remember `` `...` `` and `${}`
inside the emitted script must be escaped as `` \` ``/`\${` in the outer template literal):

```html
<div class="tabs" id="tabs" role="tablist" aria-label="Coloring categories"></div>
...
<iframe id="sheet" role="tabpanel" title="Category proof sheet"></iframe>
```

```js
CATEGORIES.forEach((cat, i) => {
  const b = document.createElement('button');
  b.textContent = cat.name;
  b.id = `tab-${cat.id}`;
  b.dataset.id = cat.id;
  b.setAttribute('role', 'tab');
  b.setAttribute('aria-controls', 'sheet');
  ...
});

const show = (i, skipHash, initialLoad) => {
  ...
  Object.keys(buttons).forEach((id) => {
    buttons[id].classList.toggle('on', id === cat.id);
    buttons[id].setAttribute('aria-selected', String(id === cat.id));
  });
  frame.setAttribute('aria-labelledby', buttons[cat.id].id);
  ...
};
```

New test (same file, sharing the route fixture via `beforeEach`):

```ts
test('the tab strip exposes ARIA tab semantics', async ({ page }) => {
  await page.goto('/coloring-book-proof-sheets/index.html');

  await expect(page.getByRole('tablist')).toHaveCount(1);
  await expect(page.getByRole('tab')).toHaveCount(8);
  await expect(page.getByRole('tab', { name: 'Farm' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#sheet')).toHaveAttribute('role', 'tabpanel');
  await expect(page.locator('#sheet')).toHaveAttribute('aria-labelledby', 'tab-farm');

  await page.getByRole('tab', { name: 'Dinosaurs' }).click();

  await expect(page.getByRole('tab', { name: 'Dinosaurs' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab', { name: 'Farm' })).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#sheet')).toHaveAttribute('aria-labelledby', 'tab-dinosaur');
  // Deliberately no history traversal after the click: a tab click pushes a synchronous hash
  // entry AND an async iframe entry, so back() here races the iframe commit — the exact flake
  // that sank the first attempt.
});
```
