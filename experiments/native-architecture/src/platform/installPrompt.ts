import type { InstallPromptOwner } from '../install/installPolicy';

// A native app is already installed, so it offers no Add to Home Screen prompt.
export const installPrompt: InstallPromptOwner | null = null;
