import type { PaletteLabel } from '$lib/palette';

// The privacy page's contents metadata, kept beside +page.svelte; the scrollspy
// that drives its contents rail/disclosure is lib/components/nav/readingPosition.

// The headline promises, each led by a crayon chip in the brand rainbow — the
// same visual vocabulary as the masthead's CrayonStrip.
export const HIGHLIGHTS: { label: PaletteLabel; lead: string; body: string }[] = [
  { label: 'Red', lead: 'No ads.', body: 'Ever. None.' },
  { label: 'Orange', lead: 'No tracking.', body: "We don't follow you around the internet." },
  { label: 'Yellow', lead: 'No accounts.', body: 'No sign-up, no login, no passwords.' },
  { label: 'Green', lead: 'No analytics.', body: 'Not from us, not from anyone else.' },
  {
    label: 'Blue',
    lead: 'No surprises.',
    body: 'Every request the app makes is described on this page.',
  },
  { label: 'Purple', lead: 'Works offline.', body: 'Drawing happens entirely on your device.' },
];

// The contents entries and the section ids/headings in the page markup are the
// same list twice, like /design's — a mismatch is a dead anchor, caught by
// privacy.spec.ts walking every rail link to its section.
export const SECTIONS = [
  { id: 'on-device', label: 'What stays on your device' },
  { id: 'ai-pictures', label: 'Making an AI picture' },
  { id: 'counting', label: 'How the counting works' },
  { id: 'reports', label: 'Reporting a picture' },
  { id: 'feedback', label: 'Sending feedback' },
  { id: 'hosting', label: 'Hosting and downloads' },
  { id: 'children', label: "Children's privacy" },
  { id: 'contact', label: 'Changes and contact' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];
