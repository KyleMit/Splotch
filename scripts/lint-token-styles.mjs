// Raw-hex ratchet for component styles (ADR-0071). Scans the <style> blocks
// of every web/src Svelte component for raw hex colors — the values that
// should be design tokens (`var(--…)` from web/src/lib/design/tokens.ts) —
// and fails if any file's count differs from the committed baseline below.
//
// The baseline is the explicit allowlist of documented one-offs. A count
// ABOVE baseline means a new raw hex crept in: migrate it to a token (see the
// design skill). A count BELOW baseline means someone migrated a one-off:
// lower the baseline here so the ratchet holds. CSS comments and hexes inside
// var(--x, #fallback) are ignored.
//
// Run via `npm run lint:tokens` (wired into the CI Quality job).

import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ROOT } from './lib/utils.mjs';

const SRC = resolve(ROOT, 'web/src');

// file (relative to web/src) → allowed raw-hex count, with the reason.
const BASELINE = new Map(
  Object.entries({
    // Light-only surface with its own WCAG-tuned accent palette (#7c4dcf
    // family); themed color tokens would half-dark-theme it. See the note at
    // the top of its <style> block.
    'lib/components/admin/AdminConsole.svelte': 49,
    // Light-only page, same reasoning as /admin.
    'routes/privacy/+page.svelte': 8,
    // Deliberate constants: contrast-pinned #666 on hardcoded-light host pages.
    'lib/components/Breadcrumb.svelte': 1,
    // Photographic stage/polaroid whites + the #4caf50 confirmation green.
    'lib/components/AiImageResult.svelte': 5,
    // #000 white-stroke keyline twin + rainbow-gradient/eraser chrome.
    'lib/components/ActionsPanel.svelte': 1,
    // Constant dim swatch ring + var(--color) usage documented in-file.
    'lib/components/ColorPicker.svelte': 1,
    // Unthemed danger-red chrome (deliberate — reads the same on both papers).
    'lib/components/ClearButton.svelte': 6,
    // Eraser-hole preview chrome and the rainbow conic gradient.
    'lib/components/DrawingCanvas.svelte': 9,
    // #fff on brand chrome (white-on-brand is constant in both themes).
    'lib/components/InstallBanner.svelte': 1,
    'lib/components/ParentCenter.svelte': 2,
    'lib/components/parent/ControlsSection.svelte': 2,
    'lib/components/parent/ReportForm.svelte': 2,
    // #fff on brand + the #4caf50 confirmation green shared with AiImageResult.
    'lib/components/parent/SetupInstructions.svelte': 2,
    // Confetti particle colors are content, not chrome.
    'lib/components/AiConfetti.svelte': 2,
    'lib/components/design/Button.svelte': 1,
    'lib/components/ErrorScreen.svelte': 1,
    'lib/components/parent/AiKeyManager.svelte': 1,
    'lib/components/parent/SavingSection.svelte': 1,
    // Paper-white backing behind the baked-light style-cover thumbnails.
    'lib/components/AiImagePrompt.svelte': 1,
    // Constant on-paper ink for the floating "?" button.
    'lib/components/ParentHelpButton.svelte': 1,
    // Deliberate console-key chip (dark slab + white glyph in both themes).
    'routes/dev/ai-timer/+page.svelte': 1,
  })
);

function svelteFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.svelte'))
    .map((e) => join(e.parentPath, e.name));
}

export function countRawHex(source) {
  const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1])
    .join('\n');
  const stripped = styles.replace(/\/\*[\s\S]*?\*\//g, '').replace(/var\([^)]*\)/g, 'var()');
  return (stripped.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
}

const problems = [];
const seen = new Set();

for (const file of svelteFiles(SRC)) {
  const rel = relative(SRC, file);
  const count = countRawHex(readFileSync(file, 'utf8'));
  const allowed = BASELINE.get(rel) ?? 0;
  seen.add(rel);
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
  console.error('Raw-hex token lint failed:\n\n' + problems.map((p) => `  ${p}`).join('\n'));
  process.exit(1);
}
console.log(`Raw-hex token lint passed (${BASELINE.size} allowlisted files).`);
