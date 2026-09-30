import { SITE_ORIGIN } from '$lib/siteUrl';
import { SECTIONS, type SectionId } from './contents';

const COPIED_DURATION_MS = 2000;

export function sectionUrl(id: SectionId): string {
  return `${SITE_ORIGIN}/privacy#${id}`;
}

export function createSectionLinks() {
  let copied = $state<SectionId | null>(null);
  let announcement = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request = 0;
  let disposed = false;

  async function copy(event: MouseEvent, id: SectionId) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    if (!navigator.clipboard?.writeText) return;
    event.preventDefault();
    const currentRequest = ++request;
    try {
      await navigator.clipboard.writeText(sectionUrl(id));
    } catch {
      if (!disposed && currentRequest === request) location.hash = id;
      return;
    }
    if (disposed || currentRequest !== request) return;
    history.replaceState(history.state, '', `#${id}`);
    clearTimeout(timer);
    copied = id;
    const section = SECTIONS.find((section) => section.id === id);
    if (!section) throw new Error(`Unknown privacy section: ${id}`);
    announcement = `Link to “${section.label}” copied.`;
    timer = setTimeout(() => {
      copied = null;
      announcement = '';
    }, COPIED_DURATION_MS);
  }

  return {
    get copied() {
      return copied;
    },
    get announcement() {
      return announcement;
    },
    copy,
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
