import { useEffect, useRef } from 'react';
import { css, html } from 'react-strict-dom';
import { landFocus } from './landFocus';
import { colors, dimensions, motion } from './tokens.css';
import { hubRowFace } from './hubRowFace';
import { RsdActivityDot } from './RsdActivityDot';
import { LineClampBox } from './lineClampBox';
import { RsdSectionIcon, type SectionIconName } from './RsdSectionIcon';
import { RsdToggleSwitch } from './RsdToggleSwitch';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import type { ToggleSwitchProps } from './toggleSwitchFace';

// The shipping HubList.svelte row; rsd-native-settings-rows.test.mjs reads each from that source.
// The icon box is the optical column that keeps every title left-aligned, not a hit target.
const ICON_BOX_PX = 44;
const ICON_PX = 38;
const TEXT_GAP_PX = 2;
// Two lines is the ceiling: a third would push the row past the icon column beside it.
const SUBTITLE_LINES = 2;
const SPLIT_HEIGHT_PX = 36;
const ACTION_GAP_PX = 14;
const PRESSED_SCALE = 0.97;

const styles = css.create({
  // The tile carries the surface, so a row with a switch reads as one card with two targets.
  tile: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: dimensions.radiusLg,
    backgroundColor: colors.surface2,
  },
  row: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space3,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    padding: dimensions.space4,
    borderWidth: 0,
    borderRadius: dimensions.radiusLg,
    backgroundColor: { default: 'transparent', ':hover': colors.surfaceHover },
    cursor: 'pointer',
    textAlign: 'left',
    transform: { default: 'scale(1)', ':active': `scale(${PRESSED_SCALE})` },
    transitionProperty: 'backgroundColor, transform',
    transitionDuration: motion.durationFast,
    transitionTimingFunction: 'ease',
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: ICON_BOX_PX,
    height: ICON_BOX_PX,
    flexShrink: 0,
  },
  text: {
    display: 'flex',
    flexDirection: 'column',
    gap: TEXT_GAP_PX,
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
  },
  title: {
    color: colors.textStrong,
    fontSize: dimensions.fontSizeMd,
  },
  // Wraps rather than ellipsizing on one line: the summary says what a section does.
  subtitle: {
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    lineClamp: SUBTITLE_LINES,
  },
  action: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: ACTION_GAP_PX,
    paddingRight: dimensions.space4,
    flexShrink: 0,
  },
  split: {
    width: dimensions.borderWidth,
    height: SPLIT_HEIGHT_PX,
    backgroundColor: colors.border,
  },
});

export type HubToggle = Omit<ToggleSwitchProps, 'description'>;

// The shipping phone hub row (HubList.svelte): the body drills into its section, and a section
// whose boolean is legible from its own name answers it inline with a trailing switch.
export function RsdHubRow({
  icon,
  title,
  subtitle,
  unseen,
  focusOnMount = false,
  onOpen,
  toggle,
}: {
  icon: SectionIconName;
  title: string;
  subtitle: string;
  unseen: boolean;
  /** Takes focus: the row a phone Back returns to, in place of the Back it unmounted. */
  focusOnMount?: boolean;
  onOpen: () => void;
  toggle?: HubToggle;
}) {
  const theme = useDrawingTheme();
  const body = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnMount) landFocus(body.current);
  }, [focusOnMount]);
  const name = [title, subtitle, ...(unseen ? ['new'] : [])].join(', ');
  return (
    <html.div data-testid="hub-tile" style={styles.tile}>
      <html.button
        ref={body}
        aria-label={name}
        style={[styles.row, hubRowFace.row]}
        onClick={onOpen}
      >
        <html.div style={styles.icon}>
          <RsdSectionIcon icon={icon} size={ICON_PX} ink={theme.brandText} />
          <RsdActivityDot unseen={unseen} surface="surface2" />
        </html.div>
        <html.div style={styles.text}>
          <html.span style={[styles.title, hubRowFace.title]}>{title}</html.span>
          <html.span data-testid="hub-subtitle" style={styles.subtitle}>
            <LineClampBox lines={SUBTITLE_LINES}>{subtitle}</LineClampBox>
          </html.span>
        </html.div>
      </html.button>
      {toggle ? (
        <html.div style={styles.action}>
          <html.div aria-hidden data-testid="hub-split" style={styles.split} />
          <RsdToggleSwitch {...toggle} />
        </html.div>
      ) : null}
    </html.div>
  );
}
