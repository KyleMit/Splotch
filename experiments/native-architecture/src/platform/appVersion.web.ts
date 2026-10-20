import { FEEDBACK_APP_VERSION } from '../feedback/feedbackCopy';
import { WEB_VERSION_META_SELECTOR } from './webVersion';

// Shipping web shows deriveWebVersion (web/buildVersion.ts), the version the RN web export writes
// into its document's version meta. Only a development server, which has no meta, shows the
// package version.
function documentVersion() {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLMetaElement>(WEB_VERSION_META_SELECTOR)?.content || null;
}

export const APP_VERSION = documentVersion() ?? FEEDBACK_APP_VERSION;
