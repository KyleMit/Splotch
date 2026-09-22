// The accessibility statement's contents list, kept beside +page.svelte. The
// entries and the section ids/headings in the page markup are the same list
// twice, like /privacy's — a mismatch is a dead anchor, caught by
// accessibility.spec.ts walking every rail link to its section.
export const SECTIONS = [
  { id: 'scope', label: 'What this statement covers' },
  { id: 'canvas', label: 'What it leaves out on purpose' },
  { id: 'checks', label: 'How we check' },
  { id: 'limitations', label: 'Known limitations' },
  { id: 'contact', label: 'Changes and contact' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];
