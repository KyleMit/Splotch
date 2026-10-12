import { slide } from 'svelte/transition';
import { calm } from '$lib/platform/calmTransition';
import { SECTION_SLIDE } from './sections';

// The reveal every conditional block inside a settings section uses, already
// calmed. It lives here rather than beside SECTION_SLIDE in sections.ts because
// that module is on the startup path (state/ui.svelte.ts imports it) and this
// one pulls in svelte/transition; startup-bundle.spec.ts owns that boundary.
export const sectionReveal = calm(slide, SECTION_SLIDE);
