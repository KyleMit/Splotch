import type { ParentPreferences } from '../parentCenter/parentPolicy';
export const DEFAULT_PARENT_PREFERENCES: ParentPreferences = {
  aiEnabled: false,
  parentPolicies: { ai: 'never', imageReport: 'never', feedback: 'never', parentCenter: 'never' },
};
