import type { SectionId } from './contents';
import {
  sectionUrl,
  sectionLinkAnnouncement,
  COPIED_DURATION_MS,
  REANNOUNCE_DELAY_MS,
} from './sectionLink';
export { sectionUrl } from './sectionLink';

export function createSectionLinks() {
  let copied = $state<SectionId | null>(null);
  let announcement = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let announcementTimer: ReturnType<typeof setTimeout> | undefined;
  let request = 0;
  let disposed = false;

  function announce(message: string, currentRequest: number) {
    clearTimeout(announcementTimer);
    if (announcement !== message) {
      announcement = message;
      return;
    }
    announcement = '';
    announcementTimer = setTimeout(() => {
      if (!disposed && currentRequest === request) announcement = message;
    }, REANNOUNCE_DELAY_MS);
  }

  async function copy(event: MouseEvent, id: SectionId) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    if (!navigator.clipboard?.writeText) return;
    event.preventDefault();
    const currentRequest = ++request;
    try {
      await navigator.clipboard.writeText(sectionUrl(id));
    } catch {
      if (!disposed && currentRequest === request) {
        if (location.hash === `#${id}`) document.getElementById(id)?.scrollIntoView();
        else location.hash = id;
      }
      return;
    }
    if (disposed || currentRequest !== request) return;
    history.replaceState(history.state, '', `#${id}`);
    clearTimeout(timer);
    copied = id;
    announce(sectionLinkAnnouncement(id), currentRequest);
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
      clearTimeout(announcementTimer);
    },
  };
}
