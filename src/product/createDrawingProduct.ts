import { createParentGate } from '../parentCenter/parentGate';
import { DEFAULT_PARENT_PREFERENCES } from '../platform/parentDefaults';
import { PARENT_PLATFORM } from '../platform/parentPlatform';
import {
  createSoundSettings,
  type SoundSettingsState,
  type SoundSettingsStorage,
} from '../settings/soundSettings';
import {
  PARENT_FEATURES,
  endsParentCenterProtection,
  isParentModeAvailable,
  type ParentFeature,
  type ParentMode,
  type ParentOperationPort,
} from '../parentCenter/parentPolicy';

export function createDrawingProduct(storage: SoundSettingsStorage, publish: () => void) {
  let preferences = DEFAULT_PARENT_PREFERENCES;
  let consentEpoch = 0;
  let aiSpan = 0;
  let parentCenterOpen = false;
  let confirmNever = false;
  let disposed = false;
  const notify = () => {
    if (!disposed) publish();
  };
  let settingsState: SoundSettingsState | null = null;
  const gate = createParentGate(() => preferences.parentPolicies, notify);
  const settings = createSoundSettings(storage, (next) => {
    const changedPolicies = PARENT_FEATURES.filter(
      (feature) => preferences.parentPolicies[feature] !== next.parentPolicies[feature]
    );
    if (preferences.aiEnabled !== next.aiEnabled) aiSpan += 1;
    const changed = preferences.aiEnabled !== next.aiEnabled || changedPolicies.length > 0;
    preferences = { aiEnabled: next.aiEnabled, parentPolicies: next.parentPolicies };
    settingsState = next;
    for (const feature of changedPolicies) gate.rearm(feature);
    if (changed) {
      consentEpoch += 1;
      gate.invalidate();
    }
    notify();
  });
  const port: ParentOperationPort = {
    request(feature, action, options) {
      if (
        disposed ||
        !settingsState ||
        settingsState.status === 'loading' ||
        ((feature === 'ai' || feature === 'imageReport') && !preferences.aiEnabled)
      )
        return false;
      return gate.request(feature, action, options);
    },
    cancel: gate.cancel,
    consent: () => ({ enabled: !disposed && preferences.aiEnabled, epoch: consentEpoch, aiSpan }),
  };
  // Parent Center's controls answer to whoever can reach them: the parent who passed its check, or
  // anyone when its policy asks for none.
  function editable() {
    return (parentCenterOpen || !gate.requires('parentCenter')) && settings.canEditParent();
  }
  function enterParentCenter() {
    if (disposed) return;
    parentCenterOpen = true;
    confirmNever = false;
    notify();
  }
  return {
    settings,
    gate,
    port,
    getState: () => ({
      settings: settingsState,
      gate: gate.getState(),
      parentCenterOpen,
      parentCenterCheckDue: gate.requires('parentCenter'),
      confirmNever,
    }),
    openParentCenter() {
      port.request('parentCenter', enterParentCenter);
    },
    retargetParentCenter() {
      gate.retarget(enterParentCenter);
    },
    closeParentCenter() {
      parentCenterOpen = false;
      confirmNever = false;
      gate.invalidate();
      notify();
    },
    // Settings › AI Art's master switch, which, as in shipping, asks for no grown-up check: a
    // drawing still waits behind the generation check before it is sent.
    async setAiEnabled(aiEnabled: boolean) {
      if (!disposed) await settings.setAiEnabled(aiEnabled);
    },
    async setPolicy(feature: ParentFeature, mode: ParentMode, confirmed = false) {
      if (!editable()) return;
      if (!isParentModeAvailable(feature, mode, PARENT_PLATFORM)) return;
      if (endsParentCenterProtection(feature, mode, preferences.parentPolicies) && !confirmed) {
        confirmNever = true;
        notify();
        return;
      }
      confirmNever = false;
      await settings.setParentPreferences({
        ...preferences,
        parentPolicies: { ...preferences.parentPolicies, [feature]: mode },
      });
    },
    cancelNever() {
      confirmNever = false;
      notify();
    },
    async retryParentSave() {
      if (!editable()) return;
      await settings.retryParentSave();
    },
    async resetSavedSettings() {
      if (disposed || !parentCenterOpen) return;
      await settings.resetSavedSettings();
    },
    background() {
      parentCenterOpen = false;
      confirmNever = false;
      gate.invalidate();
      notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      consentEpoch += 1;
      parentCenterOpen = false;
      gate.dispose();
      settings.dispose();
    },
  };
}
export type DrawingProductOwner = ReturnType<typeof createDrawingProduct>;
