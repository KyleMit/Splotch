import { useId, useRef, useState, type RefObject } from 'react';
import { css, html } from 'react-strict-dom';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { DRAWING_THEMES } from '../drawing/theme';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { RsdIcon } from './RsdIcon';
import { RsdPressable } from './RsdPressable';
import { usePageTypography } from './pageTypography';
import { styles as controlStyles } from './controls';
import { displayFontSize } from './displayType';
import { SHOWN_WITHOUT_SCRIPT_ATTRIBUTE } from './pageFrame';
import { colors, dimensions, fonts, motion } from './tokens.css';

const H1_LINE_HEIGHT = 1.08;
const H1_TRACKING_EM = -0.015;
const LEDE_LINE_HEIGHT = 1.6;
const SHORT_H1_FONT_PX = 22;
const SHORT_H1_LINE_HEIGHT = 1.2;
const SHORT_H1_TRACKING_EM = -0.01;
const SHORT_LEDE_LINE_HEIGHT = 1.5;
const LEDE_CHEVRON_PX = 18;
const LEDE_TOGGLE_MARGIN_PX = -6;
const LEDE_CHEVRON_OVERHANG_PX = -4;
const HERO_BOTTOM_PX = { wide: 32, phone: 28 } as const;
const LEDE_FONT_PX = { wide: 18, phone: 16 } as const;
const LEDE_TOGGLE_TARGET_PX = 44;

// Page geometry stays in the lazy page module; dynamic styles reuse declarations checked by
// check-native-web-startup.mjs instead of adding page-specific rules to startup CSS.
const styles = css.create({
  hero: (bottom: number) => ({ paddingTop: dimensions.space2, paddingBottom: bottom }),
  shortHero: { paddingTop: dimensions.space1, paddingBottom: dimensions.space4 },
  shortHeroText: (columnGap: string) => ({
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap,
    minWidth: 0,
  }),
  shortTitle: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  ledeToggle: (margin: number, padding: string) => ({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space1,
    flexShrink: 0,
    minHeight: LEDE_TOGGLE_TARGET_PX,
    marginTop: margin,
    marginBottom: margin,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: padding,
    paddingRight: padding,
    borderWidth: 0,
    backgroundColor: 'transparent',
    cursor: 'pointer',
  }),
  ledeToggleText: {
    color: colors.brandText,
    fontSize: dimensions.fontSizeSm,
    whiteSpace: 'nowrap',
  },
  ledeChevron: {
    display: 'flex',
    width: LEDE_CHEVRON_PX,
    height: LEDE_CHEVRON_PX,
    marginRight: LEDE_CHEVRON_OVERHANG_PX,
    transitionProperty: 'transform',
    transitionDuration: motion.durationBase,
    transitionTimingFunction: 'ease',
  },
  openChevron: { transform: 'rotate(90deg)' },
  stillChevron: { transitionDuration: '0s' },
  hidden: { display: 'none' },
  shortLede: {
    flexBasis: '100%',
    marginTop: dimensions.space2,
    fontSize: dimensions.fontSizeMd,
    lineHeight: SHORT_LEDE_LINE_HEIGHT,
  },
  title: (fontSize: number, short: boolean) => ({
    margin: 0,
    color: colors.textStrong,
    fontSize,
    lineHeight: short ? SHORT_H1_LINE_HEIGHT : H1_LINE_HEIGHT,
    outlineWidth: 0,
    letterSpacing: fontSize * (short ? SHORT_H1_TRACKING_EM : H1_TRACKING_EM),
  }),
  lede: (fontSize: number) => ({
    marginTop: dimensions.space4,
    marginBottom: 0,
    color: colors.text,
    fontSize,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
    lineHeight: LEDE_LINE_HEIGHT,
  }),
});

export function RsdPageHero({
  title,
  lede,
  titleRef,
  width,
  phone,
  short,
  collapsibleLede,
}: {
  title: string;
  lede: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
  width: number;
  phone: boolean;
  short: boolean;
  collapsibleLede: boolean;
}) {
  const theme = useDrawingAppearance();
  const ledeId = useId();
  const [ledeOpen, setLedeOpen] = useState(false);
  const reduced = useReduceMotion();
  const ledeRef = useRef<HTMLParagraphElement>(null);
  usePageTypography(titleRef, ledeRef);
  return (
    <html.div
      style={[styles.hero(HERO_BOTTOM_PX[phone ? 'phone' : 'wide']), short && styles.shortHero]}
    >
      <html.div style={short && styles.shortHeroText(dimensions.space4)}>
        <html.h1
          ref={titleRef}
          data-page-heading
          tabIndex={-1}
          style={[
            controlStyles.boldText,
            styles.title(short ? SHORT_H1_FONT_PX : displayFontSize(width), short),
            short && styles.shortTitle,
          ]}
        >
          {title}
        </html.h1>
        {collapsibleLede ? (
          <RsdPressable
            type="button"
            aria-expanded={ledeOpen}
            aria-controls={ledeId}
            style={[
              styles.ledeToggle(LEDE_TOGGLE_MARGIN_PX, dimensions.space1),
              !short && styles.hidden,
            ]}
            onClick={() => setLedeOpen((open) => !open)}
          >
            <html.span style={[controlStyles.boldText, styles.ledeToggleText]}>
              About this page
            </html.span>
            <html.div
              aria-hidden
              style={[
                styles.ledeChevron,
                ledeOpen && styles.openChevron,
                reduced && styles.stillChevron,
              ]}
            >
              <RsdIcon
                name="chevron-right"
                size={LEDE_CHEVRON_PX}
                ink={DRAWING_THEMES[theme].brandText}
                muted={false}
              />
            </html.div>
          </RsdPressable>
        ) : null}
        <html.p
          ref={ledeRef}
          id={ledeId}
          {...{ [SHOWN_WITHOUT_SCRIPT_ATTRIBUTE]: true }}
          style={[
            styles.lede(LEDE_FONT_PX[phone ? 'phone' : 'wide']),
            short && styles.shortLede,
            short && collapsibleLede && !ledeOpen && styles.hidden,
          ]}
        >
          {lede}
        </html.p>
      </html.div>
    </html.div>
  );
}
