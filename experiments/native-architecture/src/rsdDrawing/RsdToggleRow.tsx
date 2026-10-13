import { css, html } from 'react-strict-dom';
import { colors, dimensions, fonts } from './tokens.css';
import { RsdIcon } from './RsdIcon';
import { RsdSwitchLabel, RsdToggleSwitch } from './RsdToggleSwitch';
import type { NativeIconName } from './icons.generated';

// The settings rows' icon column (--setting-icon-size), and the gap from a row to its help line.
// rsd-native-settings-rows.test.mjs reads both from the shipping source.
export const SETTING_ICON_PX = 20;
const HELP_GAP_PX = 6;
const HELP_LINE_HEIGHT = 1.4;

const styles = css.create({
  row: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    flexShrink: 1,
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
  },
  // --text-soft is pinned to hold 4.5:1 for this small help text on the card.
  help: {
    marginTop: HELP_GAP_PX,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: dimensions.settingIndent,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    lineHeight: HELP_LINE_HEIGHT,
  },
  disabled: { opacity: dimensions.disabledOpacity },
});

// The shipping ToggleRow.svelte: an icon and label on the left, the switch on the right, and an
// optional help line below that the switch names as its description. The switch's accessible
// name is the visible label, so the two cannot diverge.
export function RsdToggleRow({
  icon,
  label,
  id,
  checked,
  onToggle,
  help,
  disabled = false,
}: {
  icon: NativeIconName;
  label: string;
  id: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  help?: string;
  disabled?: boolean;
}) {
  const helpId = `${id}-help`;
  return (
    <>
      <html.div data-testid={`${id}-row`} style={[styles.row, disabled && styles.disabled]}>
        <RsdSwitchLabel id={id} checked={checked} disabled={disabled} onToggle={onToggle}>
          <RsdIcon name={icon} size={SETTING_ICON_PX} ink={undefined} muted={false} />
          <html.span style={styles.label}>{label}</html.span>
        </RsdSwitchLabel>
        <RsdToggleSwitch
          id={id}
          label={label}
          checked={checked}
          onToggle={onToggle}
          disabled={disabled}
          description={help ? { id: helpId, text: help } : undefined}
        />
      </html.div>
      {help ? (
        <html.p id={helpId} data-testid={helpId} style={[styles.help, disabled && styles.disabled]}>
          {help}
        </html.p>
      ) : null}
    </>
  );
}
