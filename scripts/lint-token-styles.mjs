// Token lints for component styles (ADR-0071). Scans the <style> blocks of
// every web/src Svelte component for two classes of raw values that should be
// design tokens (from web/src/lib/design/tokens.ts):
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
// Run via `npm run lint:tokens` (wired into the CI Quality job).
// countRawHex and countRawZIndex are unit-tested in
// web/src/lib/design/lint-token-styles.test.ts.

import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { isMain } from './lib/proc.mjs';

// file (relative to web/src) → allowed raw-hex count, with the reason.
const BASELINE = new Map(
  Object.entries({
    // Light-only surface with its own WCAG-tuned accent palette (#7c4dcf
    // family); themed color tokens would half-dark-theme it. See the note at
    // the top of its <style> block.
    'lib/components/admin/AdminConsole.svelte': 34,
    // The /admin overflow modal, lifted out of AdminConsole with its
    // `.more-menu*` rules intact — same light-only surface, same reasoning.
    // Its four are the sheet white, the hover tint, and the destructive
    // red + its tint; none has an --admin-* equivalent to point at.
    'lib/components/admin/InviteMenu.svelte': 4,
    // Light-only page, same reasoning as /admin.
    'routes/privacy/+page.svelte': 8,
    // Light-only page, same reasoning as /admin — a palette pinned to a light
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
    // Deliberate constant: #666 is contrast-pinned for the one light-only host
    // (/admin), where --text-mid's dark value would be 1.9:1. Themed hosts (the
    // /dev harnesses) override it — see the note on .crumb-current.
    'lib/components/Breadcrumb.svelte': 1,
    // Photographic stage/polaroid whites + the #9559cd download-button hover
    // (≠ --brand-hover #9961d1; converging it is a visible change).
    'lib/components/AiImageResult.svelte': 3,
    // #000 white-stroke keyline for the Brush/Stroke trigger faces.
    'lib/components/ActionsPanel.svelte': 1,
    // #000 white-stroke keyline for the Brush Menu popover (extracted from
    // ActionsPanel — see the twin rule there).
    'lib/components/BrushMenu.svelte': 1,
    // #000 white-stroke keyline for the Stroke Width popover (extracted from
    // ActionsPanel — see the twin rule there).
    'lib/components/StrokeWidthMenu.svelte': 1,
    // Constant dim swatch ring + var(--color) usage documented in-file.
    'lib/components/ColorPicker.svelte': 1,
    // The armed (drag-past-threshold) danger red — unthemed on purpose, it
    // reads the same on both papers (ADR-0052 and the ThemeTokens doc comment
    // in lib/design/tokens.ts). The at-rest fill is --clear-gradient-rest,
    // shared with the coachmark ghost.
    'lib/components/ClearButton.svelte': 2,
    // Eraser-hole preview chrome and the rainbow conic gradient (moved here
    // from DrawingCanvas.svelte with the rest of the pointer-halo UI).
    'lib/components/PointerHalos.svelte': 9,
    // Confetti particle colors are content, not chrome.
    'lib/components/AiConfetti.svelte': 1,
    // Paper-white backing behind the baked-light style-cover thumbnails.
    'lib/components/AiImagePrompt.svelte': 1,
    // Constant on-paper ink for the floating "?" button.
    'lib/components/SettingsButton.svelte': 1,
    // Deliberate console-key chip (dark slab + white glyph in both themes).
    'routes/dev/ai-timer/+page.svelte': 1,
  })
);

function svelteFiles(dir) {
  // recursive readdir + parentPath needs Node >= 20.12 (see package.json engines).
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.svelte'))
    .map((e) => join(e.parentPath, e.name));
}

// Known blind spots, harmless today: an all-hex SVG fragment ref like
// url(#fade) would false-positive (none exist in style blocks — it would show
// up as a baseline bump to investigate, not a silent pass), and the var()
// strip doesn't survive nested parens (var(--x, rgba(…))) — fine while
// fallbacks stay simple, since the leftover text contains no hex.
function strippedStyles(source) {
  return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1])
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/var\([^)]*\)/g, 'var()');
}

export function countRawHex(source) {
  return (strippedStyles(source).match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
}

export function countRawZIndex(source) {
  return (strippedStyles(source).match(/z-index\s*:\s*-?\d{2,}/g) ?? []).length;
}

async function main() {
  const { ROOT } = await import('./lib/proc.mjs');
  const SRC = resolve(ROOT, 'web/src');
  const problems = [];
  const seen = new Set();

  for (const file of svelteFiles(SRC)) {
    const rel = relative(SRC, file);
    const source = readFileSync(file, 'utf8');
    const count = countRawHex(source);
    const allowed = BASELINE.get(rel) ?? 0;
    seen.add(rel);
    const zCount = countRawZIndex(source);
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
  }

  for (const rel of BASELINE.keys()) {
    if (!seen.has(rel)) {
      problems.push(`${rel}: in the baseline but no longer exists — remove its entry.`);
    }
  }

  if (problems.length) {
    console.error('Token style lint failed:\n\n' + problems.map((p) => `  ${p}`).join('\n'));
    process.exit(1);
  }
  console.log(
    `Token style lint passed (${BASELINE.size} allowlisted raw-hex files, 0 raw z-index).`
  );
}

if (isMain(import.meta.url)) {
  await main();
}
