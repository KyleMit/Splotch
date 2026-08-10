// Token lints for component styles (ADR-0071). Scans the <style> blocks of
// every web/src Svelte component — plus the hand-authored plain .css files
// (app.css; the generated tokens.css is the token source and is excluded) —
// for the classes of raw values that should be design
// tokens (from web/src/lib/design/tokens.ts):
//
// 1. Raw hex colors — a ratchet against the committed baseline below. The
//    baseline is the explicit allowlist of documented one-offs. A count ABOVE
//    baseline means a new raw hex crept in: migrate it to a token (see the
//    design skill). A count BELOW baseline means someone migrated a one-off:
//    lower the baseline here so the ratchet holds. CSS comments and hexes
//    inside var(--x, #fallback) are ignored. Scope is deliberately hex-only:
//    raw rgba()/hsl() are dominated by legitimate alpha shadows and overlays
//    that have no token equivalent, so counting them would triple the
//    baseline and blunt the signal. Hex is the surface the token migration
//    actually finished.
//
// 2. Raw multi-digit z-index values — zero tolerance, no baseline. A z-index
//    of 10+ is chrome-tier stacking and must use the --z-* tokens so the
//    stacking order stays legible in one place. Single-digit values (local
//    ordering inside an isolated stacking context), var(--z-…), and calc()
//    stay legal.
//
// 3. Raw font-size values — a ratchet like the hex one, against
//    FONT_SIZE_BASELINE. The type ramp (--font-size-*, --input-font-size)
//    covers every size the app sets on purpose; a raw declaration is either a
//    documented one-off (the baseline) or ramp drift. Size-bearing `font`
//    shorthands count too — the shorthand grammar always carries a size —
//    while keyword-only forms (font: inherit) stay legal. box-shadow was
//    considered for the same treatment and rejected: raw shadows are
//    dominated by the canvas-floating chrome's legitimate one-off alpha
//    lifts, so a baseline would blunt the signal the way raw
//    rgba() would for color — the elevation tokens cover the modal/settings
//    surfaces, and rule 2 of the design skill governs the rest.
//
// Run via `npm run lint:tokens` (wired into the CI Quality job).
// The countRaw* seams are unit-tested in
// web/src/lib/design/lint-token-styles.test.ts.

import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { isMain } from './lib/proc.mjs';

// file (relative to web/src) → allowed raw-hex count, with the reason.
const BASELINE = new Map(
  Object.entries({
    // The persistence banner's warning amber — no warn token pair exists yet
    // (it is the product's only warning surface), so the four light values
    // (wash, ink, border, code chip) stay pinned on both themes; the WHY
    // comment lives on .flash-warning.
    'lib/components/admin/AdminConsole.svelte': 4,
    // The polaroid flight's photographic near-paper whites — the print stays
    // paper-white on both themes, like the AiImageResult stage it lands in —
    // plus the #000 white-stroke ink keyline shared by the action buttons and
    // the Brush/Stroke Width popovers (black reads against every pen color and
    // both papers).
    'app.css': 3,
    // Light-only page (ADR-0071 amendment) — pins PageShell's themed
    // --page-* defaults to the same light values /android-beta pins (eleven),
    // plus the highlight panel's brand-tinted border and row hairline (two).
    'routes/privacy/+page.svelte': 13,
    // Light-only full release history, matching /privacy's PageShell palette.
    'routes/changelog/+page.svelte': 11,
    // Light-only page (ADR-0071 amendment) — a palette pinned to a light
    // ground, declared once as custom properties at the top of its <style>
    // block. Its eleven pin PageShell's themed --page-* defaults (whose dark
    // values would half-dark-theme the page), including /privacy's AA-safe
    // #7c4dcf link and the step buttons' fill; the other five are the
    // troubleshooting panel's fill, border, hover pair, and chevron disc border.
    'routes/android-beta/+page.svelte': 16,
    // The beta page's step ledger, light-only with the page it renders on: each
    // step's crayon hue in two strengths — a wash behind the numeral and under
    // the callout, and a darkened ink for both of those texts (the raw palette
    // hues fail contrast on either ground) — plus the connector rail and the
    // callout body ink. The crayon chips and the callout accent rails are NOT
    // here: those read their hexes out of lib/palette.ts at render, which
    // palette-source.test.mjs requires.
    'lib/components/androidBeta/StepLedger.svelte': 10,
    // Photographic stage/polaroid whites.
    'lib/components/AiImageResult.svelte': 2,
    // Constant dim swatch ring + var(--color) usage documented in-file.
    'lib/components/ColorPicker.svelte': 1,
    // The delete-ready gradient's darker second stop — unthemed on purpose,
    // it reads the same on both papers (ADR-0052 and the ThemeTokens doc
    // comment in lib/design/tokens.ts). The alarm red itself is the local
    // --alarm-rgb custom property; the at-rest fill is --clear-gradient-rest,
    // shared with the coachmark ghost.
    'lib/components/ClearButton.svelte': 1,
    // Eraser-hole preview chrome and the rainbow conic gradient (moved here
    // from DrawingCanvas.svelte with the rest of the pointer-halo UI).
    'lib/components/PointerHalos.svelte': 9,
    // Confetti particle colors are content, not chrome.
    'lib/components/AiConfetti.svelte': 1,
    // Deliberate console-key chip (dark slab + white glyph in both themes).
    'routes/dev/ai-timer/+page.svelte': 1,
  })
);

// file (relative to web/src) → allowed raw font-size count, with the reason.
const FONT_SIZE_BASELINE = new Map(
  Object.entries({
    // The wordmark lockup's 10px tagline — brand typography sized to the mark
    // it locks up with, not UI text on the ramp.
    'lib/components/page/BrandMark.svelte': 1,
    // The reveal stage's 48px celebration emoji and the error state's 36px —
    // pictorial glyphs scaled as art, not type.
    'lib/components/AiImageResult.svelte': 2,
    // The intro's inline code chips ride their sentence at 0.9em — relative to
    // the prose around them, so a ramp step would break the lockstep.
    'routes/dev/ai-timer/+page.svelte': 1,
  })
);

function styledFiles(dir) {
  // Svelte components plus plain .css (app.css) — every
  // hand-authored stylesheet under web/src. The generated tokens.css is the
  // token source itself, so it is the one exclusion.
  // recursive readdir + parentPath needs Node >= 20.12 (see package.json engines).
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(
      (e) =>
        e.isFile() &&
        (e.name.endsWith('.svelte') || (e.name.endsWith('.css') && e.name !== 'tokens.css'))
    )
    .map((e) => join(e.parentPath, e.name));
}

// Known blind spots, harmless today: an all-hex SVG fragment ref like
// url(#fade) would false-positive (none exist in style blocks — it would show
// up as a baseline bump to investigate, not a silent pass), and the var()
// strip doesn't survive nested parens (var(--x, rgba(…))) — fine while
// fallbacks stay simple, since the leftover text contains no hex.
function stripCss(cssText) {
  return cssText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/var\([^)]*\)/g, 'var()');
}

// A .svelte source contributes its <style> blocks; a .css source is one big
// style block already.
function strippedStyles(source) {
  return stripCss(
    [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
  );
}

export function countRawHexCss(cssText) {
  return (stripCss(cssText).match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
}

export function countRawZIndexCss(cssText) {
  return (stripCss(cssText).match(/z-index\s*:\s*-?\d{2,}/g) ?? []).length;
}

// The lookbehind keeps custom-property declarations and references out
// (--font-size-xs: 12px, --admin-font-size: …); stripCss has already
// collapsed var() calls, so a tokenized font-size: var(--font-size-sm)
// reads as font-size: var() and the lookahead skips it.
// The whitespace lives inside the lookahead: with a \s* before it, the
// matcher would backtrack the whitespace to a position where the lookahead
// sees " var(" and passes, counting tokenized declarations too.
// Property names are case-insensitive in CSS, so the matchers are too.
const RAW_FONT_SIZE = /(?<![\w-])font-size\s*:(?!\s*var\()/gi;

// The font shorthand's grammar requires a size in every non-keyword form, so
// a shorthand that isn't a CSS-wide keyword (or a collapsed var()) sets a raw
// size the longhand matcher above cannot see. System-font keywords
// (font: menu) also apply an off-ramp size and stay counted on purpose.
const FONT_SHORTHAND = /(?<![\w-])font\s*:\s*([^;}]*)/gi;
const SIZELESS_FONT_VALUE = /^(inherit|initial|unset|revert(-layer)?|var\(\))$/i;

function countRawFontShorthand(strippedCss) {
  return [...strippedCss.matchAll(FONT_SHORTHAND)].filter(
    (m) => !SIZELESS_FONT_VALUE.test(m[1].trim())
  ).length;
}

export function countRawFontSizeCss(cssText) {
  const stripped = stripCss(cssText);
  return (stripped.match(RAW_FONT_SIZE) ?? []).length + countRawFontShorthand(stripped);
}

export function countRawHex(source) {
  return (strippedStyles(source).match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
}

export function countRawZIndex(source) {
  return (strippedStyles(source).match(/z-index\s*:\s*-?\d{2,}/g) ?? []).length;
}

export function countRawFontSize(source) {
  const stripped = strippedStyles(source);
  return (stripped.match(RAW_FONT_SIZE) ?? []).length + countRawFontShorthand(stripped);
}

async function main() {
  const { ROOT } = await import('./lib/proc.mjs');
  const SRC = resolve(ROOT, 'web/src');
  const problems = [];
  const seen = new Set();

  for (const file of styledFiles(SRC)) {
    const rel = relative(SRC, file);
    const source = readFileSync(file, 'utf8');
    const isCss = file.endsWith('.css');
    const count = isCss ? countRawHexCss(source) : countRawHex(source);
    const allowed = BASELINE.get(rel) ?? 0;
    seen.add(rel);
    const zCount = isCss ? countRawZIndexCss(source) : countRawZIndex(source);
    if (zCount > 0) {
      problems.push(
        `${rel}: ${zCount} raw multi-digit z-index value(s) in <style> — chrome-tier stacking must ` +
          `use the --z-* tokens (var(--z-…), see the design skill); single-digit local values are fine.`
      );
    }
    if (count > allowed) {
      problems.push(
        `${rel}: ${count} raw hex color(s) in <style> (baseline ${allowed}) — use the design tokens ` +
          `(var(--…), see the design skill); a genuine one-off needs a comment and a baseline bump here.`
      );
    } else if (count < allowed) {
      problems.push(
        `${rel}: ${count} raw hex color(s) in <style> but baseline says ${allowed} — nice, ` +
          `now lower its entry in scripts/lint-token-styles.mjs so the ratchet holds.`
      );
    }
    const fontCount = isCss ? countRawFontSizeCss(source) : countRawFontSize(source);
    const fontAllowed = FONT_SIZE_BASELINE.get(rel) ?? 0;
    if (fontCount > fontAllowed) {
      problems.push(
        `${rel}: ${fontCount} raw font-size(s) in <style> (baseline ${fontAllowed}) — use the type ramp ` +
          `(var(--font-size-…), see the design skill); a genuine one-off needs a comment and a baseline bump here.`
      );
    } else if (fontCount < fontAllowed) {
      problems.push(
        `${rel}: ${fontCount} raw font-size(s) in <style> but baseline says ${fontAllowed} — nice, ` +
          `now lower its entry in scripts/lint-token-styles.mjs so the ratchet holds.`
      );
    }
  }

  for (const rel of BASELINE.keys()) {
    if (!seen.has(rel)) {
      problems.push(`${rel}: in the raw-hex baseline but no longer exists — remove its entry.`);
    }
  }
  for (const rel of FONT_SIZE_BASELINE.keys()) {
    if (!seen.has(rel)) {
      problems.push(`${rel}: in the font-size baseline but no longer exists — remove its entry.`);
    }
  }

  if (problems.length) {
    console.error('Token style lint failed:\n\n' + problems.map((p) => `  ${p}`).join('\n'));
    process.exit(1);
  }
  console.log(
    `Token style lint passed (${BASELINE.size} allowlisted raw-hex files, ` +
      `${FONT_SIZE_BASELINE.size} allowlisted raw-font-size files, 0 raw z-index).`
  );
}

if (isMain(import.meta.url)) {
  await main();
}
