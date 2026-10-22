import { SECTIONS, type SectionId } from '../../../../web/src/lib/privacy/contents';
import { sectionUrl } from '../../../../web/src/lib/privacy/sectionLink';

export async function copyPrivacySection(id: SectionId) {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(sectionUrl(id));
    return true;
  } catch {
    return false;
  }
}
export function privacySectionAtLaunch(): SectionId | null {
  return SECTIONS.find(({ id }) => location.hash === `#${id}`)?.id ?? null;
}
export function replacePrivacyFragment(id: SectionId) {
  history.replaceState(history.state, '', `#${id}`);
}
