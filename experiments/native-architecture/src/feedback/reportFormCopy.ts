import type { ReportKind } from './report';

// The shipping Settings feedback form's words (settings/ReportForm.svelte and
// report/ReportFields.svelte, which author them in markup); native-settings-info-drift.test.mjs
// reads each back from those sources.
export const REPORT_FORM_COPY = {
  heading: 'Send Feedback',
  intro:
    'Found a bug or have an idea? Tell us here — it opens a private support issue that only the Splotch maintainer can read. No account needed.',
  kindLabel: 'Report type',
  includeDevice: 'Include device info',
  includeDeviceWhy: '(helps us reproduce the bug)',
  deviceSummary: 'What will be sent?',
  deviceGathering: 'Gathering device info…',
  deviceNote:
    'No names, accounts, or location — just the basics about your device and app version.',
  privacy:
    "Your report goes to our private support tracker. Please don't include personal details like names or email addresses.",
  send: 'Send report',
  sendIdea: 'Send idea',
  sending: 'Sending…',
  sent: 'Thanks for your feedback.',
} as const;

// What the message box asks for each kind.
export const MESSAGE_PROMPT_BY_KIND: Record<ReportKind, { label: string; placeholder: string }> = {
  bug: {
    label: 'What went wrong?',
    placeholder: 'Describe what happened, and what you expected instead…',
  },
  feature: {
    label: "What's your idea?",
    placeholder: "Describe the feature or change you'd love to see…",
  },
};
