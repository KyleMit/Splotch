import { createElement as h } from 'react';
import { css, html } from 'react-strict-dom';
import { vi } from 'vitest';
import {
  brandColors,
  colors,
  darkTheme,
  dimensions,
  fixedColors,
  fonts,
  motion,
  shadows,
} from '../../../src/rsdDrawing/tokens.css.ts';

// The released RSD native renderer over a React Native stand-in that paints each host
// view as a DOM node wearing its resolved style, so a specimen can be read or captured.
export const resolvedStyles = new Map();

vi.mock('react-native', async () => {
  const React = await import('react');
  const { animatedPort, easingPort } = await import('./rsd-native-animated-host.mjs');
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  const host = (tag, base) =>
    React.forwardRef(({ style, testID, children }, ref) => {
      const resolved = flat(style);
      if (testID) resolvedStyles.set(testID, resolved);
      const { experimental_backgroundImage: backgroundImage, ...rest } = resolved;
      return React.createElement(
        tag,
        { ref, 'data-testid': testID, style: { ...base, ...rest, backgroundImage } },
        children
      );
    });
  const View = host('div', { display: 'flex', flexDirection: 'column', boxSizing: 'border-box' });
  const Text = host('span', {});
  return {
    Platform: {
      OS: 'ios',
      constants: { reactNativeVersion: { major: 0, minor: 86, patch: 3 } },
      select: (values) => values.ios ?? values.native ?? values.default,
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove() {} }),
    },
    Animated: animatedPort(View, Text),
    Easing: easingPort,
    useWindowDimensions: () => ({ width: 402, height: 874, scale: 1, fontScale: 1 }),
    useColorScheme: () => 'light',
    Text,
    Pressable: View,
    experimental_LayoutConformance: View,
    Image: View,
    TextInput: View,
    __host: View,
  };
});
vi.mock('react-native/Libraries/Text/TextAncestor', async () => {
  const React = await import('react');
  return { default: React.createContext(false) };
});
vi.mock('react-native/Libraries/Components/View/ViewNativeComponent', async () => ({
  default: (await import('react-native')).__host,
}));

const SWATCH_PX = 44;
const SAMPLE_PX = 56;
const SPACE_BAR_PX = 10;
const COLOR_KEYS = Object.keys(colors).filter((key) => key !== 'floatShadow');
const SPACE_KEYS = Object.keys(dimensions).filter((key) => /^space\d$/.test(key));
const RADIUS_KEYS = ['radiusSm', 'radiusMd', 'radiusLg', 'radiusPill'];
const BLOB_KEYS = ['radiusBlob1', 'radiusBlob2', 'radiusBlob3'];
const SHADOW_SAMPLES = [
  ['shadowControl', shadows.shadowControl],
  ['shadowPop', shadows.shadowPop],
  ['floatShadow', colors.floatShadow],
];
const TYPE_KEYS = [
  'fontSizeXs',
  'fontSizeSm',
  'fontSizeMd',
  'fontSizeLg',
  'fontSizeXl',
  'fontSizeDisplayMin',
];
const WEIGHT_KEYS = ['mediumWeight', 'semiboldWeight', 'boldWeight'];

const styles = css.create({
  root: {
    backgroundColor: colors.appBg,
    color: colors.text,
    fontFamily: fonts.family,
    padding: dimensions.space6,
    gap: dimensions.space6,
    width: 560,
  },
  heading: {
    color: colors.textStrong,
    fontSize: dimensions.fontSizeXl,
    fontWeight: fonts.boldWeight,
  },
  section: { gap: dimensions.space3 },
  sectionTitle: {
    color: colors.labelInk,
    fontSize: dimensions.fontSizeSm,
    fontWeight: fonts.semiboldWeight,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: dimensions.space2 },
  cell: { width: 100, gap: dimensions.space1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: dimensions.space3 },
  label: { color: colors.textSoft, fontSize: dimensions.fontSizeXs },
  swatch: (color) => ({
    backgroundColor: color,
    borderColor: colors.border,
    borderRadius: dimensions.radiusSm,
    borderStyle: 'solid',
    borderWidth: dimensions.borderWidth,
    height: SWATCH_PX,
  }),
  spaceBar: (width) => ({
    backgroundColor: brandColors.brand,
    height: SPACE_BAR_PX,
    width,
  }),
  sample: {
    backgroundColor: colors.brandWash,
    borderColor: colors.brandSolid,
    borderStyle: 'solid',
    borderWidth: dimensions.borderWidth,
    height: SAMPLE_PX,
    width: SAMPLE_PX,
  },
  radius: (radius) => ({ borderRadius: radius }),
  blob: (topLeft, topRight, bottomRight, bottomLeft) => ({
    backgroundColor: brandColors.brand,
    borderTopLeftRadius: topLeft,
    borderTopRightRadius: topRight,
    borderBottomRightRadius: bottomRight,
    borderBottomLeftRadius: bottomLeft,
  }),
  card: (shadow) => ({
    backgroundColor: colors.floatSurface,
    borderColor: colors.floatBorder,
    borderRadius: dimensions.radiusLg,
    borderStyle: 'solid',
    borderWidth: dimensions.borderWidth,
    boxShadow: shadow,
    height: SAMPLE_PX,
    width: SAMPLE_PX + SAMPLE_PX / 2,
  }),
  type: (fontSize) => ({ color: colors.textStrong, fontSize }),
  weight: (fontWeight) => ({
    color: colors.textStrong,
    fontSize: dimensions.fontSizeLg,
    fontWeight,
  }),
  fixed: (color) => ({
    backgroundColor: color,
    borderRadius: dimensions.radiusMd,
    height: SWATCH_PX,
  }),
  gradient: {
    backgroundImage: fixedColors.clearGradientRest,
    borderRadius: dimensions.radiusPill,
    height: SWATCH_PX,
    width: SWATCH_PX,
  },
  control: {
    alignItems: 'center',
    backgroundColor: colors.brandSolid,
    borderRadius: dimensions.radiusMd,
    justifyContent: 'center',
    minHeight: dimensions.touchTargetMin,
    opacity: dimensions.disabledOpacity,
    paddingLeft: dimensions.space5,
    paddingRight: dimensions.space5,
  },
  controlLabel: {
    color: brandColors.onBrand,
    fontSize: dimensions.fontSizeSm,
    fontWeight: fonts.semiboldWeight,
  },
});

function section(title, children) {
  return h(
    html.div,
    { style: styles.section },
    h(html.span, { style: styles.sectionTitle }, title),
    children
  );
}

function labelled(key, sample) {
  return h(
    html.div,
    { key, style: styles.cell },
    sample,
    h(html.span, { style: styles.label }, key)
  );
}

function colorSection(mode) {
  return section(
    'Color',
    h(
      html.div,
      { style: styles.grid },
      COLOR_KEYS.map((key) =>
        labelled(
          key,
          h(html.div, { 'data-testid': `${mode}-color-${key}`, style: styles.swatch(colors[key]) })
        )
      )
    )
  );
}

function fixedSection(mode) {
  const fixed = Object.keys(fixedColors).filter((key) => key !== 'clearGradientRest');
  return section(
    'Fixed and brand color',
    h(
      html.div,
      { style: styles.grid },
      [
        ...Object.keys(brandColors).map((key) =>
          labelled(key, h(html.div, { style: styles.fixed(brandColors[key]) }))
        ),
        ...fixed.map((key) =>
          labelled(
            key,
            h(html.div, {
              'data-testid': `${mode}-fixed-${key}`,
              style: styles.fixed(fixedColors[key]),
            })
          )
        ),
      ],
      labelled(
        'clearGradientRest',
        h(html.div, { 'data-testid': `${mode}-gradient`, style: styles.gradient })
      )
    )
  );
}

function spacingSection() {
  return section(
    'Spacing',
    SPACE_KEYS.map((key) =>
      h(
        html.div,
        { key, style: styles.row },
        h(html.div, { style: styles.spaceBar(dimensions[key]) }),
        h(html.span, { style: styles.label }, key)
      )
    )
  );
}

function radiusSection(mode) {
  return section(
    'Radius',
    h(html.div, { style: styles.grid }, [
      ...RADIUS_KEYS.map((key) =>
        labelled(
          key,
          h(html.div, {
            'data-testid': `${mode}-${key}`,
            style: [styles.sample, styles.radius(dimensions[key])],
          })
        )
      ),
      ...BLOB_KEYS.map((key) =>
        labelled(
          key,
          h(html.div, {
            'data-testid': `${mode}-${key}`,
            style: [
              styles.sample,
              styles.blob(
                dimensions[`${key}TopLeft`],
                dimensions[`${key}TopRight`],
                dimensions[`${key}BottomRight`],
                dimensions[`${key}BottomLeft`]
              ),
            ],
          })
        )
      ),
    ])
  );
}

function shadowSection(mode) {
  return section(
    'Shadow',
    h(
      html.div,
      { style: styles.grid },
      SHADOW_SAMPLES.map(([key, shadow]) =>
        labelled(key, h(html.div, { 'data-testid': `${mode}-${key}`, style: styles.card(shadow) }))
      )
    )
  );
}

function typeSection(mode) {
  return section('Type', [
    ...TYPE_KEYS.map((key) =>
      h(
        html.span,
        { key, 'data-testid': `${mode}-${key}`, style: styles.type(dimensions[key]) },
        `${key} Splotch`
      )
    ),
    ...WEIGHT_KEYS.map((key) =>
      h(html.span, { key, style: styles.weight(fonts[key]) }, `${key} Splotch`)
    ),
  ]);
}

function otherSection(mode) {
  return section('Control', [
    h(
      html.div,
      { key: 'control', 'data-testid': `${mode}-control`, style: styles.control },
      h(html.span, { style: styles.controlLabel }, 'Disabled control at touchTargetMin')
    ),
    h(html.span, { key: 'motion', style: styles.label }, Object.keys(motion).join(' · ')),
  ]);
}

export function TokenSpecimen({ mode }) {
  return h(
    html.div,
    { style: [styles.root, mode === 'dark' && darkTheme] },
    h(html.span, { style: styles.heading }, `RSD tokens (${mode})`),
    colorSection(mode),
    fixedSection(mode),
    spacingSection(),
    radiusSection(mode),
    shadowSection(mode),
    typeSection(mode),
    otherSection(mode)
  );
}
