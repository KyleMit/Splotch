// @vitest-environment node
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { sourceFile } from '../appHtmlBootTestHarness';
import { brand } from './design/tokens';
import { THEME_COLORS } from './theme';

// The manifest is static JSON, so it restates the colors the installed app's
// launch screen and window chrome wear before any page code runs. The operating
// system's color scheme picks between the top-level values and
// color_scheme_dark; the parent's Appearance setting cannot reach it.
interface ManifestColors {
  theme_color?: string;
  background_color?: string;
}

interface ManifestIcon {
  src: string;
  sizes: string;
  purpose: string;
}

const manifest: ManifestColors & {
  color_scheme_dark?: ManifestColors;
  icons: ManifestIcon[];
} = JSON.parse(sourceFile('../static/site.webmanifest'));

const iconsFor = (purpose: string) => manifest.icons.filter((icon) => icon.purpose === purpose);

describe('site.webmanifest colors track the theme module', () => {
  it('keeps the light window chrome on THEME_COLORS.light', () => {
    expect(manifest.theme_color).toBe(THEME_COLORS.light);
  });

  it('keeps the dark window chrome on THEME_COLORS.dark', () => {
    expect(manifest.color_scheme_dark?.theme_color).toBe(THEME_COLORS.dark);
  });

  it('launches on the brand color', () => {
    expect(manifest.background_color).toBe(brand.brand);
  });

  // The launch screen follows the operating system, and the app it hands off
  // to follows the Appearance setting, so the two can disagree. The brand color
  // sits between both papers; a dark launch screen would not.
  it('launches on the same color under either color scheme', () => {
    expect(Object.keys(manifest.color_scheme_dark ?? {})).toEqual(['theme_color']);
  });
});

// Same workaround as sourceFile: the path stays a parameter so Vite leaves it
// a file URL.
function staticFile(src: string): string {
  return fileURLToPath(new URL(`../../static${src}`, import.meta.url));
}

async function cornerColor(src: string): Promise<{ hex: string; alpha: number }> {
  const { data } = await sharp(staticFile(src))
    .ensureAlpha()
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const hex = [data[0], data[1], data[2]].map((c) => c.toString(16).padStart(2, '0')).join('');
  return { hex: `#${hex}`, alpha: data[3] };
}

describe('site.webmanifest icons', () => {
  // Android draws the maskable icon on the launch screen, masked or as the
  // whole square depending on how the app was installed. On a ground of the
  // launch color the square cannot show.
  it.each(iconsFor('maskable'))(
    'paints the maskable $sizes ground in the launch color',
    async (icon) => {
      expect(await cornerColor(icon.src)).toEqual({ hex: manifest.background_color, alpha: 255 });
    }
  );

  it.each(iconsFor('any'))(
    'leaves the ground of the $sizes any-purpose icon clear',
    async (icon) => {
      expect((await cornerColor(icon.src)).alpha).toBe(0);
    }
  );

  it('gives each purpose its own artwork at both sizes', () => {
    const any = iconsFor('any');
    const maskable = iconsFor('maskable');
    expect(any.map((icon) => icon.sizes)).toEqual(['192x192', '512x512']);
    expect(maskable.map((icon) => icon.sizes)).toEqual(['192x192', '512x512']);
    for (const icon of any) {
      expect(maskable.map((other) => other.src)).not.toContain(icon.src);
    }
  });
});
