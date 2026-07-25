import type { IconName } from '../icon-names';
import { APP_VERSION } from '$lib/appVersion';
import { aiCredentialKind, settings } from '$lib/state/settings.svelte';

// The Parent Center is one flat list of sections (ADR-0061). Both shells — the
// phone hub with full-page drill-in and the tablet sidebar + content pane —
// render from this single ordered list, so the two layouts can never drift.
export interface SectionMeta {
  id: SectionId;
  label: string;
  // Heading shown once drilled in (phone) or as the pane title (tablet), when
  // it should differ from the nav label — e.g. "What's New" reads best in the
  // menu, but "Updates" avoids stacking on the "✨ New" headings inside.
  title?: string;
  icon: IconName;
}

export type SectionId =
  | 'appearance'
  | 'sound'
  | 'saving'
  | 'controls'
  | 'ai'
  | 'setup'
  | 'whatsnew'
  | 'feedback'
  | 'about';

export const SECTIONS: SectionMeta[] = [
  { id: 'appearance', label: 'Appearance & Display', icon: 'theme-auto' },
  { id: 'sound', label: 'Sound', icon: 'volume-on' },
  { id: 'saving', label: 'Saving', icon: 'download' },
  { id: 'controls', label: 'Controls & Buttons', icon: 'dashboard-customize' },
  { id: 'ai', label: 'AI Art', icon: 'wand-stars' },
  { id: 'setup', label: 'Setup Guide', icon: 'pin' },
  { id: 'whatsnew', label: "What's New", title: 'Updates', icon: 'magic-brush' },
  { id: 'feedback', label: 'Submit Feedback', icon: 'more-horiz' },
  { id: 'about', label: 'About', icon: 'splotchy' },
];

// Reveal timing shared by every conditional settings block inside a section.
// It lives here rather than in tokens.css because `transition:slide` takes a JS
// number, not a `var(--duration-*)` string.
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
    case 'controls':
      return settings.advancedControlsEnabled ? 'Advanced controls on' : 'Standard controls';
    case 'ai': {
      const kind = aiCredentialKind();
      if (kind === 'none') return 'Not set up';
      if (!settings.aiImageEnabled) return 'Turned off';
      return kind === 'apiKey' ? 'Your Gemini key' : 'Access code';
    }
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
