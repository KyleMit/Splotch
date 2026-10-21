import { css } from 'react-strict-dom';
import { colors, dimensions, fonts } from '../../rsdDrawing/tokens.css';

// The styleguide's one wide/narrow breakpoint and its column widths, from shipping's /design.
const WIDE = '@media (min-width: 980px)';
const SPECIMEN_MIN_PX = 180;
const CODE_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const SECTION_GAP_PX = 48;
const PROSE_MAX = '62ch';
const READING_LINE_HEIGHT = 1.62;
const HEADING_LINE_HEIGHT = 1.25;
const META_LINE_HEIGHT = 1.5;
const LABEL_TRACKING = '0.12em';

// The section furniture every specimen block shares: its heading, intro and the token names it
// prints. Each section keeps its own specimen layout beside it.
export const specimen = css.create({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space4,
    paddingTop: SECTION_GAP_PX,
    scrollMarginTop: {
      default: dimensions.space8,
      [WIDE]: dimensions.space4,
    },
  },
  heading: {
    margin: 0,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeLg,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    lineHeight: HEADING_LINE_HEIGHT,
  },
  // The white card a specimen sits on, as shipping's styleguide frames its live specimens.
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space3,
    padding: dimensions.space4,
    backgroundColor: colors.surface,
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: dimensions.radiusLg,
  },
  subheading: {
    margin: 0,
    marginTop: dimensions.space2,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeMd,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
  },
  intro: {
    margin: 0,
    maxWidth: PROSE_MAX,
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
    lineHeight: READING_LINE_HEIGHT,
  },
  code: {
    fontFamily: CODE_FONT_FAMILY,
    fontSize: dimensions.fontSizeXs,
    color: colors.brandText,
    overflowWrap: 'break-word',
  },
  file: { marginLeft: dimensions.space2, fontWeight: 'normal' },
  meta: {
    color: colors.textSoft,
    fontSize: dimensions.fontSizeXs,
    lineHeight: META_LINE_HEIGHT,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${SPECIMEN_MIN_PX}px, 1fr))`,
    gap: dimensions.space3,
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: dimensions.space3,
  },
  stack: { display: 'flex', flexDirection: 'column', gap: dimensions.space3 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space2,
    padding: dimensions.space4,
    backgroundColor: colors.surface,
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: dimensions.radiusLg,
  },
  stage: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space4,
    padding: dimensions.space5,
    backgroundColor: colors.surface,
    borderRadius: dimensions.radiusLg,
    boxShadow: colors.floatShadow,
  },
  label: {
    color: colors.labelInk,
    fontSize: dimensions.fontSizeXs,
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
    letterSpacing: LABEL_TRACKING,
    textTransform: 'uppercase',
  },
  strong: { fontFamily: fonts.boldFamily, fontWeight: fonts.boldWeight },
});
