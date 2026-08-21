import type { PaletteLabel } from '$lib/palette';

// The privacy page's contents metadata and the scrollspy that drives its
// contents rail/disclosure, kept beside +page.svelte.

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

// A section is the one being read once its top has climbed within this
// distance of the viewport top. Deeper than either layout parks a jumped-to
// section, so arriving from the contents marks the section it landed on.
export const SPY_LINE_PX = 128;

export interface ReadingPosition {
  /** The scrollspied section — the last one whose top has crossed the line. */
  active: SectionId;
  /** False while the reader is still above the first section. */
  entered: boolean;
}

// rAF-throttled window scrollspy, the /design pattern. Returns its teardown.
export function watchReadingPosition(onChange: (reading: ReadingPosition) => void): () => void {
  let raf = 0;
  const spy = () => {
    raf = 0;
    let active: SectionId = SECTIONS[0].id;
    let entered = false;
    for (const { id } of SECTIONS) {
      const section = document.getElementById(id);
      if (section && section.getBoundingClientRect().top <= SPY_LINE_PX) {
        active = id;
        entered = true;
      }
    }
    onChange({ active, entered });
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(spy);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();
  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    if (raf) cancelAnimationFrame(raf);
  };
}
