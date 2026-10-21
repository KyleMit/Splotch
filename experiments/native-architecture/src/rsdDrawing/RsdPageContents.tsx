import { useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { ScrollView } from '../platform/ScrollView';
import { useInformationViewport } from './useInformationViewport';
import { css, html } from 'react-strict-dom';
import type { ReleaseHue } from '../../../../web/src/lib/releaseHues';
import { paletteHex } from '../drawing/palette';
import { useDrawingTheme, useScrollIndicatorStyle } from '../drawing/DrawingAppearance';
import { DRAWING_SCALE } from '../drawing/theme';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { Svg, Path } from '../platform/svg';
import { RsdPressable } from './RsdPressable';
import { RsdSidebarRow } from './RsdSidebarRow';
import { blobPath } from './blob';
import { rgba } from './colorMix';
import { focusRingHost } from './focusRing';
import { landFocus } from './landFocus';
import { SHOWN_WITHOUT_SCRIPT_ATTRIBUTE } from './pageFrame';
import { usePrerenderedMarkup } from './pageDocumentState';
import { styles as controls } from './controls';
import { brandColors, colors, dimensions, motion } from './tokens.css';

export const PAGE_CONTENTS = {
  row: 50,
  border: 2,
  mark: 30,
  count: 26,
  inset: 16,
  panelMin: 160,
  panelTail: 8,
  shade: 9,
} as const;
const ROW_PX = PAGE_CONTENTS.row;
const BORDER_PX = PAGE_CONTENTS.border;
const MARK_PX = PAGE_CONTENTS.mark;
const COUNT_PX = PAGE_CONTENTS.count;
const INSET_PX = PAGE_CONTENTS.inset;
const SHADE_PX = PAGE_CONTENTS.shade;
const INLINE_PADDING_PX = { start: 14, end: 12 };
const BLOCK_PADDING_PX = 10;
const SCROLL_REPORT_MS = 16;
const PINNED_Z_INDEX = 8;
const HUE_PX = 10;
const CHEVRON_PATH = blobPath('radiusBlob2', MARK_PX, MARK_PX);
const COUNT_PATH = blobPath('radiusBlob1', COUNT_PX, COUNT_PX);
const styles = css.create({
  shell: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: BORDER_PX,
    borderStyle: 'solid',
    borderColor: {
      default: colors.borderWarm,
      '@media (hover: hover)': { default: colors.borderWarm, ':hover': colors.brandText },
    },
    borderRadius: dimensions.radiusMd,
  },
  // A button sizes to its content on the web; the row takes the shell's width so the readout can
  // shrink to fit beside the eyebrow and the mark. It grows past its height only for a large OS
  // text size, which would otherwise clip the line it truncates.
  summary: {
    boxSizing: 'border-box',
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space2,
    minHeight: ROW_PX,
    paddingBlock: BLOCK_PADDING_PX,
    paddingLeft: INLINE_PADDING_PX.start,
    paddingRight: INLINE_PADDING_PX.end,
    borderWidth: 0,
    backgroundColor: 'transparent',
    cursor: 'pointer',
  },
  eyebrow: {
    fontSize: dimensions.fontSizeXs,
    color: colors.textSoft,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  readout: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space3,
    marginLeft: 'auto',
    minWidth: 0,
    flexShrink: 1,
    overflow: 'hidden',
  },
  // One line, ended by an ellipsis: React Native truncates only through numberOfLines, which
  // lineClamp sets on native, and ignores the web's whiteSpace and textOverflow.
  label: {
    fontSize: dimensions.fontSizeMd,
    color: colors.textStrong,
    flexShrink: 1,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    lineClamp: 1,
  },
  badge: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: COUNT_PX,
    height: COUNT_PX,
    flexShrink: 0,
  },
  count: { position: 'relative', color: brandColors.onBrand, fontSize: dimensions.fontSizeXs },
  mark: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: MARK_PX,
    height: MARK_PX,
    flexShrink: 0,
    transitionProperty: 'transform',
    transitionDuration: motion.durationBase,
    transitionTimingFunction: 'ease',
  },
  markText: { position: 'relative', color: colors.brandText, fontSize: dimensions.fontSizeMd },
  still: { transitionDuration: '0s' },
  open: { transform: 'rotate(90deg)' },
  paint: { position: 'absolute', inset: 0 },
  panel: {
    position: 'relative',
    borderTopWidth: dimensions.borderWidth,
    borderTopStyle: 'solid',
    borderTopColor: colors.border,
  },
  shade: { position: 'absolute', left: 0, right: 0, height: SHADE_PX, pointerEvents: 'none' },
  top: { top: 0 },
  bottom: { bottom: 0 },
  fade: (backgroundImage: string) => ({ backgroundImage }),
  folded: { display: 'none' },
});

function ContentsPanel<Id extends string>({
  items,
  active,
  label,
  folded,
  onSelect,
}: {
  items: readonly PageContentsItem<Id>[];
  active: Id;
  label: string;
  // Closed, in a prerendered page: hidden until a script opens it, and shown without one.
  folded: boolean;
  onSelect: (id: Id) => void;
}) {
  const theme = useDrawingTheme();
  const indicatorStyle = useScrollIndicatorStyle();
  const { height } = useInformationViewport();
  const maxHeight = Math.max(
    PAGE_CONTENTS.panelMin,
    height - INSET_PX - BORDER_PX - ROW_PX - PAGE_CONTENTS.panelTail
  );
  const [extent, setExtent] = useState({ viewport: 0, content: 0, offset: 0 });
  return (
    <html.div
      {...(folded ? { [SHOWN_WITHOUT_SCRIPT_ATTRIBUTE]: true } : {})}
      style={[styles.panel, folded && styles.folded]}
    >
      <ScrollView
        testID="page-contents-panel"
        style={{ maxHeight }}
        contentContainerStyle={{
          padding: DRAWING_SCALE.space2,
          paddingBottom: DRAWING_SCALE.space3,
        }}
        indicatorStyle={indicatorStyle}
        scrollEventThrottle={SCROLL_REPORT_MS}
        onLayout={({ nativeEvent }) =>
          setExtent((old) => ({ ...old, viewport: nativeEvent.layout.height }))
        }
        onContentSizeChange={(_, content) => setExtent((old) => ({ ...old, content }))}
        onScroll={({ nativeEvent }) =>
          setExtent((old) => ({ ...old, offset: nativeEvent.contentOffset.y }))
        }
      >
        <html.nav aria-label={label}>
          {items.map((section) => (
            <RsdSidebarRow
              key={section.id}
              label={section.label}
              meta={section.meta}
              hue={section.hue}
              active={active === section.id}
              href={`#${section.id}`}
              onSelect={() => onSelect(section.id)}
            />
          ))}
        </html.nav>
      </ScrollView>
      {extent.offset > 0 ? (
        <html.div
          aria-hidden
          style={[
            styles.shade,
            styles.top,
            styles.fade(
              `linear-gradient(to bottom, ${rgba(theme.border, 1)}, ${rgba(theme.border, 0)})`
            ),
          ]}
        />
      ) : null}
      {extent.offset + extent.viewport < extent.content ? (
        <html.div
          aria-hidden
          style={[
            styles.shade,
            styles.bottom,
            styles.fade(
              `linear-gradient(to top, ${rgba(theme.border, 1)}, ${rgba(theme.border, 0)})`
            ),
          ]}
        />
      ) : null}
    </html.div>
  );
}

export type PageContentsItem<Id extends string> = {
  id: Id;
  label: string;
  meta?: string;
  hue?: ReleaseHue;
};

export function RsdPageContents<Id extends string>({
  items,
  label,
  noun,
  active,
  entered,
  open,
  offset,
  onToggle,
  onSelect,
  onLayout,
}: {
  items: readonly PageContentsItem<Id>[];
  label: string;
  noun: 'sections' | 'releases';
  active: Id;
  entered: boolean;
  open: boolean;
  offset: number;
  onToggle: () => void;
  onSelect: (id: Id) => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const summary = useRef<HTMLButtonElement>(null);
  const theme = useDrawingTheme();
  const reduceMotion = useReduceMotion();
  const current = items.find((section) => section.id === active);
  const readout = entered ? current?.label : noun;
  const prerendered = usePrerenderedMarkup();
  return (
    <View
      testID="page-contents-disclosure"
      onLayout={onLayout}
      style={{
        zIndex: PINNED_Z_INDEX,
        paddingTop: INSET_PX,
        marginBottom: INSET_PX,
        backgroundColor: theme.surface,
        transform: [{ translateY: offset }],
      }}
    >
      <html.div data-testid="page-contents-shell" style={styles.shell}>
        <RsdPressable
          ref={summary}
          {...focusRingHost('inset')}
          aria-expanded={open}
          aria-label={`${label}, ${entered ? readout : `${items.length} ${noun}`}`}
          style={styles.summary}
          onClick={onToggle}
        >
          <html.span style={[controls.semiboldText, styles.eyebrow]}>Contents</html.span>
          <html.div style={styles.readout}>
            {!entered ? (
              <html.div aria-hidden style={styles.badge}>
                <html.div style={styles.paint}>
                  <Svg width={COUNT_PX} height={COUNT_PX}>
                    <Path d={COUNT_PATH} fill={theme.brandSolid} />
                  </Svg>
                </html.div>
                <html.span style={[controls.boldText, styles.count]}>{items.length}</html.span>
              </html.div>
            ) : current?.hue ? (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  width: HUE_PX,
                  height: HUE_PX,
                  borderRadius: HUE_PX / 2,
                  backgroundColor: paletteHex(current.hue),
                }}
              />
            ) : null}
            <html.span style={[controls.semiboldText, styles.label]}>{readout}</html.span>
          </html.div>
          <html.div
            aria-hidden
            style={[styles.mark, reduceMotion && styles.still, open && styles.open]}
          >
            <html.div style={styles.paint}>
              <Svg width={MARK_PX} height={MARK_PX}>
                <Path d={CHEVRON_PATH} fill={theme.surface2} />
              </Svg>
            </html.div>
            <html.span style={[controls.boldText, styles.markText]}>›</html.span>
          </html.div>
        </RsdPressable>
        {open || prerendered ? (
          <ContentsPanel
            items={items}
            label={label}
            active={active}
            folded={!open}
            onSelect={(id) => {
              landFocus(summary.current);
              onSelect(id);
            }}
          />
        ) : null}
      </html.div>
    </View>
  );
}
