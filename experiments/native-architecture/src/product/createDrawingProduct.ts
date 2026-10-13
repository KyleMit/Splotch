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
  let parentCenterOpen = false;
  let confirmNever = false;
  let disposed = false;
  const notify = () => {
    if (!disposed) publish();
  };
  let settingsState: SoundSettingsState | null = null;
  const gate = createParentGate(() => preferences.parentPolicies, notify);
  const settings = createSoundSettings(storage, (next) => {
    const changed =
      preferences.aiEnabled !== next.aiEnabled ||
      PARENT_FEATURES.some(
        (feature) => preferences.parentPolicies[feature] !== next.parentPolicies[feature]
      );
    preferences = { aiEnabled: next.aiEnabled, parentPolicies: next.parentPolicies };
    settingsState = next;
    if (changed) {
      consentEpoch += 1;
      gate.invalidate();
    }
    notify();
  });
  const port: ParentOperationPort = {
    request(feature, action) {
      if (
        disposed ||
        !settingsState ||
        settingsState.status === 'loading' ||
        ((feature === 'ai' || feature === 'imageReport') && !preferences.aiEnabled)
      )
        return false;
      return gate.request(feature, action);
    },
    cancel: gate.cancel,
    consent: () => ({ enabled: !disposed && preferences.aiEnabled, epoch: consentEpoch }),
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
    async setAiEnabled(aiEnabled: boolean) {
      if (!editable()) return;
      await settings.setParentPreferences({ ...preferences, aiEnabled });
    },
    async setPolicy(feature: ParentFeature, mode: ParentMode, confirmed = false) {
      if (!editable()) return;
      if (!isParentModeAvailable(feature, mode, PARENT_PLATFORM)) return;
      if (endsParentCenterProtection(feature, mode) && !confirmed) {
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
    background() {
      consentEpoch += 1;
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
