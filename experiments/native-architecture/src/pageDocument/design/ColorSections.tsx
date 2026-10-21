import { useState } from 'react';
import { css, html } from 'react-strict-dom';
import { useDrawingAppearance } from '../../drawing/DrawingAppearance';
import { PaperTexture } from '../../drawing/PaperTexture';
import { paintAppearance, paintLabel, PALETTE_COLORS } from '../../drawing/palette';
import { brandColors, colors, dimensions, fixedColors } from '../../rsdDrawing/tokens.css';
import { brand, scale, themes, type ThemeTokens } from '../../../../../web/src/lib/design/tokens';
import { brandUsage, scaleUsage, themeUsage } from '../../../../../web/src/lib/design/tokenUsage';
import { colorContrast } from '../../../../../web/src/lib/design/colorContrast';
import { Code, Section } from './Section';
import { specimen } from './designStyles';

const CHIP_HEIGHT_PX = 44;
const CHIP_NAME_TRACKING = '-0.01em';
const CODE_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
// Ink printed on a chip's own fill: black or white, whichever holds the better worst-case contrast
// across the fill's stops (shipping's chipInk.ts), so every chip clears the AA floor.
const CHIP_INK = { dark: '#000', light: '#fff' } as const;
const PAPER_SPECIMEN_HEIGHT_PX = 96;
const SWATCH_PX = 44;
const FAMILY_MIN_PX = 240;
const SWATCH_LABEL_PX = 68;

const styles = css.create({
  families: {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${FAMILY_MIN_PX}px, 1fr))`,
    gap: dimensions.space4,
  },
  family: { display: 'flex', flexDirection: 'column', gap: dimensions.space2 },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: dimensions.radiusLg,
    overflow: 'hidden',
  },
  chip: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: dimensions.space2,
    minHeight: CHIP_HEIGHT_PX,
    paddingLeft: dimensions.space3,
    paddingRight: dimensions.space3,
    borderWidth: 0,
    fontSize: dimensions.fontSizeXs,
    textAlign: 'left',
    cursor: 'pointer',
  },
  // strict.css hands every button the page font, so the code face goes on the button's text.
  code: { fontFamily: CODE_FONT_FAMILY },
  chipName: {
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 'bold',
    letterSpacing: CHIP_NAME_TRACKING,
  },
  chipValue: { flexShrink: 0, whiteSpace: 'nowrap' },
  ink: (color: string) => ({ color }),
  detail: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space1,
    paddingTop: dimensions.space2,
    paddingBottom: dimensions.space2,
    paddingLeft: dimensions.space3,
    paddingRight: dimensions.space3,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: dimensions.fontSizeXs,
  },
  fill: (backgroundColor: string) => ({ backgroundColor }),
  image: (backgroundImage: string) => ({ backgroundImage }),
  swatches: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: dimensions.space3 },
  swatch: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: dimensions.space1,
    width: SWATCH_LABEL_PX,
  },
  swatchDisc: { width: SWATCH_PX, height: SWATCH_PX, borderRadius: dimensions.radiusPill },
  paper: {
    position: 'relative',
    height: PAPER_SPECIMEN_HEIGHT_PX,
    borderRadius: dimensions.radiusLg,
    overflow: 'hidden',
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: colors.border,
  },
  paperLabel: {
    position: 'absolute',
    left: dimensions.space3,
    bottom: dimensions.space2,
    color: colors.text,
    fontSize: dimensions.fontSizeXs,
  },
});

// The usage rules name shipping's CSS variables (--text-strong); this page names each token by
// the key the React Native token module gives it (textStrong).
const CSS_VARIABLE = /--([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/g;
export function usage(rule: string) {
  return rule.replace(CSS_VARIABLE, (_, name: string) =>
    name.replace(/-([a-z0-9])/g, (__, letter: string) => letter.toUpperCase())
  );
}

function chipInk(stops: readonly string[], ground: string) {
  const worst = (ink: string) => Math.min(...stops.map((stop) => colorContrast(ink, stop, ground)));
  return worst(CHIP_INK.dark) >= worst(CHIP_INK.light) ? CHIP_INK.dark : CHIP_INK.light;
}

const HEX = /#[0-9a-f]{3,8}/gi;

type ThemedColor = keyof typeof colors & keyof ThemeTokens;
type Chip = {
  group: 'colors' | 'fixedColors' | 'brandColors';
  key: string;
  fill: string;
  gradient: boolean;
  light: string;
  dark: string;
  usage: string;
};

const themed = (key: ThemedColor): Chip => ({
  group: 'colors',
  key,
  fill: colors[key],
  gradient: false,
  light: themes.light[key],
  dark: themes.dark[key],
  usage: usage(themeUsage[key]),
});
const fixed = (key: keyof typeof fixedColors & keyof typeof scale): Chip => ({
  group: 'fixedColors',
  key,
  fill: fixedColors[key],
  gradient: key === 'clearGradientRest',
  light: scale[key],
  dark: scale[key],
  usage: usage(scaleUsage[key]),
});
const brandChip = (key: keyof typeof brandColors & keyof typeof brand): Chip => ({
  group: 'brandColors',
  key,
  fill: brandColors[key],
  gradient: false,
  light: brand[key],
  dark: brand[key],
  usage: usage(brandUsage[key]),
});

// One token, painted with itself and named in ink that reads on it; a tap opens its usage rule
// and both theme values.
function ColorChip({ chip }: { chip: Chip }) {
  const theme = useDrawingAppearance();
  const [open, setOpen] = useState(false);
  const value = chip[theme];
  const stops = chip.gradient ? (value.match(HEX) ?? [value]) : [value];
  return (
    <>
      <html.button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
        style={[
          styles.chip,
          chip.gradient ? styles.image(chip.fill) : styles.fill(chip.fill),
          styles.ink(chipInk(stops, themes[theme].appBg)),
        ]}
      >
        <html.span style={[styles.code, styles.chipName]}>{chip.key}</html.span>
        <html.span style={[styles.code, styles.chipValue]}>
          {chip.gradient ? stops.join(' → ') : value}
        </html.span>
      </html.button>
      {open ? (
        <html.div style={styles.detail}>
          <Code>{`${chip.group}.${chip.key}`}</Code>
          <html.span>{chip.usage}</html.span>
          <html.span style={specimen.meta}>
            {chip.light === chip.dark
              ? `${chip.light} in both themes`
              : `light ${chip.light} · dark ${chip.dark}`}
          </html.span>
        </html.div>
      ) : null}
    </>
  );
}

const COLOR_FAMILIES: readonly { label: string; chips: readonly Chip[] }[] = [
  {
    label: 'Brand & unthemed',
    chips: [brandChip('brand'), brandChip('onBrand'), fixed('clearGradientRest')],
  },
  {
    label: 'On scrim · both themes',
    chips: [fixed('scrimInk'), fixed('scrimInkDanger'), fixed('scrimInkSoft'), fixed('scrimPill')],
  },
  { label: 'Polaroid · both themes', chips: [fixed('polaroidPaper'), fixed('polaroidInk')] },
  {
    label: 'Ground & surfaces',
    chips: (['appBg', 'surface', 'surface2', 'surfaceHover'] as const).map(themed),
  },
  {
    label: 'Text ink',
    chips: (['textStrong', 'text', 'textSoft', 'labelInk'] as const).map(themed),
  },
  { label: 'Icon ink', chips: (['iconInk', 'iconMuted'] as const).map(themed) },
  {
    label: 'Hairlines',
    chips: (['border', 'borderWarm', 'borderWarmStrong'] as const).map(themed),
  },
  {
    label: 'Control tracks',
    chips: (['controlTrack', 'controlTrackHover', 'sliderNotch'] as const).map(themed),
  },
  {
    label: 'Brand ramp',
    chips: (
      ['brandWash', 'brandWashHover', 'brandText', 'brandSolid', 'brandSolidHover'] as const
    ).map(themed),
  },
  {
    label: 'Status',
    chips: (
      [
        'successWash',
        'successText',
        'dangerWash',
        'dangerWashHover',
        'dangerText',
        'warningWash',
        'warningText',
        'warningChip',
      ] as const
    ).map(themed),
  },
  {
    label: 'Crayon details',
    chips: (
      ['tapeInk', 'linkCrayon', 'highlighter', 'arrivalWash', 'selectionHighlight'] as const
    ).map(themed),
  },
  {
    label: 'Paper',
    chips: (['paper', 'paperMargin', 'holeStroke', 'blackSwatchInk'] as const).map(themed),
  },
  {
    label: 'Floating on paper',
    chips: (
      [
        'floatSurface',
        'floatSurfaceHover',
        'floatBorder',
        'darkInkKeyline',
        'ruleInk',
        'externalMarkWash',
      ] as const
    ).map(themed),
  },
];

function ColorSection() {
  return (
    <Section
      id="color"
      intro="Every color the React Native token module carries, grouped by family and named by its key in `colors`, `brandColors` or `fixedColors`. Chips paint the token itself, so the theme picker flips them. Tap any chip for its usage rule and both theme values."
    >
      <html.div style={styles.families}>
        {COLOR_FAMILIES.map(({ label, chips }) => (
          <html.div key={label} style={styles.family}>
            <html.span style={specimen.label}>{label}</html.span>
            <html.div style={styles.stack}>
              {chips.map((chip) => (
                <ColorChip key={chip.key} chip={chip} />
              ))}
            </html.div>
          </html.div>
        ))}
      </html.div>
    </Section>
  );
}

function PaletteSection() {
  const theme = useDrawingAppearance();
  return (
    <Section
      id="palette"
      intro="The drawing inks from `drawing/palette.ts`, in the palette's own order: purple first because it's the default selection. Black is near-black ink that presents, and paints, as white on dark paper."
    >
      <html.div style={styles.swatches}>
        {PALETTE_COLORS.map(({ label }) => {
          const { hex } = paintAppearance(label, theme);
          return (
            <html.div key={label} style={styles.swatch}>
              <html.div aria-hidden style={[styles.swatchDisc, styles.fill(hex)]} />
              <html.span style={specimen.meta}>{paintLabel(label, theme)}</html.span>
              <Code>{hex}</Code>
            </html.div>
          );
        })}
      </html.div>
    </Section>
  );
}

function PaperSection() {
  return (
    <Section
      id="paper"
      intro="The canvas is warm off-white paper under a low-alpha handmade grain (`assets/paper/handmade-paper.webp`, tiled). Dark paper keeps the same grain; only the color beneath it changes. `colors.paperMargin` is the flat tone behind the rotation-locked sheet."
    >
      <html.div style={specimen.grid}>
        <html.div style={styles.paper}>
          <PaperTexture />
          <html.span style={styles.paperLabel}>
            <Code>colors.paper</Code>
          </html.span>
        </html.div>
        <html.div style={[styles.paper, styles.fill(colors.paperMargin)]}>
          <html.span style={styles.paperLabel}>
            <Code>colors.paperMargin</Code>
          </html.span>
        </html.div>
      </html.div>
    </Section>
  );
}

export function ColorSections() {
  return (
    <>
      <ColorSection />
      <PaletteSection />
      <PaperSection />
    </>
  );
}
