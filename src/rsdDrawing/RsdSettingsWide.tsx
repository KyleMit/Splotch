import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SettingsTextZoom } from '../platform/SettingsTextZoom';
import { scrollSettingsPaneToSection, spiedSettingsSection } from '../platform/settingsPane';
import { View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';
import { ScrollView } from '../platform/ScrollView';
import { css, html } from 'react-strict-dom';
import { useDrawingTheme, useScrollIndicatorStyle } from '../drawing/DrawingAppearance';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { navRevealOffset, sectionJumpOffset, stackedOffsets } from '../settings/settingsPane';
import type { NativeSettingsSection, NativeSettingsSectionId } from '../settings/settingsSections';
import { sectionHeading } from '../settings/settingsSections';
import { rgba } from './colorMix';
import { styles as controlStyles } from './controls';
import { RsdScrollCue, type ScrollExtent } from './RsdScrollCue';
import { RsdSidebarRow } from './RsdSidebarRow';
import { colors, dimensions, motion } from './tokens.css';

// WideShell.svelte's split; rsd-native-settings-layouts.test.mjs reads each from that source.
export const WIDE_SHELL = {
  navWidth: 232,
  splitGap: 8,
  split: { top: 0, inline: 24, bottom: 24 },
  pane: { top: 4, right: 8, bottom: 4, left: 16 },
  // Every section shares the one pane, so whitespace and headings do the separating.
  sectionGap: 60,
  titleGap: 20,
  navShade: 9,
} as const;
// One report a frame keeps the highlight in step with the finger.
const NAV_REPORT_INTERVAL_MS = 16;

const styles = css.create({
  split: {
    display: 'flex',
    flexDirection: 'row',
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    gap: WIDE_SHELL.splitGap,
    paddingTop: WIDE_SHELL.split.top,
    paddingLeft: WIDE_SHELL.split.inline,
    paddingRight: WIDE_SHELL.split.inline,
    paddingBottom: WIDE_SHELL.split.bottom,
  },
  nav: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    width: WIDE_SHELL.navWidth,
    minHeight: 0,
  },
  list: { display: 'flex', flexDirection: 'column', margin: 0, padding: 0, listStyle: 'none' },
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: WIDE_SHELL.navShade,
    pointerEvents: 'none',
    transitionProperty: 'opacity',
    transitionDuration: motion.durationFast,
  },
  top: { top: 0 },
  bottom: { bottom: 0 },
  fade: (backgroundImage: string) => ({ backgroundImage }),
  hidden: { opacity: 0 },
  seeThroughHidden: { visibility: 'hidden' },
  title: {
    marginTop: 0,
    marginLeft: 0,
    marginRight: 0,
    marginBottom: WIDE_SHELL.titleGap,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeLg,
  },
});

const FOLLOWING_SECTION = { marginTop: WIDE_SHELL.sectionGap };
const AT_REST: ScrollExtent = { viewport: 0, content: 0, offset: 0 };

// The nav's edge shades say "more list this way" at whichever end is not at rest, since a row
// clipped mid-height leaves the column looking finished and touch scrollbars paint only mid-flick.
function shadeFrom(border: string, toward: 'top' | 'bottom') {
  return `linear-gradient(to ${toward}, ${rgba(border, 0)}, ${rgba(border, 1)})`;
}

function useHeights() {
  const heights = useRef<(number | undefined)[]>([]);
  const measure = (index: number, then?: () => void) => (event: LayoutChangeEvent) => {
    heights.current[index] = event.nativeEvent.layout.height;
    then?.();
  };
  return { heights, measure };
}

// The table of contents (SidebarToc.svelte's button rows) in its own scroll column. The pane's
// scroll elects the highlighted row, so the row can be one the parent never scrolled the column
// to; each election brings it into view. Only an election moves the column, so a parent scrolling
// it by hand keeps their position until the reading position moves on.
function SettingsToc({
  sections,
  spied,
  hidden,
  unseen,
  onSelect,
}: {
  sections: readonly NativeSettingsSection[];
  spied: NativeSettingsSectionId;
  hidden: boolean;
  unseen: (id: NativeSettingsSectionId) => boolean;
  onSelect: (id: NativeSettingsSectionId) => void;
}) {
  const border = useDrawingTheme().border;
  const indicatorStyle = useScrollIndicatorStyle();
  const reduced = useReduceMotion();
  const nav = useRef<ScrollViewInstance>(null);
  const [extent, setExtent] = useState<ScrollExtent>(AT_REST);
  const latest = useRef(extent);
  const rows = useHeights();
  const update = (next: Partial<ScrollExtent>) => {
    latest.current = { ...latest.current, ...next };
    setExtent(latest.current);
  };
  useEffect(() => {
    const index = sections.findIndex((section) => section.id === spied);
    const tops = stackedOffsets(rows.heights.current, sections.length, 0, 0);
    const height = rows.heights.current[index];
    if (!tops || height === undefined) return;
    const target = navRevealOffset({ top: tops[index], height }, latest.current);
    if (target !== null) nav.current?.scrollTo({ y: target, animated: !reduced });
  }, [spied, sections, rows.heights, reduced]);
  return (
    <html.div style={[styles.nav, hidden && styles.seeThroughHidden]}>
      <ScrollView
        ref={nav}
        indicatorStyle={indicatorStyle}
        scrollEventThrottle={NAV_REPORT_INTERVAL_MS}
        onScroll={({ nativeEvent }) => update({ offset: nativeEvent.contentOffset.y })}
        onLayout={({ nativeEvent }) => update({ viewport: nativeEvent.layout.height })}
        onContentSizeChange={(_, height) => update({ content: height })}
      >
        <html.nav aria-label="Settings sections">
          <html.ol style={styles.list}>
            {sections.map((section, index) => (
              <html.li key={section.id}>
                <View onLayout={rows.measure(index)}>
                  <RsdSidebarRow
                    icon={section.icon}
                    label={section.label}
                    unseen={unseen(section.id)}
                    active={section.id === spied}
                    onSelect={() => onSelect(section.id)}
                  />
                </View>
              </html.li>
            ))}
          </html.ol>
        </html.nav>
      </ScrollView>
      <html.div
        aria-hidden
        style={[
          styles.shade,
          styles.top,
          styles.fade(shadeFrom(border, 'top')),
          extent.offset <= 0 && styles.hidden,
        ]}
      />
      <html.div
        aria-hidden
        style={[
          styles.shade,
          styles.bottom,
          styles.fade(shadeFrom(border, 'bottom')),
          extent.offset + extent.viewport >= extent.content && styles.hidden,
        ]}
      />
    </html.div>
  );
}

// One section of the pane under its heading. While the dialog is see-through, the headings hide
// and only the kept section's body stays, for its cards to decide what shows.
function PaneSection({
  id,
  headingId,
  following,
  keptSection,
  onLayout,
  children,
}: {
  id: NativeSettingsSectionId;
  headingId: string;
  following: boolean;
  keptSection: NativeSettingsSectionId | null;
  onLayout: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const seeThrough = keptSection !== null;
  return (
    <View style={following ? FOLLOWING_SECTION : undefined} onLayout={onLayout}>
      <html.section
        data-section={id}
        aria-labelledby={headingId}
        style={seeThrough && keptSection !== id && styles.seeThroughHidden}
      >
        <html.h3
          id={headingId}
          style={[controlStyles.semiboldText, styles.title, seeThrough && styles.seeThroughHidden]}
        >
          {sectionHeading(id)}
        </html.h3>
        <html.div style={controlStyles.dialogContent}>{children}</html.div>
      </html.section>
    </View>
  );
}

function scaledOffsets(heights: readonly (number | undefined)[], count: number, zoom: number) {
  return stackedOffsets(
    heights.map((height) => (height === undefined ? undefined : height * zoom)),
    count,
    WIDE_SHELL.pane.top,
    WIDE_SHELL.sectionGap * zoom
  );
}

function useMarkSeen(onSeen: (id: NativeSettingsSectionId) => void) {
  const seenInitial = useRef(false);
  return {
    seenInitial,
    markSeen(id: NativeSettingsSectionId) {
      seenInitial.current = true;
      onSeen(id);
    },
  };
}

// The shipping tablet Settings (WideShell.svelte): a table of contents beside one continuously
// scrolling pane that stacks every section. The table of contents marks where the reading
// position is rather than a page, and a row jumps the pane to its section.
export function RsdSettingsWide({
  sections,
  keptSection,
  unseen,
  renderSection,
  onSeen,
  locked,
  onUnlock,
  landing,
  children,
}: {
  sections: readonly NativeSettingsSection[];
  keptSection: NativeSettingsSectionId | null;
  unseen: (id: NativeSettingsSectionId) => boolean;
  renderSection: (id: NativeSettingsSectionId) => ReactNode;
  onSeen: (id: NativeSettingsSectionId) => void;
  // The section whose controls wait behind a grown-up check (Parent Center until it is solved): a
  // row naming it asks for the check, and the jump lands once the check is passed.
  locked: NativeSettingsSectionId | null;
  onUnlock: () => void;
  // The section an open asked to land on (shipping's landingSection): the pane goes straight there
  // once its sections have measured, and lands once per request.
  landing: NativeSettingsSectionId | null;
  children: ReactNode;
}) {
  const reduced = useReduceMotion();
  const [zoom, setZoom] = useState(1);
  const headingId = useId();
  const paneIds = sections.map((section) => section.id);
  const [spied, setSpied] = useState<NativeSettingsSectionId>(paneIds[0]);
  const spiedNow = useRef(spied);
  const { seenInitial, markSeen } = useMarkSeen(onSeen);
  const pane = useRef<ScrollViewInstance>(null);
  const paneExtent = useRef<ScrollExtent>(AT_REST);
  const sectionHeights = useHeights();
  // A smooth jump crosses sections the parent did not choose to visit; none of them is seen.
  const jumpTarget = useRef<NativeSettingsSectionId | null>(null);
  const offsets = () => scaledOffsets(sectionHeights.heights.current, paneIds.length, zoom);

  const landed = useRef<NativeSettingsSectionId | null>(null);
  const lockedJump = useRef<NativeSettingsSectionId | null>(null);
  const land = () => {
    const stacked = offsets();
    const at = paneIds.findIndex((id) => id === landing);
    if (landing === null || landed.current === landing || !stacked || at === -1) return;
    landed.current = landing;
    if (lockedJump.current === landing) return;
    jumpTarget.current = null;
    markSeen(landing);
    scrollSettingsPaneToSection(pane.current, landing, sectionJumpOffset(stacked[at]), false);
  };

  const elect = () => {
    land();
    const stacked = offsets();
    if (!stacked) return;
    const next = spiedSettingsSection(pane.current, paneIds, stacked, paneExtent.current);
    const inFlight = jumpTarget.current;
    if (next === inFlight || next === paneIds[paneIds.length - 1]) jumpTarget.current = null;
    const changed = next !== spiedNow.current;
    if (changed) {
      spiedNow.current = next;
      setSpied(next);
    }
    if (!inFlight && (changed || !seenInitial.current)) markSeen(next);
  };

  const jump = (id: NativeSettingsSectionId) => {
    if (id === locked) {
      lockedJump.current = id;
      onUnlock();
      return;
    }
    const stacked = offsets();
    if (!stacked) return;
    markSeen(id);
    jumpTarget.current = reduced ? null : id;
    scrollSettingsPaneToSection(
      pane.current,
      id,
      sectionJumpOffset(stacked[paneIds.indexOf(id)]),
      !reduced
    );
  };

  useEffect(() => {
    if (landing === null) landed.current = null;
    const pending = lockedJump.current;
    if (pending !== null && pending !== locked) {
      lockedJump.current = null;
      jump(pending);
    }
    land();
  });

  return (
    <html.div style={styles.split}>
      <SettingsToc {...{ sections, spied, unseen }} hidden={keptSection !== null} onSelect={jump} />
      <RsdScrollCue
        inset={WIDE_SHELL.pane}
        scrollRef={pane}
        // Any hand on the pane ends a jump: from there the position is the parent's, and every
        // section the reading line reaches is one they chose to visit.
        onUserScroll={() => {
          jumpTarget.current = null;
        }}
        onExtent={(extent) => {
          paneExtent.current = extent;
          elect();
        }}
      >
        <SettingsTextZoom enabled onZoom={setZoom}>
          {paneIds.map((id, index) => (
            <PaneSection
              key={id}
              id={id}
              headingId={`${headingId}-${id}`}
              following={index > 0}
              keptSection={keptSection}
              onLayout={sectionHeights.measure(index, elect)}
            >
              {renderSection(id)}
            </PaneSection>
          ))}
          {children}
        </SettingsTextZoom>
      </RsdScrollCue>
    </html.div>
  );
}
