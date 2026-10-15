import { useColorScheme } from 'react-native';
import { css, html } from 'react-strict-dom';
import { dimensions } from './tokens.css';
import { RsdHubRow, type HubToggle } from './RsdHubRow';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { useLazyValue } from '../lazyExport';
import { settingsSessions } from '../platform/settingsSessions';
import { activityDotsShown } from '../settings/settingsSessions';
import {
  sectionSubtitle,
  type NativeSettingsSection,
  type NativeSettingsSectionId,
  type SectionSummaryContext,
} from '../settings/settingsSections';
import { whatsNewUnseen } from '../settings/whatsNew';
import { quickToggleAppearance, type AppearancePreference } from '../settings/appearance';

const SESSION_COUNT_DESCRIPTION = 'Settings session count';

const styles = css.create({
  list: { display: 'flex', flexDirection: 'column', gap: dimensions.space2 },
  // The switch rows lead the list; the first drill-in doubles the gap as the break between
  // "flip it here" and "go configure".
  groupBreak: { marginTop: dimensions.space2 },
});

export type HubToggles = Partial<Record<NativeSettingsSectionId, HubToggle>>;

// Night Mode flips the resolved theme, as shipping's does, writing the loosest preference that
// gives it, and the three-way choice stays in the Appearance section. Both wait out a pending save,
// as the section controls do: the settings owner drops a choice made before the last one is
// written.
export function useHubToggles({
  busy,
  soundEnabled,
  onSoundToggle,
  onAppearanceChange,
}: {
  busy: boolean;
  soundEnabled: boolean;
  onSoundToggle: () => void;
  onAppearanceChange: (appearance: AppearancePreference) => void;
}): { appearance: HubToggle; sound: HubToggle } {
  const night = useDrawingAppearance() === 'dark';
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  return {
    appearance: {
      id: 'hubNightToggle',
      label: 'Night Mode',
      checked: night,
      onToggle: (next) =>
        onAppearanceChange(quickToggleAppearance(next ? 'dark' : 'light', system)),
      thumbIcon: night ? 'theme-dark' : 'theme-light',
      disabled: busy,
    },
    sound: {
      id: 'hubSoundToggle',
      label: 'Sound',
      checked: soundEnabled,
      disabled: busy,
      onToggle: (next) => {
        if (next !== soundEnabled) onSoundToggle();
      },
    },
  };
}

function sectionUnseen(id: NativeSettingsSectionId, context: SectionSummaryContext) {
  return id === 'whatsnew' && whatsNewUnseen(context.settings.whatsNewSeen);
}

// Whether a section carries its activity dot: content changed since the parent last opened it,
// from the sixth session on. The hub rows and the wide sidebar rows both ask this.
export function useSectionActivity(context: SectionSummaryContext) {
  const sessions = useLazyValue(settingsSessions, (count) => count, SESSION_COUNT_DESCRIPTION);
  const dots = activityDotsShown(sessions);
  return (id: NativeSettingsSectionId) => dots && sectionUnseen(id, context);
}

// The shipping phone hub (HubList.svelte): one tile per section with its icon and live status, a
// trailing switch on the rows a parent flips mid-session, and the activity dot on a section whose
// content changed since the parent last opened it, from the sixth session on.
export function RsdSettingsHub({
  sections,
  context,
  toggles,
  unseen,
  returnTo,
  onOpen,
}: {
  sections: readonly NativeSettingsSection[];
  context: SectionSummaryContext;
  toggles: HubToggles;
  unseen: (id: NativeSettingsSectionId) => boolean;
  returnTo: NativeSettingsSectionId | null;
  onOpen: (id: NativeSettingsSectionId) => void;
}) {
  const firstDrillIn = sections.findIndex((section) => !toggles[section.id]);
  return (
    <html.div role="list" style={styles.list}>
      {sections.map((section, index) => {
        const toggle = toggles[section.id];
        return (
          <html.div
            key={section.id}
            role="listitem"
            style={index === firstDrillIn && index > 0 && styles.groupBreak}
          >
            <RsdHubRow
              icon={section.icon}
              title={section.label}
              subtitle={sectionSubtitle(section.id, context)}
              unseen={unseen(section.id)}
              focusOnMount={section.id === returnTo}
              onOpen={() => onOpen(section.id)}
              toggle={toggle}
            />
          </html.div>
        );
      })}
    </html.div>
  );
}
