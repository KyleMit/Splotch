import type { IconName } from '../icon-names';
import { settings } from '$lib/state/settings.svelte';

// The Parent Center is one flat list of sections (ADR-0061). Both shells — the
// phone hub with full-page drill-in and the tablet sidebar + content pane —
// render from this single ordered list, so the two layouts can never drift.
export interface SectionMeta {
  id: SectionId;
  label: string;
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
  { id: 'whatsnew', label: 'Updates', icon: 'magic-brush' },
  { id: 'feedback', label: 'Submit Feedback', icon: 'more-horiz' },
  { id: 'about', label: 'About', icon: 'splotchy' },
];

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

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
    case 'ai':
      if (settings.aiUserApiKey) return settings.aiImageEnabled ? 'Your Gemini key' : 'Turned off';
      if (settings.aiAccessToken) return settings.aiImageEnabled ? 'Access code' : 'Turned off';
      return 'Not set up';
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
