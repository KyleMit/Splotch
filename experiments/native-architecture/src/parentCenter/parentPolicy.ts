// The shipping PARENTAL_GATE_FEATURES in its order, with `ai` standing for shipping's `aiImage`;
// native-parent-center-parity.test.mjs pins the two lists together.
export const PARENT_FEATURES = [
  'ai',
  'imageReport',
  'externalLinks',
  'feedback',
  'parentCenter',
] as const;
export type ParentFeature = (typeof PARENT_FEATURES)[number];
export const PARENT_MODES = ['always', 'session', 'never'] as const;
export type ParentMode = (typeof PARENT_MODES)[number];
export type ParentPolicies = Readonly<Record<ParentFeature, ParentMode>>;
export type ParentPreferences = Readonly<{ aiEnabled: boolean; parentPolicies: ParentPolicies }>;
export const PROTECTED_PARENT_POLICIES: ParentPolicies = {
  ai: 'always',
  imageReport: 'always',
  externalLinks: 'always',
  feedback: 'always',
  parentCenter: 'always',
};
function isParentMode(value: unknown): value is ParentMode {
  return PARENT_MODES.some((mode) => mode === value);
}
export type ParentPlatform = 'ios' | 'android' | 'web';
// Apple's Kids Category keeps links that leave the app behind a grown-up check, so on iOS external
// links cannot be set to Never (shipping isParentalGateModeAvailable).
export function isParentModeAvailable(
  feature: ParentFeature,
  mode: ParentMode,
  platform: ParentPlatform
) {
  return !(feature === 'externalLinks' && mode === 'never' && platform === 'ios');
}
export function arePoliciesAvailable(policies: ParentPolicies, platform: ParentPlatform) {
  return PARENT_FEATURES.every((feature) =>
    isParentModeAvailable(feature, policies[feature], platform)
  );
}
// A saved choice the platform forbids reads back as the build's default for it, or Every time where
// that is forbidden too (shipping readFeatureMode), so no stored record can relax a store rule.
export function availablePolicies(
  policies: ParentPolicies,
  platform: ParentPlatform,
  defaults: ParentPolicies
): ParentPolicies {
  const pick = (feature: ParentFeature): ParentMode =>
    isParentModeAvailable(feature, policies[feature], platform)
      ? policies[feature]
      : isParentModeAvailable(feature, defaults[feature], platform)
        ? defaults[feature]
        : 'always';
  return {
    ai: pick('ai'),
    imageReport: pick('imageReport'),
    externalLinks: pick('externalLinks'),
    feedback: pick('feedback'),
    parentCenter: pick('parentCenter'),
  };
}
// Whether Parent Center itself opens with no check in front of it, which leaves every other
// policy on the device open to whoever holds it (shipping isParentCenterUnprotected).
export function isParentCenterUnprotected(policies: ParentPolicies) {
  return policies.parentCenter === 'never';
}
// Never on Parent Center is the one choice that waits for a confirmation: it leaves the checks
// themselves unprotected. Already unprotected is not a change, so it asks nothing (shipping
// endsParentCenterProtection).
export function endsParentCenterProtection(
  feature: ParentFeature,
  mode: ParentMode,
  policies: ParentPolicies
) {
  return feature === 'parentCenter' && mode === 'never' && !isParentCenterUnprotected(policies);
}
function hasExactPolicies<Feature extends ParentFeature>(
  value: unknown,
  features: readonly Feature[]
): value is Readonly<Record<Feature, ParentMode>> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...features].sort().join(',') &&
    features.every((feature) => feature in value && isParentMode(Reflect.get(value, feature)))
  );
}
export function isParentPolicies(value: unknown): value is ParentPolicies {
  return hasExactPolicies(value, PARENT_FEATURES);
}
// Settings saved before Viewing external links had a policy of its own.
const FEATURES_BEFORE_EXTERNAL_LINKS = PARENT_FEATURES.filter(
  (feature): feature is Exclude<ParentFeature, 'externalLinks'> => feature !== 'externalLinks'
);
export function isParentPoliciesBeforeExternalLinks(
  value: unknown
): value is Omit<ParentPolicies, 'externalLinks'> {
  return hasExactPolicies(value, FEATURES_BEFORE_EXTERNAL_LINKS);
}
// The saved form lists the policies in PARENT_FEATURES order, so a snapshot reads back canonical
// however the in-memory record was assembled.
export function orderedParentPolicies(policies: ParentPolicies): ParentPolicies {
  return {
    ai: policies.ai,
    imageReport: policies.imageReport,
    externalLinks: policies.externalLinks,
    feedback: policies.feedback,
    parentCenter: policies.parentCenter,
  };
}
export type ParentProof = Readonly<{ valid: () => boolean }>;
// An external link opens inside the solving tap, which keeps a web export's new tab within that
// tap's user activation, so its solve hands over at once with no "Unlocked!" card (shipping's
// `immediate`).
export type ParentRequestOptions = Readonly<{ immediate?: boolean }>;
export type ParentOperationPort = {
  request: (
    feature: ParentFeature,
    action: (proof: ParentProof) => void,
    options?: ParentRequestOptions
  ) => boolean;
  cancel: (feature: ParentFeature) => void;
  // `epoch` changes with any parent choice; `aiSpan` only when AI image creation turns on or off.
  consent: () => Readonly<{ enabled: boolean; epoch: number; aiSpan: number }>;
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
