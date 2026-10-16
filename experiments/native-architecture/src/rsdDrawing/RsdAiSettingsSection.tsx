import { Platform } from 'react-native';
import { css, html } from 'react-strict-dom';
import { FREE_LIMIT } from '../ai/contract';
import type { NativeAiOwner } from '../ai/generation';
import type { AiState } from '../ai/sessionContract';
import { AI_AUTO_SAVE_HELP, AI_SETTINGS_COPY as COPY } from '../settings/aiSettingsCopy';
import { folderSaveSupported } from '../platform/folderSaveSupport';
import type { SoundSettingsState } from '../settings/soundSettings';
import { RsdSectionReveal } from './RsdSectionReveal';
import { RsdAiKeyManager } from './RsdAiKeyManager';
import { RsdAiValueProp } from './RsdAiValueProp';
import { RsdButton } from './RsdButton';
import { RsdStatusMessage } from './RsdStatusMessage';
import { RsdSettingCard, RsdSettingGroup } from './RsdSettingCard';
import { RsdToggleRow } from './RsdToggleRow';
import { dimensions } from './tokens.css';

const styles = css.create({
  stack: { display: 'flex', flexDirection: 'column', gap: dimensions.space4 },
  enabled: { display: 'flex', flexDirection: 'column', gap: dimensions.space5 },
  failure: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: dimensions.space2,
  },
});

export const AI_SAVE_RETRY = 'Retry saving the AI Art choice';

const AUTO_SAVE_HELP =
  Platform.OS === 'web'
    ? folderSaveSupported()
      ? AI_AUTO_SAVE_HELP.webFolder
      : AI_AUTO_SAVE_HELP.web
    : AI_AUTO_SAVE_HELP.native;

export type AiSettingsRoute = {
  owner: NativeAiOwner | null;
  state: AiState | null;
  onToggle: (enabled: boolean) => void;
  // Native persistence is asynchronous where shipping's is not, so a switch that failed to save
  // keeps its failure and retry here, beside the switch.
  saveFailed: boolean;
  onRetrySave: () => void;
  onOpenKeysPage: () => void;
};

// The shipping Settings › AI Art section (settings/AiKeyManager.svelte): the Create AI Images
// switch over either the explainer, while it is off, or the key manager and the two feature
// switches, once it is on (ADR-0127: the off state shows nothing that implies AI is active).
export function RsdAiSettingsSection({
  settings,
  busy,
  ai,
  onAiCustomizationChange,
  onAutoSaveAiChange,
}: {
  settings: SoundSettingsState;
  busy: boolean;
  ai: AiSettingsRoute;
  onAiCustomizationChange: (enabled: boolean) => void;
  onAutoSaveAiChange: (enabled: boolean) => void;
}) {
  const { state } = ai;
  const enabled = settings.aiEnabled;
  const credential = state?.credential;
  return (
    <html.div style={styles.stack}>
      <RsdSettingGroup>
        <RsdSettingCard flushEnd>
          <RsdToggleRow
            icon="wand-stars"
            label={COPY.create}
            id="aiImageToggle"
            checked={enabled}
            disabled={busy}
            help={enabled ? COPY.createHelp.on : COPY.createHelp.off}
            onToggle={ai.onToggle}
          />
        </RsdSettingCard>
      </RsdSettingGroup>
      {ai.saveFailed ? (
        <html.div style={styles.failure}>
          <RsdStatusMessage status="error">{settings.message}</RsdStatusMessage>
          <RsdButton size="sm" onPress={ai.onRetrySave}>
            {AI_SAVE_RETRY}
          </RsdButton>
        </html.div>
      ) : null}
      <RsdSectionReveal visible={!enabled}>
        <RsdAiValueProp
          credential={credential === 'byok' || credential === 'managed' ? credential : 'none'}
          freeRemaining={state?.remaining ?? FREE_LIMIT}
        />
      </RsdSectionReveal>
      <RsdSectionReveal visible={enabled}>
        <html.div style={styles.enabled}>
          <RsdAiKeyManager owner={ai.owner} state={state} onOpenKeysPage={ai.onOpenKeysPage} />
          <RsdSettingGroup>
            <RsdSettingCard>
              <RsdToggleRow
                icon="customize"
                label={COPY.customization}
                id="aiCustomizationToggle"
                checked={settings.aiCustomizationEnabled}
                disabled={busy}
                help={COPY.customizationHelp}
                onToggle={onAiCustomizationChange}
              />
            </RsdSettingCard>
            <RsdSettingCard>
              <RsdToggleRow
                icon="download"
                label={COPY.autoSave}
                id="autoSaveAiToggle"
                checked={settings.autoSaveAiEnabled}
                disabled={busy}
                help={AUTO_SAVE_HELP}
                onToggle={onAutoSaveAiChange}
              />
            </RsdSettingCard>
          </RsdSettingGroup>
        </html.div>
      </RsdSectionReveal>
    </html.div>
  );
}
