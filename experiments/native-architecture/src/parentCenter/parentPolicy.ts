export const PARENT_FEATURES = ['ai', 'imageReport', 'feedback', 'parentCenter'] as const;
export type ParentFeature = (typeof PARENT_FEATURES)[number];
export const PARENT_MODES = ['always', 'session', 'never'] as const;
export type ParentMode = (typeof PARENT_MODES)[number];
export type ParentPolicies = Readonly<Record<ParentFeature, ParentMode>>;
export type ParentPreferences = Readonly<{ aiEnabled: boolean; parentPolicies: ParentPolicies }>;
export const PROTECTED_PARENT_POLICIES: ParentPolicies = {
  ai: 'always',
  imageReport: 'always',
  feedback: 'always',
  parentCenter: 'always',
};
export const PARENT_LABELS: Record<ParentFeature, string> = {
  ai: 'Sending a drawing for AI',
  imageReport: 'Reporting an AI picture',
  feedback: 'Sending feedback',
  parentCenter: 'Opening Parent Center',
};
export const PARENT_MODE_LABELS: Record<ParentMode, string> = {
  always: 'Every time',
  session: 'Per session',
  never: 'Never',
};
export function isParentMode(value: unknown): value is ParentMode {
  return PARENT_MODES.some((mode) => mode === value);
}
export function isParentPolicies(value: unknown): value is ParentPolicies {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...PARENT_FEATURES].sort().join(',') &&
    PARENT_FEATURES.every(
      (feature) => feature in value && isParentMode(Reflect.get(value, feature))
    )
  );
}
export type ParentProof = Readonly<{ valid: () => boolean }>;
export type ParentOperationPort = {
  request: (feature: ParentFeature, action: (proof: ParentProof) => void) => boolean;
  cancel: (feature: ParentFeature) => void;
  consent: () => Readonly<{ enabled: boolean; epoch: number }>;
};

export function readLegacyParentPreferences(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    !('aiEnabled' in value) ||
    typeof value.aiEnabled !== 'boolean' ||
    !('parentPolicies' in value) ||
    !value.parentPolicies ||
    typeof value.parentPolicies !== 'object' ||
    Array.isArray(value.parentPolicies) ||
    Object.keys(value.parentPolicies).sort().join(',') !== 'ai,feedback,parentCenter' ||
    !('ai' in value.parentPolicies) ||
    !isParentMode(value.parentPolicies.ai) ||
    !('feedback' in value.parentPolicies) ||
    !isParentMode(value.parentPolicies.feedback) ||
    !('parentCenter' in value.parentPolicies) ||
    !isParentMode(value.parentPolicies.parentCenter)
  )
    throw new Error('Parent Center settings are invalid.');
  return {
    aiEnabled: value.aiEnabled,
    parentPolicies: {
      ai: value.parentPolicies.ai,
      feedback: value.parentPolicies.feedback,
      parentCenter: value.parentPolicies.parentCenter,
    },
  };
}
