import type { IconName } from '../icon-names';
import { APP_VERSION } from '$lib/appVersion';
import { aiCredentialKind, settings } from '$lib/state/settings.svelte';
import { coloringPackState } from '$lib/state/coloringPacks.svelte';
import { freeGenerations } from '$lib/state/freeGenerations.svelte';

// Settings is one flat list of sections (ADR-0061). Both shells — the phone hub
// with full-page drill-in and the tablet table of contents over one continuous
// pane — render from this single ordered list, so the two layouts can never
// drift, and the nav order is the pane's stacking order.
export const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: 'appearance' },
  { id: 'sound', label: 'Sound', icon: 'sound' },
  { id: 'controls', label: 'Buttons', icon: 'controls' },
  { id: 'saving', label: 'Saving', icon: 'save-picture' },
  { id: 'coloring', label: 'Coloring', icon: 'shapes' },
  { id: 'ai', label: 'AI Art', icon: 'wand-stars' },
  { id: 'parentCenter', label: 'Parent Center', icon: 'parent-center' },
  { id: 'setup', label: 'Install', icon: 'setup' },
  { id: 'feedback', label: 'Feedback', icon: 'feedback' },
  { id: 'whatsnew', label: "What's New", title: 'Updates', icon: 'whats-new' },
  { id: 'about', label: 'About', icon: 'splotchy' },
] as const satisfies readonly {
  id: string;
  label: string;
  // Heading shown once drilled in (phone) or as the pane title (tablet), when
  // it should differ from the nav label — e.g. "What's New" reads best in the
  // menu, but "Updates" avoids stacking on the "✨ New" headings inside.
  title?: string;
  icon: IconName;
}[];

export type SectionId = (typeof SECTIONS)[number]['id'];
// The intersection re-states the optional `title`, which is otherwise readable only on the one
// entry that sets it — every other member of the derived union lacks the key entirely.
type SectionMeta = (typeof SECTIONS)[number] & { readonly title?: string };

const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s] as const)) as Record<
  SectionId,
  SectionMeta
>;

/** The heading a section carries once it is on screen, in either shell. */
export function sectionHeading(id: SectionId): string {
  const meta = SECTION_BY_ID[id];
  return meta.title ?? meta.label;
}

// Reveal timing for every conditional block a settings section itself owns. The
// exception is the shared feedback field set, ReportFields: it is also hosted by
// /feedback, outside Settings, so its nested device reveals name their own
// shorter duration locally instead of importing this one. It lives here rather
// than in tokens.css because `transition:slide` takes a JS number, not a
// `var(--duration-*)` string.
export const SECTION_SLIDE = { duration: 220 };

const THEME_LABEL = { light: 'Light', dark: 'Dark', system: 'System' } as const;

// The one-line status shown under each row in the phone hub. Reads live
// `settings`, so it stays reactive wherever it's rendered in a component.
export function sectionSubtitle(id: SectionId): string {
  switch (id) {
    case 'appearance': {
      const parts: string[] = [THEME_LABEL[settings.theme]];
      if (settings.lockRotationEnabled) {
        parts.push('rotation locked');
        parts.push(settings.forceLandscapeOrientation ? 'landscape' : 'portrait');
      }
      return parts.join(' · ');
    }
    case 'sound':
      return settings.soundEnabled
        ? `Drawing sounds on · ${settings.soundVolume}%`
        : 'Drawing sounds off';
    case 'saving':
      return settings.saveOnDeleteEnabled ? 'Auto-save on' : 'Auto-save off';
    case 'coloring':
      return settings.coloringBookEnabled
        ? `${Math.max(0, coloringPackState.installedBookIds.length - 1)} extra books ready`
        : 'Coloring books off';
    case 'controls':
      return settings.advancedControlsEnabled ? 'Advanced controls on' : 'Standard controls';
    case 'ai': {
      const kind = aiCredentialKind();
      if (kind === 'none') {
        return freeGenerations.available
          ? `${freeGenerations.remaining} free ${freeGenerations.remaining === 1 ? 'creation' : 'creations'} left`
          : 'Free allowance unavailable';
      }
      if (!settings.aiImageEnabled) return 'Turned off';
      return kind === 'apiKey' ? 'Your Gemini key' : 'Access code';
    }
    case 'parentCenter':
      return 'Choose when grown-up checks appear';
    case 'setup':
      return 'Install & lock the app';
    case 'whatsnew':
      return "See what's changed";
    case 'feedback':
      return 'Report a bug or share an idea';
    case 'about':
      return `Version ${APP_VERSION}`;
  }
}
