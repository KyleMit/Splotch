import type { SoundSettingsState } from './soundSettingsCodec';
import type { BrushPreferencesState } from './brushPreferences';
import { OPTIONAL_BRUSHES } from './brushPreferences';
import { APPEARANCE_LABELS } from './appearance';
import { ORIENTATION_LABELS } from './orientation';
import { SOUND_LEVEL_LABELS } from './soundLevel';
import { FEEDBACK_APP_VERSION } from '../feedback/feedbackCopy';

// The shipping Settings sections (web/src/lib/components/settings/sections.ts) that hold a native
// control, in the shipping order; the phone hub lists them and each drills into its own page.
// AI Art and Feedback live in Parent Center and Drawing tools here, so they have no row.
// native-settings-sections.test.mjs holds the ids, labels, titles, order and fixed subtitles to
// the shipping list.
export const NATIVE_SETTINGS_SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'sound', label: 'Sound' },
  { id: 'controls', label: 'Tool Drawer' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'coloring', label: 'Coloring' },
  { id: 'saving', label: 'Saving' },
  { id: 'parentCenter', label: 'Parent Center' },
  { id: 'setup', label: 'Install' },
  { id: 'whatsnew', label: "What's New", title: 'Updates' },
  { id: 'about', label: 'About' },
] as const satisfies readonly { id: string; label: string; title?: string }[];

export type NativeSettingsSectionId = (typeof NATIVE_SETTINGS_SECTIONS)[number]['id'];
type SectionMeta = (typeof NATIVE_SETTINGS_SECTIONS)[number] & { readonly title?: string };

export function sectionHeading(id: NativeSettingsSectionId) {
  const section: SectionMeta | undefined = NATIVE_SETTINGS_SECTIONS.find(
    (candidate) => candidate.id === id
  );
  if (!section) throw new Error(`Unknown Settings section: ${id}`);
  return section.title ?? section.label;
}

export const SECTION_SUBTITLES = {
  allToolsShowing: 'Pen, crayon, magic brush & more',
  muted: 'Muted',
  coloringOff: 'Coloring books off',
  accessibility: 'Make it easier to see and tap',
  parentCenter: 'Choose when grown-up checks appear',
  setup: 'Install & lock the app',
  whatsnew: "See what's changed",
  saveOnDeleteOn: 'Auto-save on',
  saveOnDeleteOff: 'Auto-save off',
} as const;

function hiddenToolCount(settings: SoundSettingsState, brushes: BrushPreferencesState) {
  return (
    OPTIONAL_BRUSHES.filter((brush) => !brushes.availability[brush]).length +
    (settings.undoButtonEnabled ? 0 : 1) +
    (settings.strokeWidthControlEnabled ? 0 : 1)
  );
}

// The one-line status under each hub row, worded as the shipping sectionSubtitle words it
// wherever the native setting matches the shipping one.
export function sectionSubtitle(
  id: NativeSettingsSectionId,
  settings: SoundSettingsState,
  brushes: BrushPreferencesState
): string {
  switch (id) {
    case 'appearance': {
      const parts: string[] = [APPEARANCE_LABELS[settings.appearance]];
      if (settings.orientation !== 'auto')
        parts.push(`${ORIENTATION_LABELS[settings.orientation].toLowerCase()} lock`);
      return parts.join(' · ');
    }
    case 'sound':
      return settings.soundEnabled
        ? `${SOUND_LEVEL_LABELS[settings.soundLevel]} volume`
        : SECTION_SUBTITLES.muted;
    case 'controls': {
      const hidden = hiddenToolCount(settings, brushes);
      if (!hidden) return SECTION_SUBTITLES.allToolsShowing;
      return `${hidden} ${hidden === 1 ? 'tool' : 'tools'} hidden`;
    }
    case 'accessibility':
      return SECTION_SUBTITLES.accessibility;
    case 'coloring':
      return settings.coloringBookEnabled ? 'Coloring books on' : SECTION_SUBTITLES.coloringOff;
    case 'saving':
      return settings.saveOnDeleteEnabled
        ? SECTION_SUBTITLES.saveOnDeleteOn
        : SECTION_SUBTITLES.saveOnDeleteOff;
    case 'parentCenter':
      return SECTION_SUBTITLES.parentCenter;
    case 'setup':
      return SECTION_SUBTITLES.setup;
    case 'whatsnew':
      return SECTION_SUBTITLES.whatsnew;
    case 'about':
      return `Version ${FEEDBACK_APP_VERSION}`;
  }
}
