import { SITE_ORIGIN } from '../../lib/siteUrl';
import { SECTIONS, type SectionId } from './contents';

export const COPIED_DURATION_MS = 2000;
export const REANNOUNCE_DELAY_MS = 150;

export function sectionUrl(id: SectionId): string {
  return `${SITE_ORIGIN}/privacy#${id}`;
}

export function sectionLinkAnnouncement(id: SectionId): string {
  const section = SECTIONS.find((section) => section.id === id);
  if (!section) throw new Error(`Unknown privacy section: ${id}`);
  return `Link to “${section.label}” copied.`;
}
