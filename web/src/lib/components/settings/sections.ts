import type { IconName } from '../icon-names';
import { APP_VERSION } from '$lib/appVersion';
import { aiCredentialKind, settings } from '$lib/state/settings.svelte';
import { coloringPackState } from '$lib/state/coloringPacks.svelte';
import { freeGenerations } from '$lib/state/freeGenerations.svelte';
import { hiddenDrawingToolCount } from './drawingTools';

// Settings is one flat list of sections (ADR-0061). Both shells — the phone hub
// with full-page drill-in and the tablet table of contents over one continuous
// pane — render from this single ordered list, so the two layouts can never
// drift, and the nav order is the pane's stacking order.
//
// Ordered by what a visit does: the two sections the phone hub answers inline
// with a switch lead (see HUB_TOGGLES in SettingsModal), then the drill-ins by
// how often a parent goes configuring, then the reference sections. Saving sits
// below the feature sections because it is set once and left alone.
export const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: 'appearance', contentStamp: '1' },
  { id: 'sound', label: 'Sound', icon: 'sound', contentStamp: '2' },
  { id: 'controls', label: 'Tool Drawer', icon: 'controls', contentStamp: '1' },
  { id: 'coloring', label: 'Coloring', icon: 'shapes', contentStamp: '1' },
  { id: 'ai', label: 'AI Art', icon: 'wand-stars', contentStamp: '2' },
  { id: 'saving', label: 'Saving', icon: 'save-picture', contentStamp: '1' },
  {
    id: 'parentCenter',
    label: 'Parent Center',
    icon: 'parent-center',
    contentStamp: '1',
  },
  { id: 'setup', label: 'Install', icon: 'setup', contentStamp: '1' },
  { id: 'feedback', label: 'Feedback', icon: 'feedback', contentStamp: '1' },
  {
    id: 'whatsnew',
    label: "What's New",
    title: 'Updates',
    icon: 'whats-new',
    contentStamp: APP_VERSION,
  },
  { id: 'about', label: 'About', icon: 'splotchy', contentStamp: '1' },
] as const satisfies readonly {
  id: string;
  label: string;
  // Heading shown once drilled in (phone) or as the pane title (tablet), when
  // it should differ from the nav label — e.g. "What's New" reads best in the
  // menu, but "Updates" avoids stacking on the "✨ New" headings inside.
  title?: string;
  icon: IconName;
  contentStamp: string;
}[];

export type SectionId = (typeof SECTIONS)[number]['id'];
// The intersection re-states the optional `title`, which is otherwise readable only on the one
// entry that sets it — every other member of the derived union lacks the key entirely.
type SectionMeta = (typeof SECTIONS)[number] & { readonly title?: string };

const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s] as const)) as Record<
  SectionId,
  SectionMeta
>;

export function isSectionId(id: string): id is SectionId {
  return Object.hasOwn(SECTION_BY_ID, id);
}

export function sectionContentStamp(id: SectionId): string {
  return SECTION_BY_ID[id].contentStamp;
}

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

// What the Tool Drawer row says while every tool is showing: the contents of
// the drawer, rather than a count of nothing.
const ALL_TOOLS_SHOWING = 'Pen, crayon, magic brush & more';

// The one-line status shown under each row in the phone hub. Reads live
// `settings`, so it stays reactive wherever it's rendered in a component.
//
// A row the hub answers with an inline switch (HUB_TOGGLES in SettingsModal)
// drops the on/off word from its subtitle and names the boolean instead — the
// switch beside it is what says which way that boolean is set.
export function sectionSubtitle(id: SectionId): string {
  switch (id) {
    case 'appearance': {
      // The rotation lock is the other thing this section holds, kept to two
      // words: the inline switch leaves this row the least subtitle width in
      // the hub, and a summary that wraps past two lines is clipped.
      const parts: string[] = ['Night Mode'];
      if (settings.lockRotationEnabled) {
        parts.push(settings.forceLandscapeOrientation ? 'landscape lock' : 'portrait lock');
      }
      return parts.join(' · ');
    }
    case 'sound': {
      if (
        !settings.soundEnabled ||
        (!settings.drawingSoundEnabled && !settings.deleteSoundEnabled)
      ) {
        return 'Muted';
      }
      const volume = `Volume ${settings.soundVolume}%`;
      if (settings.drawingSoundEnabled && settings.deleteSoundEnabled) return volume;
      return `${volume} · ${settings.drawingSoundEnabled ? 'drawing' : 'delete'} only`;
    }
    case 'saving':
      return settings.saveOnDeleteEnabled ? 'Auto-save on' : 'Auto-save off';
    case 'coloring':
      return settings.coloringBookEnabled
        ? `${Math.max(0, coloringPackState.installedBookIds.length - 1)} extra books ready`
        : 'Coloring books off';
    case 'controls': {
      // Advanced Controls is the umbrella over every tool below it: with it off
      // the drawer cannot be opened at all — its toggle is hidden too — so no
      // per-tool flag is reachable, and counting them would describe a panel
      // the child cannot see.
      if (!settings.advancedControlsEnabled) return 'All tools hidden';
      const hidden = hiddenDrawingToolCount();
      if (!hidden) return ALL_TOOLS_SHOWING;
      return `${hidden} ${hidden === 1 ? 'tool' : 'tools'} hidden`;
    }
    case 'ai': {
      if (!settings.aiImageEnabled) return 'Turned off';
      const kind = aiCredentialKind();
      if (kind === 'none') {
        return freeGenerations.available
          ? `${freeGenerations.remaining} free ${freeGenerations.remaining === 1 ? 'creation' : 'creations'} left`
          : 'Free allowance unavailable';
      }
      return kind === 'apiKey' ? 'Your OpenAI key' : 'Access code';
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
