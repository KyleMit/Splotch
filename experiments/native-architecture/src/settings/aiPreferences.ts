// Settings › AI Art's two feature switches (shipping settings/AiFeatureToggles.svelte), stored
// with the other drawing choices from settings schema 15. The defaults are shipping's
// settings.svelte.ts fallbacks; native-ai-settings.test.mjs reads them back from that source.
export type AiPreferences = Readonly<{
  aiCustomizationEnabled: boolean;
  autoSaveAiEnabled: boolean;
}>;

export const DEFAULT_AI_PREFERENCES: AiPreferences = {
  aiCustomizationEnabled: true,
  autoSaveAiEnabled: false,
};

export function readAiPreferences(value: object): AiPreferences {
  const aiCustomizationEnabled =
    'aiCustomizationEnabled' in value ? value.aiCustomizationEnabled : undefined;
  const autoSaveAiEnabled = 'autoSaveAiEnabled' in value ? value.autoSaveAiEnabled : undefined;
  if (typeof aiCustomizationEnabled !== 'boolean' || typeof autoSaveAiEnabled !== 'boolean')
    throw new Error('AI Art choices are invalid.');
  return { aiCustomizationEnabled, autoSaveAiEnabled };
}

// The two switches' setters, through the settings owner's one validated choice writer.
export function createAiActions(
  choose: (choice: Partial<AiPreferences>, valid: boolean, invalid: string) => Promise<void>
) {
  const feature = (choice: Partial<AiPreferences>, enabled: boolean) =>
    choose(choice, typeof enabled === 'boolean', 'AI Art choice is invalid.');
  return {
    setAiCustomizationEnabled: (aiCustomizationEnabled: boolean) =>
      feature({ aiCustomizationEnabled }, aiCustomizationEnabled),
    setAutoSaveAiEnabled: (autoSaveAiEnabled: boolean) =>
      feature({ autoSaveAiEnabled }, autoSaveAiEnabled),
  };
}
