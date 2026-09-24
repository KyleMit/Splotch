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
// 5. Entirely unpinned :global() selectors — a per-file ratchet against
//    UNPINNED_GLOBAL_SELECTOR_BASELINE. Legitimate global seams stay legal
//    when a scoped compound pins them to the component; a selector made only
//    of global compounds and combinators can leak anywhere its class names
//    happen to match. Svelte's parsed CSS tree preserves top-level comma-list
//    members and nested :global { … } blocks, so the count follows selector
//    semantics rather than raw :global token count.
//
// Run via `npm run lint:tokens` (wired into the CI Quality job).
// The counting seams are unit-tested in
// web/src/lib/design/lint-token-styles.test.ts.

import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parse } from 'svelte/compiler';
import { isMain } from '../lib/proc.mjs';

// file (relative to web/src) → allowed raw-hex count, with the reason.
const BASELINE = new Map(
  Object.entries({
    // The notch harness's warning palette is migration debt, capped here to
    // prevent growth. Themed product warnings use the --warning-* tokens.
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
    // The #000 white-stroke ink keyline shared by the action buttons and the
    // Brush/Stroke Width popovers (black reads against every pen color and
    // both papers).
    'app.css': 1,
    // /privacy, /changelog and both beta pages are absent on
    // purpose: they pinned a light-only --page-* palette until every page was
    // made to follow night mode, and now hold zero raw hexes. A new one there
    // is a page opting out of the theme again.

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
    // The button handoff specifies compact matrix captions below the control label ramp.
    'lib/components/styleguide/ButtonSpecimens.svelte': 1,
    // The wordmark lockup's 10px tagline — brand typography sized to the mark
    // it locks up with, not UI text on the ramp.
    'lib/components/page/BrandMark.svelte': 1,
    // The Play feature graphic's display type (128px wordmark, 38px tagline,
    // 24px sub) — sized to a fixed 1024×500 store canvas, not the UI ramp.
    'routes/dev/store-frames/lib/FeatureGraphic.svelte': 3,
  })
);

// file (relative to web/src) → allowed entirely unpinned :global() selector count.
const UNPINNED_GLOBAL_SELECTOR_BASELINE = new Map(
  Object.entries({
    // Cross-component panel state and its forwarded Icon class require global seams.
    'lib/components/ActionsPanel.svelte': 5,
    // The chip sizes and re-inks the class forwarded into its child Icon.
    'lib/components/ActivePageChip.svelte': 2,
    // The prompt positions the close class forwarded into DialogHeader.
    'lib/components/AiImagePrompt.svelte': 2,
    // The result positions the close class forwarded into DialogHeader.
    'lib/components/AiImageResult.svelte': 1,
    // The disclosure sizes and re-inks the class forwarded into its child Icon.
    'lib/components/AiResultDisclosure.svelte': 2,
    // The waiting print positions the class forwarded into its child Icon.
    'lib/components/AiWaitingPolaroid.svelte': 1,
    // The clear control sizes the class forwarded into its child Icon.
    'lib/components/ClearButton.svelte': 2,
    // The coachmark positions and re-inks classes forwarded into child Icons.
    'lib/components/ClearCoachmark.svelte': 3,
    // The install surface sizes classes forwarded into SplotchyIcon and Icon children.
    'lib/components/InstallBanner.svelte': 4,
    // The gate sizes classes forwarded into its SplotchyIcon and Icon children.
    'lib/components/ParentalGate.svelte': 6,
    // The keypad sizes the class forwarded into its child Icon.
    'lib/components/ParentalGateKeypad.svelte': 3,
    // The footer sizes and re-inks the class forwarded into its child Icons.
    'lib/components/ParentalGateManageFooter.svelte': 3,
    // The empty ledger sizes the class forwarded into its child Icon.
    'lib/components/admin/InviteLedger.svelte': 1,
    // The row action sizes and re-inks the class forwarded into its child Icon.
    'lib/components/admin/InviteRowActions.svelte': 4,
    // The about section sizes classes forwarded into SplotchyIcon and Icon children.
    'lib/components/settings/AboutSection.svelte': 2,
    // The key manager sizes and re-inks the class forwarded into its child Icon.
    'lib/components/settings/AiKeyManager.svelte': 2,
    // The value proposition sizes and re-inks the class forwarded into child Icons.
    'lib/components/settings/AiValueProp.svelte': 2,
    // The settings hub sizes and re-inks the class forwarded into SectionIcon.
    'lib/components/settings/HubList.svelte': 2,
    // The compact shell sizes classes forwarded into SplotchyIcon and Icon children.
    'lib/components/settings/CompactShell.svelte': 3,
    // The saving section sizes the class forwarded into its child Icon.
    'lib/components/settings/SavingSection.svelte': 1,
    // The setup steps size classes forwarded into Button and Icon children.
    'lib/components/settings/SetupInstructions.svelte': 2,
    // The toggle row sizes the class forwarded into its child Icon.
    'lib/components/settings/ToggleRow.svelte': 1,
    // The switch sizes and re-inks the class forwarded into its child Icon.
    'lib/components/settings/ToggleSwitch.svelte': 2,
    // The styleguide re-inks nested Icon SVGs rendered by child furniture components.
    'lib/components/styleguide/ChromeSections.svelte': 1,
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
// Comments strip before strings on purpose: an apostrophe inside a comment
// ("don't") would otherwise open a phantom string that swallows real CSS,
// while a comment marker inside a string (content: "/*") is the rarer hazard.
const QUOTED_STRING = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;

function stripCss(cssText) {
  return cssText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(QUOTED_STRING, '""')
    .replace(/var\([^)]*\)/g, 'var()');
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

function isGlobalPseudo(selectorNode) {
  return selectorNode.type === 'PseudoClassSelector' && selectorNode.name === 'global';
}

function firstCompoundNode(relativeSelector) {
  return relativeSelector.selectors[0];
}

function endsWithBlockGlobal(selector) {
  const first = firstCompoundNode(selector.children.at(-1));
  return isGlobalPseudo(first) && first.args === null;
}

function hasArgumentlessGlobal(selector) {
  return selector.children.some((compound) => {
    const first = firstCompoundNode(compound);
    return isGlobalPseudo(first) && first.args === null;
  });
}

function hasGlobalCompound(selector) {
  return selector.children.some((compound) => isGlobalPseudo(firstCompoundNode(compound)));
}

function hasNestingCompound(selector) {
  return selector.children.some(
    (compound) => firstCompoundNode(compound)?.type === 'NestingSelector'
  );
}

function hasScopedCompound(selector, insideGlobalBlock) {
  if (insideGlobalBlock) return false;

  let globalTail = false;
  return selector.children.some((compound) => {
    if (globalTail) return false;

    const first = firstCompoundNode(compound);
    if (isGlobalPseudo(first)) {
      globalTail = first.args === null;
      return false;
    }
    return first?.type !== 'NestingSelector';
  });
}

function containsRule(children) {
  return children.some(
    (child) =>
      child.type === 'Rule' || (child.block?.children && containsRule(child.block.children))
  );
}

export function countUnpinnedGlobalSelectors(source) {
  const style = parse(source, { modern: true }).css;
  if (!style) return 0;

  let count = 0;

  function walk(children, parentContexts) {
    for (const child of children) {
      if (child.type !== 'Rule') {
        if (child.block?.children) walk(child.block.children, parentContexts);
        continue;
      }

      const selectors = child.prelude.children;
      const hasNestedRule = containsRule(child.block.children);

      for (const selector of selectors) {
        const isBlockWrapper = hasNestedRule && endsWithBlockGlobal(selector);
        const isUnpinned = parentContexts.some((parent) => {
          const isGlobal =
            parent.insideGlobalBlock || hasGlobalCompound(selector) || hasNestingCompound(selector);
          const isScoped = parent.scoped || hasScopedCompound(selector, parent.insideGlobalBlock);
          return isGlobal && !isScoped;
        });
        if (!isBlockWrapper && isUnpinned) count++;
      }

      const nextContexts = parentContexts.flatMap((parent) =>
        selectors.map((selector) => ({
          scoped: parent.scoped || hasScopedCompound(selector, parent.insideGlobalBlock),
          insideGlobalBlock:
            parent.insideGlobalBlock || (hasNestedRule && hasArgumentlessGlobal(selector)),
        }))
      );
      walk(child.block.children, nextContexts);
    }
  }

  walk(style.children, [{ scoped: false, insideGlobalBlock: false }]);
  return count;
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
    if (!isCss) {
      const globalCount = countUnpinnedGlobalSelectors(source);
      const globalAllowed = UNPINNED_GLOBAL_SELECTOR_BASELINE.get(rel) ?? 0;
      if (globalCount > globalAllowed) {
        problems.push(
          `${rel}: ${globalCount} entirely unpinned :global() selector(s) (baseline ${globalAllowed}) — ` +
            `add a scoped compound to each new selector; legitimate scoped global seams remain allowed.`
        );
      } else if (globalCount < globalAllowed) {
        problems.push(
          `${rel}: ${globalCount} entirely unpinned :global() selector(s) but baseline says ` +
            `${globalAllowed} — nice, now lower its entry in tools/tokens/lint-token-styles.mjs ` +
            `so the ratchet holds.`
        );
      }
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
  for (const rel of UNPINNED_GLOBAL_SELECTOR_BASELINE.keys()) {
    if (!seen.has(rel)) {
      problems.push(
        `${rel}: in the unpinned :global() baseline but no longer exists — remove its entry.`
      );
    }
  }

  if (problems.length) {
    console.error('Token style lint failed:\n\n' + problems.map((p) => `  ${p}`).join('\n'));
    process.exit(1);
  }
  console.log(
    `Token style lint passed (${BASELINE.size} allowlisted raw-hex files, ` +
      `${FONT_SIZE_BASELINE.size} allowlisted raw-font-size files, ` +
      `${UNPINNED_GLOBAL_SELECTOR_BASELINE.size} ratcheted unpinned-:global() files, ` +
      `0 raw z-index, 0 !important).`
  );
}

if (isMain(import.meta.url)) {
  await main();
}
