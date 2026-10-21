import { useEffect, useState } from 'react';
import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../../drawing/DrawingAppearance';
import { useReduceMotion } from '../../drawing/useReduceMotion';
import { RsdIcon } from '../../rsdDrawing/RsdIcon';
import { blobXml } from '../../rsdDrawing/blob';
import { SvgXml } from '../../platform/svg';
import { NATIVE_ICONS, type NativeIconName } from '../../rsdDrawing/icons.generated';
import { NATIVE_DEFERRED_ICONS } from '../../rsdDrawing/icons.deferred.generated';
import { colors, dimensions, fonts, motion, shadows } from '../../rsdDrawing/tokens.css';
import { scale } from '../../../../../web/src/lib/design/tokens';
import { scaleUsage, themeUsage } from '../../../../../web/src/lib/design/tokenUsage';
import { ColorSections, usage } from './ColorSections';
import { RecipeSection } from './RecipeSection';
import { Code, Section } from './Section';
import { specimen } from './designStyles';

const RADIUS_SPECIMEN_PX = 56;
const SHADOW_SPECIMEN_PX = 72;
const ICON_SPECIMEN_PX = 28;
const LANE_DOT_PX = 16;
const LANE_HEIGHT_PX = 24;
const LANE_PERIOD_MS = 1400;
const TYPE_SAMPLE = 'Splotch says hello';
const SPACE_NAME_PX = 150;
const ICON_TILE_MIN_PX = 104;
const BLOB_SHAPES = ['radiusBlob1', 'radiusBlob2', 'radiusBlob3'] as const;

const styles = css.create({
  rows: { gap: 0, paddingTop: 0, paddingBottom: 0 },
  typeRow: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: dimensions.space4,
    paddingTop: dimensions.space3,
    paddingBottom: dimensions.space3,
    borderBottomWidth: dimensions.borderWidth,
    borderBottomStyle: 'solid',
    borderBottomColor: colors.border,
  },
  typeMeta: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
  sample: (fontSize: string) => ({ fontSize, color: colors.textStrong }),
  weight: (fontFamily: string, fontWeight: string) => ({ fontFamily, fontWeight }),
  spaceRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space3,
  },
  spaceName: { width: SPACE_NAME_PX, flexShrink: 0 },
  spaceBar: (width: string) => ({
    width,
    height: dimensions.space3,
    backgroundColor: colors.brandSolid,
    borderRadius: dimensions.radiusSm,
  }),
  radius: (borderRadius: string) => ({
    width: RADIUS_SPECIMEN_PX,
    height: RADIUS_SPECIMEN_PX,
    borderRadius,
    backgroundColor: colors.brandWash,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: colors.brandSolid,
  }),
  shadow: (boxShadow: string) => ({
    width: SHADOW_SPECIMEN_PX,
    height: SHADOW_SPECIMEN_PX,
    borderRadius: dimensions.radiusLg,
    backgroundColor: colors.surface,
    boxShadow,
  }),
  parked: {
    paddingTop: dimensions.space2,
    paddingBottom: dimensions.space2,
    paddingLeft: dimensions.space4,
    paddingRight: dimensions.space4,
    borderRadius: dimensions.radiusMd,
    backgroundColor: colors.controlTrack,
    color: colors.text,
    opacity: dimensions.disabledOpacity,
    alignSelf: 'flex-start',
  },
  lane: {
    position: 'relative',
    height: LANE_HEIGHT_PX,
    borderRadius: dimensions.radiusPill,
    backgroundColor: colors.controlTrack,
  },
  dot: (left: string, transitionTimingFunction: string) => ({
    position: 'absolute',
    top: (LANE_HEIGHT_PX - LANE_DOT_PX) / 2,
    left,
    width: LANE_DOT_PX,
    height: LANE_DOT_PX,
    borderRadius: dimensions.radiusPill,
    backgroundColor: colors.brandSolid,
    transitionProperty: 'left',
    transitionDuration: motion.durationSlow,
    transitionTimingFunction,
  }),
  note: { marginTop: dimensions.space7 },
  icons: {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${ICON_TILE_MIN_PX}px, 1fr))`,
    gap: dimensions.space2,
  },
  icon: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: dimensions.space1,
    paddingTop: dimensions.space3,
    paddingBottom: dimensions.space2,
    paddingLeft: dimensions.space1,
    paddingRight: dimensions.space1,
    borderRadius: dimensions.radiusMd,
    backgroundColor: colors.surface,
    textAlign: 'center',
  },
});

const TYPE_STEPS = [
  { key: 'fontSizeXs', role: 'fine print' },
  { key: 'fontSizeSm', role: 'UI chrome' },
  { key: 'fontSizeMd', role: 'body prose' },
  { key: 'fontSizeLg', role: 'ledes & section heads' },
  { key: 'fontSizeXl', role: 'titles' },
] as const;

const WEIGHTS = [
  {
    family: fonts.boldFamily,
    weight: fonts.boldWeight,
    name: 'fonts.bold',
    source: scale.fontWeightBold,
    role: 'headings',
    sample: 'Let them make a mess.',
  },
  {
    family: fonts.semiboldFamily,
    weight: fonts.semiboldWeight,
    name: 'fonts.semibold',
    source: scale.fontWeightSemibold,
    role: 'buttons, active states, sub-heads',
    sample: 'Settings, not a paywall',
  },
  {
    family: fonts.mediumFamily,
    weight: fonts.mediumWeight,
    name: 'fonts.medium',
    source: scale.fontWeightMedium,
    role: 'quiet labels',
    sample: 'Sound · Night Mode · Tool drawer',
  },
] as const;

function TypeSection() {
  return (
    <Section
      id="type"
      intro="Five body steps plus the display tier, one role each: if two steps both look right, take the smaller. Titles stop at xl; only the H1 of a whole page takes display, which the app sizes from the window between its two bounds."
    >
      <html.div style={[specimen.panel, styles.rows]}>
        {TYPE_STEPS.map(({ key, role }) => (
          <html.div key={key} style={styles.typeRow}>
            <html.span style={styles.sample(dimensions[key])}>{TYPE_SAMPLE}</html.span>
            <html.span style={styles.typeMeta}>
              <Code>{`dimensions.${key}`}</Code>
              <html.span style={specimen.meta}>{`${scale[key]} · ${role}`}</html.span>
            </html.span>
          </html.div>
        ))}
        <html.div style={styles.typeRow}>
          <html.span style={[styles.sample(dimensions.fontSizeDisplayMax), specimen.strong]}>
            {TYPE_SAMPLE}
          </html.span>
          <html.span style={styles.typeMeta}>
            <Code>dimensions.fontSizeDisplayMin … Max</Code>
            <html.span style={specimen.meta}>{`${scale.fontSizeDisplay} · page H1`}</html.span>
          </html.span>
        </html.div>
      </html.div>
      <html.h4 style={specimen.subheading}>Weights</html.h4>
      <html.p style={specimen.intro}>
        Body prose stays at the untokenized 400 default; everything heavier goes through a font
        token, whose family carries the weight on native.
      </html.p>
      <html.div style={[specimen.panel, styles.rows]}>
        {WEIGHTS.map((weight) => (
          <html.div key={weight.name} style={styles.typeRow}>
            <html.span style={styles.weight(weight.family, weight.weight)}>
              {weight.sample}
            </html.span>
            <html.span style={styles.typeMeta}>
              <Code>{weight.name}</Code>
              <html.span style={specimen.meta}>{`${weight.source} · ${weight.role}`}</html.span>
            </html.span>
          </html.div>
        ))}
      </html.div>
    </Section>
  );
}

const SPACES = [
  'space1',
  'space2',
  'space3',
  'space4',
  'space5',
  'space6',
  'space7',
  'space8',
] as const;
const RADII = [
  { key: 'radiusSm', role: 'inline chips' },
  { key: 'radiusMd', role: 'controls' },
  { key: 'radiusLg', role: 'cards & sheets' },
  { key: 'radiusPill', role: 'pills & toggle tracks' },
] as const;
const BLOB_ROLES = {
  radiusBlob1: 'first paint daub',
  radiusBlob2: 'second paint daub',
  radiusBlob3: 'third paint daub',
} as const satisfies Record<(typeof BLOB_SHAPES)[number], string>;

function SpaceSection() {
  const { brandSolid } = useDrawingTheme();
  return (
    <Section
      id="space"
      intro="A 4px ramp: 1–2 inside a control, 3–4 between controls and card padding, 5–6 tap targets and gutters, 7–8 section and page breaks."
    >
      <html.div style={specimen.panel}>
        {SPACES.map((key) => (
          <html.div key={key} style={styles.spaceRow}>
            <html.span style={styles.spaceName}>
              <Code>{`dimensions.${key}`}</Code>
            </html.span>
            <html.div aria-hidden style={styles.spaceBar(dimensions[key])} />
            <html.span style={specimen.meta}>{scale[key]}</html.span>
          </html.div>
        ))}
      </html.div>
      <html.h4 style={specimen.subheading}>Radius</html.h4>
      <html.div style={specimen.grid}>
        {RADII.map(({ key, role }) => (
          <html.div key={key} style={specimen.card}>
            <html.div aria-hidden style={styles.radius(dimensions[key])} />
            <Code>{`dimensions.${key}`}</Code>
            <html.span style={specimen.meta}>{`${scale[key]} · ${role}`}</html.span>
          </html.div>
        ))}
        {BLOB_SHAPES.map((key) => (
          <html.div key={key} style={specimen.card}>
            <SvgXml
              xml={blobXml({ shape: key, size: RADIUS_SPECIMEN_PX, fill: brandSolid })}
              width={RADIUS_SPECIMEN_PX}
              height={RADIUS_SPECIMEN_PX}
            />
            <Code>{`blobShapes.${key}`}</Code>
            <html.span style={specimen.meta}>{`${scale[key]} · ${BLOB_ROLES[key]}`}</html.span>
          </html.div>
        ))}
        <html.div style={specimen.card}>
          <html.div aria-hidden style={styles.radius(dimensions.radiusMd)} />
          <Code>dimensions.borderWidth</Code>
          <html.span style={specimen.meta}>{`${scale.borderWidth} · the one hairline`}</html.span>
        </html.div>
      </html.div>
      <html.p style={specimen.intro}>
        React Native takes one radius per corner, so each blob corner carries the mean of the
        source's horizontal and vertical radii; shapes drawn as paths read the full ellipse from
        blobShapes.
      </html.p>
    </Section>
  );
}

const SHADOWS = [
  {
    name: 'shadows.shadowControl',
    value: shadows.shadowControl,
    usage: usage(scaleUsage.shadowControl),
  },
  { name: 'shadows.shadowPop', value: shadows.shadowPop, usage: usage(scaleUsage.shadowPop) },
  { name: 'colors.floatShadow', value: colors.floatShadow, usage: usage(themeUsage.floatShadow) },
] as const;

function ElevationSection() {
  return (
    <Section id="elevation" intro="Three shadows only, and one dimming for a whole parked control.">
      <html.div style={specimen.grid}>
        {SHADOWS.map(({ name, value, usage }) => (
          <html.div key={name} style={specimen.stack}>
            <html.div aria-hidden style={styles.shadow(value)} />
            <Code>{name}</Code>
            <html.span style={specimen.meta}>{usage}</html.span>
          </html.div>
        ))}
      </html.div>
      <html.h4 style={specimen.subheading}>Disabled</html.h4>
      <html.div aria-hidden style={styles.parked}>
        Parked control
      </html.div>
      <html.p style={specimen.intro}>
        <Code>dimensions.disabledOpacity</Code>
        {` ${scale.disabledOpacity}. ${usage(scaleUsage.disabledOpacity)}`}
      </html.p>
    </Section>
  );
}

const CURVES = [
  { name: 'easePop', value: motion.easePop },
  { name: 'easeGlide', value: motion.easeGlide },
  { name: 'easeDrawer', value: motion.easeDrawer },
] as const;
const DURATIONS = [
  { key: 'durationFast', role: 'presses & hovers' },
  { key: 'durationBase', role: 'standard transitions' },
  { key: 'durationSlow', role: 'whole-surface entrances' },
  { key: 'durationExit', role: 'exits' },
] as const;

// Each lane runs its curve back and forth once hydrated, unless the visitor asked for less motion.
function useLaneSwing() {
  const reduced = useReduceMotion();
  const [swung, setSwung] = useState(false);
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setSwung((value) => !value), LANE_PERIOD_MS);
    return () => clearInterval(timer);
  }, [reduced]);
  return swung;
}

function MotionSection() {
  const swung = useLaneSwing();
  return (
    <Section
      id="motion"
      intro="Three curves: the springy overshoot for a two-state pop, the glide for anything that settles or leaves, and the symmetric drawer curve for two things that move as one. Press states scale down (0.9–0.96); hovers swap to a wash or hover token. Tuned one-shot choreography carries its own timing."
    >
      <html.div style={specimen.panel}>
        {CURVES.map(({ name, value }) => (
          <html.div key={name} style={specimen.stack}>
            <html.div aria-hidden style={styles.lane}>
              <html.div
                style={styles.dot(swung ? `calc(100% - ${LANE_DOT_PX}px)` : '0px', value)}
              />
            </html.div>
            <html.span>
              <Code>{`motion.${name}`}</Code>
              <html.span
                style={specimen.meta}
              >{` ${scale[name]} · ${usage(scaleUsage[name])}`}</html.span>
            </html.span>
          </html.div>
        ))}
      </html.div>
      <html.div style={specimen.grid}>
        {DURATIONS.map(({ key, role }) => (
          <html.div key={key} style={specimen.card}>
            <Code>{`motion.${key}`}</Code>
            <html.span style={specimen.meta}>{`${scale[key]} · ${role}`}</html.span>
          </html.div>
        ))}
      </html.div>
    </Section>
  );
}

const MONOCHROME = /^<svg[^>]*\bfill="currentColor"/;
const ICON_NAMES = [
  ...Object.keys(NATIVE_ICONS),
  ...Object.keys(NATIVE_DEFERRED_ICONS),
] as NativeIconName[];
const ICON_MARKUP = { ...NATIVE_ICONS, ...NATIVE_DEFERRED_ICONS };
const isMonochrome = (name: NativeIconName) => MONOCHROME.test(ICON_MARKUP[name].light);

function IconGrid({ names }: { names: readonly NativeIconName[] }) {
  return (
    <html.div style={styles.icons}>
      {names.map((name) => (
        <html.div key={name} style={styles.icon}>
          <RsdIcon name={name} size={ICON_SPECIMEN_PX} ink={undefined} muted={false} />
          <html.span style={specimen.meta}>{name}</html.span>
        </html.div>
      ))}
    </html.div>
  );
}

function IconSection() {
  const monochrome = ICON_NAMES.filter(isMonochrome).sort();
  const spot = ICON_NAMES.filter((name) => !isMonochrome(name)).sort();
  return (
    <Section
      id="icons"
      intro="A first-party SVG set drawn through RsdIcon: no icon font, no CDN set, no emoji as icons. Monochrome glyphs paint currentColor, which RsdIcon resolves to the theme's icon ink or the caller's. Spot icons carry their own palette, with a light and a dark drawing where a part must move at night, and are never tinted wholesale."
    >
      <html.h4
        style={specimen.subheading}
      >{`Monochrome · re-inked (${monochrome.length})`}</html.h4>
      <IconGrid names={monochrome} />
      <html.h4 style={specimen.subheading}>{`Spot color · never tinted (${spot.length})`}</html.h4>
      <IconGrid names={spot} />
    </Section>
  );
}

export function FoundationSections() {
  return (
    <>
      <ColorSections />
      <TypeSection />
      <SpaceSection />
      <ElevationSection />
      <MotionSection />
      <IconSection />
      <RecipeSection />
      <html.aside aria-label="Not in the React Native system" style={[specimen.card, styles.note]}>
        <html.span style={specimen.label}>Not in the React Native system</html.span>
        <html.p style={specimen.intro}>
          The shipping tokens the React Native projection leaves out are listed, each with its
          reason, in <Code>RSD_UNPROJECTED_TOKENS</Code>{' '}
          (tools/migration/lib/rsd-fixture-tokens.mjs). There is no stacking scale: React Native
          chrome stacks by tree order and the zIndex each surface sets for itself.
        </html.p>
      </html.aside>
    </>
  );
}
