import { Clipboard } from 'react-native';
import { sectionUrl } from '../../../../web/src/lib/privacy/sectionLink';
import type { SectionId } from '../../../../web/src/lib/privacy/contents';

export async function copyPrivacySection(id: SectionId) {
  try {
    Clipboard.setString(sectionUrl(id));
    return true;
  } catch {
    return false;
  }
}
export function privacySectionAtLaunch(): SectionId | null {
  return null;
}
export function replacePrivacyFragment(_id: SectionId) {}
