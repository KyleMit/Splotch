import type { ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { useOrientationLockApplies } from '../platform/deviceOrientation';
import { APP_VERSION } from '../platform/appVersion';
import type { OrientationChoice } from '../settings/orientation';
import { TOOL_DRAWER_COPY } from '../settings/toolDrawerSection';
import { RsdOrientationPicker } from './RsdOrientationPicker';
import type { HubToggle } from './RsdHubRow';
import { RsdIcon } from './RsdIcon';
import { RsdScrollCue } from './RsdScrollCue';
import { RsdSplotchyIcon } from './RsdSplotchyIcon';
import { RsdToggleRow, SETTING_ICON_PX } from './RsdToggleRow';
import { colors, dimensions, fonts } from './tokens.css';

// CompactShell.svelte's quick toggles; rsd-native-settings-layouts.test.mjs reads each from it.
export const COMPACT_SHELL = {
  // Shallower than the default fade: the pane is only a couple of rows tall.
  cueHeight: 32,
  inline: 24,
  note: { top: 10, inline: 24, bottom: 14, gap: 8, icon: 16 },
} as const;
const COLUMNS = 2;

const styles = css.create({
  grid: { display: 'flex', flexDirection: 'column', gap: dimensions.space2 },
  row: { display: 'flex', flexDirection: 'row', gap: dimensions.space2 },
  // A lone last cell keeps its column's width rather than spanning the row.
  cell: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingTop: dimensions.space3,
    paddingBottom: dimensions.space3,
    paddingLeft: dimensions.space4,
    paddingRight: dimensions.space4,
    borderRadius: dimensions.radiusLg,
    backgroundColor: colors.surface2,
  },
  // The orientation track replaces the cell's card, so the options get all of the cell's room.
  bare: {
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    backgroundColor: 'transparent',
  },
  spacer: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  about: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: dimensions.settingIconGap,
  },
  version: {
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
  },
  note: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    gap: COMPACT_SHELL.note.gap,
    paddingTop: COMPACT_SHELL.note.top,
    paddingBottom: COMPACT_SHELL.note.bottom,
    paddingLeft: COMPACT_SHELL.note.inline,
    paddingRight: COMPACT_SHELL.note.inline,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    textAlign: 'center',
  },
});

function rows(cells: readonly ReactNode[]) {
  const grouped: ReactNode[] = [];
  for (let start = 0; start < cells.length; start += COLUMNS) {
    const row = cells.slice(start, start + COLUMNS);
    grouped.push(
      <html.div key={start} style={styles.row}>
        {row}
        {row.length < COLUMNS ? <html.div style={styles.spacer} /> : null}
      </html.div>
    );
  }
  return grouped;
}

// The landscape-phone Settings (CompactShell.svelte): too short for the section list, so the
// essential quick toggles in two columns, and a pointer to portrait for the rest. The last cell
// sets the orientation lock wherever one would be honored, and shows the version elsewhere.
export function RsdSettingsCompact({
  sound,
  night,
  toolDrawer,
  orientation,
  busy,
  onOrientationChange,
  children,
}: {
  sound: HubToggle;
  night: HubToggle;
  toolDrawer: Pick<HubToggle, 'checked' | 'disabled' | 'onToggle'>;
  orientation: OrientationChoice;
  busy: boolean;
  onOrientationChange: (orientation: OrientationChoice) => void;
  children: ReactNode;
}) {
  const softInk = useDrawingTheme().textSoft;
  const lockApplies = useOrientationLockApplies();
  const cells = [
    <html.div key="sound" style={styles.cell}>
      <RsdToggleRow
        icon={sound.checked ? 'volume-on' : 'volume-off'}
        label={sound.label}
        id="quickSoundToggle"
        checked={sound.checked}
        disabled={sound.disabled}
        onToggle={sound.onToggle}
      />
    </html.div>,
    <html.div key="night" style={styles.cell}>
      <RsdToggleRow
        icon={night.checked ? 'theme-dark' : 'theme-light'}
        label={night.label}
        id="quickNightToggle"
        checked={night.checked}
        disabled={night.disabled}
        onToggle={night.onToggle}
      />
    </html.div>,
    <html.div key="toolDrawer" style={styles.cell}>
      <RsdToggleRow
        icon="dashboard-customize"
        label={TOOL_DRAWER_COPY.quick}
        id="quickToolDrawerToggle"
        checked={toolDrawer.checked}
        disabled={toolDrawer.disabled}
        onToggle={toolDrawer.onToggle}
      />
    </html.div>,
    lockApplies ? (
      <html.div key="orientation" style={[styles.cell, styles.bare]}>
        <RsdOrientationPicker selected={orientation} busy={busy} onChange={onOrientationChange} />
      </html.div>
    ) : (
      <html.div key="about" style={[styles.cell, styles.about]}>
        <html.div role="img" aria-label="Splotch">
          <RsdSplotchyIcon size={SETTING_ICON_PX} />
        </html.div>
        <html.span style={styles.version}>Version {APP_VERSION}</html.span>
      </html.div>
    ),
  ];
  return (
    <>
      <RsdScrollCue
        cueHeight={COMPACT_SHELL.cueHeight}
        inset={{ top: 0, right: COMPACT_SHELL.inline, bottom: 0, left: COMPACT_SHELL.inline }}
      >
        <html.div style={styles.grid}>
          {rows(cells)}
          {children}
        </html.div>
      </RsdScrollCue>
      <html.div style={styles.note}>
        <RsdIcon name="mobile-portrait" size={COMPACT_SHELL.note.icon} ink={softInk} muted />
        <html.span>Switch to portrait for the full settings.</html.span>
      </html.div>
    </>
  );
}
