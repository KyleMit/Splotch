import type { ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { autoOverridesSystemLock, useOrientationLockApplies } from '../platform/deviceOrientation';
import {
  APPEARANCE_LABELS,
  APPEARANCE_PREFERENCES,
  type AppearancePreference,
} from '../settings/appearance';
import { AUTO_FOLLOWS_SYSTEM_ROTATION_NOTE, type OrientationChoice } from '../settings/orientation';
import { TOOLBAR_STYLE_OPTIONS, TOOLBAR_STYLES, type ToolbarStyle } from '../settings/toolbarStyle';
import type { NativeIconName } from './icons.generated';
import { RsdIcon } from './RsdIcon';
import { RsdOrientationPicker } from './RsdOrientationPicker';
import { RsdSegmentedPicker } from './RsdSegmentedPicker';
import { RsdSettingCard, RsdSettingGroup } from './RsdSettingCard';
import { SETTING_ICON_PX } from './RsdToggleRow';
import { colors, dimensions, fonts } from './tokens.css';

// AppearanceSection.svelte's option glyphs and the label's gap above its picker;
// native-settings-sections.test.mjs reads them from that source.
const APPEARANCE_ICONS: Record<AppearancePreference, NativeIconName> = {
  light: 'theme-light',
  dark: 'theme-dark',
  system: 'theme-auto',
};
const APPEARANCE_LABEL_GAP_PX = 10;

const styles = css.create({
  label: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.settingIconGap,
    marginBottom: APPEARANCE_LABEL_GAP_PX,
  },
  title: {
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
  },
  note: {
    marginTop: dimensions.space2,
    marginBottom: 0,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
  },
});

function PickerCard({
  icon,
  title,
  children,
}: {
  icon: NativeIconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <RsdSettingCard>
      <html.div style={styles.label}>
        <RsdIcon name={icon} size={SETTING_ICON_PX} ink={undefined} muted={false} />
        <html.span style={styles.title}>{title}</html.span>
      </html.div>
      {children}
    </RsdSettingCard>
  );
}

// The shipping AppearanceSection.svelte: Theme and Button style each as an icon track, and the
// orientation lock wherever a lock would be honored. Every choice holds still while one saves.
export function RsdAppearanceSection({
  appearance,
  toolbarStyle,
  orientation,
  busy,
  onAppearanceChange,
  onToolbarStyleChange,
  onOrientationChange,
}: {
  appearance: AppearancePreference;
  toolbarStyle: ToolbarStyle;
  orientation: OrientationChoice;
  busy: boolean;
  onAppearanceChange: (appearance: AppearancePreference) => void;
  onToolbarStyleChange: (style: ToolbarStyle) => void;
  onOrientationChange: (orientation: OrientationChoice) => void;
}) {
  const lockApplies = useOrientationLockApplies();
  return (
    <RsdSettingGroup>
      <PickerCard icon="theme-auto" title="Theme">
        <RsdSegmentedPicker
          label="Theme"
          options={APPEARANCE_PREFERENCES.map((value) => ({
            value,
            label: APPEARANCE_LABELS[value],
            icon: APPEARANCE_ICONS[value],
            disabled: busy,
          }))}
          selected={appearance}
          onSelect={onAppearanceChange}
        />
      </PickerCard>
      <PickerCard icon="button-style-raised" title="Button style">
        <RsdSegmentedPicker
          label="Button style"
          options={TOOLBAR_STYLES.map((value) => ({
            value,
            ...TOOLBAR_STYLE_OPTIONS[value],
            disabled: busy,
          }))}
          selected={toolbarStyle}
          onSelect={onToolbarStyleChange}
        />
      </PickerCard>
      {lockApplies ? (
        <PickerCard icon="mobile-rotate" title="Orientation">
          <RsdOrientationPicker selected={orientation} busy={busy} onChange={onOrientationChange} />
          {autoOverridesSystemLock() ? null : (
            <html.p style={styles.note}>{AUTO_FOLLOWS_SYSTEM_ROTATION_NOTE}</html.p>
          )}
        </PickerCard>
      ) : null}
    </RsdSettingGroup>
  );
}
