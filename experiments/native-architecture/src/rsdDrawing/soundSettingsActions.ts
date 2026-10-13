import type { useDrawingSound } from '../useDrawingSound';

type Sound = ReturnType<typeof useDrawingSound>;
type SettingsOwner = NonNullable<Sound['owner']>['settings'];

// The Settings dialog's choice callbacks, each routed to the one settings owner.
export function soundSettingsActions(sound: Sound) {
  return {
    onToggle: () => void sound.owner?.settings.setEnabled(!sound.settings.soundEnabled),
    onUndoButtonChange: (enabled: boolean) =>
      void sound.owner?.settings.setUndoButtonEnabled(enabled),
    onStrokeWidthControlChange: (enabled: boolean) =>
      void sound.owner?.settings.setStrokeWidthControlEnabled(enabled),
    onSaveOnDeleteChange: (enabled: boolean) =>
      void sound.owner?.settings.setSaveOnDeleteEnabled(enabled),
    onSoundLevelChange: (level: Parameters<SettingsOwner['setSoundLevel']>[0]) =>
      void sound.owner?.settings.setSoundLevel(level),
    onAppearanceChange: (appearance: Parameters<SettingsOwner['setAppearance']>[0]) =>
      void sound.owner?.settings.setAppearance(appearance),
    onOrientationChange: (orientation: Parameters<SettingsOwner['setOrientation']>[0]) =>
      void sound.owner?.settings.setOrientation(orientation),
    onColoringBookChange: (enabled: boolean) =>
      void sound.owner?.settings.setColoringBookEnabled(enabled),
    onButtonScaleChange: (scale: number) => void sound.owner?.settings.setButtonScale(scale),
    onReduceMotionChange: (preference: Parameters<SettingsOwner['setReduceMotion']>[0]) =>
      void sound.owner?.settings.setReduceMotion(preference),
    onWhatsNewSeen: () => void sound.owner?.settings.markWhatsNewSeen(),
    onRetry: () => void sound.owner?.settings.retrySave(),
  };
}
