import releases from '../../../../web/src/lib/releases.json';
import notes from '../information/releaseNotes.generated.json';
import { FEEDBACK_APP_VERSION } from '../feedback/feedbackCopy';

type ReleaseSection = Readonly<{ title: string; items: readonly string[] }>;
export type ReleaseNotes = Readonly<{
  version: string;
  dateLabel: string;
  sections: readonly ReleaseSection[];
}>;

const NOTES_BY_VERSION: Readonly<Record<string, readonly ReleaseSection[] | undefined>> = notes;

// The shipping release list, newest first, with the notes tools/release/gen-release-notes.mjs
// renders for this app from the same releases/*.md documents.
export const RELEASE_NOTES: readonly ReleaseNotes[] = releases.map(({ version, dateLabel }) => {
  const sections = NOTES_BY_VERSION[version];
  if (!sections) throw new Error(`Release ${version} has no generated notes.`);
  return { version, dateLabel, sections };
});

// The shipping What's New section's content stamp is the app version, so its dot returns with
// each release until the section is opened.
export const WHATS_NEW_STAMP = FEEDBACK_APP_VERSION;
const VERSION_STAMP = /^\d+\.\d+\.\d+$/;

export function isWhatsNewSeen(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && VERSION_STAMP.test(value));
}

export function whatsNewUnseen(seen: string | null) {
  return seen !== WHATS_NEW_STAMP;
}
