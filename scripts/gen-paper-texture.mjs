// Bakes the handmade-paper grain onto each theme's --paper color and writes the
// two OPAQUE tiles the app serves (ADR-0100). Run via `npm run gen:paper-texture`;
// `--check` is the CI drift gate (regenerate and fail if a committed tile
// differs, like gen:tokens:check).
//
// The grain source is alpha-only and deliberately NOT in web/static — a served
// copy would be dead weight nothing references, and the whole point of this
// generator is that the shipped tiles carry no alpha channel to blend.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { PAPER_TEXTURES, themes } from '../web/src/lib/design/tokens.ts';
import { ROOT } from './lib/proc.mjs';

const GRAIN_PATH = resolve(ROOT, 'scripts/assets/handmade-paper-grain.webp');
const STATIC_DIR = resolve(ROOT, 'web/static');

// Lossless is not a default worth revisiting. The grain spans only ~21 levels
// per channel, and lossy webp's per-pixel error is the same order as the signal
// itself: q90 moves pixels by up to 8 levels and q100 by 5, so the artifacts
// don't just soften the grain, they replace it (measured per-channel variance
// goes DOWN in some channels and UP in others — blocking noise standing in for
// texture). Exact bytes also let the drift guard compare decoded pixels against
// the token color with no tolerance for compression. The two tiles cost ~8 KB
// more than the single alpha grain they replace; that is the accepted price.
const WEBP_OPTIONS = { lossless: true, effort: 6 };

async function renderTile(theme) {
  const grain = sharp(GRAIN_PATH);
  const { width, height } = await grain.metadata();
  return sharp({
    create: { width, height, channels: 4, background: themes[theme].paper },
  })
    .composite([{ input: await grain.toBuffer() }])
    .removeAlpha()
    .webp(WEBP_OPTIONS)
    .toBuffer();
}

function outPath(theme) {
  return join(STATIC_DIR, PAPER_TEXTURES[theme]);
}

function safeRead(path) {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

const {
  values: { check },
} = parseArgs({ options: { check: { type: 'boolean' } } });

let stale = 0;
for (const theme of Object.keys(PAPER_TEXTURES)) {
  const next = await renderTile(theme);
  const path = outPath(theme);
  const current = safeRead(path);
  const label = PAPER_TEXTURES[theme];

  if (current?.equals(next)) {
    console.log(`${label} already up to date.`);
    continue;
  }
  if (check) {
    console.error(`${label} is out of date — run \`npm run gen:paper-texture\` and commit it.`);
    stale++;
    continue;
  }
  writeFileSync(path, next);
  console.log(`Wrote web/static${label} (${next.length} bytes)`);
}

if (stale) process.exit(1);
