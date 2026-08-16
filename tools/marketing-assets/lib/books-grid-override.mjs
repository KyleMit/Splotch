// The books-scene capture override: the tall two-column cover grid that real
// phone hardware renders (every phone-class device falls under the app's
// 520px two-column rule) recreated at the 576 CSS px capture width, where the
// app's own tall-portrait rule (ColoringBook.svelte, gated min-width: 741px)
// can never fire. It re-states that rule's custom properties verbatim, plus a
// modal width that hugs the narrower grid — a duplication the capture cannot
// avoid because a Svelte <style> block is not importable here. The agreement
// is enforced by tests/books-grid-override.test.mjs, which fails when the
// component's declarations and these drift apart.

// Applied only when the capture is tall enough to seat all four cover rows;
// the 16:9 Play phone slot keeps the app's native 3/3/2 grid.
export const BOOKS_TWO_COL_MIN_ASPECT = 1.6;

export const BOOKS_TWO_COL_CSS = `
  .coloring-book-modal {
    width: calc(var(--book-grid-max-width) + 2 * var(--space-7)) !important;
  }
  .coloring-book-modal,
  .coloring-books-grid,
  .coloring-books-grid.book-grid-has-orphan {
    --book-cols: 2 !important;
    --book-grid-rows-in-view: 4 !important;
    --book-grid-chrome: calc(
      2 * var(--space-7) + var(--modal-close-size) + var(--space-5) +
        (var(--book-grid-rows-in-view) - 1) * var(--space-3) + var(--space-4)
    ) !important;
    --book-grid-max-width: calc(
      (var(--coloring-book-modal-max-height) - var(--book-grid-chrome)) /
        var(--book-grid-rows-in-view) * var(--book-cols) +
        (var(--book-cols) - 1) * var(--space-3)
    ) !important;
  }
`;
