// Regenerates the AI style cover thumbnails in web/static/styles/ by running
// the source drawing (tools/asset-gen/style-covers/source.svg) through Gemini once per
// style per theme, using the same prompt assembly as /api/generate-image.
// Requires GEMINI_API_KEY in the environment. Run via npm so the TypeScript
// imports resolve (node --experimental-strip-types):
//   npm run gen:style-covers                                  every style, both themes
//   npm run gen:style-covers -- --theme dark                  every style, dark only
//   npm run gen:style-covers -- --style Crayon --theme dark   one style, one theme
//   npm run gen:style-covers -- --style Crayon --temperature 1.4
// Bump --temperature (model default is 1) for different takes on a re-run when
// a style's first render isn't the look you want — but see
// docs/style-cover-theme-fork.md: past about 1.0 these styles start inventing
// shapes the child never drew.
//
// The source is flattened onto the theme's own paper color before it is shown
// to the model: on dark paper the model reads the scene as a night drawing,
// which is half of what makes a dark cover a dark cover (the other half is the
// night clause buildPromptForStyle appends).
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { STYLES_DIR, STYLE_SOURCE_SVG } from '../lib/asset-paths.mjs';
import { fail, parseTemperature } from '../lib/asset-cli.mjs';
import { generateImage, makeClient } from '../lib/gemini.mjs';
import {
  STYLE_NAMES,
  hasPunchedBackground,
  styleSuffixesFor,
  styleThumbPath,
} from '../../../web/src/lib/ai/styles.ts';
import { buildPromptForStyle } from '../../../web/src/lib/ai/prompt.ts';
import { PAPER_COLORS, RESOLVED_THEMES } from '../../../web/src/lib/theme.ts';
import { punchFlatBackground } from '../lib/flat-background-punch.mjs';

const THUMB_SIZE = 448;
// Display-sized cover thumbnails hide q75 artifacts, so favor download bytes over source fidelity.
const WEBP_QUALITY = 75;
const THEMES = RESOLVED_THEMES;

// A keyed cover should lose most of its field but keep a substantial subject.
// Outside this band the model gave us a shadowed or textured backdrop the flood
// fill could only nibble at, or a flat image it ate whole. Either way the render
// is unusable, so it is rejected BEFORE the write — anything that reaches disk is
// something a human will review and ship.
export const MIN_PUNCHED_FRACTION = 0.05;
export const MAX_PUNCHED_FRACTION = 0.95;

export class CoverFailuresError extends Error {
  constructor(count) {
    super(`${count} cover(s) failed.`);
    this.name = 'CoverFailuresError';
    this.count = count;
  }
}

// Generate one styled render of a drawing. Returns raw image bytes + mime type,
// or throws with the refusal/empty reason.
async function generateStyledImage(ai, { imageBytes, mimeType, style, theme, temperature }) {
  const prompt = buildPromptForStyle(style, styleSuffixesFor(theme), theme);
  return generateImage(ai, { imageBytes, mimeType, prompt, temperature });
}

// Cut the flat field off a cutout style, rejecting a key that plainly missed.
async function punchOrReject(bytes) {
  const { buffer, punchedFraction } = await punchFlatBackground(bytes);
  if (punchedFraction < MIN_PUNCHED_FRACTION || punchedFraction > MAX_PUNCHED_FRACTION) {
    throw new Error(
      `keyed ${(punchedFraction * 100).toFixed(0)}% of the frame, outside the ` +
        `${MIN_PUNCHED_FRACTION * 100}-${MAX_PUNCHED_FRACTION * 100}% band — the model ` +
        `probably ignored the flat backdrop; re-roll`
    );
  }
  return { buffer, note: ` (punched ${(punchedFraction * 100).toFixed(0)}%)` };
}

function resolveOne(name, available, label) {
  const match = available.find((s) => s.toLowerCase() === name.toLowerCase());
  if (!match) fail(`Unknown ${label} "${name}". Available: ${available.join(', ')}`);
  return match;
}

export async function run(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      style: { type: 'string', short: 's', multiple: true },
      theme: { type: 'string', multiple: true },
      temperature: { type: 'string', short: 't' },
    },
  });

  const styles = values.style?.length
    ? values.style.map((s) => resolveOne(s, STYLE_NAMES, 'style'))
    : STYLE_NAMES;
  const themes = values.theme?.length
    ? values.theme.map((t) => resolveOne(t, THEMES, 'theme'))
    : THEMES;
  const temperature = parseTemperature(values.temperature, '--temperature', undefined);
  const ai = makeClient();

  const sourceSvg = await readFile(STYLE_SOURCE_SVG);
  const sourceForTheme = Object.fromEntries(
    await Promise.all(
      themes.map(async (theme) => [
        theme,
        await sharp(sourceSvg).flatten({ background: PAPER_COLORS[theme] }).png().toBuffer(),
      ])
    )
  );

  let failures = 0;
  const shipped = [];
  for (const theme of themes) {
    for (const style of styles) {
      // styleThumbPath is the app's URL for the asset; under web/static/ the
      // route and the file path are the same string, so the app and the
      // generator can never disagree about where a cover lives.
      const out = join(STYLES_DIR, styleThumbPath(style, theme).replace('/styles/', ''));
      const cutout = hasPunchedBackground(style);
      process.stdout.write(`${theme}/${style} ... `);
      try {
        const { bytes } = await generateStyledImage(ai, {
          imageBytes: sourceForTheme[theme],
          mimeType: 'image/png',
          style,
          theme,
          temperature,
        });
        // Key the backdrop at full resolution, before the resize resamples its
        // edge into a gradient the flood fill would stop partway through.
        const { buffer: image, note } = cutout
          ? await punchOrReject(bytes)
          : { buffer: bytes, note: '' };

        await sharp(image)
          // A cutout is fitted whole rather than cropped to fill: 'cover' would
          // shave the die-cut band off whichever edge the model drew closest.
          .resize(
            THUMB_SIZE,
            THUMB_SIZE,
            cutout
              ? { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }
              : { fit: 'cover' }
          )
          .webp({ quality: WEBP_QUALITY })
          .toFile(out);
        shipped.push(out);
        console.log(`saved ${out}${note}`);
      } catch (err) {
        failures++;
        console.log(`FAILED (${err instanceof Error ? err.message : err})`);
      }
    }
  }

  console.log('Done.');
  if (failures) throw new CoverFailuresError(failures);
  return { shipped };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    // A CoverFailuresError is the expected "some renders were rejected" exit and
    // its message says everything; anything else is a bug, so print it whole to
    // keep the stack.
    console.error(err instanceof CoverFailuresError ? err.message : err);
    process.exitCode = 1;
  });
}
