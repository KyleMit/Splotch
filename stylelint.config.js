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
  // A `stylelint-disable` must say why, must actually be suppressing
  // something, and must name a rule this config enables — the same standard
  // ADR-0031 holds the justified `{@html}` disables to. Without these, a
  // silent bare disable is the cheapest way to defeat any rule below.
  reportDescriptionlessDisables: true,
  reportNeedlessDisables: true,
  reportInvalidScopeDisables: true,

  // web/src/tokens.css is generated from web/src/lib/design/tokens.ts
  // (ADR-0071) — `npm run gen:tokens:check` is what guards it.
  ignoreFiles: ['web/src/tokens.css'],
  rules: {
    // Constructs the CSS parser keeps and the browser then ignores. A
    // misspelled *property* is dropped and looks wrong on first render; a
    // misspelled at-rule prelude, media feature, pseudo-class or value is
    // retained in `cssRules`, reports unmatched, and simply never applies —
    // indistinguishable from correct code unless you happen to be developing
    // in the state it guards. Issue 1854 established that empirically for
    // `@media (prefers-reduced-motoin: reduce)`.
    'annotation-no-unknown': true,
    'at-rule-descriptor-no-unknown': true,
    'at-rule-descriptor-value-no-unknown': true,
    'at-rule-no-unknown': true,
    'at-rule-prelude-no-invalid': [true, { ignoreAtRules: ['media'] }],
    'custom-property-no-missing-var-function': true,
    'declaration-property-value-no-unknown': true,
    'font-family-no-missing-generic-family-keyword': true,
    'function-calc-no-unspaced-operator': true,
    'media-feature-name-no-unknown': true,
    'media-feature-name-value-no-unknown': true,
    'media-query-no-invalid': true,
    'named-grid-areas-no-invalid': true,
    'nesting-selector-no-missing-scoping-root': true,
    'no-invalid-double-slash-comments': true,
    'no-invalid-position-at-import-rule': true,
    'no-invalid-position-declaration': true,
    'no-irregular-whitespace': true,
    'property-no-unknown': true,
    'selector-anb-no-unmatchable': true,
    // `:global()` is Svelte scoping syntax, not an unknown pseudo-class, and
    // the 325 uses of it are the only thing that stood between this rule and
    // zero. Teaching the rule the framework's vocabulary is what ADR-0031
    // already does for genuine idioms; the rule then catches the typo it is
    // for (`:focus-visable`) across every component.
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global'] }],
    'selector-pseudo-element-no-unknown': true,
    'selector-type-no-unknown': [true, { ignore: ['custom-elements'] }],
    'string-no-newline': [true, { ignore: ['at-rule-preludes', 'declaration-values'] }],
    'syntax-string-no-invalid': true,

    // CSS that parses, applies, and does nothing — a block with no
    // declarations, a duplicate the cascade discards, a longhand a later
    // shorthand overwrites. Each one is either a leftover or an edit that
    // landed in the wrong place, and neither reads as wrong.
    'block-no-empty': true,
    'block-no-redundant-nested-style-rules': true,
    'comment-no-empty': true,
    'declaration-block-no-duplicate-custom-properties': true,
    'declaration-block-no-duplicate-properties': [
      true,
      { ignore: ['consecutive-duplicates-with-different-syntaxes'] },
    ],
    'declaration-block-no-shorthand-property-overrides': true,
    'font-family-no-duplicate-names': true,
    'keyframe-block-no-duplicate-selectors': true,
    // A keyframe declaration is unreachable by !important, so one there is
    // always a mistake — unlike the app-wide !important ban, which lives in
    // `npm run lint:tokens` (ADR-0071).
    'keyframe-declaration-no-important': true,
    'no-duplicate-at-import-rules': true,
    'no-empty-source': true,

    // Deprecated and vendor-prefixed syntax, in the four categories the
    // codebase already scores zero on. `property-no-vendor-prefix` is
    // deliberately NOT here: at the Safari 16.4 floor
    // (docs/COMPATIBILITY.md) `-webkit-backdrop-filter` and
    // `-webkit-user-select` are the only spellings that work, so those 8
    // prefixes are the floor being honoured rather than debt. ADR-0031
    // records the count.
    'at-rule-no-deprecated': true,
    'at-rule-no-vendor-prefix': true,
    'media-feature-name-no-vendor-prefix': true,
    'media-type-no-deprecated': true,
    'selector-no-vendor-prefix': true,
    'value-no-vendor-prefix': [true, { ignoreValues: ['box', 'inline-box'] }],

    // Conventions the codebase already follows everywhere, ratified so the
    // next divergence fails CI instead of resting on a reviewer noticing —
    // the same move ADR-0031 made for the silently-followed ESLint rules.
    // None of these is contested by Prettier: it normalises whitespace and
    // line breaks in CSS, not case, quoting, units, or naming. The three
    // patterns for constructs the app has not adopted yet (@container,
    // @custom-media, @layer) score zero for want of a subject and settle the
    // spelling before the first one lands.
    'comment-whitespace-inside': 'always',
    'container-name-pattern': '^(--)?([a-z][a-z0-9]*)(-[a-z0-9]+)*$',
    'custom-media-pattern': '^([a-z][a-z0-9]*)(-[a-z0-9]+)*$',
    'custom-property-pattern': '^([a-z][a-z0-9]*)(-[a-z0-9]+)*$',
    'declaration-block-single-line-max-declarations': 1,
    'font-family-name-quotes': 'always-where-recommended',
    'function-name-case': 'lower',
    'function-url-quotes': 'always',
    'hue-degree-notation': 'angle',
    'import-notation': 'url',
    'keyframe-selector-notation': 'percentage-unless-within-keyword-only-block',
    'layer-name-pattern': '^([a-z][a-z0-9]*)([.-][a-z0-9]+)*$',
    'length-zero-no-unit': [true, { ignore: ['custom-properties'] }],
    'lightness-notation': 'percentage',
    'number-max-precision': 4,
    'selector-attribute-quotes': 'always',
    'selector-pseudo-element-colon-notation': 'double',
    'selector-type-case': 'lower',
  },
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
