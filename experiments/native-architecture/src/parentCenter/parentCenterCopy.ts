import type { ParentFeature, ParentMode } from './parentPolicy';

// The shipping Parent Center copy (settings/ParentCenterSection.svelte and
// settings/ParentCenterLock.svelte). Kept apart from parentPolicy.ts, which settings load on the
// startup path, and from the gate's copy, which loads with the gate's own chunk.
// tools/tests/native-parent-center-parity.test.mjs reads each string back from those sources.

export const PARENT_LABELS: Record<ParentFeature, string> = {
  ai: 'Generating an AI image',
  imageReport: 'Reporting an AI result',
  externalLinks: 'Viewing external links',
  feedback: 'Sending feedback',
  parentCenter: 'Opening Parent Center',
};

export const PARENT_HELP: Record<ParentFeature, string> = {
  ai: 'Before a drawing is sent to OpenAI for image generation.',
  imageReport:
    'Before a drawing and either a generated picture or safety refusal are sent for review.',
  externalLinks: 'Before a link opens another website or app.',
  feedback: "Before a report is sent to Splotch's issue tracker.",
  parentCenter: 'Before anyone can change these protections.',
};

export const PARENT_MODE_LABELS: Record<ParentMode, string> = {
  always: 'Every time',
  session: 'Per session',
  never: 'Never',
};

export const PARENT_CENTER_COPY = {
  intro:
    'Choose when Splotch should ask for a grown-up check. Each action includes a short explanation so you can see what the protection is for.',
  matrixHeading: 'Action',
  sessionNote: 'asks once until Splotch is closed.',
  neverNote: 'skips the grown-up check on this device where available.',
  unavailableTitle: 'Why Never is unavailable on iOS',
  unavailable:
    "Apple's Kids Category requires links that leave Splotch to stay behind a grown-up check. Choose Every time or Per session instead.",
  warningTitle: 'This check is off',
  // One sentence for both warning surfaces: the confirmation in front of the choice, and the note
  // beside it for as long as the choice holds.
  unprotected:
    "Anyone using this device can open Parent Center and change Splotch's settings and protections.",
  confirmTitle: 'Turn off the Parent Center check?',
  keepOn: 'Keep it on',
  turnOff: 'Turn it off',
  lock: 'Parent Center decides when Splotch asks for a grown-up check, so it waits behind one itself.',
  unlock: 'Unlock these settings',
} as const;
