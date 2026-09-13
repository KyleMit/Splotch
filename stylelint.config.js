// Stylelint over the app's hand-authored styles — every `<style>` block under
// web/src plus the plain .css files beside them (issue 1859, ADR-0031).
//
// The rule set grows one measured rule at a time, the same way ADR-0031's
// ESLint set was chosen: a rule is enabled only where the codebase already
// scores zero, and a rule the codebase violates is recorded in ADR-0031 with
// its count rather than enabled with exceptions.
//
// Two things deliberately stay out:
//   * Stylistic rules. Prettier owns CSS formatting (ADR-0031, ADR-0057), and
//     stylelint 16 removed its own stylistic rules for that reason.
//   * The checks in `npm run lint:tokens` (ADR-0071). Some are expressible
//     here, but consolidating them is its own decision.
export default {
  // web/src/tokens.css is generated from web/src/lib/design/tokens.ts
  // (ADR-0071) — `npm run gen:tokens:check` is what guards it.
  ignoreFiles: ['web/src/tokens.css'],
  rules: {},
  overrides: [
    {
      // postcss-html extracts the <style> blocks from a component file. It is
      // scoped to .svelte rather than set at the top level on purpose: pointed
      // at a plain .css file it parses the stylesheet as a document, finds no
      // embedded style block, and reports zero problems — coverage that
      // disappears without failing.
      files: ['**/*.svelte'],
      customSyntax: 'postcss-html',
    },
  ],
};
