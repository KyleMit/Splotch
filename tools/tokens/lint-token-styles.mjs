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
// 2. Raw multi-digit z-index values — zero tolerance, no baseline yet. A z-index
//    of 10+ is chrome-tier stacking and must use the --z-* tokens so the
//    stacking order stays legible in one place. Single-digit values (local
//    ordering inside an isolated stacking context), var(--z-…), and calc()
//    stay legal. The first legitimate one-off gets a BASELINE-style per-file
//    allowlist map like the hex ratchet, never an inline exception or weakened
//    check.
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
// 4. !important — zero tolerance, no baseline yet. A declaration that needs
//    !important is out-arguing the cascade instead of fixing the specificity
//    or source-order problem underneath, and the next reader inherits a rule
//    that can only be beaten by another !important. The first legitimate
//    one-off gets a BASELINE-style per-file allowlist map like the hex
//    ratchet, never an inline exception or weakened check.
//
// Run via `npm run lint:tokens` (wired into the CI Quality job).
// The countRaw* seams are unit-tested in
// web/src/lib/design/lint-token-styles.test.ts.

import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { isMain } from '../lib/proc.mjs';

// file (relative to web/src) → allowed raw-hex count, with the reason.
const BASELINE = new Map(
  Object.entries({
    // The persistence banner's warning amber — no warn token pair exists yet
    // (it is the product's only warning surface), so the four light values
    // (wash, ink, border, code chip) stay pinned on both themes; the WHY
    // comment lives on .flash-warning.
    'lib/components/admin/AdminConsole.svelte': 4,
    // Notch harness (dev harness): the one warn pair. Amber is the ramp's
    // missing status colour — the same gap AdminConsole's persistence banner
    // documents — and both warn surfaces here (a medium-confidence badge, a
    // verdict) read it from these two declarations rather than restating it.
    'routes/dev/notch/+page.svelte': 2,
    // Notch harness hardware illustration: a camera cutout is black and the
    // system glyphs over it are white on every device in the matrix, whatever
    // theme the previewing browser is in — theme tokens would repaint physical
    // hardware. The WHY comment lives on .cutout.
    'routes/dev/notch/lib/DeviceChrome.svelte': 2,
    // Store marketing art (dev harness): the benefit chip stays white on the
    // frame's fixed light gradient — store screenshots must render identically
    // whatever theme the previewing browser is in, so theme tokens are the
    // wrong tool; the WHY comment lives on .chip.
    'routes/dev/store-frames/lib/StoreFrame.svelte': 1,
    // The Play feature graphic's fixed 1024×500 composition: three gradient
    // stops and the tag/sub inks from the store design handoff — marketing art
    // pinned to one look, deliberately outside the app's theming.
    'routes/dev/store-frames/lib/FeatureGraphic.svelte': 5,
    // The polaroid flight's photographic near-paper white behind the print
    // (the print itself is --polaroid-paper), like the AiResultStage picture it
    // lands in — plus the #000 white-stroke ink keyline shared by the action
    // buttons and the Brush/Stroke Width popovers (black reads against every
    // pen color and both papers).
    'app.css': 2,
    // /privacy, /changelog and both beta pages are absent on
    // purpose: they pinned a light-only --page-* palette until every page was
    // made to follow night mode, and now hold zero raw hexes. A new one there
    // is a page opting out of the theme again.
    // The ground behind the picture, the same photographic white for the same
    // reason: a picture is a print, and it hangs on paper under either theme.
    'lib/components/AiResultStage.svelte': 1,
    // The AI disclosure strip's ink and its Report accent. The strip is the one
    // surface in the app that sits on the dimmed modal backdrop rather than on
    // either paper, and that backdrop is dark under both themes — so --text-soft
    // and --danger-text would flip to dark ink on dark glass in light mode. The
    // two values are those tokens' dark-theme readings, pinned to the ground
    // they actually sit on.
    'lib/components/AiResultDisclosure.svelte': 2,
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
    // The Play feature graphic's display type (128px wordmark, 38px tagline,
    // 24px sub) — sized to a fixed 1024×500 store canvas, not the UI ramp.
    'routes/dev/store-frames/lib/FeatureGraphic.svelte': 3,
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

// Property names and keywords are case-insensitive in CSS, and the grammar
// allows whitespace between the ! and the keyword.
const IMPORTANT = /!\s*important\b/gi;

export function countImportantCss(cssText) {
  return (stripCss(cssText).match(IMPORTANT) ?? []).length;
}

export function countImportant(source) {
  return (strippedStyles(source).match(IMPORTANT) ?? []).length;
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
  const { ROOT } = await import('../lib/proc.mjs');
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
          `now lower its entry in tools/tokens/lint-token-styles.mjs so the ratchet holds.`
      );
    }
    const importantCount = isCss ? countImportantCss(source) : countImportant(source);
    if (importantCount > 0) {
      problems.push(
        `${rel}: ${importantCount} !important declaration(s) in <style> — fix the specificity or ` +
          `source order instead; a genuine one-off gets a baseline allowlist here, never an inline pass.`
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
          `now lower its entry in tools/tokens/lint-token-styles.mjs so the ratchet holds.`
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
      `${FONT_SIZE_BASELINE.size} allowlisted raw-font-size files, 0 raw z-index, 0 !important).`
  );
}

if (isMain(import.meta.url)) {
  await main();
}
