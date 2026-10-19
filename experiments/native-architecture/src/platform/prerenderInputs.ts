import { DEFAULT_APPEARANCE, type AppearancePreference } from '../settings/appearance';

// What the build's first-frame prerender (prerenderFirstFrame.tsx) renders for: the browser reads
// these from its document and window, which a Node render does not have.
export const prerenderInputs: { appearance: AppearancePreference } = {
  appearance: DEFAULT_APPEARANCE,
};
