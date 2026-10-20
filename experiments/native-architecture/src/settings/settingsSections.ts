import type { SoundSettingsState } from './soundSettingsCodec';
import type { BrushPreferencesState } from './brushPreferences';
import { hiddenDrawingToolCount, TOOL_DRAWER_COPY } from './toolDrawerSection';
import { APP_VERSION } from '../platform/appVersion';
import type { AiState } from '../ai/sessionContract';
import { SPLOTCHY_ICON_NAME } from '../rsdDrawing/icons.generated';
import type { SectionIconName } from '../rsdDrawing/RsdSectionIcon';

// The shipping Settings sections (web/src/lib/components/settings/sections.ts), in the shipping
// order; the phone hub lists them and each drills into its own page.
// native-settings-sections.test.mjs holds the ids, labels, titles, icons, order and copy to the
// shipping list.
export const NATIVE_SETTINGS_SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: 'appearance', contentStamp: '1' },
  { id: 'sound', label: 'Sound', icon: 'sound', contentStamp: '2' },
  { id: 'controls', label: 'Tool Drawer', icon: 'controls', contentStamp: '1' },
  { id: 'accessibility', label: 'Accessibility', icon: 'accessibility', contentStamp: '2' },
  { id: 'coloring', label: 'Coloring', icon: 'shapes', contentStamp: '1' },
  { id: 'ai', label: 'AI Art', icon: 'wand-stars', contentStamp: '2' },
  { id: 'saving', label: 'Saving', icon: 'save-picture', contentStamp: '1' },
  { id: 'parentCenter', label: 'Parent Center', icon: 'parent-center', contentStamp: '1' },
  { id: 'setup', label: 'Install', icon: 'setup', contentStamp: '1' },
  { id: 'feedback', label: 'Feedback', icon: 'feedback', contentStamp: '1' },
  {
    id: 'whatsnew',
    label: "What's New",
    title: 'Updates',
    icon: 'whats-new',
    contentStamp: APP_VERSION,
  },
  { id: 'about', label: 'About', icon: SPLOTCHY_ICON_NAME, contentStamp: '1' },
] as const satisfies readonly {
  id: string;
  label: string;
  title?: string;
  icon: SectionIconName;
  contentStamp: string;
}[];

export type NativeSettingsSection = (typeof NATIVE_SETTINGS_SECTIONS)[number];
export type NativeSettingsSectionId = NativeSettingsSection['id'];
type SectionMeta = NativeSettingsSection & { readonly title?: string };

export function sectionHeading(id: NativeSettingsSectionId) {
  const section: SectionMeta | undefined = NATIVE_SETTINGS_SECTIONS.find(
    (candidate) => candidate.id === id
  );
  if (!section) throw new Error(`Unknown Settings section: ${id}`);
  return section.title ?? section.label;
}

export const SECTION_SUBTITLES = {
  nightMode: 'Night Mode',
  allToolsShowing: 'Pen, crayon, magic brush & more',
  toolDrawerOff: TOOL_DRAWER_COPY.off,
  muted: 'Muted',
  noSoundSources: 'No sources',
  coloringOff: 'Coloring books off',
  accessibility: 'Make it easier to see and tap',
  aiOff: 'Turned off',
  aiAllowanceUnavailable: 'Free allowance unavailable',
  aiOwnKey: 'Your OpenAI key',
  aiAccessCode: 'Access code',
  parentCenter: 'Choose when grown-up checks appear',
  setup: 'Install & lock the app',
  feedback: 'Report a bug or share an idea',
  whatsnew: "See what's changed",
  saveOnDeleteOn: 'Auto-save on',
  saveOnDeleteOff: 'Auto-save off',
} as const;

export type SectionSummaryContext = {
  settings: SoundSettingsState;
  brushes: BrushPreferencesState;
  downloadedBooks: number;
  ai: Pick<AiState, 'credential' | 'remaining'> | null;
};

function soundSubtitle({
  soundEnabled,
  soundVolume,
  drawingSoundEnabled,
  deleteSoundEnabled,
}: SoundSettingsState) {
  if (!soundEnabled) return SECTION_SUBTITLES.muted;
  if (!drawingSoundEnabled && !deleteSoundEnabled) return SECTION_SUBTITLES.noSoundSources;
  const volume = `Volume ${soundVolume}%`;
  if (drawingSoundEnabled && deleteSoundEnabled) return volume;
  return `${volume} · ${drawingSoundEnabled ? 'drawing' : 'deleting'} only`;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function aiSubtitle({ settings, ai }: SectionSummaryContext) {
  if (!settings.aiEnabled) return SECTION_SUBTITLES.aiOff;
  if (ai?.credential === 'byok') return SECTION_SUBTITLES.aiOwnKey;
  if (ai?.credential === 'managed') return SECTION_SUBTITLES.aiAccessCode;
  return ai?.credential === 'free' && ai.remaining !== null
    ? `${plural(ai.remaining, 'free creation', 'free creations')} left`
    : SECTION_SUBTITLES.aiAllowanceUnavailable;
}

// The one-line status under each hub row, worded as the shipping sectionSubtitle words it. A row
// the hub answers with an inline switch names the boolean rather than its on/off state.
export function sectionSubtitle(id: NativeSettingsSectionId, context: SectionSummaryContext) {
  const { settings, brushes } = context;
  switch (id) {
    case 'appearance':
      return settings.orientation === 'auto'
        ? SECTION_SUBTITLES.nightMode
        : `${SECTION_SUBTITLES.nightMode} · ${settings.orientation} lock`;
    case 'sound':
      return soundSubtitle(settings);
    case 'controls': {
      // The drawer's own switch hides every tool the row would count, so with it off the row
      // names the switch, as Coloring's does.
      if (!settings.toolDrawerEnabled) return SECTION_SUBTITLES.toolDrawerOff;
      const hidden = hiddenDrawingToolCount(settings, brushes.availability);
      return hidden
        ? `${plural(hidden, 'tool', 'tools')} hidden`
        : SECTION_SUBTITLES.allToolsShowing;
    }
    case 'accessibility':
      return SECTION_SUBTITLES.accessibility;
    case 'coloring':
      return settings.coloringBookEnabled
        ? `${plural(context.downloadedBooks, 'extra book', 'extra books')} ready`
        : SECTION_SUBTITLES.coloringOff;
    case 'ai':
      return aiSubtitle(context);
    case 'saving':
      return settings.saveOnDeleteEnabled
        ? SECTION_SUBTITLES.saveOnDeleteOn
        : SECTION_SUBTITLES.saveOnDeleteOff;
    case 'parentCenter':
      return SECTION_SUBTITLES.parentCenter;
    case 'setup':
      return SECTION_SUBTITLES.setup;
    case 'feedback':
      return SECTION_SUBTITLES.feedback;
    case 'whatsnew':
      return SECTION_SUBTITLES.whatsnew;
    case 'about':
      return `Version ${APP_VERSION}`;
  }
}
