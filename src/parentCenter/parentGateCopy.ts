// The shipping Grown-Ups Only copy (ParentalGate.svelte and ParentalGateManageFooter.svelte), apart
// from the Parent Center section's so each loads with the one chunk that shows it.
// tools/tests/native-parent-center-parity.test.mjs reads each string back from those sources.
export const PARENT_GATE_COPY = {
  title: 'Grown-Ups Only',
  subtitle: 'Solve the problem to continue',
  managingSubtitle: 'Solve the problem to manage grown-up checks',
  manageLead: 'Manage these checks in',
  managePlace: 'Settings',
  managePolicies: 'Parent Center',
  unlocked: 'Unlocked!',
  unlockedSub: "You're all set.",
} as const;
